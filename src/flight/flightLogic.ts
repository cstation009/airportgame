import {
  FIRST_NAMES_F,
  FIRST_NAMES_M,
  HAIR_COLORS,
  JACKET_COLORS,
  LAST_NAMES,
  SHIRT_COLORS,
  SKIN_TONES,
} from '../data/names';
import { createSeededRng, type RngFn } from '../sim/generator';
import type { FacialHair, GlassesStyle, HairStyle, PassengerAppearance } from '../sim/types';
import type {
  CabinPerson,
  CoverObstacle,
  FlightMissionConfig,
  FlightMissionResult,
} from './flightTypes';

/** Cabin interior walkable bounds (meters). Cockpit door is at z = -13.4, rear galley at z = +11.2 */
export const CABIN_BOUNDS = {
  minX: -2.45,
  maxX: 2.45,
  minZ: -12.9,
  maxZ: 10.8,
  aisleHalfWidth: 0.62,
  cockpitDoorZ: -13.2,
};

export const FLIGHT_MISSIONS: FlightMissionConfig[] = [
  {
    id: 'flight-204',
    flightNumber: 'PA 204',
    route: 'SEA ✈ JFK',
    aircraft: 'BOEING 777-300ER',
    threatTitle: 'Domestic Sky-Marshal Patrol',
    minCareerLevel: 1,
    hijackerCount: 2,
    civilianCount: 16,
    hijackerSpeed: 1.55,
    hijackerFireInterval: 2.2,
    rewardXp: 260,
    rewardCredits: 180,
  },
  {
    id: 'flight-418',
    flightNumber: 'NS 418',
    route: 'SEA ✈ LHR',
    aircraft: 'AIRBUS A350-900',
    threatTitle: 'Transatlantic Red-Alert Intercept',
    minCareerLevel: 3,
    hijackerCount: 3,
    civilianCount: 18,
    hijackerSpeed: 1.85,
    hijackerFireInterval: 1.85,
    rewardXp: 380,
    rewardCredits: 260,
  },
  {
    id: 'flight-909',
    flightNumber: 'PH 909',
    route: 'SEA ✈ HND',
    aircraft: 'BOEING 787-9 DREAMLINER',
    threatTitle: 'Coordinated Cell — Critical Flight',
    minCareerLevel: 5,
    hijackerCount: 4,
    civilianCount: 18,
    hijackerSpeed: 2.1,
    hijackerFireInterval: 1.55,
    rewardXp: 520,
    rewardCredits: 360,
  },
];

const HIJACKER_TELLS = [
  'Repeatedly checking cockpit door timing & flexing wrist',
  'Concealed earpiece wire visible beneath jacket collar',
  'Heavy metallic bulge tucked inside seatback pocket',
  'Sweating profusely — unbuckling seatbelt mid-turbulence',
  'Exchanging coded hand signals across the aisle',
];

const CIVILIAN_NOTES = [
  'Reading flight magazine — calm vitals',
  'Listening to noise-canceling headphones',
  'Asleep against window — cleared manifest',
  'Reviewing business presentation on tablet',
  'Verified SkyMiles frequent flyer — low risk',
];

function pick<T>(arr: readonly T[], rng: RngFn): T {
  return arr[Math.floor(rng() * arr.length)];
}

