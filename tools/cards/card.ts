/**
 * Dev-only: renders a pack model as a reveal card in the pack's card style
 * (warm radial backdrop, floating 3/4 view, soft floor shadow, 600x800 WebP).
 * Used for cards the pack does not ship, such as the steamer trunk.
 * Usage: /tools/cards/index.html?model=models/covers/cover_trunk.json&ref=cards/cover_safe.webp
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const q = new URLSearchParams(location.search);
const MODEL = q.get('model') ?? 'models/covers/cover_trunk.json';
const REF = q.get('ref') ?? 'cards/cover_safe.webp';
const YAW = Number(q.get('yaw') ?? -0.62);
const W = 600, H = 800, SS = 2;

async function refColors(): Promise<{ center: string; mid: string; edge: string; corner: string }> {
  const img = new Image(); img.src = '/assets/pack/' + REF; await img.decode();
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d')!; x.drawImage(img, 0, 0, W, H);
  const px = (u: number, v: number) => { const d = x.getImageData(u, v, 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})`; };
  // sample backdrop away from the object: upper middle, side middles, corners
  return { center: px(300, 70), mid: px(30, 400), edge: px(590, 400), corner: px(8, 8) };
}

(async () => {
  const cols = await refColors();
  const out = document.getElementById('out') as HTMLCanvasElement; const ctx = out.getContext('2d')!;
  // backdrop: warm radial glow centred slightly above the object
  const g = ctx.createRadialGradient(W * 0.5, H * 0.45, 20, W * 0.5, H * 0.5, H * 0.72);
  g.addColorStop(0, '#f9dcaa'); g.addColorStop(0.42, '#f1bd8c'); g.addColorStop(0.78, cols.mid); g.addColorStop(1, cols.corner);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // salmon edge falloff, matching the pack's cards
  const v = ctx.createRadialGradient(W * 0.5, H * 0.46, H * 0.3, W * 0.5, H * 0.5, H * 0.78);
  v.addColorStop(0, 'rgba(214,128,112,0)'); v.addColorStop(1, 'rgba(214,128,112,0.75)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  // soft floor shadow
  ctx.save(); ctx.filter = 'blur(14px)'; ctx.fillStyle = 'rgba(120,60,40,.30)';
  ctx.beginPath(); ctx.ellipse(W * 0.5, H * 0.885, W * 0.3, 15, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();

  // render model
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(W * SS, H * SS, false); r.setClearColor(0, 0); r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.3;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffe7cf, 0x6a3c33, 1.5));
  const key = new THREE.DirectionalLight(0xffd7a6, 3.6); key.position.set(4, 3.5, 3); scene.add(key);
  const fill = new THREE.DirectionalLight(0xc9b6ff, 0.55); fill.position.set(-4, 1.5, 3); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xfff0dd, 1.6); rim.position.set(1, 4, -5); scene.add(rim);
  const { b64 } = await (await fetch('/assets/pack/' + MODEL)).json();
  const buf = await (await fetch('data:application/octet-stream;base64,' + b64)).arrayBuffer();
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buf, '');
  const obj = gltf.scene; obj.rotation.y = YAW; scene.add(obj);
  const box = new THREE.Box3().setFromObject(obj); const ctr = box.getCenter(new THREE.Vector3()); const sz = box.getSize(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(24, W / H, 0.01, 100);
  const dist = Math.max(sz.x, sz.y, sz.z) / Math.tan(THREE.MathUtils.degToRad(12)) * 0.72;
  cam.position.set(ctr.x, ctr.y + dist * 0.32, ctr.z + dist); cam.lookAt(ctr.x, ctr.y - sz.y * 0.02, ctr.z);
  r.render(scene, cam);
  // object floats a little above centre, as in the pack cards
  ctx.drawImage(r.domElement, 0, -H * 0.03, W, H);
  (window as unknown as { card: string }).card = out.toDataURL('image/webp', 0.9);
})().catch((e) => { (window as unknown as { card: string }).card = 'ERR ' + e; });
