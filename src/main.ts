import './style.css';
import { SoundEngine } from './audio/SoundEngine';
import {
  AIR_MARSHAL_RANKS,
  AIR_MARSHAL_UNLOCK_LEVEL,
  UPGRADES,
  getRankForXp,
  getShiftConfig,
} from './data/levels';
import { CheckpointScene } from './scene/CheckpointScene';
import { evaluateDecision } from './sim/evaluator';
import { generatePassengerCase, generateWatchlist } from './sim/generator';
import { renderBoardingPass, renderIdentityDocument } from './sim/idRenderer';
import type {
  BeltState,
  CameraStation,
  DecisionAction,
  PassengerCase,
  PlayerProgress,
  ShiftConfig,
  UpgradeId,
  WatchlistEntry,
  XRayMode,
} from './sim/types';
import { hitTestBagItem, renderXRayMonitor } from './sim/xrayRenderer';

const SAVE_KEY = 'skyguard_checkpoint_save_v1';

function createInitialProgress(): PlayerProgress {
  return {
    level: 1,
    xp: 0,
    credits: 0,
    totalProcessed: 0,
    totalCorrect: 0,
    contrabandSeized: 0,
    forgeriesCaught: 0,
    streak: 0,
    bestStreak: 0,
    upgrades: {
      densityProbe: false,
      highSpeedBelt: false,
      wideUvLamp: false,
      watchlistAlert: false,
    },
    airMarshalUnlocked: false,
  };
}

function loadProgress(): PlayerProgress {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return createInitialProgress();
    const parsed = JSON.parse(raw) as Partial<PlayerProgress>;
    return {
      ...createInitialProgress(),
      ...parsed,
      upgrades: {
        ...createInitialProgress().upgrades,
        ...(parsed.upgrades ?? {}),
      },
    };
  } catch {
    return createInitialProgress();
  }
}

function saveProgress(progress: PlayerProgress): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage quota / private mode failures
  }
}

class SkyGuardGame {
  private readonly sound = new SoundEngine();
  private readonly scene: CheckpointScene;
  private progress: PlayerProgress = loadProgress();

  // DOM references
  private readonly hudTop = document.getElementById('hud-top')!;
  private readonly hudBottom = document.getElementById('hud-bottom')!;
  private readonly paxDialogue = document.getElementById('pax-dialogue')!;
  private readonly paxDialogueText = document.getElementById('pax-dialogue-text')!;
  private readonly rulesDrawer = document.getElementById('rules-drawer')!;
  private readonly stationDocs = document.getElementById('station-documents')!;
  private readonly stationXRay = document.getElementById('station-xray')!;
  private readonly modalBriefing = document.getElementById('modal-briefing')!;
  private readonly modalDebrief = document.getElementById('modal-debrief')!;
  private readonly feedbackToast = document.getElementById('feedback-toast')!;

  private readonly canvasId = document.getElementById('canvas-id') as HTMLCanvasElement;
  private readonly canvasBoarding = document.getElementById('canvas-boarding') as HTMLCanvasElement;
  private readonly canvasXRay = document.getElementById('canvas-xray') as HTMLCanvasElement;

  private readonly idCtx = this.canvasId.getContext('2d')!;
  private readonly boardingCtx = this.canvasBoarding.getContext('2d')!;
  private readonly xrayCtx = this.canvasXRay.getContext('2d')!;

  // Active shift state
  private shiftConfig: ShiftConfig = getShiftConfig(this.progress.level);
  private watchlist: WatchlistEntry[] = [];
  private shiftQueue: PassengerCase[] = [];
  private currentPaxIdx = 0;
  private currentPax: PassengerCase | null = null;
  private shiftActive = false;
  private awaitingNextPax = false;

  // Shift-scoped telemetry for debrief
  private shiftCorrect = 0;
  private shiftContraband = 0;

  // Interactive station state
  private station: CameraStation = 'overview';
  private xrayMode: XRayMode = 'STD';
  private beltState: BeltState = 'FWD';
  private bagOffsetX = 280; // Starts right of scan tunnel and glides in
  private xrayCursor: { x: number; y: number } | null = null;
  private hoveredItemId: string | null = null;