function makePassengerAppearance(rng: RngFn, sinisterBias = false): PassengerAppearance {
  const sex: 'M' | 'F' = rng() > 0.42 ? 'M' : 'F';
  const hairM: HairStyle[] = ['short', 'parted', 'buzz', 'curly', 'bald', 'cap', 'beanie'];
  const hairF: HairStyle[] = ['long', 'parted', 'curly', 'short', 'beanie'];
  const facial: FacialHair[] = sex === 'M' ? ['none', 'stubble', 'beard', 'mustache'] : ['none'];
  const glasses: GlassesStyle[] = sinisterBias
    ? ['aviator', 'rectangular', 'none', 'aviator']
    : ['none', 'none', 'rectangular', 'round'];

  return {
    skinTone: pick(SKIN_TONES, rng),
    hairStyle: pick(sex === 'M' ? hairM : hairF, rng),
    hairColor: pick(HAIR_COLORS, rng),
    facialHair: pick(facial, rng),
    glasses: pick(glasses, rng),
    jacketStyle: sinisterBias ? 'bomber' : 'blazer',
    jacketColor: sinisterBias ? pick(['#1b212c', '#2b2420', '#27313d', '#332024'], rng) : pick(JACKET_COLORS, rng),
    shirtColor: pick(SHIRT_COLORS, rng),
    hatColor: '#1e2631',
    eyeColor: '#25211c',
    heightScale: 0.96 + rng() * 0.08,
    buildScale: 0.94 + rng() * 0.14,
    genderPresentation: sex,
  };
}

/**
 * Generates physical 3D cabin cover obstacles (seat banks, bulkhead dividers, and galley carts)
 * shared identically by both the 3D renderer and collision / line-of-sight physics!
 */
export function buildCabinObstacles(): CoverObstacle[] {
  const obstacles: CoverObstacle[] = [];

  // 10 rows of seats from z = -10.0 (First Class) to z = +8.0 (Economy), spacing 2.0m
  // Left bank: x in [-2.35, -0.78], Right bank: x in [0.78, 2.35]
  const rowZs = [-9.6, -7.6, -5.2, -3.2, -1.2, 0.8, 2.8, 4.8, 6.8, 8.8];
  rowZs.forEach((rz, idx) => {
    obstacles.push({
      id: `seat-L-${idx}`,
      kind: 'seat_bank',
      minX: -2.35,
      maxX: -0.76,
      minZ: rz - 0.36,
      maxZ: rz + 0.36,
      height: 1.15,
    });
    obstacles.push({
      id: `seat-R-${idx}`,
      kind: 'seat_bank',
      minX: 0.76,
      maxX: 2.35,
      minZ: rz - 0.36,
      maxZ: rz + 0.36,
      height: 1.15,
    });
  });

  // Business / Economy cabin partition bulkheads at z = -6.45
  obstacles.push({
    id: 'bulkhead-L',
    kind: 'bulkhead',
    minX: -2.45,
    maxX: -0.82,
    minZ: -6.58,
    maxZ: -6.3,
    height: 1.9,
  });
  obstacles.push({
    id: 'bulkhead-R',
    kind: 'bulkhead',
    minX: 0.82,
    maxX: 2.45,
    minZ: -6.58,
    maxZ: -6.3,
    height: 1.9,
  });

  // Two stainless-steel beverage service carts parked slightly off-center in the aisle for cover!
  obstacles.push({
    id: 'cart-1',
    kind: 'galley_cart',
    minX: -0.58,
    maxX: -0.06,
    minZ: 2.05,
    maxZ: 3.15,
    height: 0.98,
  });
  obstacles.push({
    id: 'cart-2',
    kind: 'galley_cart',
    minX: 0.08,
    maxX: 0.6,
    minZ: -4.45,
    maxZ: -3.35,
    height: 0.98,
  });

  return obstacles;
}

