/** All 2D UI: main menu, top bar, banners, phase panels, result card, stats. */
import { fmt, fmtSigned } from '../core/money';
import { TARGET_RTP, TIER_LABEL, hitRate, type OutcomeTier } from '../core/economy';
import { realizedRTP, type Stats, START_BALANCE, BAILOUT_AMOUNT } from '../core/stats';
import { CATEGORY_ICON, CATEGORY_LABEL, type Category } from '../game/items/types';
import { BOT_BY_ID, type Bot } from '../game/bots';
import type { Appraisal } from '../game/lockerGen';
import { icon, logoMark } from './icons';
import { itemCard, coverCard } from '../pack/manifest';
import type { CoverKind } from '../game/items/types';

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
  onMenu: () => void = () => {};
  onBailout: () => void = () => {};
  onToggleSound: () => boolean = () => true;
  onToggleVoice: () => boolean = () => true;
  onReset: () => void = () => {};
  onStart: () => void = () => {};
  onOpenStats: () => Stats = () => null as unknown as Stats;

  private topbar!: HTMLElement;
  private balanceEl!: HTMLElement; private deltaEl!: HTMLElement; private lockerEl!: HTMLElement; private themeEl!: HTMLElement;
  private banner!: HTMLElement; private bannerTitle!: HTMLElement; private bannerSub!: HTMLElement; private bannerBar!: HTMLElement; private bannerBarI!: HTMLElement;
  private auctLine!: HTMLElement;
  private panels: Record<string, HTMLElement> = {};
  private priceEl!: HTMLElement; private whoEl!: HTMLElement; private bidMain!: HTMLButtonElement; private bidJ1!: HTMLButtonElement; private bidJ2!: HTMLButtonElement; private passBtn!: HTMLButtonElement; private rivalsStrip!: HTMLElement;
  private cardIcon!: HTMLElement; private cardName!: HTMLElement; private cardCond!: HTMLElement; private cardVal!: HTMLElement; private runningEl!: HTMLElement; private paidEl!: HTMLElement; private dots!: HTMLElement;
  private flashBtns: HTMLButtonElement[] = []; private soundBtns: HTMLButtonElement[] = []; private voiceBtns: HTMLButtonElement[] = []; private installBtns: HTMLButtonElement[] = [];
  private resultModal!: HTMLElement; private statsModal!: HTMLElement; private menu!: HTMLElement; private toasts!: HTMLElement;
  private balanceShown = 0;
  private installPrompt: (Event & { prompt: () => Promise<void> }) | null = null;
  private soundOn = true; private voiceOn = true;
  private revealEl!: HTMLElement;
  private menuLoading: number | null = null;

  constructor() {
    this.root.appendChild(h('<div class="vignette"></div>'));
    const top = h(`<div class="topbar">
      <div class="chip balance"><span class="t-label">Cash</span><span class="amount">$0</span><span class="delta"></span></div>
      <div class="chip locker-info"><b>Locker</b><span></span></div>
      <div class="icons"><button class="ibtn b-stats" title="Stats">${icon('stats')}</button><button class="ibtn b-sound" title="Sound">${icon('soundOn')}</button><button class="ibtn b-install" title="Install app" style="display:none">${icon('install')}</button></div>
    </div>`);
    this.root.appendChild(top);
    this.topbar = top;
    this.balanceEl = top.querySelector('.amount')!; this.deltaEl = top.querySelector('.delta')!;
    this.lockerEl = top.querySelector('.locker-info b')!; this.themeEl = top.querySelector('.locker-info span')!;
    this.soundBtns.push(top.querySelector('.b-sound')!); this.installBtns.push(top.querySelector('.b-install')!);
    top.querySelector('.b-stats')!.addEventListener('click', () => this.showStats(this.onOpenStats()));
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.installPrompt = e as never; for (const b of this.installBtns) b.style.display = ''; });

    this.banner = h('<div class="banner"><div class="banner-title"></div><div class="banner-sub"></div><div class="banner-bar"><i></i></div></div>');
    this.root.appendChild(this.banner);
    this.bannerTitle = this.banner.querySelector('.banner-title')!; this.bannerSub = this.banner.querySelector('.banner-sub')!; this.bannerBar = this.banner.querySelector('.banner-bar')!; this.bannerBarI = this.bannerBar.querySelector('i')!;

    this.auctLine = h('<div class="auct-line"></div>'); this.root.appendChild(this.auctLine);
    this.toasts = h('<div class="toasts"></div>'); this.root.appendChild(this.toasts);
    this.revealEl = h('<div class="reveal-card" aria-hidden="true"><div class="flip"><div class="face front"><img alt=""></div><div class="face back"><img alt=""></div></div><div class="cap"><b></b><span></span></div></div>');
    this.root.appendChild(this.revealEl);

    // inspection panel
    const pi = h(`<div class="panel panel-inspect">
      <div class="rivals-strip"></div>
      <div class="row"><button class="btn flash-btn">${icon('flashlight')} Flashlight</button><button class="btn primary ready-btn"><span class="stack">Ready to bid<small>skip the look</small></span>${icon('chevron', 18)}</button></div>
      <div class="hint">Drag to look around · pinch or scroll to lean in · what's under the tarps?</div>
    </div>`);
    this.root.appendChild(pi); this.panels.inspect = pi;
    this.flashBtns.push(pi.querySelector('.flash-btn')!);
    pi.querySelector('.ready-btn')!.addEventListener('click', () => this.onReady());

    // auction panel
    const pa = h(`<div class="panel panel-auction">
      <div class="bid-state"><div class="price">$0</div><div class="who">Opening</div></div>
      <div class="bid-buttons"><button class="btn primary main">Bid</button><button class="btn jump1">+</button><button class="btn jump2">+</button></div>
      <div class="row"><button class="btn sq flash-btn" title="Flashlight">${icon('flashlight')}</button><button class="btn danger pass">Pass on this locker</button></div>
      <div class="rivals-strip"></div>
    </div>`);
    this.root.appendChild(pa); this.panels.auction = pa;
    this.priceEl = pa.querySelector('.price')!; this.whoEl = pa.querySelector('.who')!;
    this.bidMain = pa.querySelector('.main')!; this.bidJ1 = pa.querySelector('.jump1')!; this.bidJ2 = pa.querySelector('.jump2')!; this.passBtn = pa.querySelector('.pass')!;
    this.rivalsStrip = pa.querySelector('.rivals-strip')!;
    for (const b of [this.bidMain, this.bidJ1, this.bidJ2]) b.addEventListener('click', () => this.onBid(Number(b.dataset.amount)));
    this.passBtn.addEventListener('click', () => this.onPass());
    this.flashBtns.push(pa.querySelector('.flash-btn')!);
    for (const b of this.flashBtns) b.addEventListener('click', () => this.onFlashlight());

    // count-up panel
    const pc = h(`<div class="panel panel-count">
      <div class="item-card"><div class="icon">${icon('look', 22)}</div><div><div class="name">—</div><div class="cond"></div></div><div class="val"></div></div>
      <div class="running"><span>Locker total</span><div><b>$0</b><span class="paid"></span></div></div>
      <div class="progress-dots"></div>
      <div class="row"><button class="btn ghost ff">${icon('forward', 18)} Fast-forward</button></div>
    </div>`);
    this.root.appendChild(pc); this.panels.count = pc;
    this.cardIcon = pc.querySelector('.icon')!; this.cardName = pc.querySelector('.name')!; this.cardCond = pc.querySelector('.cond')!; this.cardVal = pc.querySelector('.val')!;
    this.runningEl = pc.querySelector('.running b')!; this.paidEl = pc.querySelector('.paid')!; this.dots = pc.querySelector('.progress-dots')!;
    pc.querySelector('.ff')!.addEventListener('click', () => this.onFastForward());

    this.resultModal = h('<div class="modal result"><div class="card"></div></div>'); this.root.appendChild(this.resultModal);
    this.statsModal = h('<div class="modal stats"><div class="card"></div></div>'); this.root.appendChild(this.statsModal);
    this.menu = h('<div class="menu hidden"></div>'); this.root.appendChild(this.menu);
    this.wireToggles();
  }

  private wireToggles(): void {
    for (const b of this.soundBtns) b.onclick = () => { this.setSound(this.onToggleSound()); };
    for (const b of this.voiceBtns) b.onclick = () => { this.setVoice(this.onToggleVoice()); };
    for (const b of this.installBtns) { b.onclick = async () => { if (this.installPrompt) { await this.installPrompt.prompt(); for (const x of this.installBtns) x.style.display = 'none'; } }; if (this.installPrompt) b.style.display = ''; }
  }

  /* ---------- top bar ---------- */
  setBalance(n: number, animateDelta = true): void {
    const d = n - this.balanceShown;
    if (animateDelta && Math.abs(d) >= 0.01 && this.balanceShown !== 0) {
      this.deltaEl.textContent = fmtSigned(d);
      this.deltaEl.className = 'delta';
      void this.deltaEl.offsetWidth;
      this.deltaEl.classList.add(d > 0 ? 'up' : 'down');
    }
    this.balanceShown = n;
    this.balanceEl.textContent = fmt(n);
  }
  setLocker(n: number, theme: string, blurb: string): void { this.lockerEl.textContent = `Locker #${n} · ${theme}`; this.themeEl.textContent = blurb; }
  setSound(on: boolean): void { this.soundOn = on; for (const b of this.soundBtns) { b.innerHTML = icon(on ? 'soundOn' : 'soundOff'); b.classList.toggle('off', !on); } }
  setVoice(on: boolean): void { this.voiceOn = on; for (const b of this.voiceBtns) { b.innerHTML = icon(on ? 'voiceOn' : 'voiceOff'); b.classList.toggle('off', !on); } }
  setFlashlight(on: boolean): void { for (const b of this.flashBtns) b.classList.toggle('on', on); }
  setChrome(visible: boolean): void { this.topbar.classList.toggle('hidden', !visible); if (!visible) this.hideBanner(); }

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
    (this.panels.inspect.querySelector('.rivals-strip') as HTMLElement).innerHTML = `<span class="t-label">Against</span>` + html;
  }

  setAuction(state: { price: number; ask: number; high: string | null; canBid: boolean; going: 0 | 1 | 2; folded: boolean; jumps: [number, number]; balance: number }): void {
    const { price, ask, high, canBid, going, folded, jumps, balance } = state;
    const prev = this.priceEl.textContent;
    this.priceEl.textContent = price > 0 ? fmt(price) : fmt(ask);
    if (prev !== this.priceEl.textContent) { this.priceEl.classList.remove('bump'); void this.priceEl.offsetWidth; this.priceEl.classList.add('bump'); }
    let who = 'Opening bid';
    let cls = 'who';
    if (high === 'player') { who = 'You have it'; cls += ' you'; }
    else if (high) { who = `${BOT_BY_ID[high]?.short ?? high} has it`; }
    if (going === 1) { who = 'Going once'; cls += ' going'; }
    if (going === 2) { who = 'Going twice'; cls += ' going'; }
    this.whoEl.textContent = who; this.whoEl.className = cls;
    this.bidMain.innerHTML = `Bid ${fmt(ask)}`; this.bidMain.dataset.amount = String(ask);
    this.bidJ1.innerHTML = `<span class="stack">${fmt(jumps[0])}<small>jump</small></span>`; this.bidJ1.dataset.amount = String(jumps[0]);
    this.bidJ2.innerHTML = `<span class="stack">${fmt(jumps[1])}<small>big jump</small></span>`; this.bidJ2.dataset.amount = String(jumps[1]);
    this.bidMain.disabled = !canBid; this.bidJ1.disabled = !canBid || jumps[0] > balance; this.bidJ2.disabled = !canBid || jumps[1] > balance;
    this.passBtn.disabled = folded; this.passBtn.textContent = folded ? 'You passed' : 'Pass on this locker';
    if (!canBid && !folded && high !== 'player' && ask > balance) this.bidMain.innerHTML = `Can't afford ${fmt(ask)}`;
  }

  /* ---------- count-up ---------- */
  startCount(total: number, paid: number): void {
    this.dots.innerHTML = Array.from({ length: total }, () => '<i></i>').join('');
    this.runningEl.textContent = '$0'; this.runningEl.className = '';
    this.paidEl.textContent = paid > 0 ? `paid ${fmt(paid)}` : '';
    this.cardIcon.className = 'icon'; this.cardIcon.innerHTML = icon('look', 22); this.cardName.textContent = 'Walking the locker…'; this.cardCond.textContent = ''; this.cardVal.textContent = '';
  }
  showItem(a: Appraisal, index: number): void {
    this.cardIcon.className = 'icon thumb'; this.cardIcon.innerHTML = `<img src="${itemCard(a.def.id)}" alt="" onerror="this.replaceWith(document.createRange().createContextualFragment(this.dataset.fb))" data-fb='${icon(CATEGORY_ICON[a.def.category], 24)}'>`;
    this.cardName.textContent = a.def.name;
    const tone = a.condition.tone;
    this.cardCond.innerHTML = `${a.revealed ? `<b>${icon('eye', 12)} Revealed</b>` : ''}<b class="${tone}">${a.condition.label}${a.condition.mult !== 1 ? ` ×${a.condition.mult}` : ''}</b><span>${CATEGORY_LABEL[a.def.category]}</span>`;
    this.cardVal.textContent = ''; this.cardVal.className = 'val';
    this.dots.querySelectorAll('i').forEach((d, i) => { d.className = i < index ? 'done' : i === index ? 'cur' : ''; });
  }
  showItemValue(v: number, bad: boolean): void { this.cardVal.textContent = fmt(v); this.cardVal.className = 'val' + (bad ? ' bad' : ''); }
  /**
   * Big reveal card. With a container, it shows the container's card and flips to the item.
   * `hold` is how long it stays up (seconds of game time, already scaled by fast-forward).
   */
  revealCard(itemId: string, container: CoverKind | null, title: string, value: string, tone: 'good' | 'neutral' | 'bad', hold: number): void {
    const el = this.revealEl;
    const [front, back] = el.querySelectorAll('img');
    (front as HTMLImageElement).src = container ? coverCard(container) : itemCard(itemId);
    (back as HTMLImageElement).src = itemCard(itemId);
    (el.querySelector('.cap b') as HTMLElement).textContent = title;
    const v = el.querySelector('.cap span') as HTMLElement; v.textContent = value; v.className = tone;
    el.className = 'reveal-card'; void el.offsetWidth;
    el.classList.add('show', container ? 'flipping' : 'plain');
    el.style.setProperty('--hold', `${Math.max(0.8, hold)}s`);
    clearTimeout((el as unknown as { _t?: number })._t);
    (el as unknown as { _t?: number })._t = window.setTimeout(() => el.classList.remove('show'), Math.max(0.8, hold) * 1000);
  }
  hideRevealCard(): void { this.revealEl.classList.remove('show'); }

  setRunning(total: number, paid: number): void {
    this.runningEl.textContent = fmt(total);
    this.runningEl.className = paid > 0 ? (total >= paid ? 'pos' : 'neg') : '';
  }

  /* ---------- result ---------- */
  showResult(r: ResultData): void {
    const card = this.resultModal.querySelector('.card')!;
    const profit = r.value - r.paid;
    let title = '', cls = '';
    if (r.kind === 'won') {
      title = profit >= 0 ? (r.tier === 'jackpot' ? 'Jackpot locker' : r.tier === 'huge' ? 'Huge score' : r.tier === 'big' ? 'Big score' : 'Profit') : (r.tier === 'bust' ? 'Junk locker' : 'That hurt');
      cls = profit >= 0 ? (r.tier === 'big' || r.tier === 'huge' || r.tier === 'jackpot' ? 'gold' : 'good') : 'bad';
    }
    else { title = r.kind === 'passed' ? 'You passed' : `${r.winnerName} takes it`; }
    const missed = r.value - r.paid;
    const bestHtml = r.best ? `<div class="best"><img src="${itemCard(r.best.def.id)}" alt=""><div><span class="t-label">Best find</span><b>${r.best.def.name}</b><small>${r.best.revealed ? 'Was hidden · ' : ''}${r.best.condition.label}</small><em>${fmt(r.best.value)}</em></div></div>` : '';
    const quipHtml = r.quip ? `<div class="quote"><b>${r.quip.who}</b> “${r.quip.text}”</div>` : '';
    const tierBadge = r.tier ? `<span class="badge ${r.tier}">${TIER_LABEL[r.tier]}</span>` : '';
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
    const brokeHtml = r.broke ? `<p><b style="color:var(--bad)">You're out of cash.</b> Big Dave offers a ${fmt(BAILOUT_AMOUNT)} "loan" to keep you in the game. No interest. Probably.</p>` : '';
    card.innerHTML = `<h1 class="${cls}">${title}</h1>${body}${bestHtml}${quipHtml}${brokeHtml}
      <div class="actions">${r.broke ? '<button class="btn gold bail">Take the loan</button>' : `<button class="btn primary next">Next locker ${icon('chevron', 18)}</button>`}<button class="btn sq stats" title="Stats">${icon('stats')}</button><button class="btn sq to-menu" title="Main menu">${icon('home')}</button></div>`;
    card.querySelector('.next')?.addEventListener('click', () => { this.resultModal.classList.remove('show'); this.onNext(); });
    card.querySelector('.bail')?.addEventListener('click', () => { this.resultModal.classList.remove('show'); this.onBailout(); });
    card.querySelector('.stats')!.addEventListener('click', () => this.showStats(this.onOpenStats()));
    card.querySelector('.to-menu')!.addEventListener('click', () => { if (r.broke) return this.toast('Take the loan first'); this.resultModal.classList.remove('show'); this.onMenu(); });
    this.resultModal.classList.add('show');
  }

  /* ---------- main menu ---------- */
  showMenu(stats: Stats, bots: Bot[]): void {
    const returning = stats.rounds > 0;
    const net = stats.balance - START_BALANCE;
    const rtp = realizedRTP(stats);
    this.menu.innerHTML = `
      <div class="menu-logo">${logoMark(64)}<div class="wordmark">Locker<br><span>Wars</span><small>Storage auction showdown</small></div></div>
      <div class="menu-copy">
        <p>Fresh units roll up one after another. You get <b>one look from the door</b>, then you're in a shouting match with the crowd.</p>
        <p>Win it and we count every item inside. <b>Pay less than it's worth</b> and you profit.</p>
      </div>
      <div class="menu-cta">
        <button class="btn primary hero start" ${this.menuLoading !== null ? 'disabled' : ''}>${icon('play', 20)} <span class="start-label">${this.menuLoading !== null ? 'Loading the crowd…' : returning ? 'Back to the lot' : 'Start bidding'}</span></button>
        <div class="load-bar" ${this.menuLoading === null ? 'hidden' : ''}><i style="transform:scaleX(${this.menuLoading ?? 0})"></i></div>
        <div class="meta"><span>Bankroll</span><b>${fmt(stats.balance)}</b><span>·</span><span>Locker #${stats.round + 1} is next</span></div>
      </div>
      <div class="menu-side">
        <div class="mcard rivals"><h3>${icon('users', 16)} Today's rivals</h3>${bots.map((b) => `<div class="mrival"><i class="dot" style="background:${cssColor(b.color)}"></i><div>${b.name}<small>${b.intro}</small></div></div>`).join('')}</div>
        <div class="mcard"><h3>${icon('trophy', 16)} Your record</h3><div class="mstats">
          <div class="mstat"><span>Lockers</span><b>${stats.rounds}</b></div>
          <div class="mstat"><span>Net</span><b class="${net >= 0 ? '' : ''}" style="color:${net > 0 ? 'var(--good)' : net < 0 ? 'var(--bad)' : 'inherit'}">${fmtSigned(net)}</b></div>
          <div class="mstat"><span>Best haul</span><b>${stats.bestProfit > 0 ? fmtSigned(stats.bestProfit) : '—'}</b></div>
          <div class="mstat"><span>Return</span><b>${rtp === null ? '—' : (rtp * 100).toFixed(0) + '%'}</b></div>
        </div></div>
      </div>
      <div class="menu-foot">
        <span class="tiny">Every locker is an independent ${Math.round(TARGET_RTP * 100)}% RTP bet.</span>
        <button class="ibtn m-stats" title="Stats">${icon('stats')}</button>
        <button class="ibtn m-sound" title="Sound">${icon(this.soundOn ? 'soundOn' : 'soundOff')}</button>
        <button class="ibtn m-voice" title="Voices">${icon(this.voiceOn ? 'voiceOn' : 'voiceOff')}</button>
        <button class="ibtn m-install" title="Install app" style="display:none">${icon('install')}</button>
      </div>`;
    this.menu.querySelector('.start')!.addEventListener('click', () => this.onStart());
    this.menu.querySelector('.m-stats')!.addEventListener('click', () => this.showStats(this.onOpenStats()));
    this.soundBtns = [this.soundBtns[0], this.menu.querySelector('.m-sound')!];
    this.voiceBtns = [this.menu.querySelector('.m-voice')!];
    this.installBtns = [this.installBtns[0], this.menu.querySelector('.m-install')!];
    this.wireToggles();
    this.setSound(this.soundOn); this.setVoice(this.voiceOn);
    this.menu.classList.remove('hidden');
    this.setChrome(false);
  }
  /** null = ready; 0..1 = still loading characters. */
  setMenuLoading(p: number | null, readyLabel = 'Start bidding'): void {
    this.menuLoading = p;
    const btn = this.menu.querySelector('.start') as HTMLButtonElement | null;
    if (!btn) return;
    btn.disabled = p !== null;
    (btn.querySelector('.start-label') as HTMLElement).textContent = p !== null ? 'Loading the crowd…' : readyLabel;
    const bar = this.menu.querySelector('.load-bar') as HTMLElement;
    bar.hidden = p === null;
    if (p !== null) (bar.firstElementChild as HTMLElement).style.transform = `scaleX(${p})`;
  }
  hideMenu(): void { this.menu.classList.add('hidden'); this.setChrome(true); }

  /* ---------- stats ---------- */
  showStats(s: Stats): void {
    const card = this.statsModal.querySelector('.card')!;
    const render = (tab: string) => {
      const rtp = realizedRTP(s);
      const net = s.balance - START_BALANCE;
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
          <div class="kpi"><span>Worst</span><b class="${s.worstLoss < 0 ? 'bad' : ''}">${s.worstLoss < 0 ? fmtSigned(s.worstLoss) : '—'}</b></div>
          <div class="kpi"><span>Best ×</span><b>${s.bestMultiplier.toFixed(1)}×</b></div>
          <div class="kpi"><span>Streak</span><b>${s.streak} <small>/ best ${s.bestStreak}</small></b></div>
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
        <p class="fairness">Every locker you win is an independent bet. The payout multiplier is drawn before the auction starts, from a distribution with a ${Math.round(TARGET_RTP * 100)}% average return: about ${Math.round(hitRate() * 100)}% of won lockers pay out more than you paid, and the busts pay for it. Nothing you see from the door, and nothing the rivals do, changes it.</p>`;
      } else if (tab === 'items') {
        const cats = (Object.entries(s.byCategory) as [Category, { items: number; value: number; lockers: number; replicas: number }][]).sort((a, b) => b[1].value - a[1].value);
        const maxV = Math.max(1, ...cats.map((c) => c[1].value));
        const items = Object.entries(s.items).sort((a, b) => b[1].value - a[1].value).slice(0, 8);
        body = `<div class="kpis">
          <div class="kpi"><span>Appraised</span><b>${s.itemsAppraised}</b></div>
          <div class="kpi"><span>Hidden value</span><b class="gold">${fmt(s.hiddenValue)}</b></div>
          <div class="kpi"><span>Visible value</span><b>${fmt(s.visibleValue)}</b></div>
          <div class="kpi"><span>Replicas</span><b class="bad">${s.replicas}</b></div>
        </div>
        <h2>Value by category</h2>
        <div class="bars">${cats.length ? cats.map(([c, v]) => `<div class="bar"><span>${icon(CATEGORY_ICON[c], 14)} ${CATEGORY_LABEL[c]}</span><div class="track"><i style="width:${(v.value / maxV) * 100}%"></i></div><span class="v">${fmt(v.value)}</span></div>`).join('') : '<p>Win a locker to start tracking.</p>'}</div>
        <h2>Top finds</h2>
        <div class="list">${items.map(([id, v]) => `<div class="li"><div><img class="mini" src="${itemCard(id)}" alt="" loading="lazy"><div>${v.name}<small>found ${v.count}× · best ${fmt(v.best)}</small></div></div><b>${fmt(v.value)}</b></div>`).join('') || '<p>Nothing yet.</p>'}</div>`;
      } else if (tab === 'rivals') {
        const rows = Object.entries(s.rivals).sort((a, b) => b[1].beatYou - a[1].beatYou);
        body = `<h2>Head to head</h2><div class="list">${rows.map(([id, r]) => { const b = BOT_BY_ID[id]; return `<div class="li"><div><i class="dot" style="background:${cssColor(b.color)}"></i><div>${b.name}<small>outbid you ${r.beatYou}× · you outbid them ${r.youBeat}× · bought ${r.lockers} for ${fmt(r.spent)}</small></div></div><b class="${r.beatYou > r.youBeat ? 'bad' : 'good'}">${r.youBeat}–${r.beatYou}</b></div>`; }).join('') || '<p>No auctions yet.</p>'}</div>`;
      } else {
        body = `<div class="list">${s.history.map((r) => `<div class="li"><div><div>#${r.n} ${r.theme}<small>${r.result === 'won' ? `paid ${fmt(r.paid)} · worth ${fmt(r.value)} · ×${r.multiplier.toFixed(2)}` : `${r.result === 'passed' ? 'passed' : 'outbid'} · ${BOT_BY_ID[r.winner]?.short ?? r.winner} paid ${fmt(r.paid)} · worth ${fmt(r.value)}`}${r.topItem ? ` · ${r.topItem.name}` : ''}</small></div></div><b class="${r.result === 'won' ? (r.profit >= 0 ? 'good' : 'bad') : ''}">${r.result === 'won' ? fmtSigned(r.profit) : (r.value - r.paid > 0 ? 'missed ' + fmt(r.value - r.paid) : 'dodged ' + fmt(r.paid - r.value))}</b></div>`).join('') || '<p>No lockers yet.</p>'}</div>`;
      }
      card.innerHTML = `<button class="close-x" title="Close">${icon('close', 18)}</button><h1>Your stats</h1>
        <div class="tabs">${['overview', 'items', 'rivals', 'history'].map((t) => `<button data-t="${t}" class="${t === tab ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
        ${body}
        <div class="actions"><button class="btn ghost voice">${icon(s.settings.voice ? 'voiceOn' : 'voiceOff', 18)} Voices ${s.settings.voice ? 'on' : 'off'}</button><button class="btn ghost danger reset">${icon('reset', 18)} Reset progress</button></div>`;
      card.querySelector('.close-x')!.addEventListener('click', () => this.statsModal.classList.remove('show'));
      card.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => render((b as HTMLElement).dataset.t!)));
      card.querySelector('.voice')!.addEventListener('click', () => { this.setVoice(this.onToggleVoice()); render(tab); });
      card.querySelector('.reset')!.addEventListener('click', () => { if (confirm('Reset all progress and stats?')) { this.statsModal.classList.remove('show'); this.onReset(); } });
    };
    render('overview');
    this.statsModal.classList.add('show');
  }
  hideModals(): void { for (const m of [this.resultModal, this.statsModal]) m.classList.remove('show'); }
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
    <path d="${d}" fill="none" stroke="${up ? '#3ecf8e' : '#ff5c5c'}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}
