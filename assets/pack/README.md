# Locker Wars asset pack (2026-10-26)

Every finished Locker Wars asset, ready to use in a web artifact or another game build. `manifest.json` describes everything: file paths, item data, container fits, character animations and voice lines.

## Contents
| Path | What it is |
|---|---|
| `manifest.json` | Master index: items (name, category, rarity, size, value range, dimensions, card, model, allowed containers), containers, `cover_fits`, characters (model, height, animation names, voice lines), the locker and lots. |
| `cards/<item>.webp` | Reveal card art: 121 items and 7 containers. The steamer trunk has no card. |
| `models/items/<item>.json` | 121 item models. |
| `models/covers/<cover>.json` | 8 containers: box, crate, safe, suitcase, trash bag, tarp, blanket, trunk. |
| `models/characters/<id>.json` | 9 rigged, animated characters. Rivals have idle, bid, cheer, sulk and flair; the auctioneer has idle, talk, gesture, point, wave and bow. |
| `models/locker_unit.json` | The storage unit, with `cut_lock` and `door_open` animations. Interior is 2.6 × 4.5 × 2.7 m. |
| `lots/<lot>.json` | 3 pre-assembled sample lots (all items and containers placed). The layout for each is in the manifest. |
| `audio/<character>/<line>.mp3` | 72 voice lines: 24 for the auctioneer, 6 for each rival. Voices are cloned from Seedance clips and voiced on ByteDance Seed Audio. |

## Model format
Each model `.json` holds `{"b64": "..."}`: a base64-encoded GLB, meshopt-compressed, with 512 px textures. The JSON wrapper exists because artifact hosting does not serve `.glb` files. Decode it to bytes, make a Blob URL, and load it with three.js `GLTFLoader` plus `MeshoptDecoder`. Units are metres, Y-up. In locker-local coordinates the door is at z = 0 and the unit extends along −z.

## Hiding items in containers
`cover_fits[item][cover]` gives `scale` [x, y, z], `yaw` and `item_offset_y`. Place the container at the item's position, scale it by `scale`, rotate the item by `yaw` inside it, and lift the item by `item_offset_y`.

## Voice lines
No line says a price, so every line works with any bid. Line ids follow the script: for the auctioneer `intro_1…3`, `look_1…2`, `open_1…2`, `ack_1…4`, `player_1…2`, `once`, `twice`, `sold_1…2`, `drop_1…2`, `chant`, `reveal_1`, `jackpot`, `bust` and `outro`; for each rival `flair`, `bid_1`, `bid_2`, `win`, `out` and `react`.