export function generateCabinManifest(
  mission: FlightMissionConfig,
  seed?: number,
): CabinPerson[] {
  const rng = seed !== undefined ? createSeededRng(seed) : Math.random;
  const rowZs = [-9.6, -7.6, -5.2, -3.2, -1.2, 0.8, 2.8, 4.8, 6.8, 8.8];
  const seatSlots: Array<{ row: number; seat: string; x: number; z: number; isAisle: boolean }> = [];

  rowZs.forEach((rz, rIdx) => {
    const rowNum = rIdx + 1;
    // Left bank: A (window), B (middle), C (aisle)
    seatSlots.push({ row: rowNum, seat: `${rowNum}A`, x: -2.05, z: rz, isAisle: false });
    seatSlots.push({ row: rowNum, seat: `${rowNum}C`, x: -1.06, z: rz, isAisle: true });
    // Right bank: D (aisle), F (window)
    seatSlots.push({ row: rowNum, seat: `${rowNum}D`, x: 1.06, z: rz, isAisle: true });
    seatSlots.push({ row: rowNum, seat: `${rowNum}F`, x: 2.05, z: rz, isAisle: false });
  });

  // Shuffle seats
  for (let i = seatSlots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [seatSlots[i], seatSlots[j]] = [seatSlots[j], seatSlots[i]];
  }

  // Prefer aisle seats in rows 2..8 for hijackers so they can clearly step out & telegraph tells
  const hijackerCandidates = seatSlots.filter((s) => s.isAisle && s.row >= 2 && s.row <= 8);
  const chosenHijackerSeats = hijackerCandidates.slice(0, mission.hijackerCount);
  const usedSeatCodes = new Set(chosenHijackerSeats.map((s) => s.seat));
  const civilianSeats = seatSlots
    .filter((s) => !usedSeatCodes.has(s.seat))
    .slice(0, mission.civilianCount);

  const people: CabinPerson[] = [];

  chosenHijackerSeats.forEach((slot, idx) => {
    const app = makePassengerAppearance(rng, true);
    const fn = pick(app.genderPresentation === 'M' ? FIRST_NAMES_M : FIRST_NAMES_F, rng);
    const ln = pick(LAST_NAMES, rng);
    people.push({
      id: `hj-${idx + 1}`,
      name: `${fn} ${ln}`.toUpperCase(),
      seatCode: slot.seat,
      role: 'hijacker',
      appearance: app,
      seatX: slot.x,
      seatZ: slot.z,
      x: slot.x,
      z: slot.z,
      facingAngle: Math.PI, // facing forward toward cockpit (-Z)
      state: 'suspicious_tell',
      scanned: false,
      tellHint: HIJACKER_TELLS[idx % HIJACKER_TELLS.length],
      // Staggered activation timers so tension builds organically!
      activationTimer: 12 + idx * 11 + rng() * 5,
      hp: 2,
      maxHp: 2,
      stunTimer: 0,
      fireCooldown: 1.1 + rng() * 0.7,
      ducked: false,
    });
  });

  civilianSeats.forEach((slot, idx) => {
    const app = makePassengerAppearance(rng, false);
    const fn = pick(app.genderPresentation === 'M' ? FIRST_NAMES_M : FIRST_NAMES_F, rng);
    const ln = pick(LAST_NAMES, rng);
    people.push({
      id: `civ-${idx + 1}`,
      name: `${fn} ${ln}`.toUpperCase(),
      seatCode: slot.seat,
      role: 'civilian',
      appearance: app,
      seatX: slot.x,
      seatZ: slot.z,
      x: slot.x,
      z: slot.z,
      facingAngle: Math.PI,
      state: 'seated_hidden',
      scanned: false,
      tellHint: CIVILIAN_NOTES[idx % CIVILIAN_NOTES.length],
      activationTimer: 9999,
      hp: 1,
      maxHp: 1,
      stunTimer: 0,
      fireCooldown: 99,
      ducked: false,
    });
  });

  return people;
}

/** Check if a circle (x, z, radius) collides with any obstacle or cabin boundary */
export function resolveCabinMovement(
  curX: number,
  curZ: number,
  nextX: number,
  nextZ: number,
  radius: number,
  obstacles: CoverObstacle[],
): { x: number; z: number } {
  let x = Math.max(CABIN_BOUNDS.minX + radius, Math.min(CABIN_BOUNDS.maxX - radius, nextX));
  let z = Math.max(CABIN_BOUNDS.minZ + radius, Math.min(CABIN_BOUNDS.maxZ - radius, nextZ));

  const collides = (px: number, pz: number) => {
    for (const o of obstacles) {
      if (
        px + radius > o.minX &&
        px - radius < o.maxX &&
        pz + radius > o.minZ &&
        pz - radius < o.maxZ
      ) {
        return true;
      }
    }
    return false;
  };

  if (!collides(x, z)) return { x, z };
  if (!collides(x, curZ)) return { x, z: curZ };
  if (!collides(curX, z)) return { x: curX, z };
  return { x: curX, z: curZ };
}

