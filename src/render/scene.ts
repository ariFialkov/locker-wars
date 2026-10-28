/** Renderer, camera, lights and the storage-facility environment. */
import * as THREE from 'three';
import { LOCKER } from '../game/lockerGen';
import { box, mat, mesh, canvasTexture } from '../game/items/shapes';

export type Quality = 'low' | 'high';

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly flashlight: THREE.SpotLight;
  readonly workLight: THREE.PointLight;
  readonly interiorBulb: THREE.PointLight;
  readonly quality: Quality;
  /** Repaint the unit-number sign above the door. */
  readonly setUnitNumber: (label: string) => void;
  /** The row of units; slides between rounds. */
  readonly facility: Facility;
  /** Our unit's interior and door: hidden while the row slides past a stand-in. */
  readonly unit: THREE.Group;
  private lastT = performance.now();

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'high', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 80);
    this.camera.position.set(0, 1.5, 4);

    this.scene.fog = new THREE.Fog(0x1a1712, 18, 60);

    // Lights: warm low sun raking in from the driveway; interior stays dim on purpose.
    const hemi = new THREE.HemisphereLight(0x8fa6c9, 0x2b2118, 0.55);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffd9a8, 2.2);
    this.sun.position.set(4, 5.5, 7);
    this.sun.target.position.set(0, 0.5, -0.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 25;
    this.sun.shadow.camera.left = -7; this.sun.shadow.camera.right = 7; this.sun.shadow.camera.top = 7; this.sun.shadow.camera.bottom = -7;
    this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    this.flashlight = new THREE.SpotLight(0xfff3d6, 0, 12, 0.42, 0.55, 1.2);
    this.flashlight.castShadow = quality === 'high';
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.bias = -0.002;
    this.flashlight.shadow.normalBias = 0.05;
    this.flashlight.shadow.radius = 3;
    this.flashlight.position.set(0.25, -0.2, 0);
    this.flashlight.target.position.set(0, 0, -5);
    this.camera.add(this.flashlight, this.flashlight.target);
    this.scene.add(this.camera);

    this.workLight = new THREE.PointLight(0xfff0d0, 0, 4, 2);
    this.scene.add(this.workLight);
    this.interiorBulb = new THREE.PointLight(0xffe2b0, 0, 6, 2);
    this.interiorBulb.position.set(0, LOCKER.height - 0.2, -LOCKER.depth / 2);
    this.scene.add(this.interiorBulb);

    const env = buildEnvironment(this.scene, quality);
    this.setUnitNumber = env.setUnitNumber; this.facility = env.facility; this.unit = env.unit;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 68 : 56; // a touch wider in portrait so the door still fits
    this.camera.updateProjectionMatrix();
  }

  setFlashlight(on: boolean): void { this.flashlight.intensity = on ? 60 : 0; }
  get flashlightOn(): boolean { return this.flashlight.intensity > 0; }

  /** Frame delta in seconds, capped so a hitch or a slow device never freezes game logic. */
  dt(): number { const now = performance.now(); const d = (now - this.lastT) / 1000; this.lastT = now; return Math.min(0.25, Math.max(0, d)); }
  render(): void { this.renderer.render(this.scene, this.camera); }
}

/* -------------------------- environment -------------------------- */

