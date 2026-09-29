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

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.05, 80);
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
    this.flashlight.shadow.bias = -0.0005;
    this.flashlight.position.set(0.25, -0.2, 0);
    this.flashlight.target.position.set(0, 0, -5);
    this.camera.add(this.flashlight, this.flashlight.target);
    this.scene.add(this.camera);

    this.workLight = new THREE.PointLight(0xfff0d0, 0, 4, 2);
    this.scene.add(this.workLight);
    this.interiorBulb = new THREE.PointLight(0xffe2b0, 0, 6, 2);
    this.interiorBulb.position.set(0, LOCKER.height - 0.2, -LOCKER.depth / 2);
    this.scene.add(this.interiorBulb);

    buildEnvironment(this.scene, quality);
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

export function buildEnvironment(scene: THREE.Scene, quality: Quality): void {
  const W = LOCKER.width, D = LOCKER.depth, H = LOCKER.height;
  const wallT = 0.15;

  // sky dome (gradient) — dusk
  const skyGeo = new THREE.SphereGeometry(60, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x1c2540) }, mid: { value: new THREE.Color(0x6b4a6e) }, bot: { value: new THREE.Color(0xd08a4a) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top, mid, bot; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h > 0.15 ? mix(mid, top, smoothstep(0.15, 0.7, h)) : mix(bot, mid, smoothstep(-0.05, 0.15, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // driveway
  const asphalt = asphaltTexture(); asphalt.repeat.set(20, 20);
  const ground = mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.001, 20); ground.castShadow = false;
  scene.add(ground);

  // unit interior
  const concrete = concreteTexture(); concrete.repeat.set(2, 2);
  const floor = mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.001, -D / 2); floor.castShadow = false;
  scene.add(floor);
  const wallTex = corrugatedTexture('#6e6a62', '#4d4a44', 18); wallTex.repeat.set(2, 1);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.75, metalness: 0.25 });
  const backWall = mesh(new THREE.PlaneGeometry(W, H), wallMat); backWall.position.set(0, H / 2, -D); scene.add(backWall);
  const sideTex = corrugatedTexture('#6e6a62', '#4d4a44', 18); sideTex.repeat.set(2, 1);
  const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.75, metalness: 0.25 });
  const lw = mesh(new THREE.PlaneGeometry(D, H), sideMat); lw.rotation.y = Math.PI / 2; lw.position.set(-W / 2, H / 2, -D / 2); scene.add(lw);
  const rw = mesh(new THREE.PlaneGeometry(D, H), sideMat); rw.rotation.y = -Math.PI / 2; rw.position.set(W / 2, H / 2, -D / 2); scene.add(rw);
  const ceil = mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0x3a3733, roughness: 0.9 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, -D / 2); scene.add(ceil);
  // dead bulb
  const bulb = mesh(new THREE.SphereGeometry(0.06, 10, 8), mat(0xddd6c0, { rough: 0.3, emissive: 0.05 })); bulb.position.set(0, H - 0.2, -D / 2); scene.add(bulb);
  const cord = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.15), mat(0x111111)); cord.position.set(0, H - 0.08, -D / 2); scene.add(cord);

  // the building: a long row of units, ours in the middle
  const bodyMat = new THREE.MeshStandardMaterial({ map: corrugatedTexture('#8c8074', '#6a6057', 30), roughness: 0.8, metalness: 0.2 });
  (bodyMat.map as THREE.Texture).repeat.set(8, 1);
  const rowLen = 40;
  // left/right blocks of the facade (leave our door opening), plus roof slab
  for (const s of [-1, 1]) {
    const blockW = (rowLen - W) / 2;
    const b = mesh(new THREE.BoxGeometry(blockW, H + 0.6, D + wallT), bodyMat);
    b.position.set(s * (W / 2 + blockW / 2), (H + 0.6) / 2, -D / 2);
    scene.add(b);
  }
  const roof = mesh(new THREE.BoxGeometry(rowLen, 0.25, D + 1.2), new THREE.MeshStandardMaterial({ color: 0x4a4540, roughness: 0.9 }));
  roof.position.set(0, H + 0.6 + 0.125, -D / 2 + 0.4); scene.add(roof);
  // header above our door
  const header = mesh(new THREE.BoxGeometry(W + 0.4, 0.6, wallT), bodyMat); header.position.set(0, H + 0.3, 0); scene.add(header);
  // door frame pillars
  for (const s of [-1, 1]) { const p = mesh(new THREE.BoxGeometry(0.2, H, 0.2), new THREE.MeshStandardMaterial({ color: 0x4f463c, roughness: 0.7, metalness: 0.4 })); p.position.set(s * (W / 2 + 0.1), H / 2, 0); scene.add(p); }
  // neighbouring closed doors (decor)
  const doorTex = corrugatedTexture('#c8742e', '#9a5722', 16); doorTex.repeat.set(1, 1);
  const doorMat = new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.6, metalness: 0.3 });
  for (let i = -4; i <= 4; i++) {
    if (i === 0) continue;
    const d = mesh(new THREE.BoxGeometry(W - 0.3, H - 0.1, 0.06), doorMat);
    d.position.set(i * (W + 0.6), (H - 0.1) / 2, 0.04);
    scene.add(d);
    const sign = mesh(new THREE.BoxGeometry(0.35, 0.18, 0.02), mat(0xf2e9d8, { rough: 0.6 }));
    sign.position.set(i * (W + 0.6) - W / 2 + 0.35, H - 0.35, 0.12); scene.add(sign);
  }
  // our unit's number sign
  const numTex = canvasTexture(256, 128, (ctx) => { ctx.fillStyle = '#f2e9d8'; ctx.fillRect(0, 0, 256, 128); ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 84px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('B-214', 128, 66); });
  const ourSign = mesh(new THREE.BoxGeometry(0.5, 0.25, 0.02), new THREE.MeshStandardMaterial({ map: numTex, roughness: 0.6 }));
  ourSign.position.set(W / 2 + 0.55, H - 0.3, 0.09); scene.add(ourSign);

  // canopy light fixtures (warm) along the row
  for (let i = -3; i <= 3; i++) {
    const fx = mesh(new THREE.BoxGeometry(0.5, 0.08, 0.2), mat(0xfff1c8, { emissive: 1.4 }));
    fx.position.set(i * (W + 0.6), H + 0.55, 0.45); scene.add(fx);
  }
  const canopyLight = new THREE.PointLight(0xffe9c0, quality === 'high' ? 25 : 18, 9, 2);
  canopyLight.position.set(0, H + 0.4, 0.8);
  scene.add(canopyLight);

  // far background: second row of units across the drive + a few props
  const far = mesh(new THREE.BoxGeometry(rowLen, H + 0.9, 3), bodyMat); far.position.set(0, (H + 0.9) / 2, 15); scene.add(far);
  for (let i = -4; i <= 4; i++) { const d = mesh(new THREE.BoxGeometry(W - 0.3, H - 0.1, 0.06), doorMat); d.position.set(i * (W + 0.6), (H - 0.1) / 2, 13.46); d.rotation.y = Math.PI; scene.add(d); }
  // a pallet & a dumpster by the wall for flavour
  const dumpster = box(1.8, 1.2, 1.0, 0x2f6b3a, { rough: 0.6, metal: 0.3 }); dumpster.position.set(-6.5, 0.6, 1.2); scene.add(dumpster);
  const lid = box(1.85, 0.08, 1.05, 0x255430, { rough: 0.6, metal: 0.3 }); lid.position.set(-6.5, 1.24, 1.2); scene.add(lid);
  const pallet = box(1.2, 0.12, 1.0, 0x9a7b4f); pallet.position.set(6.2, 0.06, 0.9); scene.add(pallet);
  const cone1 = mesh(new THREE.ConeGeometry(0.18, 0.5, 12), mat(0xff7b1a, { rough: 0.6 })); cone1.position.set(2.6, 0.25, 3.6); scene.add(cone1);
}