/** Returns true if the player is standing right next to a cover obstacle (seat bank, cart, bulkhead) */
export function isNearCover(
  px: number,
  pz: number,
  obstacles: CoverObstacle[],
  margin = 0.55,
): boolean {
  for (const o of obstacles) {
    if (
      px >= o.minX - margin &&
      px <= o.maxX + margin &&
      pz >= o.minZ - margin &&
      pz <= o.maxZ + margin
    ) {
      return true;
    }
  }
  return false;
}

/** Segment-AABB intersection test for shots and laser sights against tall/waist cover */
export function segmentHitsObstacle(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  obstacles: CoverObstacle[],
  blockSeatBanks = false,
): { hit: boolean; hitX: number; hitZ: number } {
  let bestT = 1;
  let hit = false;

  const dx = x2 - x1;
  const dz = z2 - z1;

  for (const o of obstacles) {
    if (!blockSeatBanks && o.kind === 'seat_bank') continue;

    let tmin = 0;
    let tmax = 1;

    if (Math.abs(dx) < 1e-6) {
      if (x1 < o.minX || x1 > o.maxX) continue;
    } else {
      let tx1 = (o.minX - x1) / dx;
      let tx2 = (o.maxX - x1) / dx;
      if (tx1 > tx2) [tx1, tx2] = [tx2, tx1];
      tmin = Math.max(tmin, tx1);
      tmax = Math.min(tmax, tx2);
      if (tmin > tmax) continue;
    }

    if (Math.abs(dz) < 1e-6) {
      if (z1 < o.minZ || z1 > o.maxZ) continue;
    } else {
      let tz1 = (o.minZ - z1) / dz;
      let tz2 = (o.maxZ - z1) / dz;
      if (tz1 > tz2) [tz1, tz2] = [tz2, tz1];
      tmin = Math.max(tmin, tz1);
      tmax = Math.min(tmax, tz2);
      if (tmin > tmax) continue;
    }

    if (tmin >= 0 && tmin < bestT) {
      bestT = tmin;
      hit = true;
    }
  }

  return {
    hit,
    hitX: x1 + dx * bestT,
    hitZ: z1 + dz * bestT,
  };
}

export function evaluateFlightMission(
  mission: FlightMissionConfig,
  victory: boolean,
  reason: string,
  hijackersSubdued: number,
  cockpitIntegrity: number,
  vestIntegrity: number,
  civilianIncidents: number,
  elapsedSeconds: number,
): FlightMissionResult {
  if (!victory) {
    return {
      victory: false,
      reason,
      mission,
      hijackersSubdued,
      hijackersTotal: mission.hijackerCount,
      cockpitIntegrity: Math.max(0, Math.round(cockpitIntegrity)),
      vestIntegrity: Math.max(0, Math.round(vestIntegrity)),
      civilianIncidents,
      xpEarned: hijackersSubdued * 35,
      creditsEarned: hijackersSubdued * 20,
      elapsedSeconds: Math.round(elapsedSeconds),
    };
  }

  const safetyBonus = civilianIncidents === 0 ? 75 : 0;
  const cockpitBonus = cockpitIntegrity >= 95 ? 50 : 0;
  const penalty = civilianIncidents * 45;

  return {
    victory: true,
    reason,
    mission,
    hijackersSubdued,
    hijackersTotal: mission.hijackerCount,
    cockpitIntegrity: Math.max(0, Math.round(cockpitIntegrity)),
    vestIntegrity: Math.max(0, Math.round(vestIntegrity)),
    civilianIncidents,
    xpEarned: Math.max(120, mission.rewardXp + safetyBonus + cockpitBonus - penalty),
    creditsEarned: Math.max(80, mission.rewardCredits + (safetyBonus > 0 ? 45 : 0) - penalty),
    elapsedSeconds: Math.round(elapsedSeconds),
  };
}
