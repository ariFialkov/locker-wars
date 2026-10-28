/** Cheap particle bursts: sparks, dust, coins. */
import * as THREE from 'three';

let dot: THREE.Texture | null = null;
/** Soft round sprite so particles read as dust and sparks, not squares. */
function softDot(): THREE.Texture {
  if (dot) return dot;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  dot = new THREE.CanvasTexture(c); dot.colorSpace = THREE.SRGBColorSpace;
  return dot;
}

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
    const m = new THREE.PointsMaterial({ color, size, map: softDot(), transparent: true, opacity: 0.95, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
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

/* ------------------------------ dust cloud ------------------------------ */

/** A 2×2 atlas of soft, lumpy smoke blobs, drawn once: overlapping radial gradients with a noisy edge. */
function puffAtlas(): THREE.Texture {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S * 2;
  const x = c.getContext('2d')!;
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let cell = 0; cell < 4; cell++) {
    const ox = (cell % 2) * S, oy = Math.floor(cell / 2) * S;
    x.save(); x.beginPath(); x.rect(ox, oy, S, S); x.clip();
    // a few big lobes, then many small ones toward the rim, so the silhouette is ragged rather than round
    for (let i = 0; i < 22; i++) {
      const big = i < 5;
      const r = big ? S * (0.22 + rnd() * 0.12) : S * (0.06 + rnd() * 0.1);
      const d = big ? rnd() * S * 0.14 : S * (0.12 + rnd() * 0.26);
      const a = rnd() * Math.PI * 2;
      const cx = ox + S / 2 + Math.cos(a) * d, cy = oy + S / 2 + Math.sin(a) * d;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      const al = big ? 0.85 : 0.5;
      g.addColorStop(0, `rgba(255,255,255,${al})`); g.addColorStop(0.55, `rgba(255,255,255,${al * 0.45})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(ox, oy, S, S);
    }
    x.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

interface Mote { pos: THREE.Vector3; vel: THREE.Vector3; life: number; max: number; size: number; grow: number; rot: number; spin: number; frame: number; peak: number }

/**
 * Billowing dust: a few dozen camera-facing, slowly rotating smoke sprites drawn in one call
 * (instanced quads, billboarded in the vertex shader). Each mote drifts with its velocity,
 * slows down, swells and fades. Fog applies, so clouds sit in the scene rather than on top of it.
 */
class DustCloud {
  readonly mesh: THREE.Mesh;
  private motes: Mote[] = [];
  private readonly max: number;
  private geo: THREE.InstancedBufferGeometry;
  private aPos: THREE.InstancedBufferAttribute; private aData: THREE.InstancedBufferAttribute;

  constructor(scene: THREE.Scene, max = 110) {
    this.max = max;
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index; this.geo.attributes.position = quad.attributes.position; this.geo.attributes.uv = quad.attributes.uv;
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aData = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); this.aData.setUsage(THREE.DynamicDrawUsage); // size, rotation, alpha, frame
    this.geo.setAttribute('iPos', this.aPos); this.geo.setAttribute('iData', this.aData);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: puffAtlas() }, tint: { value: new THREE.Color(0xd2c6ad) }, shade: { value: new THREE.Color(0x6e6252) } }]),
      vertexShader: `
        attribute vec3 iPos; attribute vec4 iData;
        varying vec2 vUv; varying float vAlpha; varying float vLit;
        #include <fog_pars_vertex>
        void main() {
          float s = iData.x, r = iData.y; vAlpha = iData.z;
          vec2 fr = vec2(mod(iData.w, 2.0), floor(iData.w / 2.0));
          vUv = (uv + fr) * 0.5;
          float c = cos(r), sn = sin(r);
          vec2 p = vec2(c * position.x - sn * position.y, sn * position.x + c * position.y) * s;
          // billboard: offset in view space, so the quad always faces the camera
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          mv.xy += p;
          // fake lighting: the top of a puff catches the canopy light, the underside stays in shade
          vLit = clamp(0.62 + position.y * 0.6 + iPos.y * 0.1, 0.0, 1.0);
          gl_Position = projectionMatrix * mv;
          vec4 mvPosition = mv;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform sampler2D map; uniform vec3 tint; uniform vec3 shade;
        varying vec2 vUv; varying float vAlpha; varying float vLit;
        #include <fog_pars_fragment>
        void main() {
          float a = texture2D(map, vUv).a * vAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(mix(shade, tint, vLit), a);
          #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  /** Spawn one mote. `size` is its starting width in metres; it swells by `grow` metres over its life. */
  puff(pos: THREE.Vector3, vel: THREE.Vector3, size: number, grow: number, life: number, peak = 0.5): void {
    if (this.motes.length >= this.max) this.motes.shift();
    this.motes.push({ pos: pos.clone(), vel: vel.clone(), life: 0, max: life, size, grow, rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 0.9, frame: Math.floor(Math.random() * 4), peak });
  }

  update(dt: number): void {
    let n = 0;
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.life += dt;
      if (m.life >= m.max) { this.motes.splice(i, 1); continue; }
      const drag = Math.pow(0.35, dt);
      m.vel.multiplyScalar(drag);
      m.vel.y += 0.05 * dt; // warm dust drifts up a touch once it has slowed
      m.pos.addScaledVector(m.vel, dt);
      if (m.pos.y < 0.05) { m.pos.y = 0.05; m.vel.y = Math.abs(m.vel.y) * 0.3; }
      m.rot += m.spin * dt;
    }
    for (const m of this.motes) {
      const t = m.life / m.max;
      const ease = 1 - Math.pow(1 - t, 2);
      const size = m.size + m.grow * ease;
      const alpha = m.peak * Math.min(1, t / 0.12) * (1 - Math.pow(t, 3));
      this.aPos.setXYZ(n, m.pos.x, m.pos.y, m.pos.z);
      this.aData.setXYZW(n, size, m.rot, alpha, m.frame);
      n++;
    }
    this.geo.instanceCount = n;
    this.aPos.needsUpdate = true; this.aData.needsUpdate = true;
    this.mesh.visible = n > 0;
  }
}

export class FX {
  private sparks: Burst; private dust: Burst; private coins: Burst; private glitter: Burst;
  private cloud: DustCloud;
  constructor(scene: THREE.Scene) {
    this.sparks = new Burst(scene, 0xffb347, 0.045, 9.8, true);
    this.dust = new Burst(scene, 0x9c8f7a, 0.16, 0.15, false, 200);
    this.cloud = new DustCloud(scene);
    this.coins = new Burst(scene, 0xffd54a, 0.07, 9.8, false, 200);
    this.glitter = new Burst(scene, 0xfff6c8, 0.03, 0.5, true, 200);
  }
  sparksAt(p: THREE.Vector3): void { this.sparks.emit(p, 120, 3.2, 0.7, 1.4, 1.2); }
  dustAt(p: THREE.Vector3, n = 40): void { this.dust.emit(p, n, 0.5, 2.2, 3, 0.8); }

  /**
   * Dust rolling out from under a roll-up door as it lifts. `gap` is how far the bottom edge is
   * off the floor (metres), `rate` how hard the door is moving (0..1); call every frame of the lift.
   * Low, fast puffs spill across the drive; a thinner haze climbs the slats; grit falls from the drum.
   */
  doorDust(gap: number, rate: number, dt: number, halfWidth = 1.6): void {
    const t = (n: number) => Math.random() * n;
    // the main spill: along the full width, hugging the ground, pushed outward by the door's draught
    const spill = (gap < 0.9 ? 26 : 9) * rate * dt;
    for (let i = 0; i < spill + (Math.random() < spill % 1 ? 1 : 0); i++) {
      const x = (Math.random() * 2 - 1) * halfWidth;
      const pos = new THREE.Vector3(x, 0.08 + t(0.12) + Math.min(gap, 0.6) * 0.4, 0.12 + t(0.1));
      const vel = new THREE.Vector3(x * 0.35 + (Math.random() - 0.5) * 0.5, 0.25 + t(0.45), 0.9 + t(1.3));
      this.cloud.puff(pos, vel, 0.35 + t(0.3), 1.1 + t(1.0), 2.6 + t(2.4), 0.55 + t(0.25));
    }
    // haze rising off the slats near the bottom edge
    const haze = 7 * rate * dt;
    for (let i = 0; i < haze + (Math.random() < haze % 1 ? 1 : 0); i++) {
      const x = (Math.random() * 2 - 1) * halfWidth;
      this.cloud.puff(new THREE.Vector3(x, gap + t(0.2), 0.1), new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.35 + t(0.5), 0.3 + t(0.5)), 0.25 + t(0.25), 0.7 + t(0.7), 1.8 + t(1.4), 0.32 + t(0.15));
    }
    // grit shaken loose from the drum and hood, falling in front of the door
    if (Math.random() < 0.5 * rate) this.dust.emit(new THREE.Vector3((Math.random() * 2 - 1) * halfWidth, 2.5, 0.2), 2, 0.4, 1.6, 0.6, 0.1);
  }
  coinsAt(p: THREE.Vector3, n = 30): void { this.coins.emit(p, n, 2.6, 1.4, 1.2, 1.5); }
  glitterAt(p: THREE.Vector3, n = 40): void { this.glitter.emit(p, n, 0.6, 1.2, 1.5, 1); }
  /** One particle in every burst, far below the floor, so their shaders compile during loading. */
  warmup(at: THREE.Vector3): void { for (const b of [this.sparks, this.dust, this.coins, this.glitter]) b.emit(at, 1, 0, 0.15, 0, 0); this.cloud.puff(at, new THREE.Vector3(), 0.01, 0, 0.3, 0.05); this.update(0); }
  update(dt: number): void { this.sparks.update(dt); this.dust.update(dt); this.coins.update(dt); this.glitter.update(dt); this.cloud.update(dt); }
}
