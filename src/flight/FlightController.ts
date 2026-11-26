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

  // Player Marshal state
  private px = 0;
  private pz = 9.8;
  private facingAngle = Math.PI;
  private aimWorldX = 0;
  private aimWorldZ = 4.0;
  private crouchHeld = false;
  private inCover = false;

  private readonly maxVest: number;
  private vestIntegrity: number;
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

    this.maxVest = progress.upgrades.kevlarVest ? 150 : 100;
    this.vestIntegrity = this.maxVest;
    this.maxCartridges = progress.upgrades.dualTaser ? 4 : 2;
    this.cartridges = this.maxCartridges;

    this.obstacles = buildCabinObstacles();
    this.scene = new FlightCabinScene(container, this.obstacles);
    this.people = generateCabinManifest(mission);
    this.scene.syncManifest(this.people);

    this.hudRoot.classList.remove('hidden');
    this.bindEvents();
    this.showIntel(
      `BOARDED ${mission.flightNumber} (${mission.route})`,
      `Move forward (WASD), crouch behind seats/carts (Shift) for cover, scan nervous passengers (E/Right-Click), and tase hijackers (Left-Click) before they reach the cockpit!`,
      'info',
    );
    this.updateHud();

    this.lastTs = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('contextmenu', this.onContextMenu);
  }

  private unbindEvents(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('contextmenu', this.onContextMenu);
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
    const pt = this.scene.screenToCabinFloor(e.clientX, e.clientY);
    if (pt) {
      this.aimWorldX = pt.x;
      this.aimWorldZ = pt.z;
    }
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.running || this.finished) return;
    // Ignore clicks on HUD buttons
    if ((e.target as HTMLElement)?.closest('button')) return;

    const pt = this.scene.screenToCabinFloor(e.clientX, e.clientY);
    if (pt) {
      this.aimWorldX = pt.x;
      this.aimWorldZ = pt.z;
    }

    if (e.button === 2) {
      this.scanNearestPassenger(pt?.x, pt?.z);
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
    this.reloadTimer = this.progress.upgrades.dualTaser ? 0.95 : 1.45;
    this.sound.playClick(true);
    this.showIntel('RELOADING TASER CARTRIDGES...', 'Stay behind seat cover until charged!', 'info');
  }

  private scanNearestPassenger(targetX?: number, targetZ?: number): void {
    let best: CabinPerson | null = null;
    let bestDist = 4.2;

    for (const p of this.people) {
      if (p.state === 'subdued') continue;
      const distPlayer = Math.hypot(p.x - this.px, p.z - this.pz);
      if (distPlayer > 4.6) continue;
      const scoreDist =
        targetX !== undefined && targetZ !== undefined
          ? Math.hypot(p.x - targetX, p.z - targetZ)
          : distPlayer;
      if (scoreDist < bestDist) {
        bestDist = scoreDist;
        best = p;
      }
    }

    if (!best) {
      this.showIntel('NO PASSENGER IN SCAN RANGE', 'Move closer down the aisle and press E / Right-Click to inspect.', 'info');
      return;
    }

    best.scanned = true;
    if (best.role === 'hijacker') {
      this.sound.playScanPing(true);
      this.showIntel(
        `HOSTILE IDENTIFIED — SEAT ${best.seatCode} (${best.name})`,
        `${best.tellHint}. Fire Taser NOW before they rush the cockpit!`,
        'danger',
      );
      // Exposed hijacker immediately reacts if not already active/stunned
      if (best.state === 'suspicious_tell' || best.state === 'seated_hidden') {
        // Give Marshal a brief surprise window (1-shot subdue if hit while just standing up!)
        best.hp = 1;
        best.activationTimer = Math.min(best.activationTimer, 1.35);
      }
    } else {
      this.sound.playScanPing(false);
      this.showIntel(
        `CLEARED CIVILIAN — SEAT ${best.seatCode} (${best.name})`,
        best.tellHint,
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

    this.cartridges -= 1;
    this.fireCooldown = 0.28;
    this.sound.playTaserFire();

    // Calculate ray from Marshal toward mouse aim point (max taser range 8.5m)
    const dx = this.aimWorldX - this.px;
    const dz = this.aimWorldZ - this.pz;
    const dist = Math.hypot(dx, dz) || 1;
    const range = Math.min(8.5, Math.max(2.5, dist));
    const dirX = dx / dist;
    const dirZ = dz / dist;

    let endX = this.px + dirX * range;
    let endZ = this.pz + dirZ * range;

    // Check if tall cover (bulkheads / galley carts) intercepts the taser shot
    const wallHit = segmentHitsObstacle(this.px, this.pz, endX, endZ, this.obstacles, false);
    if (wallHit.hit) {
      endX = wallHit.hitX;
      endZ = wallHit.hitZ;
    }

    // Check closest person intersected along the taser line
    let hitPerson: CabinPerson | null = null;
    let bestProjT = Math.hypot(endX - this.px, endZ - this.pz);

    for (const p of this.people) {
      if (p.state === 'subdued') continue;
      // Ignore ducked civilians so players don't accidentally hit ducking bystanders across aisles
      if (p.role === 'civilian' && p.ducked) continue;

      const toPx = p.x - this.px;
      const toPz = p.z - this.pz;
      const proj = toPx * dirX + toPz * dirZ;
      if (proj < 0.2 || proj > bestProjT) continue;
      const perp = Math.abs(toPx * -dirZ + toPz * dirX);
      const hitRadius = p.role === 'hijacker' ? 0.56 : 0.36;
      if (perp <= hitRadius) {
        bestProjT = proj;
        hitPerson = p;
      }
    }

    if (hitPerson) {
      endX = hitPerson.x;
      endZ = hitPerson.z;
      this.handleTaserHit(hitPerson);
    }

    this.scene.spawnTaserBeam(this.px, this.pz, endX, endZ);

    if (this.cartridges === 0) {
      this.startReload();
    }
    this.updateHud();
  }

  private handleTaserHit(target: CabinPerson): void {
    if (target.role === 'civilian') {
      this.civilianIncidents += 1;
      target.ducked = true;
      this.sound.playDecisionResult(false, false);
      this.showIntel(
        'SAFETY VIOLATION — CIVILIAN HIT!',
        `Watch your fire! ${target.name} (Seat ${target.seatCode}) is a civilian passenger. Scan (E) before firing on seated travelers.`,
        'danger',
      );
      return;
    }

    // Hijacker hit!
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
        `HIJACKER SUBDUED & CUFFED! (${target.name})`,
        remaining > 0
          ? `${remaining} hostile${remaining > 1 ? 's' : ''} still aboard — sweep forward and protect the flight deck!`
          : 'All hijackers neutralized! Cabin secured!',
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
      target.stunTimer = 2.0;
      this.showIntel(
        `HOSTILE SHOCKED — ${target.name}`,
        'Target staggered by Taser! Follow up with a second shot to subdue & zip-tie!',
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
    // Step out from seat into the center aisle cleanly
    hj.x = hj.seatX < 0 ? -0.35 : 0.35;
    this.sound.playHijackerAlert();
    this.scene.triggerShake(0.12);

    // Nearby civilians immediately duck down for safety!
    for (const other of this.people) {
      if (other.role === 'civilian') {
        other.ducked = true;
      }
    }

    this.showIntel(
      `ALERT: HIJACKER RUSHING AISLE — SEAT ${hj.seatCode}!`,
      `${hj.name} is moving toward the Flight Deck! Take cover behind seats/carts (Shift) and Tase them!`,
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

  private updateHud(): void {
    const subdued = this.people.filter(
      (p) => p.role === 'hijacker' && p.state === 'subdued',
    ).length;
    const activeCount = this.people.filter(
      (p) =>
        p.role === 'hijacker' &&
        (p.state === 'exposed_advancing' ||
          p.state === 'taking_cover' ||
          p.state === 'breaching_cockpit' ||
          p.state === 'stunned'),
    ).length;

    document.getElementById('flight-hud-id')!.textContent =
      `${this.mission.flightNumber} • ${this.mission.route} • ${this.mission.aircraft}`;
    document.getElementById('flight-hud-hostiles')!.textContent =
      `${subdued} / ${this.mission.hijackerCount} SUBDUED${activeCount > 0 ? ` (${activeCount} ACTIVE!)` : ''}`;

    const cockpitPct = Math.max(0, Math.round(this.cockpitIntegrity));
    const vestPct = Math.max(0, Math.round((this.vestIntegrity / this.maxVest) * 100));

    document.getElementById('flight-cockpit-pct')!.textContent = `${cockpitPct}%`;
    (document.getElementById('flight-cockpit-bar') as HTMLElement).style.width = `${cockpitPct}%`;

    document.getElementById('flight-vest-pct')!.textContent = `${vestPct}%`;
    (document.getElementById('flight-vest-bar') as HTMLElement).style.width = `${vestPct}%`;

    const taserText =
      this.reloadTimer > 0
        ? `RELOADING (${this.reloadTimer.toFixed(1)}s)`
        : `${this.cartridges} / ${this.maxCartridges} CARTRIDGES`;
    document.getElementById('flight-taser-status')!.textContent = taserText;

    const coverPill = document.getElementById('flight-cover-pill')!;
    coverPill.textContent = this.inCover ? 'IN COVER — PROTECTED' : 'EXPOSED (HOLD SHIFT NEAR SEATS)';
    coverPill.classList.toggle('protected', this.inCover);
  }

  private loop = (ts: number): void => {
    if (!this.running) return;
    const dt = Math.max(0.001, Math.min(0.05, (ts - this.lastTs) / 1000));
    this.lastTs = ts;
    this.elapsedSeconds += dt;

    // 1. Player movement & cover mechanics
    let mx = 0;
    let mz = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) mz -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) mz += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) mx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) mx += 1;

    const moving = mx !== 0 || mz !== 0;
    const nearCov = isNearCover(this.px, this.pz, this.obstacles, 0.62);
    this.inCover = this.crouchHeld && nearCov;

    if (moving) {
      const len = Math.hypot(mx, mz);
      const speed = this.crouchHeld ? 2.2 : 3.85;
      const next = resolveCabinMovement(
        this.px,
        this.pz,
        this.px + (mx / len) * speed * dt,
        this.pz + (mz / len) * speed * dt,
        0.26,
        this.obstacles,
      );
      this.px = next.x;
      this.pz = next.z;
    }

    // Regenerate vest armor slightly when safely crouched behind cover
    if (this.inCover && this.vestIntegrity < this.maxVest) {
      const regen = this.progress.upgrades.kevlarVest ? 12 : 6;
      this.vestIntegrity = Math.min(this.maxVest, this.vestIntegrity + regen * dt);
    }

    this.facingAngle = Math.atan2(this.aimWorldX - this.px, this.aimWorldZ - this.pz);

    // Cooldowns & reload timer
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

    // 2. Hijacker AI state machine
    let cockpitUnderAttack = false;
    for (const p of this.people) {
      if (p.role !== 'hijacker' || p.state === 'subdued') continue;

      if (p.state === 'stunned') {
        p.stunTimer -= dt;
        if (p.stunTimer <= 0) {
          p.state = 'exposed_advancing';
        }
        continue;
      }

      if (p.state === 'suspicious_tell' || p.state === 'seated_hidden') {
        p.activationTimer -= dt;
        // Also blow cover if the Marshal walks right past them heading forward!
        if (p.activationTimer <= 0 || this.pz < p.z - 1.35) {
          this.exposeHijacker(p);
        }
        continue;
      }

      if (p.state === 'exposed_advancing' || p.state === 'taking_cover') {
        // Move down the aisle toward the Flight Deck door (z = -12.6)
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

        // Face Marshal when firing back, otherwise face cockpit
        const distMarshal = Math.hypot(this.px - p.x, this.pz - p.z);
        p.facingAngle =
          distMarshal < 8.5
            ? Math.atan2(this.px - p.x, this.pz - p.z)
            : Math.atan2(dx, dz);

        // Fire back at the Marshal if in range & clear line of sight
        p.fireCooldown -= dt;
        if (p.fireCooldown <= 0 && distMarshal < 8.8) {
          const losBlocked = segmentHitsObstacle(
            p.x,
            p.z,
            this.px,
            this.pz,
            this.obstacles,
            false,
          ).hit;

          if (!losBlocked) {
            p.fireCooldown = this.mission.hijackerFireInterval;
            const spread = (Math.random() - 0.5) * 0.14;
            const baseAng = Math.atan2(this.px - p.x, this.pz - p.z) + spread;
            const projSpeed = 10.5;
            this.projectiles.push({
              id: `hp-${++this.projCounter}`,
              fromPlayer: false,
              x: p.x,
              z: p.z,
              vx: Math.sin(baseAng) * projSpeed,
              vz: Math.cos(baseAng) * projSpeed,
              life: 1.4,
            });
            this.sound.playHostileShot();
          } else {
            p.fireCooldown = 0.5;
          }
        }
      } else if (p.state === 'breaching_cockpit') {
        cockpitUnderAttack = true;
        this.cockpitIntegrity -= 9.5 * dt;
        if (this.cockpitIntegrity <= 0) {
          this.cockpitIntegrity = 0;
          this.completeMission(
            false,
            'FLIGHT DECK BREACHED! A hijacker forced open the cockpit door before you could neutralize them.',
          );
          return;
        }
      }
    }

    if (cockpitUnderAttack) {
      this.alarmBeepCooldown -= dt;
      if (this.alarmBeepCooldown <= 0) {
        this.alarmBeepCooldown = 0.9;
        this.sound.playCockpitAlarm();
      }
    }

    // 3. Advance hostile projectiles & check cover / Marshal vest hits
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
        if (distPlayer < 0.38) {
          this.projectiles.splice(i, 1);
          if (this.inCover) {
            // Safely deflected by seat/cart cover!
            this.sound.playClick(false);
          } else {
            this.vestIntegrity -= 24;
            this.scene.triggerShake(0.2);
            this.sound.playDecisionResult(false, false);
            if (this.vestIntegrity <= 0) {
              this.vestIntegrity = 0;
              this.completeMission(
                false,
                'AIR MARSHAL INCAPACITATED! Use Shift/Space behind seats and beverage carts to block hostile fire.',
              );
              return;
            }
          }
        }
      }
    }

    // 4. Compute live laser sight termination point
    const dx = this.aimWorldX - this.px;
    const dz = this.aimWorldZ - this.pz;
    const len = Math.hypot(dx, dz) || 1;
    const maxL = Math.min(8.5, len);
    let aimEndX = this.px + (dx / len) * maxL;
    let aimEndZ = this.pz + (dz / len) * maxL;
    const laserBlock = segmentHitsObstacle(this.px, this.pz, aimEndX, aimEndZ, this.obstacles, false);
    if (laserBlock.hit) {
      aimEndX = laserBlock.hitX;
      aimEndZ = laserBlock.hitZ;
    }

    this.scene.update(
      dt,
      {
        x: this.px,
        z: this.pz,
        facingAngle: this.facingAngle,
        isMoving: moving,
        inCover: this.inCover,
        aimEndX,
        aimEndZ,
      },
      this.people,
      this.projectiles,
      cockpitUnderAttack,
    );

    this.updateHud();
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
