# Locker Wars

A casual 3D storage-auction betting game, installable as a PWA and playable on phones and desktops.

Lockers come up for auction one after another. You get a short look through the open door (no stepping inside), then bid against a rowdy crowd of rival buyers. Win the unit and every item inside is uncovered and appraised while your total ticks up. Pay less than it was worth and you profit.

## Play it

The production build deploys to GitHub Pages on every push to `main` (and the current feature branch):
**https://arifialkov.github.io/locker-wars/**

On a phone, open that link and use "Add to Home Screen" to install it as an app.

## Run it

```bash
npm install
npm run dev        # local dev server (LAN-visible, for testing on a phone)
npm run build      # typecheck + production build into dist/ (includes the service worker)
npm run preview    # serve the production build
npm test           # vitest: RTP, generator and auction tests
npm run icons      # regenerate the PWA icons in public/
node scripts/walkthrough.mjs [--mobile]   # headless Playwright smoke run against `npm run preview`, saves screenshots to ./shots
```

Useful URL flags: `?seed=abc` for a reproducible sequence of lockers, `?q=low|high` to force the render quality tier.

## How a round plays

1. **Arrival**: the auctioneer calls the unit, bolt cutters snap the padlock (sparks, clank), the roll-up door rattles open.
2. **Inspection (15 s)**: drag to look around from outside, pinch or scroll to lean in, toggle the hand-held flashlight (a spotlight that follows the camera into the dark unit). Some items sit in plain view, others are under tarps, blankets, in boxes, crates, suitcases, trash bags or a safe.
3. **Auction**: rivals yell bids with speech bubbles and voices, the auctioneer chants asks, prices climb in real auction increments. Bid, jump-bid, or pass. When nobody tops the high bid it goes "once, twice, sold".
4. **Count-up (15–60 s)**: the camera walks the locker item by item. Covers are pulled off, each item gets a condition stamp (Mint, Worn, Broken, Replica...) and its value rolls into the running total. If a rival won, you get a quick tour of what you missed or dodged.
5. **Result**: profit or loss, best find, rival quip, and on to the next unit. Progress and analytics persist in `localStorage`.

## The economics (read this)

The game is a simulated-multiplayer bet, not a skill game, and the result of every locker you win is fixed before the auction begins.

- **RTP = 96%.** Each won locker is an independent bet: the stake is the hammer price *P*, the payout is the appraised contents *V*. A multiplier *M* is drawn per round from a fixed distribution (bust / even / win / big / jackpot bands) whose mean is analytically calibrated to exactly `TARGET_RTP` in `src/core/economy.ts`. The tests sample it and check the mean.
- **Retargeting, not rigged bidding.** After you win, `resolveLocker` sets *V = M × P*: visible items keep their identity and only their *condition* varies, while concealed slots pick an identity whose value range fits the share they must carry (a tarp might hide a jet ski or a broken washer, a safe might hold coins or bonds). That is why the design is robust against selection bias: nothing you can observe from the door (item mix, cover sizes, rival behaviour, price) correlates with *M*, so folding on "expensive-looking" lockers or jump-bidding cannot move your expected return. Driving the price with bots instead (the "bots keep raising until the deterministic minimum" approach) would leak information, because the required price relative to the visible value would then reveal the outcome.
- **Carry-over correction.** When a target cannot be hit exactly (for example, the visible items already exceed a tiny bust target even at scrap value), the difference is carried as `debt` and absorbed smoothly by the next won lockers, capped at 25% of a stake so no single round feels engineered. The round-loop test drives thousands of lockers with erratic stake sizes and confirms the realised RTP converges on 96%.
- **Rivals** value the unit from its *apparent* value (visible items plus rough guesses per cover type) times a random factor, so their ceiling looks believable and gives you the feel of finding the price band between "outbid the crowd" and "less than it's worth". They never see *M*.
- **Deterministic.** Every locker, outcome, rival roster and auction is seeded from the session seed and round number, so a round can be replayed exactly.

The Stats panel shows theoretical vs realised RTP, the outcome history, value by item category, top finds, head-to-head records against each rival, bankroll curve, streaks, hidden vs visible value found, replicas spotted, and more.

## Tech

- Vite 8 + TypeScript, Three.js (r186) for rendering, `vite-plugin-pwa` (Workbox) for offline install.
- No art or audio assets: every item, cover, figure and piece of set dressing is built from primitives with per-instance colour variation; every sound (bolt cutters, door roll and slam, gavel, cash register, crowd murmur, stamps, fanfares) is synthesised with the Web Audio API. Voices use `speechSynthesis` with a synthesised babble fallback.
- Two quality tiers (shadow resolution, pixel ratio, flashlight shadows) picked automatically for touch devices; layout adapts to portrait, landscape and safe areas.

## Project layout

```
src/core        rng, money/bid ladder, RTP economy, stats persistence, tween system
src/game        locker generation & resolution, item bank (90+ recipes), covers, rivals, auction FSM, round orchestrator
src/render      scene & environment, roll-up door + lock cutting, crowd figures, camera rig, particles, locker contents
src/audio       synthesised SFX, voices
src/ui          HUD panels, modals, stats dashboard, 3D-anchored labels/speech bubbles
test            vitest suites for the economy, generator and auction
scripts         icon generator
```

## Tuning knobs

- `TARGET_RTP` and the outcome bands: `src/core/economy.ts`
- Bid increments: `src/core/money.ts`
- Locker themes, item counts, hidden share: `THEMES` in `src/game/lockerGen.ts`
- Item bank (values, sizes, rarity, shapes): `src/game/items/bank.ts`
- Rival personalities and lines: `src/game/bots.ts`
- Starting bankroll and bailout: `src/core/stats.ts`
