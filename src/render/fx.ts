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

/**
 * A 2×2 atlas of four different smoke blobs, drawn once: a wispy one, a dense one, a stretched
 * one and a broken-up one, so neighbouring puffs never share a silhouette. Each is many soft
 * lobes plus fine grain, with alpha that fades all the way to zero well inside the cell edge.
 */
function puffAtlas(): THREE.Texture {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S * 2;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const styles = [
    { lobes: 9, big: 3, spread: 0.2, alpha: 0.5, sx: 1.0 }, // wispy
    { lobes: 7, big: 5, spread: 0.12, alpha: 0.7, sx: 1.0 }, // dense core
    { lobes: 12, big: 3, spread: 0.24, alpha: 0.52, sx: 1.45 }, // stretched streak
    { lobes: 16, big: 2, spread: 0.27, alpha: 0.42, sx: 1.1 }, // broken, patchy
  ];
  styles.forEach((st, cell) => {
    const ox = (cell % 2) * S, oy = Math.floor(cell / 2) * S;
    x.save(); x.beginPath(); x.rect(ox, oy, S, S); x.clip();
    x.translate(ox + S / 2, oy + S / 2); x.scale(st.sx, 1 / Math.sqrt(st.sx));
    for (let i = 0; i < st.lobes; i++) {
      const big = i < st.big;
      const r = big ? S * (0.17 + rnd() * 0.08) : S * (0.05 + rnd() * 0.08);
      const d = big ? rnd() * S * st.spread * 0.6 : S * st.spread * (0.5 + rnd() * 0.6);
      const a = rnd() * Math.PI * 2;
      const cx = Math.cos(a) * d, cy = Math.sin(a) * d;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      const al = st.alpha * (big ? 1 : 0.7) * (0.7 + rnd() * 0.3);
      g.addColorStop(0, `rgba(255,255,255,${al})`); g.addColorStop(0.4, `rgba(255,255,255,${al * 0.6})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(-S, -S, S * 2, S * 2);
    }
    x.restore();
    // fine grain, then a radial mask so nothing touches the cell edge (no square cut-offs)
    const img = x.getImageData(ox, oy, S, S), px = img.data;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const k = (j * S + i) * 4;
      const r = Math.hypot(i - S / 2 + 0.5, j - S / 2 + 0.5) / (S / 2);
      const mask = Math.max(0, 1 - Math.pow(Math.min(1, r / 0.92), 3));
      const grain = 0.82 + rnd() * 0.36;
      px[k] = px[k + 1] = px[k + 2] = 255;
      px[k + 3] = Math.min(255, px[k + 3] * mask * grain);
    }
    x.putImageData(img, ox, oy);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

interface Mote { pos: THREE.Vector3; vel: THREE.Vector3; life: number; max: number; size: number; grow: number; rot: number; spin: number; frame: number; peak: number; shade: number; stretch: number; drag: number }

/**
 * Billowing dust: camera-facing, slowly turning smoke sprites drawn in one call (instanced quads,
 * billboarded in the vertex shader). Every puff differs in shape, size, stretch, brightness, spin
 * and drag; it drifts, slows, swells and fades in and out smoothly. Puffs fade near the camera and
 * stay off the floor so quads never slice visibly through geometry. Fog applies.
 */
class DustCloud {
  readonly mesh: THREE.Mesh;
  private motes: Mote[] = [];
  private readonly max: number;
  private geo: THREE.InstancedBufferGeometry;
  private aPos: THREE.InstancedBufferAttribute; private aData: THREE.InstancedBufferAttribute; private aLook: THREE.InstancedBufferAttribute;
  /** Global fade used to clear the air quickly (1 = normal). */
  private fade = 1; private fadeRate = 0;

  constructor(scene: THREE.Scene, max = 70) {
    this.max = max;
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index; this.geo.attributes.position = quad.attributes.position; this.geo.attributes.uv = quad.attributes.uv;
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aData = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); this.aData.setUsage(THREE.DynamicDrawUsage); // size, rotation, alpha, frame
    this.aLook = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2); this.aLook.setUsage(THREE.DynamicDrawUsage); // brightness, stretch
    this.geo.setAttribute('iPos', this.aPos); this.geo.setAttribute('iData', this.aData); this.geo.setAttribute('iLook', this.aLook);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: puffAtlas() }, tint: { value: new THREE.Color(0xd9d2c4) }, shade: { value: new THREE.Color(0x8d8476) } }]),
      vertexShader: `
        attribute vec3 iPos; attribute vec4 iData; attribute vec2 iLook;
        varying vec2 vUv; varying float vAlpha; varying float vLit;
        #include <fog_pars_vertex>
        void main() {
          float s = iData.x, r = iData.y;
          float frame = mod(iData.w, 4.0);
          vec2 fr = vec2(mod(frame, 2.0), floor(frame / 2.0));
          // frames 4..7 are the same blobs mirrored
          vec2 u = iData.w >= 4.0 ? vec2(1.0 - uv.x, uv.y) : uv;
          vUv = (u + fr) * 0.5;
          float c = cos(r), sn = sin(r);
          vec2 q = vec2(position.x * iLook.y, position.y / iLook.y);
          vec2 p = vec2(c * q.x - sn * q.y, sn * q.x + c * q.y) * s;
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          mv.xy += p;
          // no big quads in the lens: fade out as a puff comes within ~1.5 m of the camera
          vAlpha = iData.z * smoothstep(0.35, 1.5, -mv.z);
          // the top of a puff catches the canopy light, the underside stays a little darker
          vLit = clamp((0.62 + position.y * 0.55) * iLook.x, 0.0, 1.15);
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
          if (a < 0.003) discard;
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

  get count(): number { return this.motes.length; }

  /** Spawn one puff (skipped when the pool is full: nothing ever pops out mid-life). */
  puff(pos: THREE.Vector3, vel: THREE.Vector3, size: number, grow: number, life: number, peak: number): void {
    if (this.motes.length >= this.max) return;
    this.fade = 1; this.fadeRate = 0;
    this.motes.push({
      pos: pos.clone(), vel: vel.clone(), life: 0, max: life, size, grow, peak,
      rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * (0.3 + Math.random() * 0.9),
      frame: Math.floor(Math.random() * 8), shade: 0.8 + Math.random() * 0.32, stretch: 0.8 + Math.random() * 0.5,
      drag: 0.2 + Math.random() * 0.3,
    });
  }

  /** Fade every puff away over `seconds` (the air clears for the look-around). */
  settle(seconds: number): void { this.fadeRate = 1 / Math.max(0.05, seconds); }

  update(dt: number): void {
    if (this.fadeRate > 0) { this.fade = Math.max(0, this.fade - this.fadeRate * dt); if (this.fade === 0) { this.motes.length = 0; this.fadeRate = 0; this.fade = 1; } }
    let n = 0;
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.life += dt;
      if (m.life >= m.max) { this.motes.splice(i, 1); continue; }
      m.vel.multiplyScalar(Math.pow(m.drag, dt));
      m.vel.y += 0.04 * dt; // once it has slowed, dust drifts up a little
      m.pos.addScaledVector(m.vel, dt);
      m.rot += m.spin * dt;
    }
    for (const m of this.motes) {
      const t = m.life / m.max;
      const size = m.size + m.grow * (1 - Math.pow(1 - t, 2));
      // smooth in, long smooth out: the last ~60% of a puff's life is a gentle fade to nothing
      const fadeIn = Math.min(1, t / 0.14); const fadeOut = 1 - THREE.MathUtils.smoothstep(t, 0.35, 1);
      const alpha = m.peak * fadeIn * fadeIn * (3 - 2 * fadeIn) * fadeOut * this.fade;
      // keep the quad's lower edge off the floor so it never slices visibly into the ground
      const y = Math.max(m.pos.y, size * 0.32);
      this.aPos.setXYZ(n, m.pos.x, y, m.pos.z);
      this.aData.setXYZW(n, size, m.rot, alpha, m.frame);
      this.aLook.setXY(n, m.shade, m.stretch);
      n++;
    }
    this.geo.instanceCount = n;
    this.aPos.needsUpdate = true; this.aData.needsUpdate = true; this.aLook.needsUpdate = true;
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
   * A short, low spill along the sill that rolls out onto the drive and thins away within a few
   * seconds, and a faint haze off the slats.
   */
  doorDust(gap: number, rate: number, dt: number, halfWidth = 1.6): void {
    const r = Math.random;
    const spawn = (perSecond: number, fn: () => void) => { const n = perSecond * dt; for (let i = 0; i < Math.floor(n) + (r() < n % 1 ? 1 : 0); i++) fn(); };
    // the spill: strongest while the gap is still low, then it tails off
    const strength = Math.sqrt(rate) * (gap < 0.9 ? 1 : Math.max(0.1, 1 - (gap - 0.9) / 1.1));
    spawn(24 * strength, () => {
      const x = (r() * 2 - 1) * halfWidth * 0.95;
      const size = 0.3 + Math.pow(r(), 2) * 0.7; // mostly small, a few big
      this.cloud.puff(
        new THREE.Vector3(x, 0.06 + r() * 0.1, 0.18 + r() * 0.12),
        new THREE.Vector3(x * 0.25 + (r() - 0.5) * 0.6, 0.12 + r() * 0.3, 0.6 + r() * 1.0),
        size, 0.6 + r() * 1.0, 1.4 + r() * 1.4, 0.45 + r() * 0.35,
      );
    });
    // faint haze lifting off the bottom slats while they are low enough to see
    if (gap < 1.4) spawn(5 * Math.sqrt(rate), () => {
      const x = (r() * 2 - 1) * halfWidth;
      this.cloud.puff(new THREE.Vector3(x, gap + r() * 0.15, 0.16), new THREE.Vector3((r() - 0.5) * 0.25, 0.25 + r() * 0.35, 0.25 + r() * 0.4), 0.2 + r() * 0.22, 0.4 + r() * 0.5, 1.0 + r() * 0.9, 0.25 + r() * 0.15);
    });
  }

  coinsAt(p: THREE.Vector3, n = 30): void { this.coins.emit(p, n, 2.6, 1.4, 1.2, 1.5); }
  glitterAt(p: THREE.Vector3, n = 40): void { this.glitter.emit(p, n, 0.6, 1.2, 1.5, 1); }

  /** Clear any lingering dust smoothly over `seconds`. */
  settleDust(seconds = 0.9): void { this.cloud.settle(seconds); }

  warmup(at: THREE.Vector3): void { for (const b of [this.sparks, this.dust, this.coins, this.glitter]) b.emit(at, 1, 0, 0.15, 0, 0); this.cloud.puff(at, new THREE.Vector3(), 0.01, 0, 0.3, 0.05); this.update(0); }
  update(dt: number): void { this.sparks.update(dt); this.dust.update(dt); this.coins.update(dt); this.glitter.update(dt); this.cloud.update(dt); }
}
