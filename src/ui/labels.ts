/** HTML labels and speech bubbles anchored to 3D positions. */
import * as THREE from 'three';

interface Anchor { el: HTMLElement; get: (out: THREE.Vector3) => THREE.Vector3; ttl: number; offsetY: number }

export class Labels {
  private root = document.getElementById('labels')!;
  private anchors: Anchor[] = [];
  private v = new THREE.Vector3();
  constructor(private camera: THREE.Camera) {}

  /** Persistent label (returns the element so its content can change). */
  add(get: (out: THREE.Vector3) => THREE.Vector3, html: string, cls = 'lbl', offsetY = 0): HTMLElement {
    const el = document.createElement('div');
    el.className = cls; el.innerHTML = html;
    this.root.appendChild(el);
    this.anchors.push({ el, get, ttl: Infinity, offsetY });
    requestAnimationFrame(() => el.classList.add('show'));
    return el;
  }
  /** Temporary bubble. */
  bubble(get: (out: THREE.Vector3) => THREE.Vector3, text: string, cls = '', ttl = 1.8, offsetY = 10): void {
    const el = document.createElement('div');
    el.className = 'bubble ' + cls; el.textContent = text;
    this.root.appendChild(el);
    this.anchors.push({ el, get, ttl, offsetY });
  }
  pop(get: (out: THREE.Vector3) => THREE.Vector3, text: string, bad = false): void {
    const el = document.createElement('div');
    el.className = 'valpop' + (bad ? ' bad' : ''); el.textContent = text;
    this.root.appendChild(el);
    this.anchors.push({ el, get, ttl: 1.3, offsetY: 0 });
  }
  remove(el: HTMLElement): void { const i = this.anchors.findIndex((a) => a.el === el); if (i >= 0) { this.anchors.splice(i, 1); el.remove(); } }
  clear(): void { for (const a of this.anchors) a.el.remove(); this.anchors = []; }

  update(dt: number): void {
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = this.anchors.length - 1; i >= 0; i--) {
      const a = this.anchors[i];
      a.ttl -= dt;
      if (a.ttl < 0.35 && a.ttl > 0 && a.el.classList.contains('bubble')) a.el.classList.add('fade');
      if (a.ttl <= 0) { a.el.remove(); this.anchors.splice(i, 1); continue; }
      a.get(this.v).project(this.camera);
      const behind = this.v.z > 1;
      let x = (this.v.x * 0.5 + 0.5) * w, y = (-this.v.y * 0.5 + 0.5) * h - a.offsetY;
      const isBubble = a.el.classList.contains('bubble');
      if (isBubble) {
        // keep yells from off-screen rivals visible at the screen edge (portrait phones)
        const m = Math.min(130, w * 0.33);
        x = Math.max(m, Math.min(w - m, x));
        y = Math.max(90, Math.min(h * 0.62, y));
      }
      a.el.style.display = behind || (!isBubble && (x < -100 || x > w + 100)) ? 'none' : '';
      a.el.style.left = x + 'px'; a.el.style.top = y + 'px';
    }
  }
}
