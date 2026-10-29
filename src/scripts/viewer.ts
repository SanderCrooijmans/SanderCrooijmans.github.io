// Lazy 3D viewer for the illustrative chamber model. Three.js is imported dynamically so the
// first paint only needs the static poster. Everything here degrades to the poster + text.

type Three = typeof import('three');

const MODEL_URL = '/models/chamber-concept.glb';
const CLIP = 'ZipperPanelOpen';
/** 3D anchor of each numbered dot (glTF space, metres), in the same order as the features in ChamberViewer.astro. */
const HOTSPOTS: [number, number, number][] = [
  [0.0, 0.95, 0.3],     // zipper opening
  [0.15, 0.7, -0.29],   // liner and frame
  [0.72, 0.4, 0.0],     // mattress
  [-0.26, 0.575, 0.385], // window
  [-0.63, 0.84, 0.29],  // valve and gauge
  [-0.82, 0.45, 0.0],   // head end and hose
];
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class ChamberViewer {
  private root: HTMLElement;
  private stage: HTMLElement;
  private stateEl: HTMLElement;
  private hotspots: HTMLElement | null;
  private dots: HTMLButtonElement[] = [];
  private card: HTMLElement | null;
  private hint: HTMLElement | null;
  private activeDot = -1;
  private buttons: Record<string, HTMLButtonElement> = {};
  private loading: Promise<boolean> | null = null;
  private ready = false;
  private failed = false;

  // three objects (set after load)
  private THREE!: Three;
  private renderer!: import('three').WebGLRenderer;
  private scene!: import('three').Scene;
  private camera!: import('three').PerspectiveCamera;
  private controls!: import('three/addons/controls/OrbitControls.js').OrbitControls;
  private mixer!: import('three').AnimationMixer;
  private action!: import('three').AnimationAction;
  private mannequin: import('three').Object3D[] = [];
  private visible = true;
  private inside = false;
  private busy = false;
  private panelOpen = false;
  private tween: { from: import('three').Spherical; to: import('three').Spherical; t0: number; dur: number; targetFrom: import('three').Vector3; targetTo: import('three').Vector3; done: () => void } | null = null;
  private clock: import('three').Clock | null = null;

  private readonly outsideTarget = [0.05, 0.5, 0];
  private readonly outsideCam = [3.6, 2.0, 4.4];
  private readonly insideCam = [0.0, 2.9, 0.9];
  private readonly insideTarget = [-0.02, 0.55, 0.0];

  constructor(root: HTMLElement) {
    this.root = root;
    this.stage = root.querySelector('[data-stage]') as HTMLElement;
    this.stateEl = root.querySelector('[data-state]') as HTMLElement;
    this.hotspots = root.querySelector('[data-hotspots]');
    this.card = root.querySelector('[data-card]');
    this.hint = root.querySelector('[data-hint]');
    this.dots = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-dot]'));
    this.dots.forEach((d, i) => d.addEventListener('click', () => this.selectDot(i)));
    root.querySelector('[data-card-close]')?.addEventListener('click', () => this.closeCard());
    root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((b) => {
      this.buttons[b.dataset.action!] = b;
      b.addEventListener('click', () => this.onAction(b.dataset.action!));
    });
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this.inside) return;
      if (this.activeDot >= 0) this.closeCard(); else this.reset();
    });
    root.addEventListener('pointerenter', () => void this.load(), { once: true });
    root.addEventListener('focusin', () => void this.load(), { once: true });
    const saveData = (navigator as any).connection?.saveData === true;
    if (!saveData) {
      const kick = () => void this.load();
      if ('requestIdleCallback' in window) {
        window.addEventListener('load', () => (window as any).requestIdleCallback(kick, { timeout: 4000 }), { once: true });
      } else {
        window.addEventListener('load', () => setTimeout(kick, 2500), { once: true });
      }
    }
    new IntersectionObserver((es) => { this.visible = es[0].isIntersecting; }, { threshold: 0.05 }).observe(root);
    this.setState('Static view');
  }

  private setState(s: string) { this.stateEl.textContent = s; }

  private async onAction(a: string) {
    const ok = await this.load();
    if (!ok) return;
    if (a === 'rotate') this.setRotate(true);
    else if (a === 'pause') this.setRotate(false);
    else if (a === 'inside') this.lookInside();
    else if (a === 'reset') this.reset();
  }

  private setRotate(on: boolean) {
    if (!this.ready) return;
    this.controls.autoRotate = on && !reduceMotion() && !this.inside;
    this.buttons.rotate?.setAttribute('aria-pressed', String(on));
    this.buttons.pause?.setAttribute('aria-pressed', String(!on));
    this.setState(this.inside ? 'Interior view (illustrative)' : on ? '3D view: rotating' : '3D view: paused');
  }

  load(): Promise<boolean> {
    if (this.loading) return this.loading;
    this.loading = this.init().catch((err) => {
      console.warn('3D viewer unavailable, using static view.', err);
      this.failed = true;
      this.setState('Static view (3D unavailable)');
      Object.values(this.buttons).forEach((b) => { b.disabled = true; b.title = '3D view unavailable'; });
      this.root.querySelector('[data-feature-list]')?.classList.add('show'); // keep the feature text when 3D is unavailable
      return false;
    });
    return this.loading;
  }

  private async init(): Promise<boolean> {
    // Feature-detect WebGL before downloading the heavy bundle.
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('WebGL not available');
    this.setState('Loading 3D…');
    const [THREE, { GLTFLoader }, { OrbitControls }, { RoomEnvironment }] = await Promise.all([
      import('three'),
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/controls/OrbitControls.js'),
      import('three/addons/environments/RoomEnvironment.js'),
    ]);
    this.THREE = THREE;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Interactive 3D illustration of a soft-shell chamber. Use the buttons below to rotate, look inside or reset.');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'default' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    const key = new THREE.DirectionalLight(0xffffff, 1.3); key.position.set(-3, 5, 4); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc0ff, 0.9); rim.position.set(4, 3, -4); this.scene.add(rim);
    this.camera = new THREE.PerspectiveCamera(30, 3 / 2, 0.1, 50);
    this.camera.position.set(...(this.outsideCam as [number, number, number]));
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(...(this.outsideTarget as [number, number, number]));
    this.controls.enableZoom = false; // never hijack page scroll
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minPolarAngle = 0.35; this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.autoRotateSpeed = 0.7;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
    canvas.style.touchAction = 'pan-y';
    this.controls.addEventListener('start', () => { if (this.controls.autoRotate) this.setRotate(false); });

    const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
    this.scene.add(gltf.scene);
    // Web sheen is much stronger than in Cycles; tone it down so the navy fabric does not wash out.
    gltf.scene.traverse((o) => { const m = (o as any).material; if (m && m.isMeshPhysicalMaterial) { m.sheen = Math.min(m.sheen ?? 0, 0.12); m.envMapIntensity = 0.8; } });
    gltf.scene.traverse((o) => { if (o.name.startsWith('Mannequin_') || o.name === 'Pillow') { o.visible = false; this.mannequin.push(o); } });
    this.mixer = new THREE.AnimationMixer(gltf.scene);
    const clip = THREE.AnimationClip.findByName(gltf.animations, CLIP) ?? gltf.animations[0];
    if (clip) {
      this.action = this.mixer.clipAction(clip);
      this.action.setLoop(THREE.LoopOnce, 1); this.action.clampWhenFinished = true; this.action.play(); this.action.paused = true; this.action.time = 0;
      this.mixer.update(0);
    }
    this.stage.appendChild(canvas);
    this.stage.querySelector('.poster')?.setAttribute('hidden', '');
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.stage);
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
    this.ready = true;
    Object.values(this.buttons).forEach((b) => (b.disabled = false));
    this.setRotate(!reduceMotion());
    return true;
  }

  private resize() {
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.2 ? 40 : 30; // a little wider on narrow screens
    this.camera.updateProjectionMatrix();
  }

  private frame() {
    if (!this.visible || document.hidden) return;
    const dt = Math.min(this.clock!.getDelta(), 0.05);
    this.mixer.update(dt);
    if (this.tween) this.stepTween();
    else this.controls.update();
    if (this.hotspots?.classList.contains('show')) this.placeDots();
    this.renderer.render(this.scene, this.camera);
  }

  /** Projects each dot's 3D anchor onto the stage; hides a dot that is behind the camera or off-stage. */
  private placeDots() {
    const T = this.THREE;
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    const v = new T.Vector3();
    this.dots.forEach((d, i) => {
      v.set(...HOTSPOTS[i]).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      const on = v.z < 1 && x > 14 && x < w - 14 && y > 14 && y < h - 14;
      d.hidden = !on;
      if (on) d.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    });
  }

  private selectDot(i: number) {
    if (this.activeDot === i) { this.closeCard(); return; }
    this.activeDot = i;
    const label = this.root.querySelectorAll('[data-feature-list] li')[i];
    const title = label?.querySelector('strong')?.textContent ?? '';
    const text = (label?.textContent ?? '').slice(title.length);
    if (this.card) {
      (this.card.querySelector('[data-card-title]') as HTMLElement).textContent = title;
      (this.card.querySelector('[data-card-text]') as HTMLElement).textContent = text;
      this.card.hidden = false;
    }
    this.dots.forEach((d, k) => d.setAttribute('aria-expanded', String(k === i)));
  }

  private closeCard() {
    this.activeDot = -1;
    if (this.card) this.card.hidden = true;
    this.dots.forEach((d) => d.setAttribute('aria-expanded', 'false'));
  }

  private showDots(on: boolean) {
    this.hotspots?.classList.toggle('show', on);
    this.dots.forEach((d) => { d.tabIndex = on ? 0 : -1; if (!on) d.hidden = true; });
    if (this.hint) this.hint.hidden = !on;
    if (!on) this.closeCard();
  }

  private spherical(p: number[], t: number[]) {
    const v = new this.THREE.Vector3(p[0] - t[0], p[1] - t[1], p[2] - t[2]);
    return new this.THREE.Spherical().setFromVector3(v);
  }

  /** Orbit-style camera move: interpolates spherical coordinates around the target, so the path stays above and outside the shell. */
  private moveCamera(camPos: number[], target: number[], dur: number, done: () => void) {
    const T = this.THREE;
    const to = this.spherical(camPos, target);
    const from = new T.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
    if (to.theta - from.theta > Math.PI) from.theta += Math.PI * 2; else if (from.theta - to.theta > Math.PI) to.theta += Math.PI * 2;
    if (reduceMotion() || dur <= 0) {
      this.camera.position.set(camPos[0], camPos[1], camPos[2]); this.controls.target.set(target[0], target[1], target[2]);
      this.camera.lookAt(this.controls.target); this.controls.update(); done(); return;
    }
    this.controls.enabled = false;
    this.tween = { from, to, t0: performance.now(), dur: dur * 1000, targetFrom: this.controls.target.clone(), targetTo: new T.Vector3(...(target as [number, number, number])), done };
  }

  private stepTween() {
    const tw = this.tween!; const T = this.THREE;
    const k = Math.min(1, (performance.now() - tw.t0) / tw.dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const tgt = tw.targetFrom.clone().lerp(tw.targetTo, e);
    const s = new T.Spherical(tw.from.radius + (tw.to.radius - tw.from.radius) * e, tw.from.phi + (tw.to.phi - tw.from.phi) * e, tw.from.theta + (tw.to.theta - tw.from.theta) * e);
    this.controls.target.copy(tgt);
    this.camera.position.setFromSpherical(s).add(tgt);
    this.camera.lookAt(tgt);
    if (k >= 1) { this.tween = null; this.controls.enabled = true; this.controls.update(); tw.done(); }
  }

  private playPanel(forward: boolean, done: () => void) {
    if (!this.action) { done(); return; }
    const dur = this.action.getClip().duration;
    if (reduceMotion()) { this.action.time = forward ? dur : 0; this.action.paused = true; this.mixer.update(0); done(); return; }
    this.action.paused = false; this.action.timeScale = forward ? 1 : -1;
    if (forward) { this.action.time = 0; } else if (this.action.time <= 0) { this.action.time = dur; }
    this.action.play();
    const onFinish = (e: any) => { if (e.action === this.action) { this.mixer.removeEventListener('finished', onFinish); done(); } };
    this.mixer.addEventListener('finished', onFinish);
  }

  private lookInside() {
    if (this.inside || this.busy) return;
    this.busy = true; this.inside = true; this.panelOpen = true;
    this.setRotate(false); this.controls.autoRotate = false;
    this.buttons.inside?.setAttribute('aria-pressed', 'true');
    this.setState('Opening panel (illustrative)');
    this.mannequin.forEach((o) => (o.visible = true));
    this.playPanel(true, () => {});
    const delay = reduceMotion() ? 0 : 700;
    setTimeout(() => {
      this.moveCamera(this.insideCam, this.insideTarget, 1.8, () => {
        this.busy = false; this.setState('Interior view (illustrative)');
        this.showDots(true);
      });
    }, delay);
  }

  reset() {
    if (!this.ready) return;
    const wasOpen = this.panelOpen;
    this.busy = true; this.inside = false;
    this.showDots(false);
    this.buttons.inside?.setAttribute('aria-pressed', 'false');
    this.setState(wasOpen ? 'Closing panel' : 'Resetting view');
    this.moveCamera(this.outsideCam, this.outsideTarget, wasOpen ? 1.4 : 0.9, () => {
      const finish = () => { this.mannequin.forEach((o) => (o.visible = false)); this.panelOpen = false; this.busy = false; this.setRotate(false); };
      if (wasOpen) this.playPanel(false, finish); else finish();
    });
  }
}

export function initViewers() {
  document.querySelectorAll<HTMLElement>('[data-viewer]').forEach((el) => new ChamberViewer(el));
}
initViewers();
