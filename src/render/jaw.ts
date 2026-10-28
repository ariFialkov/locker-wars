/**
 * A talking mouth for a pack character that has no jaw bone and no morph targets.
 *
 * The models are skinned to a plain humanoid rig (…neck → Head), with the mouth painted
 * on. This builds one morph target at load time: the lower front of the head (chin, lower
 * lip, under the moustache) hinges down and slightly back, like a jaw opening. The region
 * is picked in the Head bone's own space (centimetres: the joint sits at the top of the
 * neck, the face looks down +z), so it works for any character on this rig.
 */
import * as THREE from 'three';

const HEAD_BONES = new Set(['Head', 'headfront', 'head_end']);

/** Jaw region in Head-bone space (cm). The pivot is a hinge through the ears, at mouth height. */
const PIVOT_Y = 5.0, PIVOT_Z = -2.0;
const OPEN_RAD = 0.42; // full open: ~4 cm of chin drop, readable from across the lot

const smooth = (a: number, b: number, x: number): number => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** How much a point at head-local (x, y, z) belongs to the jaw: 1 at the chin, 0 at the moustache, ears and neck. */
function jawWeight(x: number, y: number, z: number): number {
  const below = 1 - smooth(1.5, 5.0, y); // lower lip moves a little, the moustache (y ≥ 5) not at all
  const front = smooth(0.5, 5.0, z); // the front of the face only
  const neck = smooth(-6.5, -3.0, y); // fade out down the throat
  const width = 1 - smooth(7.0, 10.5, Math.abs(x));
  return below * front * neck * width;
}

/**
 * Add a jaw morph to the character's skinned mesh and return a setter for how open the mouth is
 * (0 closed … 1 wide), or null if the model is not rigged the way we expect.
 */
export function addJaw(root: THREE.Object3D): ((open: number) => void) | null {
  let mesh: THREE.SkinnedMesh | null = null;
  root.traverse((o) => { if (!mesh && (o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh; });
  if (!mesh) return null;
  const sk = mesh as THREE.SkinnedMesh;
  const geo = sk.geometry;
  if (geo.morphAttributes.position?.length) { sk.updateMorphTargets(); return (open) => { sk.morphTargetInfluences![0] = open; }; }
  const bones = sk.skeleton.bones;
  const head = bones.find((b) => b.name === 'Head');
  const pos = geo.attributes.position, ji = geo.attributes.skinIndex, jw = geo.attributes.skinWeight;
  if (!head || !pos || !ji || !jw) return null;
  root.updateMatrixWorld(true);
  const headInv = head.matrixWorld.clone().invert();
  const v = new THREE.Vector3();
  /** A vertex in Head-bone space, through the skinning at the current (rest) pose. */
  const toHead = (i: number, out: THREE.Vector3): THREE.Vector3 => {
    sk.applyBoneTransform(i, out.fromBufferAttribute(pos, i));
    return out.applyMatrix4(sk.matrixWorld).applyMatrix4(headInv);
  };
  const headW = (i: number): number => { let w = 0; for (let k = 0; k < 4; k++) if (HEAD_BONES.has(bones[ji.getComponent(i, k)]?.name)) w += jw.getComponent(i, k); return w; };

  // The map from geometry space to Head space is affine for a vertex owned by the head alone:
  // measure its linear part numerically so the displacement can be expressed in geometry units.
  let probe = -1;
  for (let i = 0; i < pos.count; i++) if (headW(i) > 0.999) { probe = i; break; }
  if (probe < 0) return null;
  const base = toHead(probe, new THREE.Vector3());
  const basePos = new THREE.Vector3().fromBufferAttribute(pos, probe);
  const eps = 0.01;
  const cols: THREE.Vector3[] = [];
  const saved = [basePos.x, basePos.y, basePos.z];
  const tmp = new THREE.Vector3();
  for (let a = 0; a < 3; a++) {
    const p = basePos.clone(); p.setComponent(a, p.getComponent(a) + eps);
    // evaluate the skinning at the nudged point by temporarily writing it into the attribute
    pos.setXYZ(probe, p.x, p.y, p.z);
    toHead(probe, tmp);
    pos.setXYZ(probe, saved[0], saved[1], saved[2]);
    cols.push(tmp.clone().sub(base).divideScalar(eps));
  }
  const lin = new THREE.Matrix4().makeBasis(cols[0], cols[1], cols[2]);
  const linInv = lin.clone().invert();

  const delta = new Float32Array(pos.count * 3);
  const d = new THREE.Vector3();
  let touched = 0;
  for (let i = 0; i < pos.count; i++) {
    const w = headW(i);
    if (w < 0.3) continue;
    toHead(i, v);
    const k = jawWeight(v.x, v.y, v.z) * w;
    if (k < 0.01) continue;
    // hinge about the x axis through the pivot: the chin drops, and tucks back a little
    const dy = -(v.z - PIVOT_Z) * OPEN_RAD * k;
    const dz = (v.y - PIVOT_Y) * OPEN_RAD * 0.5 * k;
    d.set(0, dy, dz).applyMatrix4(linInv); // linear part only: Matrix4 with no translation
    delta[i * 3] = d.x; delta[i * 3 + 1] = d.y; delta[i * 3 + 2] = d.z;
    touched++;
  }
  if (touched < 20) return null;
  const attr = new THREE.Float32BufferAttribute(delta, 3);
  attr.name = 'jaw';
  geo.morphAttributes.position = [attr];
  geo.morphTargetsRelative = true;
  sk.updateMorphTargets();
  sk.morphTargetInfluences![0] = 0;
  return (open) => { sk.morphTargetInfluences![0] = THREE.MathUtils.clamp(open, 0, 1); };
}
