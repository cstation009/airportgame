import type { PassengerAppearance } from '../sim/types';

export type CabinPersonRole = 'civilian' | 'hijacker';

export type HijackerState =
  | 'seated_hidden'
  | 'suspicious_tell'
  | 'exposed_advancing'
  | 'taking_cover'
  | 'breaching_cockpit'
  | 'stunned'
  | 'subdued';

export interface CoverObstacle {
  id: string;
  kind: 'seat_bank' | 'galley_cart' | 'bulkhead';
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

export interface CabinPerson {
  id: string;
  name: string;
  seatCode: string;
  role: CabinPersonRole;
  appearance: PassengerAppearance;
  /** Seated home coordinates */
  seatX: number;
  seatZ: number;
  /** Live world coordinates */
  x: number;
  z: number;
  facingAngle: number;
  state: HijackerState;
  scanned: boolean;
  tellHint: string;
  /** Seconds until a hidden hijacker blows cover on their own */
  activationTimer: number;
  /** Remaining stun hits needed to subdue (2 normal, 1 if surprised while seated) */
  hp: number;
  maxHp: number;
  stunTimer: number;
  fireCooldown: number;
  ducked: boolean;
}

export interface FlightProjectile {
  id: string;
  fromPlayer: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
}

export interface FlightMissionConfig {
  id: string;
  flightNumber: string;
  route: string;
  aircraft: string;
  threatTitle: string;
  minCareerLevel: number;
  hijackerCount: number;
  civilianCount: number;
  hijackerSpeed: number;
  hijackerFireInterval: number;
  rewardXp: number;
  rewardCredits: number;
}

export interface FlightMissionResult {
  victory: boolean;
  reason: string;
  mission: FlightMissionConfig;
  hijackersSubdued: number;
  hijackersTotal: number;
  cockpitIntegrity: number;
  vestIntegrity: number;
  civilianIncidents: number;
  xpEarned: number;
  creditsEarned: number;
  elapsedSeconds: number;
}
