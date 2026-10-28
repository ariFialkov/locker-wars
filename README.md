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

1. **Arrival**: the auctioneer calls the unit, bolt cutters snap the padlock (sparks, clank), the roll-up door rattles open. Every round is a different unit: between rounds the camera moves down the row to the next door (B-214, B-215, ...) and the crowd walks along with it.
2. **Inspection (15 s)**: the camera steps up to the door. Drag, or use W A S D / the arrow keys, to look around; pinch or scroll to lean in; toggle the hand-held flashlight (a spotlight that follows the camera into the dark unit). Some items sit in plain view, others are under tarps, blankets, in boxes, crates, suitcases, trash bags or a safe.
3. **Auction**: rivals yell bids with speech bubbles and voices, the auctioneer chants asks, prices climb in real auction increments. Bid, jump-bid, or pass. When nobody tops the high bid it goes "once, twice, sold".
4. **Count-up (15–60 s)**: the camera walks the locker item by item, swinging around anything that would hide a small item behind a big one. Covers are pulled off, each item gets a condition stamp (Mint, Worn, Broken, Replica...) and its value rolls into the running total. If a rival won, you get a quick tour of what you missed or dodged.
5. **Result**: profit or loss, best find, rival quip, and on to the next unit. Progress and analytics persist in `localStorage`.

## The economics (read this)

The game is a simulated-multiplayer bet, not a skill game, and the result of every locker you win is fixed before the auction begins.

- **RTP = 96%.** Each won locker is an independent bet: the stake is the hammer price *P*, the payout is the appraised contents *V*. A multiplier *M* is drawn per round from a fixed distribution whose mean is analytically calibrated to exactly `TARGET_RTP` in `src/core/economy.ts`. The tests sample it and check the mean and the hit rate.
- **Shaped so wins are worth it.** About half of won lockers pay more than their price, and most of those pay ×1.1 or better, with a fat big-win band and rarer huge and jackpot bands. At a fixed 96% mean that has to be paid for on the losing side, so most losses are busts: near-worthless lockers. Same expected return, meaningful wins, harsh busts.

| Band | Share | Multiplier (after calibration) |
|---|---|---|
| Bust | 41% | ×0.02 to ×0.29 |
| Loss | 10% | ×0.29 to ×0.78 |
| Win | 27% | ×1.07 to ×1.36 |
| Big win | 17% | ×1.46 to ×2.14 |
| Huge win | 4% | ×2.1 to ×4.4 |
| Jackpot | 1% | ×4.4 to ×11.7 |
- **Retargeting, not rigged bidding.** After you win, `resolveLocker` sets *V = M × P*: visible items keep their identity and only their *condition* varies, while concealed slots pick an identity whose value range fits the share they must carry (a tarp might hide a jet ski or a broken washer, a safe might hold coins or bonds). That is why the design is robust against selection bias: nothing you can observe from the door (item mix, cover sizes, rival behaviour, price) correlates with *M*, so folding on "expensive-looking" lockers or jump-bidding cannot move your expected return. Driving the price with bots instead (the "bots keep raising until the deterministic minimum" approach) would leak information, because the required price relative to the visible value would then reveal the outcome.
- **Carry-over correction.** When a target cannot be hit exactly (for example, the visible items already exceed a tiny bust target even at scrap value), the difference is carried as `debt` and absorbed smoothly by the next won lockers, capped at 25% of a stake so no single round feels engineered. The round-loop test drives thousands of lockers with erratic stake sizes and confirms the realised RTP converges on 96%.
- **Rivals** value the unit from its *apparent* value (visible items plus rough guesses per cover type) times a random factor, so their ceiling looks believable and gives you the feel of finding the price band between "outbid the crowd" and "less than it's worth". They never see *M*.
- **Deterministic.** Every locker, outcome, rival roster and auction is seeded from the session seed and round number, so a round can be replayed exactly.

The Stats panel shows theoretical vs realised RTP, the outcome history, value by item category, top finds, head-to-head records against each rival, bankroll curve, streaks, hidden vs visible value found, replicas spotted, and more.

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
src/core        rng, money/bid ladder, RTP economy, stats persistence, tween system
src/game        locker generation & resolution, item bank (90+ recipes), covers, rivals, auction FSM, round orchestrator
src/render      scene & environment, roll-up door + lock cutting, animated crowd, camera rig, particles, locker contents
src/audio       synthesised SFX, voices
src/ui          HUD panels, modals, stats dashboard, 3D-anchored labels/speech bubbles
test            vitest suites for the economy, generator and auction
scripts         icon generator, item catalog generator, headless walkthrough
tools           dev-only pages: item catalog data, reveal-card renderer
```

## Tuning knobs

- `TARGET_RTP` and the outcome bands: `src/core/economy.ts`
- Bid increments: `src/core/money.ts`
- Locker themes, item counts, hidden share: `THEMES` in `src/game/lockerGen.ts`
- Item bank (values, sizes, rarity, shapes): `src/game/items/bank.ts`
- Rival personalities and lines: `src/game/bots.ts`
- Starting bankroll and bailout: `src/core/stats.ts`
