/**
 * Dev-only page used by scripts/item-catalog.mjs: exposes the game's item and
 * container data (descriptions, values, rarity, pack container fits). It can also
 * render the procedural fallback models (renderItem/renderCover). Not part of the
 * game build.
 */
import * as THREE from 'three';
import { ITEM_BANK } from '../../src/game/items/bank';
import { buildCover, coverDims, COVER_LABEL } from '../../src/game/items/covers';
import { coversFor, CATEGORY_LABEL, type CoverKind, type SizeClass } from '../../src/game/items/types';
import { THEMES } from '../../src/game/lockerGen';
import { VALUE_SCALE } from '../../src/core/config';
import { makeRNG } from '../../src/core/rng';
import { DESCRIPTIONS, COVER_DESCRIPTIONS } from './descriptions';
import { COVER_PACK_ID } from '../../src/pack/manifest';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: true });
renderer.setPixelRatio(1);
renderer.setSize(480, 480, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a2f26, 1.1));
const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0xbfd4ff, 1.1);
scene.add(rim);
const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.ShadowMaterial({ opacity: 0.28 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
scene.add(ground);
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 200);

function shoot(obj: THREE.Object3D): string {
  scene.add(obj);
  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const r = Math.max(0.08, size.length() / 2);
  // 3/4 view from front-right, a little above
  const dir = new THREE.Vector3(Math.sin(0.62), 0.42, Math.cos(0.62)).normalize();
  const dist = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.02;
  camera.position.copy(center).addScaledVector(dir, dist);
  camera.near = dist / 50; camera.far = dist * 4; camera.updateProjectionMatrix();
  camera.lookAt(center);
  ground.scale.setScalar(r * 3); ground.position.set(center.x, box.min.y + 0.0005, center.z);
  key.position.copy(center).add(new THREE.Vector3(-r * 1.6, r * 3, r * 2.2)); key.target.position.copy(center);
  const sc = key.shadow.camera as THREE.OrthographicCamera;
  sc.left = sc.bottom = -r * 1.6; sc.right = sc.top = r * 1.6; sc.near = 0.01; sc.far = r * 10; sc.updateProjectionMatrix();
  rim.position.copy(center).add(new THREE.Vector3(r * 2, r * 1.2, -r * 2.5));
  renderer.render(scene, camera);
  const url = canvas.toDataURL('image/webp', 0.86);
  scene.remove(obj);
  return url;
}

function rarity(w: number): string { return w >= 6 ? 'Common' : w >= 4 ? 'Uncommon' : w >= 2 ? 'Rare' : 'Very rare'; }

const SAMPLE_SEED = 20261020;

(window as unknown as Record<string, unknown>).catalog = {
  scale: VALUE_SCALE,
  categories: CATEGORY_LABEL,
  items: ITEM_BANK.map((d) => ({
    id: d.id, name: d.name, category: d.category, size: d.size,
    value: d.value, // already scaled to game dollars
    rarity: rarity(d.weight), weight: d.weight,
    luxury: !!d.luxury, valuable: !!d.valuable, soft: !!d.soft, stackable: !!d.stackable,
    covers: coversFor(d).map((k) => COVER_LABEL[k]),
    themes: THEMES.filter((t) => (t.bias[d.category] ?? 0) >= 1.4).map((t) => t.name),
    footprint: d.footprint,
    description: DESCRIPTIONS[d.id] ?? '',
  })),
  covers: (Object.keys(COVER_LABEL) as CoverKind[]).map((k) => ({ kind: k, name: COVER_LABEL[k], description: COVER_DESCRIPTIONS[k] ?? '', card: `cards/${COVER_PACK_ID[k]}.webp` })),
  renderItem(id: string): string {
    const d = ITEM_BANK.find((x) => x.id === id)!;
    return shoot(d.build(makeRNG(SAMPLE_SEED ^ d.id.length * 7919)));
  },
  renderCover(kind: CoverKind): string {
    const size: SizeClass = kind === 'tarp' ? 'L' : kind === 'blanket' ? 'M' : 'S';
    const rng = makeRNG(SAMPLE_SEED + kind.length);
    return shoot(buildCover(rng, kind, coverDims(rng, kind, size)));
  },
  missing: ITEM_BANK.filter((d) => !DESCRIPTIONS[d.id]).map((d) => d.id),
};
