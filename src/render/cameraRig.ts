/** Limited-orbit camera with touch/mouse look, pinch zoom and scripted fly-to. */
import * as THREE from 'three';

type Mode = 'orbit' | 'fly' | 'locked';

export class CameraRig {
  mode: Mode = 'locked';
  private yaw = 0; private pitch = 0.02; private dist = 5.0;
  private tYaw = 0; private tPitch = 0.02; private tDist = 5.0;
  private target = new THREE.Vector3(0, 1.1, -0.8);
  private flyPos = new THREE.Vector3(); private flyLook = new THREE.Vector3();
  private curPos = new THREE.Vector3(0, 1.5, 4.4); private curLook = new THREE.Vector3(0, 1.15, -0.9);
  private dragging = false; private lastX = 0; private lastY = 0; private pinchDist = 0;
  private dragMoved = 0;
  limits = { yaw: 0.62, pitchMin: -0.2, pitchMax: 0.42, distMin: 2.2, distMax: 5.6 };
  onInteract: (() => void) | null = null;

  constructor(private camera: THREE.PerspectiveCamera, el: HTMLElement) {
    el.addEventListener('pointerdown', (e) => { if (this.mode !== 'orbit') return; this.dragging = true; this.dragMoved = 0; this.lastX = e.clientX; this.lastY = e.clientY; el.setPointerCapture?.(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging || this.mode !== 'orbit') return;
      const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      this.tYaw = THREE.MathUtils.clamp(this.tYaw - dx * 0.0042, -this.limits.yaw, this.limits.yaw);
      this.tPitch = THREE.MathUtils.clamp(this.tPitch + dy * 0.003, this.limits.pitchMin, this.limits.pitchMax);
      if (this.dragMoved > 6) this.onInteract?.();
    });
    const up = () => { this.dragging = false; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
    el.addEventListener('wheel', (e) => { if (this.mode !== 'orbit') return; this.tDist = THREE.MathUtils.clamp(this.tDist + e.deltaY * 0.0025, this.limits.distMin, this.limits.distMax); e.preventDefault(); }, { passive: false });
    el.addEventListener('touchstart', (e) => { if (e.touches.length === 2) this.pinchDist = this.touchDist(e); }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && this.mode === 'orbit') {
        const d = this.touchDist(e);
        if (this.pinchDist > 0) this.tDist = THREE.MathUtils.clamp(this.tDist - (d - this.pinchDist) * 0.01, this.limits.distMin, this.limits.distMax);
        this.pinchDist = d; this.dragging = false;
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });
  }

  private touchDist(e: TouchEvent): number { const a = e.touches[0], b = e.touches[1]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }

  /** Back to the default spot outside the door. */
  home(instant = false): void {
    this.mode = 'orbit';
    this.tYaw = 0; this.tPitch = 0.02; this.tDist = 5.0;
    if (instant) { this.yaw = 0; this.pitch = 0.02; this.dist = 5.0; this.curPos.copy(this.orbitPos()); this.curLook.copy(this.target); }
  }

  setOrbitTarget(v: THREE.Vector3): void { this.target.copy(v); }

  flyTo(pos: THREE.Vector3, look: THREE.Vector3): void { this.mode = 'fly'; this.flyPos.copy(pos); this.flyLook.copy(look); }
  lock(): void { this.mode = 'locked'; }

  /** Nudge the view slightly toward a world point (used so the camera glances at whoever is yelling). */
  glance(worldX: number): void {
    if (this.mode !== 'orbit') return;
    const push = THREE.MathUtils.clamp(-worldX * 0.03, -0.08, 0.08);
    this.tYaw = THREE.MathUtils.clamp(this.tYaw + push, -this.limits.yaw, this.limits.yaw);
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
    if (this.mode === 'fly') { wantPos = this.flyPos; wantLook = this.flyLook; }
    else {
      this.yaw += (this.tYaw - this.yaw) * k; this.pitch += (this.tPitch - this.pitch) * k; this.dist += (this.tDist - this.dist) * k;
      wantPos = this.orbitPos(); wantLook = this.target;
    }
    const kk = this.mode === 'fly' ? 1 - Math.pow(0.02, dt) : k;
    this.curPos.lerp(wantPos, kk); this.curLook.lerp(wantLook, kk);
    // hand-held wobble
    const t = performance.now() / 1000;
    this.camera.position.set(this.curPos.x + Math.sin(t * 1.3) * 0.008, this.curPos.y + Math.sin(t * 1.9) * 0.006, this.curPos.z);
    this.camera.lookAt(this.curLook.x + Math.sin(t * 0.7) * 0.01, this.curLook.y + Math.cos(t * 1.1) * 0.008, this.curLook.z);
  }
}
