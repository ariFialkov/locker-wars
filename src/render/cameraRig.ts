/** Limited-orbit camera with touch/mouse look, WASD/arrow-key look, pinch zoom and scripted fly-to. */
import * as THREE from 'three';

type Mode = 'orbit' | 'look' | 'fly' | 'locked' | 'showcase';

export class CameraRig {
  mode: Mode = 'locked';
  private yaw = 0; private pitch = 0.02; private dist = 5.0;
  private tYaw = 0; private tPitch = 0.02; private tDist = 5.0;
  private target = new THREE.Vector3(0, 1.1, -0.8);
  private flyPos = new THREE.Vector3(); private flyLook = new THREE.Vector3();
  private curPos = new THREE.Vector3(0, 1.5, 4.4); private curLook = new THREE.Vector3(0, 1.15, -0.9);
  private dragging = false; private lastX = 0; private lastY = 0; private pinchDist = 0;
  private dragMoved = 0;
  private keys = new Set<string>();
  limits = { yaw: 0.62, pitchMin: -0.2, pitchMax: 0.42, distMin: 2.2, distMax: 5.6 };
  /** First-person look (the inspection): the camera stands still and turns; "lean" steps toward the door. */
  private lookBase = new THREE.Vector3(0, 1.5, 1.5);
  private lookYaw = 0; private lookPitch = 0; private lean = 0;
  private tLookYaw = 0; private tLookPitch = 0; private tLean = 0;
  private lookLimits = { yaw: 0.62, pitchMin: -0.42, pitchMax: 0.26, leanMax: 1.05 };
  onInteract: (() => void) | null = null;
  /** Set when the player uses the keyboard to look (so the hint can be retired). */
  onKeyLook: (() => void) | null = null;

