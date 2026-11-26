import type { SoundEngine } from '../audio/SoundEngine';
import type { PlayerProgress } from '../sim/types';
import { FlightCabinScene } from './FlightCabinScene';
import {
  CABIN_BOUNDS,
  buildCabinObstacles,
  evaluateFlightMission,
  generateCabinManifest,
  isNearCover,
  resolveCabinMovement,
  segmentHitsObstacle,
} from './flightLogic';
import type {
  CabinPerson,
  CoverObstacle,
  FlightMissionConfig,
  FlightMissionResult,
  FlightProjectile,
} from './flightTypes';

export class FlightController {
  private readonly scene: FlightCabinScene;
  private readonly obstacles: CoverObstacle[];
  private readonly sound: SoundEngine;
  private readonly mission: FlightMissionConfig;
  private readonly progress: PlayerProgress;
  private readonly onComplete: (result: FlightMissionResult) => void;

  private people: CabinPerson[] = [];
  private projectiles: FlightProjectile[] = [];
  private projCounter = 0;

  // First-Person Air Marshal state (yaw = 0 faces straight down aisle toward cockpit -Z!)
  private px = 0;
  private pz = 9.8;
  private yaw = 0;
  private pitch = -0.05;
  private targetYawOffset = 0;
  private targetPitchOffset = -0.05;
  private crouchHeld = false;
  private inCover = false;
  private pointerLocked = false;

  // Generous player durability & Taser ammo for fun, accessible action
  private readonly maxVest: number;
  private vestIntegrity: number;
  private timeSinceHit = 5;
  private cockpitIntegrity = 100;
  private readonly maxCartridges: number;
  private cartridges: number;
  private reloadTimer = 0;
  private fireCooldown = 0;
  private civilianIncidents = 0;
  private elapsedSeconds = 0;
  private alarmBeepCooldown = 0;

  private keys = new Set<string>();
  private running = true;
  private finished = false;
  private rafId = 0;
  private lastTs = performance.now();

  // Flight HUD DOM bindings
  private readonly hudRoot = document.getElementById('flight-hud')!;
  private readonly intelToast = document.getElementById('flight-intel-toast')!;
  private readonly crosshair = document.getElementById('fps-crosshair')!;
  private readonly crosshairLabel = document.getElementById('fps-target-label')!;
  private intelTimer = 0;

  constructor(
    container: HTMLElement,
    mission: FlightMissionConfig,
    progress: PlayerProgress,
    sound: SoundEngine,
    onComplete: (result: FlightMissionResult) => void,
  ) {
    this.mission = mission;
    this.progress = progress;
    this.sound = sound;
    this.onComplete = onComplete;

    // Generous vest armor (150 base, 225 with Kevlar upgrade) & 4 Taser cartridges (6 upgraded)
    this.maxVest = progress.upgrades.kevlarVest ? 225 : 150;
    this.vestIntegrity = this.maxVest;
    this.maxCartridges = progress.upgrades.dualTaser ? 6 : 4;
    this.cartridges = this.maxCartridges;

    this.obstacles = buildCabinObstacles();
    this.scene = new FlightCabinScene(container, this.obstacles);
    this.people = generateCabinManifest(mission);
    this.scene.syncManifest(this.people);

    this.hudRoot.classList.remove('hidden');
    this.bindEvents();
    this.showIntel(
      `FIRST-PERSON AIR MARSHAL — ${mission.flightNumber} (${mission.route})`,
      'Walk forward (W/S), move mouse or ←/→ to look, hold Shift to duck behind seats, and Left-Click to zap hijackers (1-shot stun!). Nearby suspects auto-scan!',
      'info',
    );
    this.updateHud(null);

    this.lastTs = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  private unbindEvents(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
  }

  private onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.scene.getDomElement();
    const lockBtn = document.getElementById('btn-flight-lock');
    if (lockBtn) {
      lockBtn.textContent = this.pointerLocked ? 'MOUSE LOCKED (ESC)' : 'LOCK MOUSE [L]';
    }
  };

