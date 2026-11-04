# Locker Wars

A casual 3D storage-auction betting game, installable as a PWA and playable on phones and desktops.

Lockers come up for auction one after another. You get a short look through the open door (no stepping inside), then bid against a rowdy crowd of rival buyers. Win the unit and every item inside is uncovered and appraised while your total ticks up. Pay less than it was worth and you profit.

## Play it

The production build deploys to GitHub Pages on every push to `main` (and the current feature branch):
**https://arifialkov.github.io/locker-wars/**

On a phone, open that link and use "Add to Home Screen" to install it as an app.

The item catalog is published next to it: **https://arifialkov.github.io/locker-wars/item-catalog.html**

## Run it

```bash
npm install
npm run dev        # local dev server (LAN-visible, for testing on a phone)
npm run build      # typecheck + production build into dist/ (includes the service worker)
npm run preview    # serve the production build
npm test           # vitest: RTP, generator and auction tests
npm run icons      # regenerate the PWA icons in public/
node scripts/walkthrough.mjs [--mobile]   # headless Playwright smoke run against `npm run preview`, saves screenshots to ./shots
npm run catalog    # re-render every item prefab into docs/item-catalog.html
```

`docs/item-catalog.html` lists every item in the bank with a render of its prefab, base value, rarity, concealments and a description. Regenerate it after editing the item bank or `tools/catalog/descriptions.ts`.

Useful URL flags: `?seed=abc` for a reproducible sequence of lockers, `?q=low|high` to force the render quality tier.

## How a round plays

1. **Arrival**: the auctioneer calls the unit, bolt cutters snap the padlock (sparks, clank), the roll-up door rattles open and dust rolls out from under it, settling before you look inside. Every round is a different unit: between rounds the camera moves down the row to the next door (B-214, B-215, ...) and the crowd walks along with it.
2. **Inspection (15 s)**: the camera steps up to the door and turns on the spot. Hold W A S D / the arrow keys, or drag, to look around; let go and the view springs back to centre. Pinch, scroll or Q/E lean in. The hand-held flashlight (a spotlight that follows the camera into the dark unit) works only here: when the auction starts the view steps back out, the controls lock and the flashlight goes off. Some items sit in plain view, others are under tarps, blankets, in boxes, crates, suitcases, trash bags or a safe.
3. **Auction**: pick an opening bid from the platform's chip levels (or **buy it now** at 10× the opener). Every raise is its own bet with the math server: if a rival tops you, your bid comes back in full and you can raise to the next amount the server names, or walk away. If the rivals fold, the locker is yours at your last bid. Rivals yell, the auctioneer chants, and it goes "once, twice, sold".
4. **Count-up (15–60 s)**: the camera walks the locker item by item, swinging around anything that would hide a small item behind a big one. Covers are pulled off, each item gets a condition stamp (Mint, Worn, Broken, Replica...) and its value rolls into the running total. If a rival won, you get a quick tour of what you missed or dodged.
5. **Result**: profit or loss, best find, rival quip, and on to the next unit. Progress and analytics persist in `localStorage`.

## The economics (read this)

Every money decision is made by the math server, not by the game. The game sends bets and shows the answers.

- **A raise is a bet.** Raise *k* (bet type `BID_k`) stakes the bid. The server answers **OUTBID**, and the stake comes back in full with the next raise named (`next.bid`), or **WON**, and the locker opens. The rivals thin out as the price climbs, so the higher you go the less likely you are to be outbid; the last raise always wins.
- **The locker is a one-shot draw.** A won locker's contents are `multiplier × your bid`, the multiplier drawn by the server from a fixed distribution (on the documented storage preset: 18% empty lockers, listed multiples from 0.5× to 7×, mean 0.95× the price). `BUY_NOW` opens the same locker shape at 10× the opener. Being outbid is free; the edge is only in lockers you win.
- **What the game does with it.** `resolveLocker` dresses the server's number as items (visible ones keep their identity and vary by condition, concealed ones pick an identity that fits), and `settleExact` makes them add up to the server's contents to the cent. The rivals, their counter-bids (always between your bid and the next raise) and the auctioneer are presentation built around the server's results; they cannot change one. When a rival wins, the "what you missed" reveal is presentation only, and no money moves.
- **Money.** All amounts on the wire are integers in minor units (cents). The bet response debits the stake; `collect` credits the win. The game collects an outbid's refund at once, and a won locker as soon as it is settled; the balance on screen is always the server's.

### Platform vs practice

`src/math` has one interface and three implementations:

- **Rollerz platform** (`src/math/rollerz.ts`): bets go through the official Rollerz SDK (`@rollerz/sdk`, pinned, MIT) and its generic provider: `RollerzSDK.init(gameId)`, `gp.configureBetTypes([BID_1 … BID_6, BUY_NOW])`, `gp.openGame({ serverUrl, internalClientCode })`, `gp.placeBet(amount, { betType })`, `gp.collect(roundId)`. The SDK routes them through the Rollerz bridge to the RGS backend, which calls the auction math server. Results are read from the bet response's top level or from its `math` field.
- **Test engine** (`src/math/engine.ts`, the default until the platform is configured): the auction math engine's own published browser module, loaded at runtime from `https://danvid1009.github.io/gnarone-game-math/auction/api/rgs.js`. It is the real math and the real wire format, but it rolls in the player's browser with test credits, so it is for testing, not release. Whatever is published at that URL is what runs.
- **Practice** (`?math=practice`, `src/math/practice.ts`): offline play credits with the same wire format and the documented storage-preset numbers, for when the engine URL is unreachable.