  private uvActive = false;
  private uvCursor: { x: number; y: number } | null = null;

  private lastFrameTs = performance.now();
  private scanTime = 0;
  private toastTimeout: number | null = null;

  constructor() {
    const viewport = document.getElementById('viewport-3d')!;
    this.scene = new CheckpointScene(viewport, this.canvasXRay);

    this.bindUIEvents();
    this.prepareBriefing(this.progress.level);
    requestAnimationFrame(this.loop);
  }

  private bindUIEvents(): void {
    // Start shift / reset career
    document.getElementById('btn-start-shift')!.addEventListener('click', () => {
      this.sound.playTerminalChime();
      this.startShift();
    });

    document.getElementById('btn-reset-save')!.addEventListener('click', () => {
      this.progress = createInitialProgress();
      saveProgress(this.progress);
      this.prepareBriefing(1);
    });

    document.getElementById('btn-next-shift')!.addEventListener('click', () => {
      this.sound.playClick(true);
      this.modalDebrief.classList.add('hidden');
      this.prepareBriefing(this.progress.level);
    });

    // Top HUD controls
    document.getElementById('btn-rules')!.addEventListener('click', () => {
      this.sound.playClick();
      this.rulesDrawer.classList.toggle('hidden');
    });
    document.getElementById('btn-close-rules')!.addEventListener('click', () => {
      this.sound.playClick();
      this.rulesDrawer.classList.add('hidden');
    });
    document.getElementById('btn-mute')!.addEventListener('click', (e) => {
      const muted = this.sound.toggleMute();
      (e.currentTarget as HTMLButtonElement).textContent = muted ? 'AUDIO OFF' : 'AUDIO ON';
    });

    // Station camera switcher
    document.querySelectorAll<HTMLButtonElement>('[data-station]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const st = btn.dataset.station as CameraStation;
        this.setStation(st);
      });
    });

    // UV blacklight toggle & cursor tracking on ID card
    document.getElementById('btn-uv-toggle')!.addEventListener('click', () => {
      this.toggleUv();
    });

    this.canvasId.addEventListener('pointermove', (e) => {
      const rect = this.canvasId.getBoundingClientRect();
      this.uvCursor = {
        x: ((e.clientX - rect.left) / rect.width) * this.canvasId.width,
        y: ((e.clientY - rect.top) / rect.height) * this.canvasId.height,
      };
      this.redrawDocuments();
    });
    this.canvasId.addEventListener('pointerleave', () => {
      this.uvCursor = null;
      this.redrawDocuments();
    });

    // X-ray filter & conveyor belt buttons
    document.querySelectorAll<HTMLButtonElement>('[data-xray-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setXRayMode(btn.dataset.xrayMode as XRayMode);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('[data-belt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setBeltState(btn.dataset.belt as BeltState);
      });
    });

    // X-ray interactive hover & click-to-flag contraband
    this.canvasXRay.addEventListener('pointermove', (e) => {
      const rect = this.canvasXRay.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * this.canvasXRay.width;
      const py = ((e.clientY - rect.top) / rect.height) * this.canvasXRay.height;
      this.xrayCursor = { x: px, y: py };
      if (this.currentPax) {
        const hit = hitTestBagItem(
          this.canvasXRay.width,
          this.canvasXRay.height,
          this.currentPax.bag,
          this.bagOffsetX,
          px,
          py,
        );
        this.hoveredItemId = hit?.instanceId ?? null;
      }
    });

    this.canvasXRay.addEventListener('pointerleave', () => {
      this.xrayCursor = null;
      this.hoveredItemId = null;
    });

    this.canvasXRay.addEventListener('click', (e) => {
      if (!this.currentPax || this.awaitingNextPax) return;
      const rect = this.canvasXRay.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * this.canvasXRay.width;
      const py = ((e.clientY - rect.top) / rect.height) * this.canvasXRay.height;
      const hit = hitTestBagItem(
        this.canvasXRay.width,
        this.canvasXRay.height,
        this.currentPax.bag,
        this.bagOffsetX,
        px,
        py,
      );
      if (hit) {
        hit.flagged = !hit.flagged;
        this.sound.playFlagItem(hit.flagged);
        this.updateFlaggedBadges();
      }
    });

    // Decision action buttons
    document.getElementById('btn-clear')!.addEventListener('click', () => this.submitDecision('CLEAR'));
    document.getElementById('btn-deny')!.addEventListener('click', () => this.submitDecision('DENY_ID'));
    document.getElementById('btn-detain')!.addEventListener('click', () => this.submitDecision('CONFISCATE_DETAIN'));

    // Keyboard shortcuts for crisp operator flow
    window.addEventListener('keydown', (e) => {
      if (!this.shiftActive || this.awaitingNextPax) return;
      const key = e.key.toLowerCase();
      if (key === '1') this.setStation('overview');
      else if (key === '2') this.setStation('documents');
      else if (key === '3') this.setStation('xray');
      else if (key === 'u') this.toggleUv();
      else if (key === 'a') this.setBeltState('REV');
      else if (key === 's') this.setBeltState('STOP');
      else if (key === 'f') this.setBeltState('FWD');
      else if (key === 'c') this.submitDecision('CLEAR');
      else if (key === 'd') this.submitDecision('DENY_ID');
      else if (key === 'x') this.submitDecision('CONFISCATE_DETAIN');
    });
  }

  private prepareBriefing(level: number): void {
    this.shiftConfig = getShiftConfig(level);
    this.watchlist = generateWatchlist(this.shiftConfig);

    document.getElementById('briefing-title')!.textContent =
      level === 1 && this.progress.totalProcessed === 0
        ? 'SKYGUARD: AIRPORT SECURITY'
        : this.shiftConfig.title.toUpperCase();
    document.getElementById('briefing-gate')!.textContent = this.shiftConfig.terminalGate;
    document.getElementById('briefing-date')!.textContent = this.shiftConfig.dateDisplay;
    document.getElementById('briefing-quota')!.textContent = `${this.shiftConfig.passengerQuota} PASSENGERS`;

    const rulesList = document.getElementById('briefing-rules-list')!;
    rulesList.innerHTML = '';
    for (const r of this.shiftConfig.briefingRules) {
      const li = document.createElement('li');
      li.textContent = r;
      rulesList.appendChild(li);
    }

    const wlBox = document.getElementById('briefing-watchlist-box')!;
    const wlList = document.getElementById('briefing-watchlist-list')!;
    wlList.innerHTML = '';
    if (this.watchlist.length > 0) {
      wlBox.classList.remove('hidden');
      for (const entry of this.watchlist) {
        const div = document.createElement('div');
        div.className = 'bolo-card';
        div.innerHTML = `<div class="bolo-name">${entry.name} • ${entry.docNumber}</div><div class="bolo-meta">${entry.threatLevel}: ${entry.reason}</div>`;
        wlList.appendChild(div);
      }
    } else {
      wlBox.classList.add('hidden');
    }

    const resetBtn = document.getElementById('btn-reset-save')!;
    resetBtn.classList.toggle('hidden', this.progress.totalProcessed === 0);

    // Populate live rules drawer for in-shift reference
    document.getElementById('drawer-date')!.textContent = this.shiftConfig.dateDisplay;
    const drawerList = document.getElementById('drawer-rules-list')!;
    drawerList.innerHTML = '';
    for (const r of this.shiftConfig.briefingRules) {
      const li = document.createElement('li');
      li.textContent = r;
      drawerList.appendChild(li);
    }
    const drawerWlSec = document.getElementById('watchlist-section')!;
    const drawerWlEntries = document.getElementById('watchlist-entries')!;
    drawerWlEntries.innerHTML = '';
    if (this.watchlist.length > 0) {
      drawerWlSec.classList.remove('hidden');
      for (const entry of this.watchlist) {
        const div = document.createElement('div');
        div.className = 'bolo-card';
        div.innerHTML = `<div class="bolo-name">${entry.name}</div><div class="bolo-meta">${entry.docNumber} • ${entry.reason}</div>`;
        drawerWlEntries.appendChild(div);
      }
    } else {
      drawerWlSec.classList.add('hidden');
    }

    this.modalBriefing.classList.remove('hidden');
    this.hudTop.classList.add('hidden');
    this.hudBottom.classList.add('hidden');
    this.paxDialogue.classList.add('hidden');
    this.stationDocs.classList.add('hidden');
    this.stationXRay.classList.add('hidden');
  }

  private startShift(): void {
    this.modalBriefing.classList.add('hidden');
    this.hudTop.classList.remove('hidden');
    this.hudBottom.classList.remove('hidden');
    this.paxDialogue.classList.remove('hidden');

    this.shiftQueue = Array.from({ length: this.shiftConfig.passengerQuota }, (_, i) =>
      generatePassengerCase(i, this.shiftConfig, this.watchlist),
    );
    this.currentPaxIdx = 0;
    this.shiftCorrect = 0;
    this.shiftContraband = 0;
    this.shiftActive = true;
    this.awaitingNextPax = false;

    this.updateHud();
    this.loadNextPassenger();
  }

  private loadNextPassenger(): void {
    if (this.currentPaxIdx >= this.shiftQueue.length) {
      this.finishShift();
      return;
    }

    const pax = this.shiftQueue[this.currentPaxIdx];
    this.currentPax = pax;
    this.awaitingNextPax = false;
    this.setDecisionButtonsDisabled(false);

    // Spawn 3D passenger walking up to the podium & matching 3D suitcase onto conveyor
    this.scene.spawnPassenger(pax.appearance, pax.nervousness, pax.bag);

    // Reset X-ray conveyor so bag smoothly glides into the center of the scanner
    this.bagOffsetX = 270;
    this.setBeltState('FWD', true);
    this.setXRayMode('STD', true);

    // Reset UV light off for new passenger & redraw documents
    this.uvActive = false;
    this.updateUvUi();
    this.redrawDocuments();
    this.updateFlaggedBadges();

    // Check BOLO Surname Scanner upgrade
    const boloPill = document.getElementById('bolo-alert-pill')!;
    const lastWord = pax.document.fullName.split(' ').pop() ?? '';
    const surnameMatch =
      this.progress.upgrades.watchlistAlert &&
      this.watchlist.some((w) => w.name.endsWith(lastWord));
    boloPill.classList.toggle('hidden', !surnameMatch);

    // Update passenger greeting
    this.paxDialogueText.textContent = `“${pax.greeting}”`;
    this.sound.playPaperSlide();
    this.updateHud();
  }

  private setStation(station: CameraStation): void {
    if (this.station === station) return;
    this.station = station;
    this.sound.playClick();
    this.scene.setCameraStation(station);

    document.querySelectorAll<HTMLButtonElement>('[data-station]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.station === station);
    });

    this.stationDocs.classList.toggle('hidden', station !== 'documents');
    this.stationXRay.classList.toggle('hidden', station !== 'xray');

    if (station === 'documents') {
      this.redrawDocuments();
    }
  }

  private toggleUv(): void {
    this.uvActive = !this.uvActive;
    this.sound.playUvToggle(this.uvActive);
    this.updateUvUi();
    this.redrawDocuments();
  }

  private updateUvUi(): void {
    const btn = document.getElementById('btn-uv-toggle')!;
    btn.classList.toggle('active', this.uvActive);
    btn.innerHTML = `UV BLACKLIGHT: ${this.uvActive ? 'ON' : 'OFF'} <kbd>U</kbd>`;
    this.canvasId.classList.toggle('uv-cursor', this.uvActive);
    this.scene.setUvLightActive(this.uvActive);
  }

  private setXRayMode(mode: XRayMode, silent = false): void {
    this.xrayMode = mode;
    if (!silent) this.sound.playClick(true);
    document.querySelectorAll<HTMLButtonElement>('[data-xray-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.xrayMode === mode);
    });
  }

  private setBeltState(state: BeltState, silent = false): void {
    this.beltState = state;
    if (!silent) this.sound.playClick();
    document.querySelectorAll<HTMLButtonElement>('[data-belt]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.belt === state);
    });
  }

  private redrawDocuments(): void {
    if (!this.currentPax) return;
    renderIdentityDocument(
      this.idCtx,
      this.currentPax.document,
      this.uvActive,
      this.uvCursor,
      this.progress.upgrades.wideUvLamp,
    );
    renderBoardingPass(this.boardingCtx, this.currentPax.boardingPass);
  }

  private updateFlaggedBadges(): void {
    const count = this.currentPax
      ? this.currentPax.bag.items.filter((i) => i.flagged).length
      : 0;
    document.getElementById('xray-flagged-status')!.textContent =
      `CLICK SUSPECTED CONTRABAND TO FLAG (${count} FLAGGED)`;
    const dot = document.getElementById('nav-flag-count')!;
    dot.textContent = String(count);
    dot.classList.toggle('hidden', count === 0);
  }

  private setDecisionButtonsDisabled(disabled: boolean): void {
    (document.getElementById('btn-clear') as HTMLButtonElement).disabled = disabled;
    (document.getElementById('btn-deny') as HTMLButtonElement).disabled = disabled;
    (document.getElementById('btn-detain') as HTMLButtonElement).disabled = disabled;
  }

  private submitDecision(action: DecisionAction): void {
    if (!this.currentPax || this.awaitingNextPax) return;

    this.awaitingNextPax = true;
    this.setDecisionButtonsDisabled(true);

    const pax = this.currentPax;
    const result = evaluateDecision(pax, action);

    // Update persistent player progress
    this.progress.totalProcessed += 1;
    this.progress.xp = Math.max(0, this.progress.xp + result.xpDelta);
    this.progress.credits = Math.max(0, this.progress.credits + result.creditsDelta);

    if (result.correct) {
      this.shiftCorrect += 1;
      this.progress.totalCorrect += 1;
      this.progress.streak += 1;
      if (this.progress.streak > this.progress.bestStreak) {
        this.progress.bestStreak = this.progress.streak;
      }
      const caughtContraband = result.caughtViolations.filter((v) => v.code === 'CONTRABAND_ITEM').length;
      if (caughtContraband > 0) {
        this.shiftContraband += caughtContraband;
        this.progress.contrabandSeized += caughtContraband;
      }
      if (result.caughtViolations.some((v) => v.code === 'FORGED_UV' || v.code === 'PHOTO_MISMATCH')) {
        this.progress.forgeriesCaught += 1;
      }
    } else {
      this.progress.streak = 0;
    }

    // Check Air Marshal rank promotion
    const rank = getRankForXp(this.progress.xp);
    if (rank.level >= AIR_MARSHAL_UNLOCK_LEVEL) {
      this.progress.airMarshalUnlocked = true;
    }
    saveProgress(this.progress);

    // 3D world response & audio feedback
    const cleared = action === 'CLEAR';
    this.scene.dismissCurrentPassenger(cleared);
    this.sound.playDecisionResult(result.correct, action === 'CONFISCATE_DETAIN');
    this.setBeltState('STOP', true);

    // Return smoothly to overview between passengers so you watch them walk through the arch or get escorted
    if (this.station !== 'overview') {
      this.setStation('overview');
    }

    this.showFeedbackToast(result.headline, result.explanation, result.xpDelta, result.creditsDelta, result.correct, result.partial);
    this.updateHud();

    this.currentPaxIdx += 1;
    window.setTimeout(() => {
      if (this.shiftActive) {
        this.loadNextPassenger();
      }
    }, 2200);
  }

  private showFeedbackToast(
    headline: string,
    detail: string,
    xpDelta: number,
    creditsDelta: number,
    correct: boolean,
    partial: boolean,
  ): void {
    if (this.toastTimeout !== null) {
      window.clearTimeout(this.toastTimeout);
    }

    this.feedbackToast.classList.remove('hidden', 'ok', 'warn', 'fail');
    this.feedbackToast.classList.add(correct ? (partial ? 'warn' : 'ok') : 'fail');

    const xpStr = `${xpDelta >= 0 ? '+' : ''}${xpDelta} XP`;
    const crStr = `${creditsDelta >= 0 ? '+' : '-'}$${Math.abs(creditsDelta)}`;

    document.getElementById('toast-headline')!.textContent = headline;
    document.getElementById('toast-rewards')!.textContent = `${xpStr}   ${crStr}`;
    document.getElementById('toast-detail')!.textContent = detail;

    this.toastTimeout = window.setTimeout(() => {
      this.feedbackToast.classList.add('hidden');
    }, 3400);
  }

  private updateHud(): void {
    const rank = getRankForXp(this.progress.xp);
    const nextRank = AIR_MARSHAL_RANKS.find((r) => r.level === rank.level + 1);

    document.getElementById('hud-rank-badge')!.textContent = rank.badgeCode;
    document.getElementById('hud-shift-title')!.textContent =
      `SHIFT ${String(this.shiftConfig.level).padStart(2, '0')} • ${this.shiftConfig.terminalGate}`;
    document.getElementById('hud-today-date')!.textContent = this.shiftConfig.dateDisplay;
    document.getElementById('hud-pax-count')!.textContent =
      `${Math.min(this.currentPaxIdx + 1, this.shiftConfig.passengerQuota)} / ${this.shiftConfig.passengerQuota}`;
    document.getElementById('hud-streak')!.textContent = String(this.progress.streak);
    document.getElementById('hud-credits')!.textContent = `$${this.progress.credits}`;
    document.getElementById('hud-rank-title')!.textContent = rank.title;

    if (nextRank) {
      const span = Math.max(1, nextRank.xpRequired - rank.xpRequired);
      const pct = Math.min(100, Math.max(0, ((this.progress.xp - rank.xpRequired) / span) * 100));
      document.getElementById('hud-xp-text')!.textContent = `${this.progress.xp} / ${nextRank.xpRequired} XP`;
      (document.getElementById('hud-xp-bar') as HTMLElement).style.width = `${pct}%`;
      document.getElementById('hud-marshal-goal')!.textContent =
        `NEXT RANK: ${nextRank.title.toUpperCase()} • AIR MARSHAL AT LVL ${AIR_MARSHAL_UNLOCK_LEVEL}`;
    } else {
      document.getElementById('hud-xp-text')!.textContent = `${this.progress.xp} XP (MAX)`;
      (document.getElementById('hud-xp-bar') as HTMLElement).style.width = '100%';
      document.getElementById('hud-marshal-goal')!.textContent =
        'FEDERAL AIR MARSHAL CLEARED • IN-FLIGHT INTERDICTION READY (PHASE 2)';
    }
  }

  private finishShift(): void {
    this.shiftActive = false;
    this.currentPax = null;
    this.sound.setBeltRunning(false);
    this.sound.playTerminalChime();

    // Advance shift level cleanly
    const accuracy = Math.round((this.shiftCorrect / Math.max(1, this.shiftQueue.length)) * 100);
    if (accuracy >= 50) {
      this.progress.level += 1;
    }
    const rank = getRankForXp(this.progress.xp);
    if (rank.level >= AIR_MARSHAL_UNLOCK_LEVEL || this.progress.level >= AIR_MARSHAL_UNLOCK_LEVEL) {
      this.progress.airMarshalUnlocked = true;
    }
    saveProgress(this.progress);

    // Populate Debrief & Upgrade Shop modal
    document.getElementById('debrief-title')!.textContent =
      `SHIFT ${String(this.shiftConfig.level).padStart(2, '0')} DEBRIEF`;
    document.getElementById('stat-accuracy')!.textContent = `${accuracy}%`;
    document.getElementById('stat-contraband')!.textContent = String(this.shiftContraband);
    document.getElementById('stat-rank')!.textContent = rank.title;
    document.getElementById('stat-credits')!.textContent = `$${this.progress.credits}`;

    const amBanner = document.getElementById('air-marshal-banner')!;
    amBanner.classList.toggle('unlocked', this.progress.airMarshalUnlocked);
    document.getElementById('am-banner-status')!.textContent = this.progress.airMarshalUnlocked
      ? 'CLEARED ✓'
      : `LVL ${rank.level} / ${AIR_MARSHAL_UNLOCK_LEVEL}`;
    document.getElementById('am-banner-title')!.textContent = this.progress.airMarshalUnlocked
      ? 'FEDERAL AIR MARSHAL BADGE UNLOCKED'
      : 'AIR MARSHAL QUALIFICATION TRACK';
    document.getElementById('am-banner-desc')!.textContent = this.progress.airMarshalUnlocked
      ? 'You have earned Federal Air Marshal clearance! Phase 2 will deploy you aboard live flights to stop hijackers in top-down cabin action.'
      : `Earn Level ${AIR_MARSHAL_UNLOCK_LEVEL} clearance to board flights and stop mid-air hijackers in Phase 2.`;

    this.renderUpgradeShop();

    this.hudBottom.classList.add('hidden');
    this.paxDialogue.classList.add('hidden');
    this.stationDocs.classList.add('hidden');
    this.stationXRay.classList.add('hidden');
    this.rulesDrawer.classList.add('hidden');
    this.modalDebrief.classList.remove('hidden');
  }

  private renderUpgradeShop(): void {
    const grid = document.getElementById('upgrade-grid')!;
    grid.innerHTML = '';

    for (const upg of UPGRADES) {
      const owned = this.progress.upgrades[upg.id];
      const canAfford = this.progress.credits >= upg.cost;

      const card = document.createElement('div');
      card.className = `upgrade-card${owned ? ' owned' : ''}`;
      card.innerHTML = `
        <div>
          <div class="upg-head">
            <span class="upg-name">${upg.name}</span>
            <span class="upg-badge">${upg.badge}</span>
          </div>
          <p class="upg-desc">${upg.description}</p>
        </div>
      `;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'upg-buy-btn';
      btn.textContent = owned ? 'INSTALLED ✓' : `INSTALL — $${upg.cost}`;
      btn.disabled = owned || !canAfford;
      btn.addEventListener('click', () => this.purchaseUpgrade(upg.id, upg.cost));

      card.appendChild(btn);
      grid.appendChild(card);
    }
  }

  private purchaseUpgrade(id: UpgradeId, cost: number): void {
    if (this.progress.upgrades[id] || this.progress.credits < cost) return;
    this.progress.credits -= cost;
    this.progress.upgrades[id] = true;
    saveProgress(this.progress);
    this.sound.playFlagItem(true);
    document.getElementById('stat-credits')!.textContent = `$${this.progress.credits}`;
    this.renderUpgradeShop();
    this.updateHud();
  }

  private loop = (ts: number): void => {
    const dt = Math.min(0.05, (ts - this.lastFrameTs) / 1000);
    this.lastFrameTs = ts;
    this.scanTime += dt;

    // Conveyor belt motion physics
    const baseSpeed = this.progress.upgrades.highSpeedBelt ? 240 : 155;
    let velocity = 0;

    if (this.shiftActive && this.currentPax) {
      if (this.beltState === 'FWD') {
        velocity = -baseSpeed; // glides bag leftward across X-ray monitor into scan zone
        this.bagOffsetX += velocity * dt;
        // Auto-stop smoothly once bag reaches center of scan tunnel if it just entered
        if (this.bagOffsetX <= 0 && this.bagOffsetX > -baseSpeed * dt * 2.5) {
          this.bagOffsetX = 0;
          this.setBeltState('STOP', true);
          velocity = 0;
        }
        if (this.bagOffsetX < -230) {
          this.bagOffsetX = -230;
          this.setBeltState('STOP', true);
          velocity = 0;
        }
      } else if (this.beltState === 'REV') {
        velocity = baseSpeed;
        this.bagOffsetX += velocity * dt;
        if (this.bagOffsetX > 250) {
          this.bagOffsetX = 250;
          this.setBeltState('STOP', true);
          velocity = 0;
        }
      }
    }

    this.sound.setBeltRunning(Math.abs(velocity) > 1, this.progress.upgrades.highSpeedBelt);

    // Render live dual-energy X-ray canvas (feeds BOTH the 2D console AND the 3D monitor texture!)
    renderXRayMonitor(this.xrayCtx, this.currentPax?.bag ?? null, {
      mode: this.xrayMode,
      bagOffsetX: this.bagOffsetX,
      hoveredItemId: this.hoveredItemId,
      cursorX: this.xrayCursor?.x ?? null,
      cursorY: this.xrayCursor?.y ?? null,
      densityProbeEnabled: this.progress.upgrades.densityProbe,
      scanTime: this.scanTime,
    });

    this.scene.syncConveyor(this.bagOffsetX, velocity);
    this.scene.update(dt);

    requestAnimationFrame(this.loop);
  };
}

new SkyGuardGame();
