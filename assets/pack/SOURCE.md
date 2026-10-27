# Asset pack source

Copied from the "Locker Wars asset pack" artifact, version 2026-10-26:
https://claude.ai/artifact/28wDhRVNjvjjGjFTwfV4jw (published version 1793000896-658c).

`manifest.json` and `README.md` are the pack's own, unmodified. File paths in the
manifest are relative to this folder. `SHA256SUMS` lists a checksum for every copied file
(`sha256sum -c SHA256SUMS` from this folder).

## Copied
| Folder | Contents |
|---|---|
| `models/characters/` | 9 rigged, animated characters (auctioneer + 8 rivals; Rosa and Ray are separate) |
| `audio/<character>/` | 72 voice lines (24 auctioneer, 6 per rival); scripts and durations are in the manifest |
| `models/items/` | 121 item models, ids matching `src/game/items/bank.ts` |
| `cards/` | 128 reveal cards: 121 items and 7 containers, 600 × 800 WebP |
| `models/covers/` | 8 container models, including the steamer trunk |

`cards/cover_trunk.webp` is not from the pack (the pack ships no trunk card). It was rendered
from the trunk model in the pack's card style by `tools/cards/card.ts`.

## Not copied (still in the pack, referenced by the manifest)
- `models/locker_unit.json` (locker with `cut_lock` and `door_open` animations)
- `lots/` (3 pre-assembled sample lots, about 12.7 MB)

## Format notes
- Each model `.json` is `{"b64": "<base64 GLB>"}`. The GLBs use `EXT_meshopt_compression`,
  `KHR_mesh_quantization` and `EXT_texture_webp`, so load them with three.js `GLTFLoader`
  plus `MeshoptDecoder` (`three/examples/jsm/libs/meshopt_decoder.module.js`).
- The game serves this folder at `./pack/` (dev server middleware and a copy into `dist/pack`
  at build time, see `vite.config.ts`). The service worker caches pack files as they are used
  instead of precaching all of them.
