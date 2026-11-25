import { CONTRABAND_ITEMS, LEGAL_ITEMS } from '../data/items';
import {
  AIRLINES,
  BAG_COLORS,
  DESTINATIONS,
  FIRST_NAMES_F,
  FIRST_NAMES_M,
  HAIR_COLORS,
  ISSUING_STATES,
  JACKET_COLORS,
  LAST_NAMES,
  NATIONALITIES,
  NERVOUS_GREETINGS,
  NORMAL_GREETINGS,
  SHIRT_COLORS,
  SKIN_TONES,
} from '../data/names';
import type {
  BagData,
  BagItemInstance,
  BagType,
  FacialHair,
  GlassesStyle,
  HairStyle,
  JacketStyle,
  PassengerAppearance,
  PassengerCase,
  ShiftConfig,
  Violation,
  WatchlistEntry,
} from './types';

export type RngFn = () => number;

export function createSeededRng(seed: number): RngFn {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], rng: RngFn): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randInt(min: number, max: number, rng: RngFn): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function generateDocNumber(isPassport: boolean, rng: RngFn): string {
  const digits = (n: number) =>
    Array.from({ length: n }, () => String(randInt(0, 9, rng))).join('');
  if (isPassport) {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    return `${letters[randInt(0, letters.length - 1, rng)]}${digits(8)}`;
  }
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return `${letters[randInt(0, letters.length - 1, rng)]}${digits(3)}-${digits(4)}-${digits(4)}`;
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatShortDate(iso: string): string {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const [y, m, d] = iso.split('-');
  const mIdx = Math.max(0, Math.min(11, parseInt(m, 10) - 1));
  return `${months[mIdx]} ${d}, ${y}`;
}

export function generateWatchlist(config: ShiftConfig, rng: RngFn = Math.random): WatchlistEntry[] {
  if (!config.allowWatchlist) return [];
  const reasons = [
    'Suspected Aviation Security Threat',
    'Prior Prohibited Weapon Smuggling',
    'Interpol Red Notice — Forged Credentials',
    'Unauthorized Airside Access Warrant',
  ];
  const count = config.level >= 4 ? 3 : 2;
  const entries: WatchlistEntry[] = [];
  const usedNames = new Set<string>();
  for (let i = 0; i < count; i++) {
    const male = rng() > 0.45;
    let fullName = '';
    do {
      fullName = `${pick(male ? FIRST_NAMES_M : FIRST_NAMES_F, rng)} ${pick(LAST_NAMES, rng)}`.toUpperCase();
    } while (usedNames.has(fullName));
    usedNames.add(fullName);
    entries.push({
      name: fullName,
      docNumber: generateDocNumber(true, rng),
      reason: pick(reasons, rng),
      threatLevel: i === 0 ? 'CRITICAL' : 'HIGH',
    });
  }
  return entries;
}

function generateAppearance(sex: 'M' | 'F', rng: RngFn): PassengerAppearance {
  const hairStylesM: HairStyle[] = ['short', 'parted', 'buzz', 'curly', 'bald', 'cap', 'beanie'];
  const hairStylesF: HairStyle[] = ['long', 'parted', 'curly', 'short', 'beanie', 'cap'];
  const facialHairs: FacialHair[] = sex === 'M' ? ['none', 'none', 'stubble', 'beard', 'mustache'] : ['none'];
  const glassesStyles: GlassesStyle[] = ['none', 'none', 'none', 'rectangular', 'round', 'aviator'];
  const jackets: JacketStyle[] = ['blazer', 'hoodie', 'bomber', 'coat', 'polo'];
  const eyeColors = ['#2d2219', '#35506b', '#3d5e43', '#4e3c28', '#24272b'];

  return {
    skinTone: pick(SKIN_TONES, rng),
    hairStyle: pick(sex === 'M' ? hairStylesM : hairStylesF, rng),
    hairColor: pick(HAIR_COLORS, rng),
    facialHair: pick(facialHairs, rng),
    glasses: pick(glassesStyles, rng),
    jacketStyle: pick(jackets, rng),
    jacketColor: pick(JACKET_COLORS, rng),
    shirtColor: pick(SHIRT_COLORS, rng),
    hatColor: pick(JACKET_COLORS, rng),
    eyeColor: pick(eyeColors, rng),
    heightScale: 0.94 + rng() * 0.12,
    buildScale: 0.92 + rng() * 0.16,
    genderPresentation: sex,
  };
}

function createMismatchedAppearance(original: PassengerAppearance, rng: RngFn): PassengerAppearance {
  const alt: PassengerAppearance = { ...original };
  // Make at least 2 clearly noticeable visual differences between 3D passenger & ID photo
  const otherSkins = SKIN_TONES.filter((s) => s !== original.skinTone);
  const otherHair: HairStyle[] = (['short', 'long', 'bald', 'curly', 'buzz'] as HairStyle[]).filter(
    (h) => h !== original.hairStyle,
  );
  const otherGlasses: GlassesStyle[] = (['none', 'rectangular', 'round', 'aviator'] as GlassesStyle[]).filter(
    (g) => g !== original.glasses,
  );
  alt.hairStyle = pick(otherHair, rng);
  alt.hairColor = pick(HAIR_COLORS.filter((c) => c !== original.hairColor), rng);
  alt.glasses = original.glasses === 'none' ? pick(['rectangular', 'aviator'] as const, rng) : pick(otherGlasses, rng);
  if (rng() > 0.45 && otherSkins.length > 0) {
    alt.skinTone = pick(otherSkins, rng);
  }
  if (original.genderPresentation === 'M') {
    alt.facialHair = original.facialHair === 'beard' ? 'none' : 'beard';
  }
  return alt;
}

function generateBag(
  config: ShiftConfig,
  includeContraband: boolean,
  rng: RngFn,
): { bag: BagData; contrabandViolations: Violation[] } {
  const bagTypes: BagType[] = ['hardshell', 'duffel', 'backpack', 'briefcase'];
  const bagType = pick(bagTypes, rng);
  const colorChoice = pick(BAG_COLORS, rng);
  const width = bagType === 'backpack' ? 350 : bagType === 'briefcase' ? 380 : 440;
  const height = bagType === 'briefcase' ? 245 : 270;

  const [minItems, maxItems] = config.bagClutterRange;
  const legalCount = randInt(minItems, maxItems, rng);
  const items: BagItemInstance[] = [];
  const marginX = 64;
  const marginY = 54;

  const placeItem = (
    template: (typeof LEGAL_ITEMS)[number],
    idx: number,
    preferCorner = false,
  ): BagItemInstance => {
    let bestX = marginX + rng() * (width - marginX * 2);
    let bestY = marginY + rng() * (height - marginY * 2);
    let bestScore = -Infinity;

    // Try candidate placements to distribute items naturally with slight realistic overlap
    for (let attempt = 0; attempt < 14; attempt++) {
      const cx = marginX + rng() * (width - marginX * 2);
      const cy = marginY + rng() * (height - marginY * 2);
      let minDist = 999;
      for (const existing of items) {
        const dx = existing.x - cx;
        const dy = existing.y - cy;
        const d = Math.hypot(dx, dy);
        if (d < minDist) minDist = d;
      }
      const edgeBonus = preferCorner ? Math.hypot(cx - width / 2, cy - height / 2) * 0.25 : 0;
      const score = minDist + edgeBonus;
      if (score > bestScore) {
        bestScore = score;
        bestX = cx;
        bestY = cy;
      }
    }

    const maxRot = template.contraband ? 0.85 : 0.65;
    return {
      instanceId: `item-${idx}-${template.id}-${Math.floor(rng() * 10000)}`,
      template,
      x: bestX,
      y: bestY,
      rotation: (rng() * 2 - 1) * maxRot,
      scale: 0.92 + rng() * 0.16,
      flagged: false,
    };
  };

  // Place legal clutter items first
  const eligibleLegal = LEGAL_ITEMS.filter((i) => i.minLevel <= config.level);
  for (let i = 0; i < legalCount; i++) {
    const tpl = pick(eligibleLegal, rng);
    items.push(placeItem(tpl, i));
  }

  const contrabandViolations: Violation[] = [];
  let hasLeadLining = false;

  if (includeContraband) {
    const eligibleContraband = CONTRABAND_ITEMS.filter((i) => i.minLevel <= config.level);
    const contrabandCount = config.level >= 4 && rng() < 0.28 ? 2 : 1;
    const chosenIds = new Set<string>();

    for (let c = 0; c < contrabandCount; c++) {
      const pool = eligibleContraband.filter((i) => !chosenIds.has(i.id));
      const tpl = pick(pool.length > 0 ? pool : eligibleContraband, rng);
      chosenIds.add(tpl.id);
      const inst = placeItem(tpl, legalCount + c, true);
      items.push(inst);
      contrabandViolations.push({
        code: 'CONTRABAND_ITEM',
        label: tpl.name,
        detail: tpl.hint,
        source: 'xray',
      });
    }

    if (config.allowLeadLining && rng() < 0.45) {
      hasLeadLining = true;
    }
  }

  return {
    bag: {
      id: `BAG-${randInt(1000, 9999, rng)}`,
      type: bagType,
      color: colorChoice.body,
      accentColor: colorChoice.accent,
      width,
      height,
      items,
      hasLeadLining,
    },
    contrabandViolations,
  };
}

export function generatePassengerCase(
  index: number,
  config: ShiftConfig,
  watchlist: WatchlistEntry[],
  rng: RngFn = Math.random,
): PassengerCase {
  const sex: 'M' | 'F' = rng() > 0.48 ? 'M' : 'F';
  const firstName = pick(sex === 'M' ? FIRST_NAMES_M : FIRST_NAMES_F, rng);
  const lastName = pick(LAST_NAMES, rng);
  let fullName = `${firstName} ${lastName}`.toUpperCase();

  const appearance = generateAppearance(sex, rng);
  const isPassport = config.level >= 3 ? rng() > 0.35 : rng() > 0.55;
  const nat = pick(NATIONALITIES, rng);
  const airline = pick(AIRLINES, rng);
  const dest = pick(DESTINATIONS, rng);
  const docNumber = generateDocNumber(isPassport, rng);

  const birthYear = randInt(1962, 2002, rng);
  const birthMonth = String(randInt(1, 12, rng)).padStart(2, '0');
  const birthDay = String(randInt(1, 28, rng)).padStart(2, '0');
  const dob = `${birthYear}-${birthMonth}-${birthDay}`;

  const issueDate = addDaysISO(config.dateISO, -randInt(180, 1400, rng));
  let expiryDate = addDaysISO(config.dateISO, randInt(120, 1800, rng));
  let boardingName = fullName;
  let flightDate = config.dateISO;
  let photoAppearance: PassengerAppearance = { ...appearance };
  let uvValid = true;
  let finalDocNumber = docNumber;

  const violations: Violation[] = [];

  // Roll whether this passenger has an ID issue and/or contraband
  const hasIdViolation = rng() < config.idViolationChance;
  const hasContraband = rng() < config.contrabandChance;

  if (hasIdViolation) {
    type IdIssueKind =
      | 'EXPIRED_ID'
      | 'NAME_MISMATCH'
      | 'WRONG_DATE'
      | 'FORGED_UV'
      | 'PHOTO_MISMATCH'
      | 'WATCHLIST_HIT';

    const pool: IdIssueKind[] = ['EXPIRED_ID', 'NAME_MISMATCH', 'WRONG_DATE'];
    if (config.allowUvForgery) pool.push('FORGED_UV', 'FORGED_UV');
    if (config.allowPhotoMismatch) pool.push('PHOTO_MISMATCH', 'PHOTO_MISMATCH');
    if (config.allowWatchlist && watchlist.length > 0) pool.push('WATCHLIST_HIT', 'WATCHLIST_HIT');

    const chosenIssue = pick(pool, rng);

    switch (chosenIssue) {
      case 'EXPIRED_ID': {
        expiryDate = addDaysISO(config.dateISO, -randInt(12, 420, rng));
        violations.push({
          code: 'EXPIRED_ID',
          label: 'Expired Photo ID',
          detail: `Document expired on ${formatShortDate(expiryDate)} (today is ${config.dateDisplay}).`,
          source: 'id',
        });
        break;
      }
      case 'NAME_MISMATCH': {
        const altLast = pick(
          LAST_NAMES.filter((n) => n.toUpperCase() !== lastName.toUpperCase()),
          rng,
        ).toUpperCase();
        boardingName = `${firstName.toUpperCase()} ${altLast}`;
        violations.push({
          code: 'NAME_MISMATCH',
          label: 'Name Mismatch',
          detail: `ID reads "${fullName}" but Boarding Pass reads "${boardingName}".`,
          source: 'id',
        });
        break;
      }
      case 'WRONG_DATE': {
        const offset = rng() > 0.5 ? randInt(1, 4, rng) : -randInt(1, 3, rng);
        flightDate = addDaysISO(config.dateISO, offset);
        violations.push({
          code: 'WRONG_DATE',
          label: 'Invalid Flight Date',
          detail: `Boarding pass is for ${formatShortDate(flightDate)}, not today (${config.dateDisplay}).`,
          source: 'id',
        });
        break;
      }
      case 'FORGED_UV': {
        uvValid = false;
        violations.push({
          code: 'FORGED_UV',
          label: 'Counterfeit / Invalid UV Seal',
          detail: 'Document failed UV blacklight verification (missing or corrupted security hologram).',
          source: 'id',
        });
        break;
      }
      case 'PHOTO_MISMATCH': {
        photoAppearance = createMismatchedAppearance(appearance, rng);
        violations.push({
          code: 'PHOTO_MISMATCH',
          label: 'ID Photo Mismatch',
          detail: 'Photo on the ID does not match the passenger standing at the checkpoint.',
          source: 'id',
        });
        break;
      }
      case 'WATCHLIST_HIT': {
        const target = pick(watchlist, rng);
        fullName = target.name;
        boardingName = target.name;
        finalDocNumber = target.docNumber;
        violations.push({
          code: 'WATCHLIST_HIT',
          label: 'Federal BOLO Watchlist Match',
          detail: `${target.name} (${target.docNumber}) — ${target.reason}.`,
          source: 'id',
        });
        break;
      }
    }
  }

  const { bag, contrabandViolations } = generateBag(config, hasContraband, rng);
  violations.push(...contrabandViolations);

  const hasAnyThreat = violations.length > 0;
  const nervousness = hasAnyThreat ? 0.55 + rng() * 0.45 : rng() * 0.25;
  const greeting =
    nervousness > 0.65 && rng() > 0.4 ? pick(NERVOUS_GREETINGS, rng) : pick(NORMAL_GREETINGS, rng);

  const seatRow = randInt(4, 34, rng);
  const seatCol = pick(['A', 'B', 'C', 'D', 'E', 'F'], rng);

  return {
    id: `PAX-${config.level}-${index + 1}-${randInt(100, 999, rng)}`,
    index,
    appearance,
    document: {
      type: isPassport ? 'PASSPORT' : 'DRIVER_LICENSE',
      fullName,
      dob,
      issueDate,
      expiryDate,
      docNumber: finalDocNumber,
      issuingAuthority: isPassport ? nat.country : `${pick(ISSUING_STATES, rng)} DMV`,
      nationality: isPassport ? nat.code : 'USA',
      sex,
      photoAppearance,
      uvValid,
      uvSealCode: `DHS-${randInt(1000, 9999, rng)}`,
    },
    boardingPass: {
      passengerName: boardingName,
      airline: airline.name,
      airlineCode: airline.code,
      flightNumber: `${airline.code} ${randInt(104, 988, rng)}`,
      origin: 'SEA',
      destination: dest.code,
      destinationCity: dest.city,
      gate: dest.gate,
      seat: `${seatRow}${seatCol}`,
      flightDate,
      boardingGroup: pick(['1', '2', '3', '4'], rng),
      sequenceNo: String(randInt(11, 189, rng)).padStart(3, '0'),
      tsaPre: !hasAnyThreat && rng() < 0.25,
    },
    bag,
    violations,
    greeting,
    nervousness,
  };
}