  public togglePointerLock(): void {
    if (!this.running || this.finished) return;
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    } else {
      this.scene.getDomElement().requestPointerLock?.();
    }
  }

  private onContextMenu = (e: MouseEvent): void => {
    if (!this.running) return;
    e.preventDefault();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.running || this.finished) return;
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (k === 'shift' || k === ' ' || k === 'c') {
      this.crouchHeld = true;
    } else if (k === 'e' || k === 'q') {
      this.scanNearestPassenger();
    } else if (k === 'r') {
      this.startReload();
    } else if (k === 'l') {
      this.togglePointerLock();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    this.keys.delete(k);
    if (k === 'shift' || k === ' ' || k === 'c') {
      this.crouchHeld = this.keys.has('shift') || this.keys.has(' ') || this.keys.has('c');
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.running || this.finished) return;
    if (this.pointerLocked) {
      // Classic smooth 360° FPS mouse look
      this.yaw -= e.movementX * 0.0022;
      this.pitch = Math.max(-0.42, Math.min(0.32, this.pitch - e.movementY * 0.0018));
    } else {
      // Effortless free-cursor steering (ideal for trackpads & quick play without locking!)
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      const nx = (e.clientX / w) * 2 - 1; // -1..+1
      const ny = (e.clientY / h) * 2 - 1;
      this.targetYawOffset = -nx * 0.72;
      this.targetPitchOffset = Math.max(-0.35, Math.min(0.22, -ny * 0.28 - 0.04));
    }
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.running || this.finished) return;
    if ((e.target as HTMLElement)?.closest('button')) return;

    if (e.button === 2) {
      this.scanNearestPassenger();
    } else if (e.button === 0) {
      this.fireTaser();
    }
  };

  public triggerScanFromButton(): void {
    if (!this.running || this.finished) return;
    this.scanNearestPassenger();
  }

  public triggerReloadFromButton(): void {
    if (!this.running || this.finished) return;
    this.startReload();
  }

  private startReload(): void {
    if (this.reloadTimer > 0 || this.cartridges >= this.maxCartridges) return;
    this.reloadTimer = this.progress.upgrades.dualTaser ? 0.55 : 0.78;
    this.sound.playClick(true);
    this.showIntel('RECHARGING TASER...', 'Back online in less than a second!', 'info');
  }

  /** Find which passenger is closest to the center First-Person crosshair (with generous aim-assist cone!) */
  private findCrosshairTarget(maxRange = 12.5): CabinPerson | null {
    const { origin, dir } = this.scene.getAimRay(0, 0);
    let best: CabinPerson | null = null;
    let bestScore = Infinity;

    for (const p of this.people) {
      if (p.state === 'subdued') continue;
      if (p.role === 'civilian' && p.ducked) continue;

      const isSeated = p.state === 'seated_hidden' || p.state === 'suspicious_tell';
      const targetY = isSeated ? 1.12 : 1.32;
      const toX = p.x - origin.x;
      const toY = targetY - origin.y;
      const toZ = p.z - origin.z;
      const proj = toX * dir.x + toY * dir.y + toZ * dir.z;
      if (proj < 0.35 || proj > maxRange) continue;

      const perpX = toX - dir.x * proj;
      const perpY = toY - dir.y * proj;
      const perpZ = toZ - dir.z * proj;
      const perpDist = Math.hypot(perpX, perpY, perpZ);

      // Generous magnetic lock radius for hijackers so first-person aiming feels crisp & satisfying!
      const lockRadius = p.role === 'hijacker' ? 0.85 : 0.42;
      if (perpDist > lockRadius) continue;

      // Make sure no bulkhead blocks the shot
      const blocked = segmentHitsObstacle(this.px, this.pz, p.x, p.z, this.obstacles, false).hit;
      if (blocked) continue;

      // Prioritize hijackers slightly when overlapping sightlines
      const score = perpDist - (p.role === 'hijacker' ? 0.28 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }

    return best;
  }

  private scanNearestPassenger(): void {
    const aimed = this.findCrosshairTarget(9.5);
    let target = aimed;

    if (!target) {
      let bestDist = 6.2;
      for (const p of this.people) {
        if (p.state === 'subdued' || p.scanned) continue;
        const d = Math.hypot(p.x - this.px, p.z - this.pz);
        if (d < bestDist) {
          bestDist = d;
          target = p;
        }
      }
    }

    if (!target) {
      this.showIntel('CABIN SECTOR SCANNED', 'Move further up the aisle toward the cockpit to check remaining rows.', 'info');
      return;
    }

    target.scanned = true;
    if (target.role === 'hijacker') {
      this.sound.playScanPing(true);
      this.showIntel(
        `HOSTILE LOCKED — SEAT ${target.seatCode} (${target.name})`,
        `${target.tellHint}. Left-Click NOW to zap & subdue!`,
        'danger',
      );
      if (target.state === 'suspicious_tell' || target.state === 'seated_hidden') {
        target.hp = 1;
        target.activationTimer = Math.min(target.activationTimer, 3.2);
      }
    } else {
      this.sound.playScanPing(false);
      this.showIntel(
        `CIVILIAN CLEARED — SEAT ${target.seatCode} (${target.name})`,
        target.tellHint,
        'ok',
      );
    }
  }

  private fireTaser(): void {
    if (this.fireCooldown > 0 || this.reloadTimer > 0) return;
    if (this.cartridges <= 0) {
      this.startReload();
      return;
    }

    const target = this.findCrosshairTarget(12.5);

    // Friendly Civilian Safety Interlock: warn instead of harshly punishing if aimed at a civilian!
    if (target && target.role === 'civilian') {
      this.sound.playClick(false);
      target.scanned = true;
      this.showIntel(
        'SAFETY INTERLOCK — CIVILIAN IN SIGHTS',
        `${target.name} (Seat ${target.seatCode}) is a bystander! Aim for the red-marked hijackers.`,
        'info',
      );
      return;
    }

    this.cartridges -= 1;
    this.fireCooldown = 0.25;
    this.sound.playTaserFire();

    if (target && target.role === 'hijacker') {
      const isSeated = target.state === 'seated_hidden' || target.state === 'suspicious_tell';
      this.scene.spawnTaserBeamTo(target.x, isSeated ? 1.1 : 1.32, target.z);
      this.handleTaserHit(target);
    } else {
      const { origin, dir } = this.scene.getAimRay(0, 0);
      const missX = origin.x + dir.x * 8.5;
      const missY = Math.max(0.2, origin.y + dir.y * 8.5);
      const missZ = origin.z + dir.z * 8.5;
      this.scene.spawnTaserBeamTo(missX, missY, missZ);
    }

    if (this.cartridges === 0) {
      this.startReload();
    }
  }

  private handleTaserHit(target: CabinPerson): void {
    target.scanned = true;
    target.hp -= 1;

    if (target.hp <= 0) {
      target.state = 'subdued';
      target.stunTimer = 0;
      this.sound.playCuffLock();
      const remaining = this.people.filter(
        (p) => p.role === 'hijacker' && p.state !== 'subdued',
      ).length;
      this.showIntel(
        `HIJACKER SUBDUED! (${target.name})`,
        remaining > 0
          ? `Nice shot! ${remaining} hostile${remaining > 1 ? 's' : ''} left — push forward toward the cockpit!`
          : 'All hijackers neutralized! Flight deck secured!',
        'ok',
      );

      if (remaining === 0) {
        this.completeMission(
          true,
          `All ${this.mission.hijackerCount} hijackers neutralized aboard ${this.mission.flightNumber}. Flight deck secured!`,
        );
      }
    } else {
      target.state = 'stunned';
      target.stunTimer = 3.2;
      this.showIntel(
        `HOSTILE STUNNED — ${target.name}`,
        'Target shocked! Click once more to subdue & zip-tie!',
        'info',
      );
    }
  }

  private exposeHijacker(hj: CabinPerson): void {
    if (
      hj.state === 'exposed_advancing' ||
      hj.state === 'breaching_cockpit' ||
      hj.state === 'subdued' ||
      hj.state === 'stunned'
    ) {
      return;
    }

    hj.state = 'exposed_advancing';
    hj.scanned = true;
    hj.x = hj.seatX < 0 ? -0.32 : 0.32;
    this.sound.playHijackerAlert();
    this.scene.triggerShake(0.06);

    for (const other of this.people) {
      if (other.role === 'civilian') {
        other.ducked = true;
      }
    }

    this.showIntel(
      `ALERT: HIJACKER IN AISLE — SEAT ${hj.seatCode}!`,
      `${hj.name} is moving toward the Flight Deck! Aim your crosshair until it turns RED and Left-Click to Tase!`,
      'danger',
    );
  }

  private showIntel(title: string, body: string, tone: 'info' | 'ok' | 'danger'): void {
    this.intelToast.classList.remove('hidden', 'tone-info', 'tone-ok', 'tone-danger');
    this.intelToast.classList.add(`tone-${tone}`);
    document.getElementById('flight-intel-title')!.textContent = title;
    document.getElementById('flight-intel-body')!.textContent = body;
    this.intelTimer = 4.2;
  }

  private completeMission(victory: boolean, reason: string): void {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    this.unbindEvents();

    const subdued = this.people.filter(
      (p) => p.role === 'hijacker' && p.state === 'subdued',
    ).length;

    const result = evaluateFlightMission(
      this.mission,
      victory,
      reason,
      subdued,
      this.cockpitIntegrity,
      this.vestIntegrity,
      this.civilianIncidents,
      this.elapsedSeconds,
    );

    this.sound.playDecisionResult(victory, true);
    window.setTimeout(() => {
      this.onComplete(result);
    }, 900);
  }

  private updateHud(aimedTarget: CabinPerson | null): void {
    const subdued = this.people.filter(
      (p) => p.role === 'hijacker' && p.state === 'subdued',
    ).length;
    const activeHijackers = this.people.filter(
      (p) =>
        p.role === 'hijacker' &&
        (p.state === 'exposed_advancing' ||
          p.state === 'taking_cover' ||
          p.state === 'breaching_cockpit' ||
          p.state === 'stunned'),
    );

    document.getElementById('flight-hud-id')!.textContent =
      `${this.mission.flightNumber} • ${this.mission.route} • FIRST-PERSON`;
    document.getElementById('flight-hud-hostiles')!.textContent =
      `${subdued} / ${this.mission.hijackerCount} SUBDUED${activeHijackers.length > 0 ? ` (${activeHijackers.length} ACTIVE!)` : ''}`;

    const cockpitPct = Math.max(0, Math.round(this.cockpitIntegrity));
    const vestPct = Math.max(0, Math.round((this.vestIntegrity / this.maxVest) * 100));

    document.getElementById('flight-cockpit-pct')!.textContent = `${cockpitPct}%`;
    (document.getElementById('flight-cockpit-bar') as HTMLElement).style.width = `${cockpitPct}%`;

    document.getElementById('flight-vest-pct')!.textContent = `${vestPct}%`;
    (document.getElementById('flight-vest-bar') as HTMLElement).style.width = `${vestPct}%`;

    const taserText =
      this.reloadTimer > 0
        ? `RECHARGING (${this.reloadTimer.toFixed(1)}s)`
        : `${this.cartridges} / ${this.maxCartridges} TASER`;
    document.getElementById('flight-taser-status')!.textContent = taserText;

    const coverPill = document.getElementById('flight-cover-pill')!;
    coverPill.textContent = this.inCover
      ? 'IN COVER — PROTECTED'
      : this.crouchHeld
        ? 'CROUCHING (MOVE NEAR SEATS/CART)'
        : 'STANDING (HOLD SHIFT TO DUCK)';
    coverPill.classList.toggle('protected', this.inCover);

    // Dynamic First-Person Crosshair Target Lock feedback
    this.crosshair.classList.remove('lock-hostile', 'lock-suspect', 'lock-civilian');
    if (aimedTarget && aimedTarget.role === 'hijacker') {
      this.crosshair.classList.add('lock-hostile');
      this.crosshairLabel.textContent = `⚡ HOSTILE LOCKED — CLICK TO TASE (${aimedTarget.seatCode})`;
    } else if (aimedTarget && aimedTarget.role === 'civilian') {
      this.crosshair.classList.add('lock-civilian');
      this.crosshairLabel.textContent = `CIVILIAN (${aimedTarget.seatCode}) — HOLD FIRE`;
    } else if (activeHijackers.length > 0) {
      const nearest = activeHijackers[0];
      const dist = Math.round(Math.hypot(nearest.x - this.px, nearest.z - this.pz));
      this.crosshair.classList.add('lock-suspect');
      this.crosshairLabel.textContent = `⚠ ACTIVE HIJACKER ${dist}m AHEAD`;
    } else {
      this.crosshairLabel.textContent = '';
    }
  }

  private loop = (ts: number): void => {
    if (!this.running) return;
    const dt = Math.max(0.001, Math.min(0.05, (ts - this.lastTs) / 1000));
    this.lastTs = ts;
    this.elapsedSeconds += dt;
    this.timeSinceHit += dt;

    // 1. First-Person look turning (Arrow Left/Right + smooth mouse steering)
    if (this.keys.has('arrowleft')) this.yaw += 1.9 * dt;
    if (this.keys.has('arrowright')) this.yaw -= 1.9 * dt;

    if (!this.pointerLocked) {
      // Smoothly blend toward mouse look angle without fighting keyboard turn
      if (!this.keys.has('arrowleft') && !this.keys.has('arrowright')) {
        this.yaw += (this.targetYawOffset - this.yaw) * Math.min(1, dt * 6.5);
      }
      this.pitch += (this.targetPitchOffset - this.pitch) * Math.min(1, dt * 6.5);
    }

    // 2. First-Person WASD movement relative to camera yaw
    let forward = 0;
    let strafe = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) forward += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) forward -= 1;
    if (this.keys.has('a')) strafe -= 1;
    if (this.keys.has('d')) strafe += 1;

    const moving = forward !== 0 || strafe !== 0;
    const nearCov = isNearCover(this.px, this.pz, this.obstacles, 0.72);
    this.inCover = this.crouchHeld && nearCov;

    if (moving) {
      // Forward vector for Three.js YXZ yaw is (-sin(yaw), -cos(yaw))
      const fwdX = -Math.sin(this.yaw);
      const fwdZ = -Math.cos(this.yaw);
      const rightX = Math.cos(this.yaw);
      const rightZ = -Math.sin(this.yaw);

      let vx = fwdX * forward + rightX * strafe;
      let vz = fwdZ * forward + rightZ * strafe;
      const len = Math.hypot(vx, vz) || 1;
      vx /= len;
      vz /= len;

      const speed = this.crouchHeld ? 2.5 : 4.2;
      const next = resolveCabinMovement(
        this.px,
        this.pz,
        this.px + vx * speed * dt,
        this.pz + vz * speed * dt,
        0.26,
        this.obstacles,
      );
      this.px = next.x;
      this.pz = next.z;
    }

    // Generous vest recovery in cover OR after 2.2s out of fire
    if (this.vestIntegrity < this.maxVest && (this.inCover || this.timeSinceHit > 2.2)) {
      const regen = this.inCover ? 22 : 10;
      this.vestIntegrity = Math.min(this.maxVest, this.vestIntegrity + regen * dt);
    }

    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloadTimer = 0;
        this.cartridges = this.maxCartridges;
        this.sound.playClick(true);
      }
    }
    if (this.intelTimer > 0) {
      this.intelTimer -= dt;
      if (this.intelTimer <= 0) {
        this.intelToast.classList.add('hidden');
      }
    }

    // 3. Auto-Proximity Air Marshal Visor Scan: automatically flags nearby hijackers as you walk close!
    for (const p of this.people) {
      if (p.scanned || p.state === 'subdued') continue;
      const dist = Math.hypot(p.x - this.px, p.z - this.pz);
      if (dist < 4.2) {
        p.scanned = true;
        if (p.role === 'hijacker') {
          this.sound.playScanPing(true);
          this.showIntel(
            `VISOR AUTO-DETECTED HOSTILE — SEAT ${p.seatCode}!`,
            `${p.name}: ${p.tellHint}. Left-Click to zap before they rush the cockpit!`,
            'danger',
          );
        }
      }
    }

    // 4. Hijacker AI (slower, fairer pacing)
    let cockpitUnderAttack = false;
    for (const p of this.people) {
      if (p.role !== 'hijacker' || p.state === 'subdued') continue;

      if (p.state === 'stunned') {
        p.stunTimer -= dt;
        if (p.stunTimer <= 0) p.state = 'exposed_advancing';
        continue;
      }

      if (p.state === 'suspicious_tell' || p.state === 'seated_hidden') {
        p.activationTimer -= dt;
        if (p.activationTimer <= 0 || this.pz < p.z - 2.0) {
          this.exposeHijacker(p);
        }
        continue;
      }

      if (p.state === 'exposed_advancing' || p.state === 'taking_cover') {
        const targetZ = CABIN_BOUNDS.cockpitDoorZ + 0.7;
        const targetX = p.z < -2.6 && p.z > -4.8 ? -0.35 : p.z > 1.7 && p.z < 3.4 ? 0.35 : 0;

        const dx = targetX - p.x;
        const dz = targetZ - p.z;
        const distDoor = Math.hypot(dx, dz);

        if (p.z <= targetZ + 0.35) {
          p.state = 'breaching_cockpit';
          p.facingAngle = Math.PI;
          continue;
        }

        const stepX = (dx / (distDoor || 1)) * this.mission.hijackerSpeed * dt;
        const stepZ = (dz / (distDoor || 1)) * this.mission.hijackerSpeed * dt;
        const moved = resolveCabinMovement(p.x, p.z, p.x + stepX, p.z + stepZ, 0.25, this.obstacles);
        p.x = moved.x;
        p.z = moved.z;

        const distMarshal = Math.hypot(this.px - p.x, this.pz - p.z);
        p.facingAngle =
          distMarshal < 9.0 ? Math.atan2(this.px - p.x, this.pz - p.z) : Math.atan2(dx, dz);

        p.fireCooldown -= dt;
        if (p.fireCooldown <= 0 && distMarshal < 8.5) {
          const losBlocked = segmentHitsObstacle(p.x, p.z, this.px, this.pz, this.obstacles, false).hit;
          if (!losBlocked) {
            p.fireCooldown = this.mission.hijackerFireInterval;
            const spread = (Math.random() - 0.5) * 0.22;
            const baseAng = Math.atan2(this.px - p.x, this.pz - p.z) + spread;
            const projSpeed = 7.8;
            this.projectiles.push({
              id: `hp-${++this.projCounter}`,
              fromPlayer: false,
              x: p.x,
              z: p.z,
              vx: Math.sin(baseAng) * projSpeed,
              vz: Math.cos(baseAng) * projSpeed,
              life: 1.5,
            });
            this.sound.playHostileShot();
          } else {
            p.fireCooldown = 0.7;
          }
        }
      } else if (p.state === 'breaching_cockpit') {
        cockpitUnderAttack = true;
        this.cockpitIntegrity -= 4.5 * dt;
        if (this.cockpitIntegrity <= 0) {
          this.cockpitIntegrity = 0;
          this.completeMission(
            false,
            'FLIGHT DECK BREACHED! Sprint down the aisle and zap hijackers before they force open the door.',
          );
          return;
        }
      }
    }

    if (cockpitUnderAttack) {
      this.alarmBeepCooldown -= dt;
      if (this.alarmBeepCooldown <= 0) {
        this.alarmBeepCooldown = 1.1;
        this.sound.playCockpitAlarm();
      }
    }

    // 5. Advance hostile projectiles (gentle damage, easily dodged or blocked with Shift cover!)
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const nextX = pr.x + pr.vx * dt;
      const nextZ = pr.z + pr.vz * dt;
      pr.life -= dt;

      const hitCover = segmentHitsObstacle(pr.x, pr.z, nextX, nextZ, this.obstacles, false).hit;
      if (hitCover || pr.life <= 0) {
        this.projectiles.splice(i, 1);
        continue;
      }

      pr.x = nextX;
      pr.z = nextZ;

      if (!pr.fromPlayer) {
        const distPlayer = Math.hypot(pr.x - this.px, pr.z - this.pz);
        if (distPlayer < 0.36) {
          this.projectiles.splice(i, 1);
          if (this.inCover || this.crouchHeld) {
            // Ducking cleanly avoids incoming shots!
            this.sound.playClick(false);
          } else {
            this.timeSinceHit = 0;
            this.vestIntegrity -= 12;
            this.scene.triggerShake(0.08);
            this.sound.playDecisionResult(false, false);
            if (this.vestIntegrity <= 0) {
              this.vestIntegrity = 0;
              this.completeMission(
                false,
                'AIR MARSHAL VEST DEPLETED! Hold Shift to duck behind seats or beverage carts whenever a hijacker fires.',
              );
              return;
            }
          }
        }
      }
    }

    this.scene.update(
      dt,
      {
        x: this.px,
        z: this.pz,
        yaw: this.yaw,
        pitch: this.pitch,
        isMoving: moving,
        inCover: this.inCover,
        crouching: this.crouchHeld,
      },
      this.people,
      this.projectiles,
      cockpitUnderAttack,
    );

    const aimed = this.findCrosshairTarget(12.5);
    this.updateHud(aimed);
    this.rafId = requestAnimationFrame(this.loop);
  };

  public destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.unbindEvents();
    this.hudRoot.classList.add('hidden');
    this.intelToast.classList.add('hidden');
    this.scene.dispose();
  }
}
