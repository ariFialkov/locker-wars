/** Cheap particle bursts: sparks, dust, coins. */
import * as THREE from 'three';

interface P { pos: THREE.Vector3; vel: THREE.Vector3; life: number; max: number; size: number }

class Burst {
  readonly points: THREE.Points;
  private ps: P[] = [];
  private geo = new THREE.BufferGeometry();
  private gravity: number;
  constructor(scene: THREE.Scene, color: number, size: number, gravity: number, additive: boolean, max = 300) {
    this.gravity = gravity;
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(max), 1));
    const m = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.95, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
    this.points = new THREE.Points(this.geo, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(at: THREE.Vector3, n: number, speed: number, life: number, spread = 1, up = 0.5): void {
    for (let i = 0; i < n; i++) {
      if (this.ps.length >= (this.geo.attributes.position as THREE.BufferAttribute).count) break;
      const dir = new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * up + 0.2, (Math.random() - 0.5) * spread).normalize();
      this.ps.push({ pos: at.clone(), vel: dir.multiplyScalar(speed * (0.4 + Math.random() * 0.8)), life: 0, max: life * (0.6 + Math.random() * 0.8), size: 1 });
    }
  }
  update(dt: number): void {
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    let n = 0;
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      p.life += dt;
      if (p.life > p.max) { this.ps.splice(i, 1); continue; }
      p.vel.y -= this.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.01) { p.pos.y = 0.01; p.vel.y *= -0.35; p.vel.x *= 0.7; p.vel.z *= 0.7; }
    }
    for (const p of this.ps) { pos.setXYZ(n++, p.pos.x, p.pos.y, p.pos.z); }
    this.geo.setDrawRange(0, n);
    pos.needsUpdate = true;
    (this.points.material as THREE.PointsMaterial).opacity = this.ps.length ? 0.95 : 0;
  }
}

export class FX {
  private sparks: Burst; private dust: Burst; private coins: Burst; private glitter: Burst;
  constructor(scene: THREE.Scene) {
    this.sparks = new Burst(scene, 0xffb347, 0.045, 9.8, true);
    this.dust = new Burst(scene, 0x9c8f7a, 0.16, 0.15, false, 200);
    this.coins = new Burst(scene, 0xffd54a, 0.07, 9.8, false, 200);
    this.glitter = new Burst(scene, 0xfff6c8, 0.03, 0.5, true, 200);
  }
  sparksAt(p: THREE.Vector3): void { this.sparks.emit(p, 120, 3.2, 0.7, 1.4, 1.2); }
  dustAt(p: THREE.Vector3, n = 40): void { this.dust.emit(p, n, 0.5, 2.2, 3, 0.8); }
  coinsAt(p: THREE.Vector3, n = 30): void { this.coins.emit(p, n, 2.6, 1.4, 1.2, 1.5); }
  glitterAt(p: THREE.Vector3, n = 40): void { this.glitter.emit(p, n, 0.6, 1.2, 1.5, 1); }
  update(dt: number): void { this.sparks.update(dt); this.dust.update(dt); this.coins.update(dt); this.glitter.update(dt); }
}
