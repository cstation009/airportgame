import './style.css';
import { SoundEngine } from './audio/SoundEngine';
import { CONTRABAND_ITEMS, LEGAL_ITEMS } from './data/items';
import {
  AIR_MARSHAL_RANKS,
  AIR_MARSHAL_UNLOCK_LEVEL,
  UPGRADES,
  getRankForXp,
  getShiftConfig,
} from './data/levels';
import { FlightController } from './flight/FlightController';
import { FLIGHT_MISSIONS } from './flight/flightLogic';
import type { FlightMissionConfig, FlightMissionResult } from './flight/flightTypes';
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
import {
  getSearchBagRect,
  hitTestSearchBagItem,
  renderBagSearchTable,
  renderPhysicalItemThumbnail,
} from './sim/bagSearchRenderer';
import {
  hitTestBagItem,
  renderXRayItemThumbnail,
  renderXRayMonitor,
} from './sim/xrayRenderer';

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
      dualTaser: false,
      kevlarVest: false,
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
  private readonly stationBagSearch = document.getElementById('station-bag-search')!;
  private readonly modalBriefing = document.getElementById('modal-briefing')!;
  private readonly modalDebrief = document.getElementById('modal-debrief')!;
  private readonly modalFlightSelect = document.getElementById('modal-flight-select')!;
  private readonly modalFlightDebrief = document.getElementById('modal-flight-debrief')!;
  private readonly modalContrabandGuide = document.getElementById('modal-contraband-guide')!;
  private readonly viewport3d = document.getElementById('viewport-3d')!;
  private readonly viewportFlight = document.getElementById('viewport-flight')!;
  private readonly feedbackToast = document.getElementById('feedback-toast')!;
  private activeGuideTab: 'contraband' | 'legal' = 'contraband';

  private readonly canvasId = document.getElementById('canvas-id') as HTMLCanvasElement;
  private readonly canvasBoarding = document.getElementById('canvas-boarding') as HTMLCanvasElement;
  private readonly canvasXRay = document.getElementById('canvas-xray') as HTMLCanvasElement;
  private readonly canvasBagSearch = document.getElementById('canvas-bag-search') as HTMLCanvasElement;

  private readonly idCtx = this.canvasId.getContext('2d')!;
  private readonly boardingCtx = this.canvasBoarding.getContext('2d')!;
  private readonly xrayCtx = this.canvasXRay.getContext('2d')!;
  private readonly bagSearchCtx = this.canvasBagSearch.getContext('2d')!;

  // Active shift state
  private shiftConfig: ShiftConfig = getShiftConfig(this.progress.level);
  private watchlist: WatchlistEntry[] = [];
  private shiftQueue: PassengerCase[] = [];
  private currentPaxIdx = 0;
  private currentPax: PassengerCase | null = null;
  private shiftActive = false;
  private awaitingNextPax = false;

  // Phase 2: Air Marshal Flight state
  private flightController: FlightController | null = null;
  private inFlightMode = false;

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

  // Station 4: Physical Bag Inspection drag & selection state
  private selectedBagItemId: string | null = null;
  private hoveredBagItemId: string | null = null;
  private draggingBagItemId: string | null = null;
  private dragOffsetBag = { x: 0, y: 0 };

  private uvActive = false;
  private uvCursor: { x: number; y: number } | null = null;

  private lastFrameTs = performance.now();
  private scanTime = 0;
  private toastTimeout: number | null = null;

  constructor() {
    this.scene = new CheckpointScene(this.viewport3d, this.canvasXRay);

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

    // Phase 2: Air Marshal Flight launch buttons
    for (const btnId of [
      'btn-open-flights-briefing',
      'btn-open-flights-hud',
      'btn-open-flights-debrief',
    ]) {
      document.getElementById(btnId)!.addEventListener('click', () => {
        this.sound.playClick(true);
        this.openFlightSelector();
      });
    }

    document.getElementById('btn-close-flight-select')!.addEventListener('click', () => {
      this.sound.playClick();
      this.modalFlightSelect.classList.add('hidden');
    });

    document.getElementById('btn-abort-flight')!.addEventListener('click', () => {
      this.sound.playClick();
      this.exitFlightMode();
    });

    document.getElementById('btn-flight-scan')!.addEventListener('click', () => {
      this.flightController?.triggerScanFromButton();
    });

    document.getElementById('btn-flight-reload')!.addEventListener('click', () => {
      this.flightController?.triggerReloadFromButton();
    });

    document.getElementById('btn-flight-return')!.addEventListener('click', () => {
      this.sound.playClick();
      this.modalFlightDebrief.classList.add('hidden');
      this.exitFlightMode();
    });

    document.getElementById('btn-flight-again')!.addEventListener('click', () => {
      this.sound.playClick(true);
      this.modalFlightDebrief.classList.add('hidden');
      this.exitFlightMode(true);
      this.openFlightSelector();
    });

    // Top HUD controls & Contraband Guide
    for (const gid of ['btn-contraband-guide', 'btn-guide-briefing']) {
      document.getElementById(gid)!.addEventListener('click', () => {
        this.sound.playClick(true);
        this.openContrabandGuide('contraband');
      });
    }
    document.getElementById('btn-close-guide')!.addEventListener('click', () => {
      this.sound.playClick();
      this.modalContrabandGuide.classList.add('hidden');
    });
    this.modalContrabandGuide.addEventListener('click', (e) => {
      if (e.target === this.modalContrabandGuide) {
        this.modalContrabandGuide.classList.add('hidden');
      }
    });
    document.querySelectorAll<HTMLButtonElement>('[data-guide-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.sound.playClick();
        const tab = btn.dataset.guideTab as 'contraband' | 'legal';
        this.openContrabandGuide(tab);
      });
    });

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

    // Quick jump from X-Ray monitor to physical Bag Inspection Table
    document.getElementById('btn-xray-open-bag')!.addEventListener('click', () => {
      this.setStation('bagSearch');
    });

    // Station 4: Interactive physical bag rummaging & item inspection
    const getBagCanvasCoords = (e: PointerEvent) => {
      const rect = this.canvasBagSearch.getBoundingClientRect();
      return {
        px: ((e.clientX - rect.left) / rect.width) * this.canvasBagSearch.width,
        py: ((e.clientY - rect.top) / rect.height) * this.canvasBagSearch.height,
      };
    };

    this.canvasBagSearch.addEventListener('pointerdown', (e) => {
      if (!this.currentPax || this.awaitingNextPax) return;
      const bag = this.currentPax.bag;
      const { px, py } = getBagCanvasCoords(e);

      // Peel back dense lead-lined false bottom if present
      if (bag.hasLeadLining && !bag.falseBottomOpened) {
        bag.falseBottomOpened = true;
        this.sound.playPaperSlide();
        this.redrawBagSearch();
        return;
      }

      const hit = hitTestSearchBagItem(
        this.canvasBagSearch.width,
        this.canvasBagSearch.height,
        bag,
        px,
        py,
      );
      if (hit) {
        // Bring grabbed item to top of stack so player can drag clothes/laptops cleanly aside
        const idx = bag.items.indexOf(hit);
        if (idx >= 0 && idx < bag.items.length - 1) {
          bag.items.splice(idx, 1);
          bag.items.push(hit);
        }
        hit.inspected = true;
        this.selectedBagItemId = hit.instanceId;
        this.draggingBagItemId = hit.instanceId;
        this.canvasBagSearch.classList.add('dragging');
        this.canvasBagSearch.setPointerCapture(e.pointerId);

        const { ox, oy, scale } = getSearchBagRect(
          this.canvasBagSearch.width,
          this.canvasBagSearch.height,
          bag,
        );
        this.dragOffsetBag = {
          x: (px - ox) / scale - hit.x,
          y: (py - oy) / scale - hit.y,
        };
        this.sound.playBagItemGrab();
        this.updateBagInspectorPanel();
        this.redrawBagSearch();
      } else {
        this.selectedBagItemId = null;
        this.updateBagInspectorPanel();
        this.redrawBagSearch();
      }
    });

    this.canvasBagSearch.addEventListener('pointermove', (e) => {
      if (!this.currentPax) return;
      const bag = this.currentPax.bag;
      const { px, py } = getBagCanvasCoords(e);

      if (this.draggingBagItemId) {
        const dragged = bag.items.find((i) => i.instanceId === this.draggingBagItemId);
        if (dragged) {
          const { ox, oy, scale } = getSearchBagRect(
            this.canvasBagSearch.width,
            this.canvasBagSearch.height,
            bag,
          );
          dragged.x = Math.max(18, Math.min(bag.width - 18, (px - ox) / scale - this.dragOffsetBag.x));
          dragged.y = Math.max(18, Math.min(bag.height - 18, (py - oy) / scale - this.dragOffsetBag.y));
          this.redrawBagSearch();
        }
        return;
      }

      const hit = hitTestSearchBagItem(
        this.canvasBagSearch.width,
        this.canvasBagSearch.height,
        bag,
        px,
        py,
      );
      const nextHover = hit?.instanceId ?? null;
      if (nextHover !== this.hoveredBagItemId) {
        this.hoveredBagItemId = nextHover;
        this.redrawBagSearch();
      }
    });

    const stopBagDrag = () => {
      if (this.draggingBagItemId) {
        this.draggingBagItemId = null;
        this.canvasBagSearch.classList.remove('dragging');
        this.redrawBagSearch();
      }
    };
    this.canvasBagSearch.addEventListener('pointerup', stopBagDrag);
    this.canvasBagSearch.addEventListener('pointercancel', stopBagDrag);
    this.canvasBagSearch.addEventListener('pointerleave', () => {
      if (!this.draggingBagItemId) {
        this.hoveredBagItemId = null;
        this.redrawBagSearch();
      }
    });

    document.getElementById('btn-seize-item')!.addEventListener('click', () => {
      if (!this.currentPax || !this.selectedBagItemId) return;
      const item = this.currentPax.bag.items.find((i) => i.instanceId === this.selectedBagItemId);
      if (!item || item.seized) return;
      item.seized = true;
      item.flagged = true;
      this.selectedBagItemId = null;
      this.sound.playFlagItem(true);
      this.updateFlaggedBadges();
      this.updateBagInspectorPanel();
      this.redrawBagSearch();
    });

    // Decision action buttons
    document.getElementById('btn-clear')!.addEventListener('click', () => this.submitDecision('CLEAR'));
    document.getElementById('btn-deny')!.addEventListener('click', () => this.submitDecision('DENY_ID'));
    document.getElementById('btn-detain')!.addEventListener('click', () => this.submitDecision('CONFISCATE_DETAIN'));

    // Keyboard shortcuts for crisp operator flow
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'escape' && !this.modalContrabandGuide.classList.contains('hidden')) {
        this.modalContrabandGuide.classList.add('hidden');
        return;
      }
      if (this.inFlightMode) return;
      if (key === 'g' && !this.awaitingNextPax) {
        if (this.modalContrabandGuide.classList.contains('hidden')) {
          this.openContrabandGuide(this.activeGuideTab);
        } else {
          this.modalContrabandGuide.classList.add('hidden');
        }
        return;
      }
      if (!this.modalContrabandGuide.classList.contains('hidden')) return;
      if (!this.shiftActive || this.awaitingNextPax) return;
      if (key === '1') this.setStation('overview');
      else if (key === '2') this.setStation('documents');
      else if (key === '3') this.setStation('xray');
      else if (key === '4') this.setStation('bagSearch');
      else if (key === 'u') this.toggleUv();
      else if (key === 'a') this.setBeltState('REV');
      else if (key === 's') this.setBeltState('STOP');
      else if (key === 'f') this.setBeltState('FWD');
      else if (key === 'c') this.submitDecision('CLEAR');
      else if (key === 'd') this.submitDecision('DENY_ID');
      else if (key === 'x') this.submitDecision('CONFISCATE_DETAIN');
    });
  }

  private openContrabandGuide(tab: 'contraband' | 'legal'): void {
    this.activeGuideTab = tab;
    document.querySelectorAll<HTMLButtonElement>('[data-guide-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.guideTab === tab);
    });

    const grid = document.getElementById('guide-items-grid')!;
    grid.innerHTML = '';

    const items = tab === 'contraband' ? CONTRABAND_ITEMS : LEGAL_ITEMS;
    for (const tpl of items) {
      const card = document.createElement('div');
      card.className = `guide-card ${tpl.contraband ? 'is-contraband' : 'is-legal'}`;

      const top = document.createElement('div');
      top.className = 'guide-card-top';
      top.innerHTML = `
        <span class="guide-item-name">${tpl.name}</span>
        <div class="guide-badges">
          <span class="guide-cat-badge ${tpl.contraband ? 'bad' : 'good'}">
            ${tpl.contraband ? tpl.category.toUpperCase() : 'ALLOWED'}
          </span>
          <span class="guide-lvl-badge">LVL ${tpl.minLevel}+</span>
        </div>
      `;
      card.appendChild(top);

      // Side-by-side live Dual-Energy X-Ray & Physical Bag Search thumbnails
      const previews = document.createElement('div');
      previews.className = 'guide-previews';

      const xrayBox = document.createElement('div');
      xrayBox.className = 'guide-preview-box';
      xrayBox.innerHTML = '<span class="guide-preview-lbl">X-RAY SIGNATURE</span>';
      const xrayCanvas = document.createElement('canvas');
      xrayCanvas.width = 160;
      xrayCanvas.height = 92;
      const xCtx = xrayCanvas.getContext('2d');
      if (xCtx) renderXRayItemThumbnail(xCtx, tpl);
      xrayBox.appendChild(xrayCanvas);

      const physBox = document.createElement('div');
      physBox.className = 'guide-preview-box';
      physBox.innerHTML = '<span class="guide-preview-lbl">INSIDE OPEN BAG</span>';
      const physCanvas = document.createElement('canvas');
      physCanvas.width = 160;
      physCanvas.height = 92;
      const pCtx = physCanvas.getContext('2d');
      if (pCtx) renderPhysicalItemThumbnail(pCtx, tpl);
      physBox.appendChild(physCanvas);

      previews.appendChild(xrayBox);
      previews.appendChild(physBox);
      card.appendChild(previews);

      const hint = document.createElement('p');
      hint.className = 'guide-hint';
      hint.textContent = tpl.hint;
      card.appendChild(hint);

      grid.appendChild(card);
    }

    this.modalContrabandGuide.classList.remove('hidden');
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
    this.stationBagSearch.classList.add('hidden');
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

    // Reset physical bag inspection selection
    this.selectedBagItemId = null;
    this.hoveredBagItemId = null;
    this.draggingBagItemId = null;

    // Reset UV light off for new passenger & redraw documents
    this.uvActive = false;
    this.updateUvUi();
    this.redrawDocuments();
    this.updateBagInspectorPanel();
    this.redrawBagSearch();
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
    if (station === 'bagSearch') {
      this.sound.playZipper();
    } else {
      this.sound.playClick();
    }
    this.scene.setCameraStation(station);

    document.querySelectorAll<HTMLButtonElement>('[data-station]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.station === station);
    });

    this.stationDocs.classList.toggle('hidden', station !== 'documents');
    this.stationXRay.classList.toggle('hidden', station !== 'xray');
    this.stationBagSearch.classList.toggle('hidden', station !== 'bagSearch');

    if (station === 'documents') {
      this.redrawDocuments();
    } else if (station === 'bagSearch') {
      this.updateBagInspectorPanel();
      this.redrawBagSearch();
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

  private redrawBagSearch(): void {
    renderBagSearchTable(this.bagSearchCtx, this.currentPax?.bag ?? null, {
      selectedItemId: this.selectedBagItemId,
      hoveredItemId: this.hoveredBagItemId,
      draggingItemId: this.draggingBagItemId,
    });
  }

  private updateBagInspectorPanel(): void {
    const emptyEl = document.getElementById('inspector-empty')!;
    const cardEl = document.getElementById('inspector-card')!;
    const evidenceList = document.getElementById('evidence-list')!;

    const selected = this.currentPax?.bag.items.find(
      (i) => i.instanceId === this.selectedBagItemId && !i.seized,
    );

    if (!selected) {
      emptyEl.classList.remove('hidden');
      cardEl.classList.add('hidden');
    } else {
      emptyEl.classList.add('hidden');
      cardEl.classList.remove('hidden');
      document.getElementById('inspector-item-name')!.textContent = selected.template.name;
      const statusEl = document.getElementById('inspector-item-status')!;
      statusEl.textContent = selected.template.contraband
        ? `PROHIBITED — ${selected.template.category.toUpperCase()}`
        : 'AUTHORIZED CARRY-ON';
      statusEl.className = `inspector-status ${selected.template.contraband ? 'contraband' : 'legal'}`;
      document.getElementById('inspector-item-detail')!.textContent = selected.template.hint;
    }

    const seizedItems = this.currentPax?.bag.items.filter((i) => i.seized) ?? [];
    evidenceList.innerHTML = '';
    if (seizedItems.length === 0) {
      const li = document.createElement('li');
      li.className = 'evidence-empty';
      li.textContent = 'No items confiscated yet.';
      evidenceList.appendChild(li);
    } else {
      for (const item of seizedItems) {
        const li = document.createElement('li');
        li.className = `evidence-item${item.template.contraband ? '' : ' legal-warning'}`;
        const label = document.createElement('span');
        label.textContent = item.template.name;
        const retBtn = document.createElement('button');
        retBtn.type = 'button';
        retBtn.className = 'evidence-return-btn';
        retBtn.textContent = 'RETURN';
        retBtn.addEventListener('click', () => {
          item.seized = false;
          item.flagged = false;
          this.sound.playClick();
          this.updateFlaggedBadges();
          this.updateBagInspectorPanel();
          this.redrawBagSearch();
        });
        li.appendChild(label);
        li.appendChild(retBtn);
        evidenceList.appendChild(li);
      }
    }
  }

  private updateFlaggedBadges(): void {
    const count = this.currentPax
      ? this.currentPax.bag.items.filter((i) => i.flagged || i.seized).length
      : 0;
    const seizedCount = this.currentPax
      ? this.currentPax.bag.items.filter((i) => i.seized).length
      : 0;

    document.getElementById('xray-flagged-status')!.textContent =
      `CLICK SUSPECTED CONTRABAND TO FLAG (${count} FLAGGED)`;
    const dot = document.getElementById('nav-flag-count')!;
    dot.textContent = String(count);
    dot.classList.toggle('hidden', count === 0);

    document.getElementById('bag-seized-summary')!.textContent = `${seizedCount} SEIZED`;
    const seizedDot = document.getElementById('nav-seized-count')!;
    seizedDot.textContent = String(seizedCount);
    seizedDot.classList.toggle('hidden', seizedCount === 0);
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
    document.getElementById('am-banner-title')!.textContent = this.progress.airMarshalUnlocked
      ? 'FEDERAL AIR MARSHAL — ALL FLIGHTS UNLOCKED'
      : `AIR MARSHAL FLIGHT DISPATCH (CLEARANCE LVL ${Math.max(rank.level, this.progress.level)})`;
    document.getElementById('am-banner-desc')!.textContent = this.progress.airMarshalUnlocked
      ? 'Deploy aboard Domestic, Transatlantic, or High-Threat Red-Eye flights to neutralize hijackers mid-air.'
      : 'Board PA 204 Patrol now, or reach Level 3 & Level 5 to unlock Transatlantic and High-Alert flights!';

    this.renderUpgradeShop();

    this.hudBottom.classList.add('hidden');
    this.paxDialogue.classList.add('hidden');
    this.stationDocs.classList.add('hidden');
    this.stationXRay.classList.add('hidden');
    this.stationBagSearch.classList.add('hidden');
    this.rulesDrawer.classList.add('hidden');
    this.modalDebrief.classList.remove('hidden');
  }

  private openFlightSelector(): void {
    const rank = getRankForXp(this.progress.xp);
    const effectiveLevel = Math.max(rank.level, this.progress.level);
    const list = document.getElementById('flight-mission-list')!;
    list.innerHTML = '';

    for (const mission of FLIGHT_MISSIONS) {
      const unlocked = effectiveLevel >= mission.minCareerLevel;
      const card = document.createElement('div');
      card.className = `flight-mission-card${unlocked ? '' : ' locked'}`;
      card.innerHTML = `
        <div>
          <div class="fm-head">
            <span class="fm-flight">${mission.flightNumber} — ${mission.threatTitle}</span>
            <span class="fm-route">${mission.route}</span>
          </div>
          <div class="fm-meta">
            ${mission.aircraft} • ${mission.hijackerCount} Disguised Hijackers • Reward: +${mission.rewardXp} XP / +$${mission.rewardCredits}
          </div>
        </div>
      `;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = unlocked ? 'flight-cta' : 'secondary-cta';
      btn.textContent = unlocked
        ? '✈ BOARD FLIGHT'
        : `LOCKED (LVL ${mission.minCareerLevel})`;
      btn.disabled = !unlocked;
      btn.addEventListener('click', () => this.launchFlightMission(mission));

      card.appendChild(btn);
      list.appendChild(card);
    }

    this.modalFlightSelect.classList.remove('hidden');
  }

  private launchFlightMission(mission: FlightMissionConfig): void {
    this.sound.playTerminalChime();
    this.sound.setBeltRunning(false);

    // Pause checkpoint UI & 3D rendering cleanly
    this.inFlightMode = true;
    this.modalFlightSelect.classList.add('hidden');
    this.modalBriefing.classList.add('hidden');
    this.modalDebrief.classList.add('hidden');
    this.modalFlightDebrief.classList.add('hidden');
    this.hudTop.classList.add('hidden');
    this.hudBottom.classList.add('hidden');
    this.paxDialogue.classList.add('hidden');
    this.stationDocs.classList.add('hidden');
    this.stationXRay.classList.add('hidden');
    this.stationBagSearch.classList.add('hidden');
    this.rulesDrawer.classList.add('hidden');
    this.feedbackToast.classList.add('hidden');
    this.viewport3d.classList.add('hidden');

    this.viewportFlight.innerHTML = '';
    this.viewportFlight.classList.remove('hidden');

    if (this.flightController) {
      this.flightController.destroy();
      this.flightController = null;
    }

    this.flightController = new FlightController(
      this.viewportFlight,
      mission,
      this.progress,
      this.sound,
      (result) => this.handleFlightComplete(result),
    );
  }

  private handleFlightComplete(result: FlightMissionResult): void {
    // Award career XP & credits from Air Marshal flight!
    this.progress.xp += result.xpEarned;
    this.progress.credits += result.creditsEarned;
    const rank = getRankForXp(this.progress.xp);
    if (rank.level >= AIR_MARSHAL_UNLOCK_LEVEL) {
      this.progress.airMarshalUnlocked = true;
    }
    saveProgress(this.progress);

    document.getElementById('flight-debrief-kicker')!.textContent = result.victory
      ? `FLIGHT ${result.mission.flightNumber} SECURED • COMMENDATION`
      : `FLIGHT ${result.mission.flightNumber} • INCIDENT REPORT`;
    document.getElementById('flight-debrief-title')!.textContent = result.victory
      ? 'HIJACKING THWARTED'
      : 'MISSION FAILED';
    document.getElementById('flight-debrief-reason')!.textContent = result.reason;
    document.getElementById('fstat-subdued')!.textContent =
      `${result.hijackersSubdued} / ${result.hijackersTotal}`;
    document.getElementById('fstat-cockpit')!.textContent = `${result.cockpitIntegrity}%`;
    document.getElementById('fstat-xp')!.textContent = `+${result.xpEarned}`;
    document.getElementById('fstat-credits')!.textContent = `+$${result.creditsEarned}`;

    this.modalFlightDebrief.classList.remove('hidden');
  }

  private exitFlightMode(stayInMenu = false): void {
    if (this.flightController) {
      this.flightController.destroy();
      this.flightController = null;
    }
    this.inFlightMode = false;
    this.viewportFlight.classList.add('hidden');
    this.viewportFlight.innerHTML = '';
    this.viewport3d.classList.remove('hidden');
    this.modalFlightDebrief.classList.add('hidden');

    if (stayInMenu) return;

    if (this.shiftActive && this.currentPax) {
      this.hudTop.classList.remove('hidden');
      this.hudBottom.classList.remove('hidden');
      this.paxDialogue.classList.remove('hidden');
      this.updateHud();
    } else {
      this.prepareBriefing(this.progress.level);
    }
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

    // Pause checkpoint WebGL rendering cleanly while running a Phase 2 3D flight mission
    if (this.inFlightMode) {
      requestAnimationFrame(this.loop);
      return;
    }

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
