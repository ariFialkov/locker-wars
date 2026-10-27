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

## Not copied (still in the pack, referenced by the manifest)
- `models/covers/` (8 container models, including a steamer trunk the game does not have yet)
- `models/locker_unit.json` (locker with `cut_lock` and `door_open` animations)
- `lots/` (3 pre-assembled sample lots, about 12.7 MB)

## Format notes
- Each model `.json` is `{"b64": "<base64 GLB>"}`. The GLBs use `EXT_meshopt_compression`,
  `KHR_mesh_quantization` and `EXT_texture_webp`, so load them with three.js `GLTFLoader`
  plus `MeshoptDecoder` (`three/examples/jsm/libs/meshopt_decoder.module.js`).
- This folder is outside `public/`, so none of it ships in the game build yet.
