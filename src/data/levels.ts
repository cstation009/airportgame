import type { AirMarshalRank, ShiftConfig, UpgradeDefinition } from '../sim/types';

export const AIR_MARSHAL_UNLOCK_LEVEL = 5;

export const AIR_MARSHAL_RANKS: AirMarshalRank[] = [
  { level: 1, title: 'TSA Trainee', xpRequired: 0, badgeCode: 'LVL-1' },
  { level: 2, title: 'Screening Officer', xpRequired: 220, badgeCode: 'LVL-2' },
  { level: 3, title: 'Senior Inspector', xpRequired: 550, badgeCode: 'LVL-3' },
  { level: 4, title: 'Lead Checkpoint Officer', xpRequired: 980, badgeCode: 'LVL-4' },
  { level: 5, title: 'Federal Air Marshal', xpRequired: 1500, badgeCode: 'FAM-5' },
];

export const UPGRADES: UpgradeDefinition[] = [
  {
    id: 'densityProbe',
    name: 'Dual-Energy Material Probe',
    cost: 120,
    badge: 'X-RAY',
    description: 'Displays real-time atomic density & material class under your X-ray cursor.',
  },
  {
    id: 'highSpeedBelt',
    name: 'Servo Conveyor Drive',
    cost: 110,
    badge: 'BELT',
    description: 'Increases X-ray conveyor belt speed by 55% with crisp instant-stop braking.',
  },
  {
    id: 'wideUvLamp',
    name: 'Wide-Spectrum UV Lamp',
    cost: 100,
    badge: 'DOCS',
    description: 'Expands the UV blacklight beam radius and boosts hologram contrast on IDs.',
  },
  {
    id: 'watchlistAlert',
    name: 'BOLO Surname Scanner',
    cost: 160,
    badge: 'INTEL',
    description: 'Automatically pulses the BOLO desk monitor whenever a passenger surname hits the watchlist.',
  },
  {
    id: 'dualTaser',
    name: 'Taser X2 Dual-Cartridge',
    cost: 140,
    badge: 'FLIGHT',
    description: 'Boosts First-Person Taser capacity (4 → 6 cartridges) and ultra-fast reloads in-flight.',
  },
  {
    id: 'kevlarVest',
    name: 'Concealed Kevlar Vest',
    cost: 160,
    badge: 'FLIGHT',
    description: 'Boosts Air Marshal tactical vest armor (+50%) and accelerates cover recovery during cabin firefights.',
  },
];

export function getShiftConfig(level: number): ShiftConfig {
  const clamped = Math.max(1, level);
  const baseDay = 14 + (clamped - 1);
  const dayStr = String(baseDay).padStart(2, '0');
  const dateISO = `2026-11-${dayStr}`;
  const dateDisplay = `NOV ${dayStr}, 2026`;

  if (clamped === 1) {
    return {
      level: 1,
      title: 'Shift 01 — Domestic Departures',
      rankTitle: 'TSA Trainee',
      dateISO,
      dateDisplay,
      terminalGate: 'CONCOURSE B • LANE 04',
      passengerQuota: 5,
      contrabandChance: 0.42,
      idViolationChance: 0.32,
      bagClutterRange: [3, 5],
      allowUvForgery: false,
      allowPhotoMismatch: false,
      allowWatchlist: false,
      allowLeadLining: false,
      briefingRules: [
        `Verify every passenger ID is NOT expired (Today: ${dateDisplay}).`,
        'Confirm the name on the Photo ID matches the Boarding Pass & flight date matches today.',
        'Scan bags on X-Ray [3] or open them physically [4] to seize banned items (press G for Contraband Guide).',
        'Ready for action? Click ✈ BOARD AIR MARSHAL FLIGHT anytime to jump into First-Person plane missions!',
      ],
    };
  }

  if (clamped === 2) {
    return {
      level: 2,
      title: 'Shift 02 — Enhanced Document Screening',
      rankTitle: 'Screening Officer',
      dateISO,
      dateDisplay,
      terminalGate: 'CONCOURSE B • LANE 04',
      passengerQuota: 6,
      contrabandChance: 0.46,
      idViolationChance: 0.38,
      bagClutterRange: [4, 6],
      allowUvForgery: true,
      allowPhotoMismatch: false,
      allowWatchlist: false,
      allowLeadLining: false,
      briefingRules: [
        'NEW: Toggle the UV BLACKLIGHT on the ID desk—genuine IDs show an intact glowing holographic seal.',
        'Use X-Ray OS (Organic Strip) & MS (Metal Boost) filters to expose weapons hidden under clothing.',
        `Reject expired IDs, mismatched names, or wrong flight dates (Today: ${dateDisplay}).`,
        'Tag contraband directly on the X-Ray monitor before clicking CONFISCATE & DETAIN.',
      ],
    };
  }

  if (clamped === 3) {
    return {
      level: 3,
      title: 'Shift 03 — Federal BOLO Watchlist Active',
      rankTitle: 'Senior Inspector',
      dateISO,
      dateDisplay,
      terminalGate: 'INTL CONCOURSE C • LANE 02',
      passengerQuota: 8,
      contrabandChance: 0.5,
      idViolationChance: 0.48,
      bagClutterRange: [6, 8],
      allowUvForgery: true,
      allowPhotoMismatch: true,
      allowWatchlist: true,
      allowLeadLining: false,
      briefingRules: [
        'NEW: Check the Federal BOLO Watchlist—detain any matching name or document number.',
        'NEW: Compare the ID photo closely against the 3D passenger standing at your podium!',
        'Verify UV security holograms on all passports and driver licenses.',
        'Watch for disguised IEDs, tactical blades, brass knuckles, and chemical canisters.',
      ],
    };
  }

  return {
    level: clamped,
    title:
      clamped >= AIR_MARSHAL_UNLOCK_LEVEL
        ? `Shift ${String(clamped).padStart(2, '0')} — Air Marshal Priority Lane`
        : `Shift ${String(clamped).padStart(2, '0')} — High-Threat International`,
    rankTitle:
      clamped >= AIR_MARSHAL_UNLOCK_LEVEL
        ? 'Federal Air Marshal'
        : 'Lead Checkpoint Officer',
    dateISO,
    dateDisplay,
    terminalGate: 'INTL CONCOURSE C • HIGH-SECURITY LANE 01',
    passengerQuota: Math.min(10, 7 + Math.floor(clamped / 2)),
    contrabandChance: 0.54,
    idViolationChance: 0.5,
    bagClutterRange: [6, 9],
    allowUvForgery: true,
    allowPhotoMismatch: true,
    allowWatchlist: true,
    allowLeadLining: true,
    briefingRules: [
      'HIGH ALERT: Smugglers are using dense shielded linings—switch to MS (High Penetration) or INV X-Ray modes!',
      'Cross-check every passenger against the Federal BOLO Watchlist, UV Seal, and 3D physical appearance.',
      'Zero tolerance on concealed weapons, IED assemblies, chemical agents, and forged travel documents.',
      clamped >= AIR_MARSHAL_UNLOCK_LEVEL
        ? 'AIR MARSHAL CLEARANCE EARNED: In-flight hijacker interdiction missions unlock in Phase 2!'
        : `Reach Level ${AIR_MARSHAL_UNLOCK_LEVEL} to earn your Federal Air Marshal wings and board live flights.`,
    ],
  };
}

export function getRankForXp(xp: number): AirMarshalRank {
  let current = AIR_MARSHAL_RANKS[0];
  for (const rank of AIR_MARSHAL_RANKS) {
    if (xp >= rank.xpRequired) {
      current = rank;
    }
  }
  return current;
}
