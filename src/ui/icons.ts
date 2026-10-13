/**
 * Inline SVG icon set (24x24, 2px round strokes, currentColor). Hand-drawn so
 * the UI ships no emoji and no icon font.
 */
const P: Record<string, string> = {
  stats: '<path d="M4 20V11M10 20V4M16 20V14"/><path d="M2 20h20"/>',
  soundOn: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9.5a3.5 3.5 0 0 1 0 5"/><path d="M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
  soundOff: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  install: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 20h16"/>',
  flashlight: '<path d="M8 3h8l-1.5 5v13h-5V8L8 3z"/><path d="M8 7h8"/><path d="M12 11v3"/>',
  forward: '<path d="M4 5l8 7-8 7V5z"/><path d="M13 5l8 7-8 7V5z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  voiceOn: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11a6 6 0 0 0 12 0"/><path d="M12 17v4M9 21h6"/>',
  voiceOff: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11a6 6 0 0 0 12 0"/><path d="M12 17v4M9 21h6"/><path d="M4 4l16 16"/>',
  play: '<path d="M7 4l12 8-12 8V4z"/>',
  reset: '<path d="M3 12a9 9 0 1 0 2.6-6.4"/><path d="M3 4v5h5"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  gavel: '<path d="M14 4l6 6-3 3-6-6 3-3z"/><path d="M12 9l-8 8 3 3 8-8"/><path d="M3 21h9"/>',
  look: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9z"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8 21h8M9 17h6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5a3 3 0 0 1 0 6M21.5 20a6 6 0 0 0-5-6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5V14"/><path d="M12 17.5h.01"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  sparkle: '<path d="M12 3l2.2 6.3L20 12l-5.8 2.7L12 21l-2.2-6.3L4 12l5.8-2.7L12 3z"/>',
  // item categories
  furniture: '<path d="M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4"/><path d="M3 12h18v6H3z"/><path d="M5 18v2M19 18v2"/>',
  appliances: '<rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="13" r="5"/><path d="M7 6h2M15 6h2"/>',
  electronics: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  tools: '<path d="M14.5 6.5a4 4 0 0 1 5-4.2L17 4.8l.2 2 2 .2 2.5-2.5a4 4 0 0 1-4.9 5.3L7.5 19a2 2 0 0 1-2.9-2.9l9.2-9.2a4 4 0 0 1 .7-.4z"/>',
  vehicles: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l3-8h6l3 8"/><path d="M9 9h3M12 17L9 9"/>',
  instruments: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  collectibles: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h3"/>',
  valuables: '<path d="M6 3h12l4 6-10 12L2 9l4-6z"/><path d="M2 9h20M9 3l3 6 3-6"/>',
  art: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M6 17l4-5 3 3 2-2 3 4"/><circle cx="16" cy="9" r="1.5"/>',
  sports: '<path d="M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12"/>',
  toys: '<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="15" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/>',
  clothing: '<path d="M8 3l4 2 4-2 5 4-3 3-1-1v12H7V9l-1 1-3-3 5-4z"/>',
  junk: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>',
  box: '<path d="M3 8l9-5 9 5v9l-9 5-9-5V8z"/><path d="M3 8l9 5 9-5M12 13v9"/>',
  tarp: '<path d="M3 18c3-9 6-12 9-12s6 3 9 12H3z"/><path d="M12 6v12"/>',
};

export type IconName = keyof typeof P;

export function icon(name: IconName, size = 20, cls = ''): string {
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name]}</svg>`;
}

/** The Locker Wars mark: a roll-up door with a cut shackle. */
export function logoMark(size = 56): string {
  return `<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="60" height="60" rx="16" fill="#1a1613"/>
    <rect x="2" y="2" width="60" height="60" rx="16" stroke="rgba(255,255,255,.08)"/>
    <rect x="13" y="14" width="38" height="34" rx="3" fill="#ff8a2a"/>
    <g fill="#c9641a"><rect x="13" y="20" width="38" height="2.2"/><rect x="13" y="27" width="38" height="2.2"/><rect x="13" y="34" width="38" height="2.2"/><rect x="13" y="41" width="38" height="2.2"/></g>
    <rect x="25" y="40" width="14" height="11" rx="2.5" fill="#ffcc4d"/>
    <path d="M28.5 40v-4.5a3.5 3.5 0 0 1 7 0V38" stroke="#ffcc4d" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path d="M33 23l3-5-5 2 2-5" stroke="#fff3d6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity=".9"/>
  </svg>`;
}