Bailouts exist only in the two test modes, and both are labelled in the menu.

The platform is used when the client code and math server URL are configured, at build time or in the page URL:

| Setting | Build variable | URL parameter |
|---|---|---|
| Game id (default `b6f0701f-fdb7-4139-8e50-c7a962e67a65`) | `VITE_ROLLERZ_GAME_ID` | `game` |
| Internal client code | `VITE_ROLLERZ_CLIENT_CODE` | `client` |
| Math server URL | `VITE_ROLLERZ_SERVER_URL` | `server` (read by the SDK) |
| Server path (optional) | `VITE_ROLLERZ_PATH` | |
| Raise stages (default 6) | `VITE_ROLLERZ_STAGES` | |

A half-configured platform shows an error instead of falling back to a test mode, and a platform build refuses `?math=practice` and `?math=engine`, so real play can never end up rolling in the browser. `VITE_ENGINE_URL` points the test engine at another copy of the module (for example a local one).

The Stats panel shows the locker return and your realised return, the outcome history, value by item category, top finds, head-to-head records against each rival, bankroll curve, streaks, hidden vs visible value found, replicas spotted, and more.

## Tech

- Vite 8 + TypeScript, Three.js (r186) for rendering, `vite-plugin-pwa` (Workbox) for offline install.
- **Art and voices come from the Locker Wars asset pack** in `assets/pack` (see its `SOURCE.md`): 9 rigged, animated characters, 121 item models, 8 container models, 129 reveal cards and 72 recorded voice lines, all described by the pack's `manifest.json`. The steamer trunk card was rendered in the pack's style by `tools/cards/card.ts`.
- The build plugin in `vite.config.ts` serves the pack at `./pack/` in development and copies it into `dist/pack`. The service worker caches pack files as they are used instead of precaching all 29 MB.
- Frame-rate rules for the pack (`src/pack/loader.ts`): models parse one at a time on separate frames with compression decoding in workers, textures are uploaded before a model is first shown, and at most 40 item and container models stay in memory. A locker's models load while its lock is cut, hidden items load while the auctioneer calls "sold", and the next locker loads during the count-up. Every shader is compiled and drawn once behind the menu's loading bar.
- The auctioneer's mouth moves with his recorded lines: the pack's models have no jaw bone or blend shapes, so `src/render/jaw.ts` builds a jaw morph target at load time (the lower front of the head hinges down) and drives it from the voice channel's loudness.
- The facility is a row of identical units built one segment at a time (`Facility` in `src/render/scene.ts`); our unit always sits at the origin, and the row slides past a stand-in closed door between rounds, so nothing else in the game has to know which unit we are at.
- The procedural models, synthesised sound effects and speech synthesis are kept as fallbacks if a pack file fails to load. Sound effects (bolt cutters, door, gavel, cash register, crowd) are still synthesised with the Web Audio API.
- Two quality tiers (shadow resolution, pixel ratio, flashlight shadows) picked automatically for touch devices; layout adapts to portrait, landscape and safe areas.

## Project layout

```
assets/pack     asset pack: characters, voice lines, item and container models, cards (see assets/pack/SOURCE.md)
src/pack        pack manifest access, model loader, recorded voice-line player
src/math        math client: Rollerz SDK (platform), test engine and practice backends, response parsing
src/core        rng, money formatting, outcome tiers, stats persistence, tween system
src/game        locker generation & resolution, item bank (90+ recipes), covers, rivals, raise-by-raise auction presentation, round orchestrator
src/render      scene & environment, roll-up door + lock cutting, animated crowd, camera rig, particles, locker contents
src/audio       synthesised SFX, voices
src/ui          HUD panels, modals, stats dashboard, 3D-anchored labels/speech bubbles
test            vitest suites for the math clients, response parsing, the raise auction and the locker generator
scripts         icon generator, item catalog generator, headless walkthrough
tools           dev-only pages: item catalog data, reveal-card renderer
```

## Tuning knobs

- Return, outbid odds, bid ladder and locker multipliers: set by the math server (practice mirrors them in `STORAGE_PRESET`, `src/math/practice.ts`)
- Pacing of the auction theatre (going once/twice, counter-bid delay): `src/game/raise.ts`
- Locker themes, item counts, hidden share: `THEMES` in `src/game/lockerGen.ts`
- Item bank (values, sizes, rarity, shapes): `src/game/items/bank.ts`
- Rival personalities and lines: `src/game/bots.ts`
- Practice credits and bailout: `PRACTICE_START` in `src/math/practice.ts`, `BAILOUT_AMOUNT` in `src/core/config.ts`
