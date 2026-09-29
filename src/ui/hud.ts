/** All 2D UI: top bar, banners, phase panels, result card, stats, intro. */
import { fmt, fmtSigned } from '../core/money';
import { TARGET_RTP, type OutcomeTier } from '../core/economy';
import { realizedRTP, type Stats, START_BALANCE } from '../core/stats';
import { CATEGORY_ICON, CATEGORY_LABEL, type Category } from '../game/items/types';
import { BOT_BY_ID, type Bot } from '../game/bots';
import type { Appraisal } from '../game/lockerGen';

export interface ResultData {
  kind: 'won' | 'lost' | 'passed';
  winnerName: string;
  paid: number;
  value: number;
  multiplier: number;
  tier: OutcomeTier | null;
  best: Appraisal | null;
  quip: { who: string; text: string } | null;
  couldHaveHadFor: number;
  broke: boolean;
}

const h = (html: string): HTMLElement => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild as HTMLElement; };
const cssColor = (c: number) => '#' + c.toString(16).padStart(6, '0');

export class HUD {
  root = document.getElementById('ui')!;
  onBid: (amount: number) => void = () => {};
  onPass: () => void = () => {};
  onFlashlight: () => void = () => {};
  onReady: () => void = () => {};
  onFastForward: () => void = () => {};
  onNext: () => void = () => {};
  onBailout: () => void = () => {};
  onToggleSound: () => boolean = () => true;
  onToggleVoice: () => boolean = () => true;
  onReset: () => void = () => {};
  onStart: () => void = () => {};
  onOpenStats: () => Stats = () => null as unknown as Stats;

  private balanceEl!: HTMLElement; private deltaEl!: HTMLElement; private lockerEl!: HTMLElement; private themeEl!: HTMLElement;
  private banner!: HTMLElement; private bannerTitle!: HTMLElement; private bannerSub!: HTMLElement; private bannerBar!: HTMLElement; private bannerBarI!: HTMLElement;
  private auctLine!: HTMLElement;
  private panels: Record<string, HTMLElement> = {};
  private priceEl!: HTMLElement; private whoEl!: HTMLElement; private bidMain!: HTMLButtonElement; private bidJ1!: HTMLButtonElement; private bidJ2!: HTMLButtonElement; private passBtn!: HTMLButtonElement; private rivalsStrip!: HTMLElement;
  private cardIcon!: HTMLElement; private cardName!: HTMLElement; private cardCond!: HTMLElement; private cardVal!: HTMLElement; private runningEl!: HTMLElement; private paidEl!: HTMLElement; private dots!: HTMLElement;
  private flashBtn!: HTMLButtonElement; private soundBtn!: HTMLButtonElement; private installBtn!: HTMLButtonElement;
  private resultModal!: HTMLElement; private statsModal!: HTMLElement; private introModal!: HTMLElement; private toasts!: HTMLElement;
  private balanceShown = 0;
  private installPrompt: (Event & { prompt: () => Promise<void> }) | null = null;