  constructor(private camera: THREE.PerspectiveCamera, el: HTMLElement) {
    el.addEventListener('pointerdown', (e) => { if (!this.interactive) return; this.dragging = true; this.dragMoved = 0; this.lastX = e.clientX; this.lastY = e.clientY; el.setPointerCapture?.(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging || !this.interactive) return;
      const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      if (this.mode === 'look') { this.turn(dx * 0.0038, -dy * 0.0028); }
      else {
        this.tYaw = THREE.MathUtils.clamp(this.tYaw - dx * 0.0042, -this.limits.yaw, this.limits.yaw);
        this.tPitch = THREE.MathUtils.clamp(this.tPitch + dy * 0.003, this.limits.pitchMin, this.limits.pitchMax);
      }
      if (this.dragMoved > 6) this.onInteract?.();
    });
    const up = () => { this.dragging = false; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
    el.addEventListener('wheel', (e) => { if (!this.interactive) return; this.zoom(e.deltaY * 0.0025); e.preventDefault(); }, { passive: false });
    el.addEventListener('touchstart', (e) => { if (e.touches.length === 2) this.pinchDist = this.touchDist(e); }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && this.interactive) {
        const d = this.touchDist(e);
        if (this.pinchDist > 0) this.zoom(-(d - this.pinchDist) * 0.01);
        this.pinchDist = d; this.dragging = false;
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('visibilitychange', () => this.keys.clear());
  }

  private static KEYS: Record<string, string> = { w: 'up', a: 'left', s: 'down', d: 'right', arrowup: 'up', arrowleft: 'left', arrowdown: 'down', arrowright: 'right', q: 'in', e: 'out' };

  private get interactive(): boolean { return this.mode === 'orbit' || this.mode === 'look'; }

  /** Turn the first-person view by (dYaw, dPitch) radians, within the look limits. dYaw > 0 turns left. */
  private turn(dYaw: number, dPitch: number): void {
    const L = this.lookLimits;
    this.tLookYaw = THREE.MathUtils.clamp(this.tLookYaw + dYaw, -L.yaw, L.yaw);
    this.tLookPitch = THREE.MathUtils.clamp(this.tLookPitch + dPitch, L.pitchMin, L.pitchMax);
  }
  /** Positive moves away (orbit: further out; look: lean back), negative moves in. */
  private zoom(amount: number): void {
    if (this.mode === 'look') this.tLean = THREE.MathUtils.clamp(this.tLean - amount, 0, this.lookLimits.leanMax);
    else this.tDist = THREE.MathUtils.clamp(this.tDist + amount, this.limits.distMin, this.limits.distMax);
  }

  private key(e: KeyboardEvent, down: boolean): void {
    const k = CameraRig.KEYS[e.key.toLowerCase()];
    if (!k) return;
    if (!this.interactive) { this.keys.clear(); return; }
    if (e.repeat) { e.preventDefault(); return; }
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (down) { if (!this.keys.has(k)) { this.keys.add(k); this.onKeyLook?.(); this.onInteract?.(); } } else this.keys.delete(k);
    e.preventDefault();
  }

  private touchDist(e: TouchEvent): number { const a = e.touches[0], b = e.touches[1]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }

  /** Back to the default spot outside the door. */
  home(instant = false): void {
    this.mode = 'orbit';
    this.limits = { yaw: 0.62, pitchMin: -0.2, pitchMax: 0.42, distMin: 2.2, distMax: 5.6 };
    this.target.set(0, 1.1, -0.8);
    this.tYaw = 0; this.tPitch = 0.02; this.tDist = 5.0;
    if (instant) { this.yaw = 0; this.pitch = 0.02; this.dist = 5.0; this.curPos.copy(this.orbitPos()); this.curLook.copy(this.target); }
  }

  /**
   * Step up to the door for the look-around: the camera stands just outside and turns on the spot
   * (left/right/up/down within limits); scroll, pinch or Q/E lean in toward the door line.
   */
  inspect(): void {
    this.mode = 'look';
    this.keys.clear();
    this.lookYaw = this.tLookYaw = 0; this.lookPitch = this.tLookPitch = -0.1; this.lean = this.tLean = 0;
  }
  get looking(): boolean { return this.mode === 'look'; }

  setOrbitTarget(v: THREE.Vector3): void { this.target.copy(v); }

  flyTo(pos: THREE.Vector3, look: THREE.Vector3): void { this.mode = 'fly'; this.flyPos.copy(pos); this.flyLook.copy(look); }
  /** Main-menu mode: a slow, wide sweep around the open unit and the crowd. */
  showcase(): void { this.mode = 'showcase'; }
  lock(): void { this.mode = 'locked'; }

  /** Nudge the view slightly toward a world point (used so the camera glances at whoever is yelling). */
  glance(worldX: number): void {
    if (this.mode !== 'orbit' && this.mode !== 'locked') return;
    // a nudge, not a drift: the view eases back to centre by itself (see update)
    this.tYaw = THREE.MathUtils.clamp(-worldX * 0.08, -0.22, 0.22);
  }

  private orbitPos(): THREE.Vector3 {
    // portrait screens see a lot of facade above the door: dip the eye a little
    const p = this.pitch - (this.camera.aspect < 1 ? 0.07 : 0);
    return new THREE.Vector3(
      this.target.x + Math.sin(this.yaw) * Math.cos(p) * this.dist,
      this.target.y + Math.sin(p) * this.dist + 0.35,
      this.target.z + Math.cos(this.yaw) * Math.cos(p) * this.dist,
    );
  }

  update(dt: number): void {
    const k = 1 - Math.pow(0.0005, dt); // smooth follow
    let wantPos: THREE.Vector3, wantLook: THREE.Vector3;
    if (this.mode === 'showcase') {
      const tt = performance.now() / 1000;
      // Orbit high and wide so the crowd stays between the camera and the door instead of in your face.
      const yaw = Math.sin(tt * 0.1) * 0.42;
      const portrait = this.camera.aspect < 1;
      // Portrait: the lower half is covered by cards, so aim low and close to push the unit into the upper half.
      const dist = portrait ? 7.4 : 8.2;
      const look = new THREE.Vector3(0, portrait ? -0.3 : 0.9, portrait ? 0.3 : 0);
      wantPos = new THREE.Vector3(look.x + Math.sin(yaw) * dist, (portrait ? 2.2 : 2.6) + Math.sin(tt * 0.07) * 0.2, look.z + Math.cos(yaw) * dist);
      wantLook = look;
      this.yaw = yaw; this.tYaw = 0; this.tPitch = 0.02; this.tDist = 5.0;
    } else if (this.mode === 'fly') { wantPos = this.flyPos; wantLook = this.flyLook; }
    else if (this.mode === 'look') {
      if (this.keys.size) {
        const turn = ((this.keys.has('left') ? 1 : 0) - (this.keys.has('right') ? 1 : 0)) * 1.5 * dt; // A: look left
        const tilt = ((this.keys.has('up') ? 1 : 0) - (this.keys.has('down') ? 1 : 0)) * 1.0 * dt; // W: look up
        this.turn(turn, tilt);
        this.zoom(((this.keys.has('out') ? 1 : 0) - (this.keys.has('in') ? 1 : 0)) * 1.6 * dt);
      }
      const kl = 1 - Math.pow(0.0002, dt); // snappy: the head turns where you steer it
      this.lookYaw += (this.tLookYaw - this.lookYaw) * kl; this.lookPitch += (this.tLookPitch - this.lookPitch) * kl; this.lean += (this.tLean - this.lean) * kl;
      const dir = new THREE.Vector3(-Math.sin(this.lookYaw) * Math.cos(this.lookPitch), Math.sin(this.lookPitch), -Math.cos(this.lookYaw) * Math.cos(this.lookPitch));
      wantPos = this.lookBase.clone().addScaledVector(new THREE.Vector3(-Math.sin(this.lookYaw), 0, -Math.cos(this.lookYaw)), this.lean);
      wantLook = wantPos.clone().addScaledVector(dir, 3);
    }
    else {
      if (this.keys.size) {
        const L = this.limits;
        const turn = ((this.keys.has('left') ? 1 : 0) - (this.keys.has('right') ? 1 : 0)) * 1.3 * dt; // A: look left
        const tilt = ((this.keys.has('down') ? 1 : 0) - (this.keys.has('up') ? 1 : 0)) * 0.8 * dt; // W: look up (camera dips)
        const lean = ((this.keys.has('out') ? 1 : 0) - (this.keys.has('in') ? 1 : 0)) * 2.2 * dt;
        this.tYaw = THREE.MathUtils.clamp(this.tYaw + turn, -L.yaw, L.yaw);
        this.tPitch = THREE.MathUtils.clamp(this.tPitch + tilt, L.pitchMin, L.pitchMax);
        this.tDist = THREE.MathUtils.clamp(this.tDist + lean, L.distMin, L.distMax);
      }
      if (this.mode === 'locked') this.tYaw *= Math.pow(0.45, dt); // glances relax back to centre
      this.yaw += (this.tYaw - this.yaw) * k; this.pitch += (this.tPitch - this.pitch) * k; this.dist += (this.tDist - this.dist) * k;
      wantPos = this.orbitPos(); wantLook = this.target;
    }
    const kk = this.mode === 'fly' ? 1 - Math.pow(0.02, dt) : this.mode === 'showcase' ? 1 - Math.pow(0.1, dt) : this.mode === 'look' ? 1 - Math.pow(0.0002, dt) : k;
    this.curPos.lerp(wantPos, kk); this.curLook.lerp(wantLook, kk);
    // hand-held wobble
    const t = performance.now() / 1000;
    this.camera.position.set(this.curPos.x + Math.sin(t * 1.3) * 0.008, this.curPos.y + Math.sin(t * 1.9) * 0.006, this.curPos.z);
    this.camera.lookAt(this.curLook.x + Math.sin(t * 0.7) * 0.01, this.curLook.y + Math.cos(t * 1.1) * 0.008, this.curLook.z);
  }
}