function corrugatedTexture(base: string, dark: string, stripes = 24): THREE.CanvasTexture {
  const t = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < stripes; i++) {
      const x = (i / stripes) * 256;
      const g = ctx.createLinearGradient(x, 0, x + 256 / stripes, 0);
      g.addColorStop(0, dark); g.addColorStop(0.5, base); g.addColorStop(1, dark);
      ctx.fillStyle = g; ctx.fillRect(x, 0, 256 / stripes + 1, 256);
    }
    // grime
    for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; ctx.fillRect(Math.random() * 256, Math.random() * 256, Math.random() * 20, Math.random() * 3); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function concreteTexture(): THREE.CanvasTexture {
  const t = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#5a5651'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 6000; i++) { const v = 60 + Math.random() * 60; ctx.fillStyle = `rgba(${v},${v - 4},${v - 8},${Math.random() * 0.5})`; ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    for (let i = 0; i < 12; i++) { ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.moveTo(Math.random() * 256, Math.random() * 256); ctx.lineTo(Math.random() * 256, Math.random() * 256); ctx.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function asphaltTexture(): THREE.CanvasTexture {
  const t = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#2c2b2a'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++) { const v = 25 + Math.random() * 50; ctx.fillStyle = `rgba(${v},${v},${v},0.6)`; ctx.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Unit pitch along the row: a door plus the wall between doors. */
export const UNIT_PITCH = LOCKER.width + 1.2;

/** The sign label of unit `i` along the row (round n opens unit n; the first is B-214). */
export function unitLabel(i: number): string {
  const num = 213 + i;
  const letter = String.fromCharCode('A'.charCodeAt(0) + Math.min(25, Math.floor(num / 100) - 1));
  return `${letter}-${num}`;
}

/** A closed roll-up door as one texture: 16 slats in the real door's two oranges, with a groove between each. */
function slatTexture(): THREE.CanvasTexture {
  const t = canvasTexture(64, 512, (ctx) => {
    const n = 16, h = 512 / n;
    for (let i = 0; i < n; i++) {
      const y = 512 - (i + 1) * h; // slat 0 at the bottom
      ctx.fillStyle = i % 2 ? '#d0782f' : '#a85d22'; ctx.fillRect(0, y, 64, h);
      const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(0.15, 'rgba(0,0,0,0)'); g.addColorStop(0.85, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = g; ctx.fillRect(0, y, 64, h);
    }
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function signTexture(label: string): { tex: THREE.CanvasTexture; paint: (label: string) => void } {
  let ctx: CanvasRenderingContext2D | null = null;
  const paint = (l: string) => { const c = ctx!; c.fillStyle = '#f2e9d8'; c.fillRect(0, 0, 256, 128); c.fillStyle = '#1a1a1a'; c.font = 'bold 84px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(l, 128, 66); };
  const tex = canvasTexture(256, 128, (c) => { ctx = c; paint(label); });
  return { tex, paint };
}

interface Segment { index: number; group: THREE.Group; door: THREE.Group; sign: THREE.Mesh; setLabel: (l: string) => void }

/**
 * The storage facility: a row of identical units along x, built one segment per unit and
 * extended lazily as the player moves down the row. Our unit always sits at the origin;
 * between rounds the whole row slides one pitch while a stand-in closed door covers the
 * unit we are leaving and the one we arrive at (see `slide`).
 *
 * Nothing here shares a plane with anything else: pillars sit in front of the wall planes,
 * the header starts above the door slats, doors and signs stand proud of the facade.
 */
export class Facility {
  /** Everything that slides: facade segments, props, canopy lights, ground. */
  readonly row = new THREE.Group();
  private segments = new Map<number, Segment>();
  private unit = 0;
  private readonly bodyMat: THREE.MeshStandardMaterial;
  private readonly doorMat: THREE.MeshStandardMaterial;
  private readonly roofMat = new THREE.MeshStandardMaterial({ color: 0x4a4540, roughness: 0.9 });
  private readonly pillarMat = new THREE.MeshStandardMaterial({ color: 0x4f463c, roughness: 0.7, metalness: 0.4 });
  private readonly fixtureMat = mat(0xfff1c8, { emissive: 1.4 });
  private readonly lights: THREE.PointLight[] = [];
  private readonly ground: THREE.Mesh;
  private readonly far: THREE.Mesh;

  constructor(scene: THREE.Scene, quality: Quality) {
    scene.add(this.row);
    this.bodyMat = new THREE.MeshStandardMaterial({ map: corrugatedTexture('#8c8074', '#6a6057', 30), roughness: 0.8, metalness: 0.2 });
    (this.bodyMat.map as THREE.Texture).repeat.set(2, 1);
    this.doorMat = new THREE.MeshStandardMaterial({ map: slatTexture(), roughness: 0.55, metalness: 0.35 });

    // driveway: starts at the door line so it never shares a plane with the unit floor; its texture
    // repeats every unit pitch, so re-basing the row by whole units never shifts it visibly
    const asphalt = asphaltTexture(); asphalt.repeat.set(120 / UNIT_PITCH, 80 / UNIT_PITCH);
    this.ground = mesh(new THREE.PlaneGeometry(120, 80), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95 }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.position.set(0, 0, 40); this.ground.castShadow = false;
    this.row.add(this.ground);
    // the row of units across the drive
    this.far = mesh(new THREE.BoxGeometry(UNIT_PITCH * 13, LOCKER.height + 0.9, 3), this.bodyMat); this.far.position.set(0, (LOCKER.height + 0.9) / 2, 15);
    this.row.add(this.far);
    // three warm canopy lights: ours and the neighbours', so the row reads as a lit facility
    for (const i of [-1, 0, 1]) {
      const l = new THREE.PointLight(0xffe9c0, i === 0 ? (quality === 'high' ? 25 : 18) : 9, i === 0 ? 9 : 8, 2);
      l.position.set(i * UNIT_PITCH, LOCKER.height + 0.4, i === 0 ? 0.8 : 0.9);
      this.lights.push(l); this.row.add(l);
    }
    this.setUnit(1);
  }

  /** Build the facade for unit `i` at its position relative to the current unit. */
  private segment(i: number): Segment {
    let s = this.segments.get(i);
    if (s) return s;
    const W = LOCKER.width, D = LOCKER.depth, H = LOCKER.height, P = UNIT_PITCH, wallT = 0.15;
    const g = new THREE.Group();
    // wall between this door and the next: full depth, bottom on the ground, face 7.5 cm proud of the door line
    const wall = mesh(new THREE.BoxGeometry(P - W - 0.06, H + 0.6, D + wallT), this.bodyMat);
    wall.position.set(W / 2 + 0.03 + (P - W - 0.06) / 2, (H + 0.6) / 2, -D / 2);
    g.add(wall);
    // header above the door: starts exactly at the door top, so it never shares a face with the slats
    const header = mesh(new THREE.BoxGeometry(W + 0.06, 0.6, D + wallT), this.bodyMat);
    header.position.set(0, H + 0.3, -D / 2);
    g.add(header);
    const roof = mesh(new THREE.BoxGeometry(P, 0.25, D + 1.2), this.roofMat);
    roof.position.set(P / 2 - 0.3, H + 0.6 + 0.125, -D / 2 + 0.4); g.add(roof);
    // door-frame pillars stand in front of the interior wall planes (z 0..0.2), never on them
    for (const sd of [-1, 1]) { const p = mesh(new THREE.BoxGeometry(0.2, H, 0.2), this.pillarMat); p.position.set(sd * (W / 2 + 0.1), H / 2, 0.1); g.add(p); }
    // a closed roll-up door (stand-in; our own unit has the real one) with a padlock, proud of the facade
    const door = new THREE.Group();
    const slab = mesh(new THREE.BoxGeometry(W + 0.1, H - 0.08, 0.06), this.doorMat); slab.position.set(0, (H - 0.08) / 2, 0.11); door.add(slab);
    const rail = box(W + 0.1, 0.06, 0.08, 0x333333, { rough: 0.5, metal: 0.6 }); rail.position.set(0, 0.03, 0.12); door.add(rail);
    const hood = box(W + 0.3, 0.42, 0.42, 0x3a3530, { rough: 0.6, metal: 0.4 }); hood.position.set(0, H - 0.03, 0.12); door.add(hood);
    const hasp = box(0.2, 0.06, 0.03, 0x777777, { rough: 0.4, metal: 0.8 }); hasp.position.set(0, 0.36, 0.155); door.add(hasp);
    const lock = box(0.18, 0.16, 0.07, 0xc9a227, { rough: 0.3, metal: 0.9 }); lock.position.set(0, 0.22, 0.17); door.add(lock);
    g.add(door);
    // unit number sign, right of the door
    const { tex, paint } = signTexture(unitLabel(i));
    const sign = mesh(new THREE.BoxGeometry(0.5, 0.25, 0.02), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    sign.position.set(W / 2 + 0.6, H - 0.3, 0.11); g.add(sign);
    // canopy fixture over the door, and the auctioneer's podium plank
    const fx = mesh(new THREE.BoxGeometry(0.5, 0.08, 0.2), this.fixtureMat); fx.position.set(0, H + 0.55, 0.45); g.add(fx);
    const podium = box(0.5, 0.05, 0.4, 0x5c3a21); podium.position.set(-2.85, 0.025, 0.85); g.add(podium);
    // flavour props across the drive, scattered deterministically so each stretch of the row looks different
    const h = ((i * 2654435761) >>> 0) % 7;
    if (h === 1 || h === 4) { const d = box(1.8, 1.2, 1.0, 0x2f6b3a, { rough: 0.6, metal: 0.3 }); d.position.set(0.4, 0.6, 12.6); g.add(d); const lid = box(1.85, 0.08, 1.05, 0x255430, { rough: 0.6, metal: 0.3 }); lid.position.set(0.4, 1.24, 12.6); g.add(lid); }
    if (h === 2 || h === 5) { const pal = box(1.2, 0.12, 1.0, 0x9a7b4f); pal.position.set(-0.6, 0.06, 12.4); g.add(pal); }
    if (h === 3 || h === 6) { const cone = mesh(new THREE.ConeGeometry(0.18, 0.5, 12), mat(0xff7b1a, { rough: 0.6 })); cone.position.set(1.2, 0.25, 10.8); g.add(cone); }
    // closed door across the drive (decor), proud of the far block's face
    const farDoor = mesh(new THREE.BoxGeometry(W - 0.3, H - 0.1, 0.06), this.doorMat); farDoor.position.set(0, (H - 0.1) / 2, 13.42); farDoor.rotation.y = Math.PI; g.add(farDoor);
    s = { index: i, group: g, door, sign, setLabel: (l) => { paint(l); tex.needsUpdate = true; } };
    this.segments.set(i, s);
    this.row.add(g);
    return s;
  }

  /** Make unit `u` the one at the origin; build its neighbours and drop far-away segments. */
  setUnit(u: number): void {
    this.unit = u;
    const keep = 6;
    for (const [i, s] of this.segments) if (Math.abs(i - u) > keep) { this.row.remove(s.group); s.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); if (m === s.sign) (m.material as THREE.MeshStandardMaterial).map?.dispose(); } }); this.segments.delete(i); }
    for (let i = u - keep; i <= u + keep; i++) {
      const s = this.segment(i);
      s.group.position.x = (i - u) * UNIT_PITCH;
      s.door.visible = i !== u; // the real door stands in our unit
      s.sign.visible = i !== u;
    }
    this.row.position.x = 0;
  }

  get currentUnit(): number { return this.unit; }

  /** Slide the row so the unit at `k` pitches along (0 = here, 1 = the next unit at the origin). */
  slide(k: number): void { this.row.position.x = -k * UNIT_PITCH; }

  /** Show (or hide) the stand-in door of our own unit, used while the row slides. */
  showStandIn(on: boolean): void {
    const s = this.segments.get(this.unit);
    if (s) { s.door.visible = on; s.sign.visible = on; }
  }
}

export function buildEnvironment(scene: THREE.Scene, quality: Quality): { facility: Facility; setUnitNumber: (label: string) => void; unit: THREE.Group } {
  const W = LOCKER.width, D = LOCKER.depth, H = LOCKER.height;

  // sky dome (gradient) — dusk
  const skyGeo = new THREE.SphereGeometry(60, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x1c2540) }, mid: { value: new THREE.Color(0x6b4a6e) }, bot: { value: new THREE.Color(0xd08a4a) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top, mid, bot; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h > 0.15 ? mix(mid, top, smoothstep(0.15, 0.7, h)) : mix(bot, mid, smoothstep(-0.05, 0.15, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // our unit's interior (the door is added to this group by the round controller)
  const unit = new THREE.Group();
  scene.add(unit);
  const concrete = concreteTexture(); concrete.repeat.set(2, 2);
  const floor = mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.001, -D / 2); floor.castShadow = false;
  unit.add(floor);
  const wallTex = corrugatedTexture('#6e6a62', '#4d4a44', 18); wallTex.repeat.set(2, 1); wallTex.anisotropy = 8;
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.75, metalness: 0.25 });
  const backWall = mesh(new THREE.PlaneGeometry(W, H), wallMat); backWall.position.set(0, H / 2, -D + 0.01); unit.add(backWall);
  const sideTex = corrugatedTexture('#6e6a62', '#4d4a44', 18); sideTex.repeat.set(2, 1); sideTex.anisotropy = 8;
  const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.75, metalness: 0.25 });
  const lw = mesh(new THREE.PlaneGeometry(D, H), sideMat); lw.rotation.y = Math.PI / 2; lw.position.set(-W / 2, H / 2, -D / 2); unit.add(lw);
  const rw = mesh(new THREE.PlaneGeometry(D, H), sideMat); rw.rotation.y = -Math.PI / 2; rw.position.set(W / 2, H / 2, -D / 2); unit.add(rw);
  const ceil = mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0x3a3733, roughness: 0.9 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H - 0.01, -D / 2); ceil.castShadow = false; unit.add(ceil);
  // dead bulb
  const bulb = mesh(new THREE.SphereGeometry(0.06, 10, 8), mat(0xddd6c0, { rough: 0.3, emissive: 0.05 })); bulb.position.set(0, H - 0.2, -D / 2); unit.add(bulb);
  const cord = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.15), mat(0x111111)); cord.position.set(0, H - 0.08, -D / 2); unit.add(cord);
  // our unit's number sign
  const { tex: numTex, paint: paintSign } = signTexture(unitLabel(1));
  const ourSign = mesh(new THREE.BoxGeometry(0.5, 0.25, 0.02), new THREE.MeshStandardMaterial({ map: numTex, roughness: 0.6 }));
  ourSign.position.set(W / 2 + 0.6, H - 0.3, 0.11); unit.add(ourSign);

  const facility = new Facility(scene, quality);
  return { facility, unit, setUnitNumber: (label: string) => { paintSign(label); numTex.needsUpdate = true; } };
}