  constructor() {
    this.root.appendChild(h('<div class="vignette"></div>'));
    const top = h(`<div class="topbar">
      <div class="chip balance"><span class="label">CASH</span><span class="amount">$0</span><span class="delta"></span></div>
      <div class="chip locker-info"><b>Locker</b><span></span></div>
      <div class="icons"><button id="b-stats" title="Stats">📊</button><button id="b-sound" title="Sound">🔊</button><button id="b-install" title="Install app" style="display:none">⬇️</button></div>
    </div>`);
    this.root.appendChild(top);
    this.balanceEl = top.querySelector('.amount')!; this.deltaEl = top.querySelector('.delta')!;
    this.lockerEl = top.querySelector('.locker-info b')!; this.themeEl = top.querySelector('.locker-info span')!;
    this.soundBtn = top.querySelector('#b-sound')!; this.installBtn = top.querySelector('#b-install')!;
    top.querySelector('#b-stats')!.addEventListener('click', () => this.showStats(this.onOpenStats()));
    this.soundBtn.addEventListener('click', () => { const on = this.onToggleSound(); this.soundBtn.textContent = on ? '🔊' : '🔇'; this.soundBtn.classList.toggle('off', !on); });
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.installPrompt = e as never; this.installBtn.style.display = ''; });
    this.installBtn.addEventListener('click', async () => { if (this.installPrompt) { await this.installPrompt.prompt(); this.installBtn.style.display = 'none'; } });

    this.banner = h('<div class="banner"><div class="banner-title"></div><div class="banner-sub"></div><div class="banner-bar"><i></i></div></div>');
    this.root.appendChild(this.banner);
    this.bannerTitle = this.banner.querySelector('.banner-title')!; this.bannerSub = this.banner.querySelector('.banner-sub')!; this.bannerBar = this.banner.querySelector('.banner-bar')!; this.bannerBarI = this.bannerBar.querySelector('i')!;

    this.auctLine = h('<div class="auct-line"></div>'); this.root.appendChild(this.auctLine);
    this.toasts = h('<div class="toasts"></div>'); this.root.appendChild(this.toasts);

    // inspection panel
    const pi = h(`<div class="panel panel-inspect">
      <div class="rivals-strip"></div>
      <div class="row"><button class="btn flash-btn">🔦 Flashlight</button><button class="btn primary ready-btn">Ready to bid <small>skip the look</small></button></div>
      <div class="hint">Drag to look around · pinch or scroll to lean in · what's under the tarps?</div>
    </div>`);
    this.root.appendChild(pi); this.panels.inspect = pi;
    this.flashBtn = pi.querySelector('.flash-btn')!; this.flashBtn.addEventListener('click', () => this.onFlashlight());
    pi.querySelector('.ready-btn')!.addEventListener('click', () => this.onReady());

    // auction panel
    const pa = h(`<div class="panel panel-auction">
      <div class="bid-state"><div class="price">$0</div><div class="who">Opening</div></div>
      <div class="bid-buttons"><button class="btn primary main">Bid</button><button class="btn jump1">+</button><button class="btn jump2">+</button></div>
      <div class="row"><button class="btn ghost flash-btn2">🔦</button><button class="btn danger pass">Pass on this locker</button></div>
      <div class="rivals-strip"></div>
    </div>`);
    this.root.appendChild(pa); this.panels.auction = pa;
    this.priceEl = pa.querySelector('.price')!; this.whoEl = pa.querySelector('.who')!;
    this.bidMain = pa.querySelector('.main')!; this.bidJ1 = pa.querySelector('.jump1')!; this.bidJ2 = pa.querySelector('.jump2')!; this.passBtn = pa.querySelector('.pass')!;
    this.rivalsStrip = pa.querySelector('.rivals-strip')!;
    for (const b of [this.bidMain, this.bidJ1, this.bidJ2]) b.addEventListener('click', () => this.onBid(Number(b.dataset.amount)));
    this.passBtn.addEventListener('click', () => this.onPass());
    pa.querySelector('.flash-btn2')!.addEventListener('click', () => this.onFlashlight());

    // count-up panel
    const pc = h(`<div class="panel panel-count">
      <div class="item-card"><div class="icon">📦</div><div><div class="name">—</div><div class="cond"></div></div><div class="val"></div></div>
      <div class="running"><span>Locker total</span><div><b>$0</b><span class="paid"></span></div></div>
      <div class="progress-dots"></div>
      <div class="row"><button class="btn ghost ff">⏩ Fast-forward</button></div>
    </div>`);
    this.root.appendChild(pc); this.panels.count = pc;
    this.cardIcon = pc.querySelector('.icon')!; this.cardName = pc.querySelector('.name')!; this.cardCond = pc.querySelector('.cond')!; this.cardVal = pc.querySelector('.val')!;
    this.runningEl = pc.querySelector('.running b')!; this.paidEl = pc.querySelector('.paid')!; this.dots = pc.querySelector('.progress-dots')!;
    pc.querySelector('.ff')!.addEventListener('click', () => this.onFastForward());

    this.resultModal = h('<div class="modal result"><div class="card"></div></div>'); this.root.appendChild(this.resultModal);
    this.statsModal = h('<div class="modal stats"><div class="card"></div></div>'); this.root.appendChild(this.statsModal);
    this.introModal = h('<div class="modal intro"><div class="card"></div></div>'); this.root.appendChild(this.introModal);
  }

  /* ---------- top bar ---------- */
  setBalance(n: number, animateDelta = true): void {
    const d = n - this.balanceShown;
    if (animateDelta && Math.abs(d) >= 1 && this.balanceShown !== 0) {
      this.deltaEl.textContent = fmtSigned(d);
      this.deltaEl.className = 'delta';
      void this.deltaEl.offsetWidth;
      this.deltaEl.classList.add(d > 0 ? 'up' : 'down');
    }
    this.balanceShown = n;
    this.balanceEl.textContent = fmt(n);
  }
  setLocker(n: number, theme: string, blurb: string): void { this.lockerEl.textContent = `Locker #${n} · ${theme}`; this.themeEl.textContent = blurb; }
  setSound(on: boolean): void { this.soundBtn.textContent = on ? '🔊' : '🔇'; this.soundBtn.classList.toggle('off', !on); }
  setFlashlight(on: boolean): void { this.flashBtn.classList.toggle('on', on); (this.panels.auction.querySelector('.flash-btn2') as HTMLElement).classList.toggle('on', on); }

  /* ---------- banner ---------- */
  showBanner(title: string, sub = '', progress: number | null = null, flash = false): void {
    this.banner.style.opacity = '1';
    this.bannerTitle.textContent = title; this.bannerTitle.classList.toggle('flash', flash);
    this.bannerSub.textContent = sub;
    this.bannerBar.classList.toggle('hide', progress === null);
    if (progress !== null) this.bannerBarI.style.transform = `scaleX(${Math.max(0, Math.min(1, progress))})`;
  }
  setBannerProgress(p: number, sub?: string): void { this.bannerBarI.style.transform = `scaleX(${Math.max(0, Math.min(1, p))})`; if (sub !== undefined) this.bannerSub.textContent = sub; }
  hideBanner(): void { this.banner.style.opacity = '0'; }

  auctioneer(text: string): void { this.auctLine.textContent = text; this.auctLine.classList.add('show'); }
  hideAuctioneer(): void { this.auctLine.classList.remove('show'); }

  toast(text: string, ms = 2200): void {
    const t = h(`<div class="toast">${text}</div>`); this.toasts.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 400); }, ms);
  }

  /* ---------- panels ---------- */
  showPanel(name: 'inspect' | 'auction' | 'count' | null): void {
    for (const [k, el] of Object.entries(this.panels)) el.classList.toggle('show', k === name);
  }

  setRivals(bots: Bot[], leaderId: string | null = null, dropped: Set<string> = new Set()): void {
    const html = bots.map((b) => `<div class="rival ${dropped.has(b.id) ? 'out' : ''} ${b.id === leaderId ? 'leader' : ''}" data-id="${b.id}"><i style="background:${cssColor(b.color)}"></i>${b.short}</div>`).join('');
    this.rivalsStrip.innerHTML = html;
    (this.panels.inspect.querySelector('.rivals-strip') as HTMLElement).innerHTML = `<div class="hint">Bidding against:</div>` + html;
  }

  setAuction(state: { price: number; ask: number; high: string | null; canBid: boolean; going: 0 | 1 | 2; folded: boolean; jumps: [number, number]; balance: number }): void {
    const { price, ask, high, canBid, going, folded, jumps, balance } = state;
    const prev = this.priceEl.textContent;
    this.priceEl.textContent = price > 0 ? fmt(price) : fmt(ask);
    if (prev !== this.priceEl.textContent) { this.priceEl.classList.remove('bump'); void this.priceEl.offsetWidth; this.priceEl.classList.add('bump'); }
    let who = 'Opening bid';
    let cls = 'who';
    if (high === 'player') { who = "YOU'RE HIGH BIDDER"; cls += ' you'; }
    else if (high) { who = `${BOT_BY_ID[high]?.short ?? high} has it`; }
    if (going === 1) { who = 'Going once…'; cls += ' going'; }
    if (going === 2) { who = 'Going twice…'; cls += ' going'; }
    this.whoEl.textContent = who; this.whoEl.className = cls;
    this.bidMain.innerHTML = `Bid ${fmt(ask)}`; this.bidMain.dataset.amount = String(ask);
    this.bidJ1.innerHTML = `${fmt(jumps[0])}<small>jump</small>`; this.bidJ1.dataset.amount = String(jumps[0]);
    this.bidJ2.innerHTML = `${fmt(jumps[1])}<small>big jump</small>`; this.bidJ2.dataset.amount = String(jumps[1]);
    this.bidMain.disabled = !canBid; this.bidJ1.disabled = !canBid || jumps[0] > balance; this.bidJ2.disabled = !canBid || jumps[1] > balance;
    this.passBtn.disabled = folded; this.passBtn.textContent = folded ? 'You passed' : 'Pass on this locker';
    if (!canBid && !folded && high !== 'player' && ask > balance) this.bidMain.innerHTML = `Can't afford ${fmt(ask)}`;
  }

  /* ---------- count-up ---------- */
  startCount(total: number, paid: number): void {
    this.dots.innerHTML = Array.from({ length: total }, () => '<i></i>').join('');
    this.runningEl.textContent = '$0'; this.runningEl.className = '';
    this.paidEl.textContent = paid > 0 ? `paid ${fmt(paid)}` : '';
    this.cardIcon.textContent = '🔍'; this.cardName.textContent = 'Walking the locker…'; this.cardCond.textContent = ''; this.cardVal.textContent = '';
  }
  showItem(a: Appraisal, index: number): void {
    this.cardIcon.textContent = CATEGORY_ICON[a.def.category];
    this.cardName.textContent = a.def.name;
    const tone = a.condition.tone;
    this.cardCond.innerHTML = `${a.revealed ? '<b>Revealed</b> ' : ''}<b class="${tone}">${a.condition.label}</b> ${a.condition.mult !== 1 ? `×${a.condition.mult}` : ''} · ${CATEGORY_LABEL[a.def.category]}`;
    this.cardVal.textContent = ''; this.cardVal.className = 'val';
    this.dots.querySelectorAll('i').forEach((d, i) => { d.className = i < index ? 'done' : i === index ? 'cur' : ''; });
  }
  showItemValue(v: number, bad: boolean): void { this.cardVal.textContent = fmt(v); this.cardVal.className = 'val' + (bad ? ' bad' : ''); }
  setRunning(total: number, paid: number): void {
    this.runningEl.textContent = fmt(total);
    this.runningEl.className = paid > 0 ? (total >= paid ? 'pos' : 'neg') : '';
  }

  /* ---------- result ---------- */
  showResult(r: ResultData): void {
    const card = this.resultModal.querySelector('.card')!;
    const profit = r.value - r.paid;
    let title = '', cls = '';
    if (r.kind === 'won') { title = profit >= 0 ? (r.tier === 'jackpot' ? 'JACKPOT LOCKER!' : r.tier === 'big' ? 'BIG SCORE!' : 'PROFIT!') : 'OUCH.'; cls = profit >= 0 ? (r.tier === 'big' || r.tier === 'jackpot' ? 'gold' : 'good') : 'bad'; }
    else { title = r.kind === 'passed' ? 'You passed' : `${r.winnerName} takes it`; cls = ''; }
    const missed = r.value - r.paid; // for lost/passed: value vs what the rival paid
    const bestHtml = r.best ? `<div class="quote">Best find: <b>${r.best.def.name}</b> ${r.best.revealed ? '(hidden!)' : ''} — ${fmt(r.best.value)}</div>` : '';
    const quipHtml = r.quip ? `<div class="quote"><b>${r.quip.who}:</b> “${r.quip.text}”</div>` : '';
    const tierBadge = r.tier ? `<span class="badge ${r.tier}">${r.tier}</span>` : '';
    let body = '';
    if (r.kind === 'won') {
      body = `<div class="kpis">
        <div class="kpi"><span>Paid</span><b>${fmt(r.paid)}</b></div>
        <div class="kpi"><span>Worth</span><b class="gold">${fmt(r.value)}</b></div>
        <div class="kpi"><span>Net</span><b class="${profit >= 0 ? 'good' : 'bad'}">${fmtSigned(profit)}</b></div>
      </div><p>Return ×${r.multiplier.toFixed(2)} ${tierBadge}</p>`;
    } else {
      const better = missed > 0;
      body = `<div class="kpis">
        <div class="kpi"><span>Sold for</span><b>${fmt(r.paid)}</b></div>
        <div class="kpi"><span>Was worth</span><b class="gold">${fmt(r.value)}</b></div>
        <div class="kpi"><span>${better ? 'You missed' : 'You dodged'}</span><b class="${better ? 'bad' : 'good'}">${fmt(Math.abs(missed))}</b></div>
      </div><p>${better ? `${r.winnerName} walks away smiling.` : `${r.winnerName} overpaid. Nice read.`} You could have taken it for <b>${fmt(r.couldHaveHadFor)}</b>.</p>`;
    }
    const brokeHtml = r.broke ? `<p><b style="color:var(--bad)">You're out of cash.</b> Big Dave offers a $2,500 "loan" to keep you in the game. No interest. Probably.</p>` : '';
    card.innerHTML = `<h1 class="${cls}">${title}</h1>${body}${bestHtml}${quipHtml}${brokeHtml}
      <div class="actions">${r.broke ? '<button class="btn gold bail">Take the loan</button>' : '<button class="btn primary next">Next locker ▶</button>'}<button class="btn ghost stats">Stats</button></div>`;
    card.querySelector('.next')?.addEventListener('click', () => { this.resultModal.classList.remove('show'); this.onNext(); });
    card.querySelector('.bail')?.addEventListener('click', () => { this.resultModal.classList.remove('show'); this.onBailout(); });
    card.querySelector('.stats')!.addEventListener('click', () => this.showStats(this.onOpenStats()));
    this.resultModal.classList.add('show');
  }

  /* ---------- intro ---------- */
  showIntro(stats: Stats, bots: Bot[]): void {
    const card = this.introModal.querySelector('.card')!;
    const returning = stats.rounds > 0;
    card.innerHTML = `<div class="logo">Locker<br>Wars<small>STORAGE AUCTION SHOWDOWN</small></div>
      <p>Lockers go up for auction one after another. You get a quick look from the door — no stepping inside — then you bid against a rowdy crowd. Win it, and we count up every item inside.</p>
      <p>Pay less than it's worth and you profit. Pay more and… well.</p>
      <h2>Today's rivals</h2>
      ${bots.map((b) => `<div class="rival-intro"><i style="background:${cssColor(b.color)}"></i><div>${b.name}<small>${b.intro}</small></div></div>`).join('')}
      ${returning ? `<p class="tiny">Welcome back. Balance ${fmt(stats.balance)} · ${stats.rounds} lockers played.</p>` : `<p class="tiny">You start with ${fmt(START_BALANCE)}. Each locker is an independent bet with a ${Math.round(TARGET_RTP * 100)}% return-to-player.</p>`}
      <div class="actions"><button class="btn primary start">${returning ? 'Back to the lot ▶' : "Let's go ▶"}</button></div>`;
    card.querySelector('.start')!.addEventListener('click', () => { this.introModal.classList.remove('show'); this.onStart(); });
    this.introModal.classList.add('show');
  }

  /* ---------- stats ---------- */
  showStats(s: Stats): void {
    const card = this.statsModal.querySelector('.card')!;
    const render = (tab: string) => {
      const rtp = realizedRTP(s);
      const net = s.balance - START_BALANCE + s.bailouts * 0;
      let body = '';
      if (tab === 'overview') {
        body = `<div class="kpis">
          <div class="kpi"><span>Balance</span><b class="gold">${fmt(s.balance)}</b></div>
          <div class="kpi"><span>Net</span><b class="${net >= 0 ? 'good' : 'bad'}">${fmtSigned(net)}</b></div>
          <div class="kpi"><span>Lockers</span><b>${s.rounds}</b></div>
          <div class="kpi"><span>Won</span><b>${s.won}</b></div>
          <div class="kpi"><span>Outbid</span><b>${s.lost}</b></div>
          <div class="kpi"><span>Passed</span><b>${s.passed}</b></div>
          <div class="kpi"><span>Best haul</span><b class="good">${fmtSigned(s.bestProfit)}</b></div>
          <div class="kpi"><span>Worst</span><b class="${s.worstLoss < 0 ? "bad" : ""}">${s.worstLoss < 0 ? fmtSigned(s.worstLoss) : "—"}</b></div>
          <div class="kpi"><span>Best ×</span><b>${s.bestMultiplier.toFixed(1)}×</b></div>
          <div class="kpi"><span>Streak</span><b>${s.streak} <small class="tiny">/ best ${s.bestStreak}</small></b></div>
          <div class="kpi"><span>Jackpots</span><b class="gold">${s.jackpots}</b></div>
          <div class="kpi"><span>Bailouts</span><b>${s.bailouts}</b></div>
        </div>
        <h2>Bankroll</h2>${sparkline(s.balanceHistory)}
        <h2>Fairness</h2>
        <div class="bars">
          <div class="bar"><span>Theoretical RTP</span><div class="track"><i style="width:${TARGET_RTP * 100 / 1.2}%"></i></div><span class="v">${(TARGET_RTP * 100).toFixed(0)}%</span></div>
          <div class="bar"><span>Your realised RTP</span><div class="track"><i class="${rtp !== null && rtp >= TARGET_RTP ? 'good' : ''}" style="width:${Math.min(100, (rtp ?? 0) * 100 / 1.2)}%"></i></div><span class="v">${rtp === null ? '—' : (rtp * 100).toFixed(1) + '%'}</span></div>
          <div class="bar"><span>Spent / earned</span><div class="track"></div><span class="v">${fmt(s.totalSpent)} / ${fmt(s.totalEarned)}</span></div>
        </div>
        <p class="fairness">Every locker you win is an independent bet. The payout multiplier is drawn before the auction starts, from a distribution with a ${Math.round(TARGET_RTP * 100)}% average return. Nothing you see from the door — and nothing the rivals do — changes it.</p>`;
      } else if (tab === 'items') {
        const cats = (Object.entries(s.byCategory) as [Category, { items: number; value: number; lockers: number; replicas: number }][]).sort((a, b) => b[1].value - a[1].value);
        const maxV = Math.max(1, ...cats.map((c) => c[1].value));
        const items = Object.entries(s.items).sort((a, b) => b[1].value - a[1].value).slice(0, 8);
        body = `<div class="kpis">
          <div class="kpi"><span>Items appraised</span><b>${s.itemsAppraised}</b></div>
          <div class="kpi"><span>Hidden value</span><b class="gold">${fmt(s.hiddenValue)}</b></div>
          <div class="kpi"><span>Visible value</span><b>${fmt(s.visibleValue)}</b></div>
          <div class="kpi"><span>Replicas / fakes</span><b class="bad">${s.replicas}</b></div>
        </div>
        <h2>Value by category</h2>
        <div class="bars">${cats.length ? cats.map(([c, v]) => `<div class="bar"><span>${CATEGORY_ICON[c]} ${CATEGORY_LABEL[c]}</span><div class="track"><i style="width:${(v.value / maxV) * 100}%"></i></div><span class="v">${fmt(v.value)}</span></div>`).join('') : '<p>Win a locker to start tracking.</p>'}</div>
        <h2>Top finds</h2>
        <div class="list">${items.map(([, v]) => `<div class="li"><div>${CATEGORY_ICON[v.category]} ${v.name}<small>found ${v.count}× · best ${fmt(v.best)}</small></div><b>${fmt(v.value)}</b></div>`).join('') || '<p>Nothing yet.</p>'}</div>`;
      } else if (tab === 'rivals') {
        const rows = Object.entries(s.rivals).sort((a, b) => b[1].beatYou - a[1].beatYou);
        body = `<h2>Head to head</h2><div class="list">${rows.map(([id, r]) => { const b = BOT_BY_ID[id]; return `<div class="li"><div><i class="badge" style="background:${cssColor(b.color)};color:#fff">${b.short}</i> ${b.name}<small>outbid you ${r.beatYou}× · you outbid them ${r.youBeat}× · bought ${r.lockers} lockers for ${fmt(r.spent)}</small></div><b class="${r.beatYou > r.youBeat ? 'bad' : 'good'}">${r.youBeat}–${r.beatYou}</b></div>`; }).join('') || '<p>No auctions yet.</p>'}</div>`;
      } else {
        body = `<div class="list">${s.history.map((r) => `<div class="li"><div>#${r.n} ${r.theme}<small>${r.result === 'won' ? `paid ${fmt(r.paid)} · worth ${fmt(r.value)} · ×${r.multiplier.toFixed(2)}` : `${r.result === 'passed' ? 'passed' : 'outbid'} · ${BOT_BY_ID[r.winner]?.short ?? r.winner} paid ${fmt(r.paid)} · worth ${fmt(r.value)}`}${r.topItem ? ` · ${r.topItem.name}` : ''}</small></div><b class="${r.result === 'won' ? (r.profit >= 0 ? 'good' : 'bad') : ''}">${r.result === 'won' ? fmtSigned(r.profit) : (r.value - r.paid > 0 ? 'missed ' + fmt(r.value - r.paid) : 'dodged ' + fmt(r.paid - r.value))}</b></div>`).join('') || '<p>No lockers yet.</p>'}</div>`;
      }
      card.innerHTML = `<button class="close-x">✕</button><h1>Your stats</h1>
        <div class="tabs">${['overview', 'items', 'rivals', 'history'].map((t) => `<button data-t="${t}" class="${t === tab ? 'on' : ''}">${t}</button>`).join('')}</div>
        ${body}
        <div class="actions"><button class="btn ghost voice">${s.settings.voice ? '🗣️ Voices on' : '🤐 Voices off'}</button><button class="btn danger reset">Reset progress</button></div>`;
      card.querySelector('.close-x')!.addEventListener('click', () => this.statsModal.classList.remove('show'));
      card.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => render((b as HTMLElement).dataset.t!)));
      card.querySelector('.voice')!.addEventListener('click', () => { this.onToggleVoice(); render(tab); });
      card.querySelector('.reset')!.addEventListener('click', () => { if (confirm('Reset all progress and stats?')) { this.statsModal.classList.remove('show'); this.onReset(); } });
    };
    render('overview');
    this.statsModal.classList.add('show');
  }
  hideModals(): void { for (const m of [this.resultModal, this.statsModal, this.introModal]) m.classList.remove('show'); }
}

function sparkline(vals: number[]): string {
  if (vals.length < 2) return '<p class="tiny">Play a few lockers to see your bankroll curve.</p>';
  const w = 400, hgt = 80, pad = 4;
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const pts = vals.map((v, i) => [pad + (i / (vals.length - 1)) * (w - pad * 2), hgt - pad - ((v - min) / span) * (hgt - pad * 2)] as const);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const startY = pts[0][1];
  const up = vals[vals.length - 1] >= vals[0];
  return `<svg class="spark" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none" role="img" aria-label="Bankroll over time">
    <line x1="0" x2="${w}" y1="${startY}" y2="${startY}" stroke="rgba(255,255,255,.15)" stroke-dasharray="4 4"/>
    <path d="${d}" fill="none" stroke="${up ? '#58c98b' : '#ef5a5a'}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}
