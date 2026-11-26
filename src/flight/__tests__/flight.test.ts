import { describe, expect, it } from 'vitest';
import {
  CABIN_BOUNDS,
  FLIGHT_MISSIONS,
  buildCabinObstacles,
  evaluateFlightMission,
  generateCabinManifest,
  isNearCover,
  resolveCabinMovement,
  segmentHitsObstacle,
} from '../flightLogic';

describe('Phase 2 Air Marshal cabin simulation', () => {
  it('generates cabin manifest with exact hijacker and civilian counts in distinct seats', () => {
    const mission = FLIGHT_MISSIONS[1]; // 3 hijackers, 18 civilians
    const people = generateCabinManifest(mission, 20261125);
    const hijackers = people.filter((p) => p.role === 'hijacker');
    const civilians = people.filter((p) => p.role === 'civilian');
    const seats = new Set(people.map((p) => p.seatCode));

    expect(hijackers.length).toBe(mission.hijackerCount);
    expect(civilians.length).toBe(mission.civilianCount);
    expect(seats.size).toBe(people.length);
  });

  it('prevents walking through seat banks and detects tactical cover near galley carts', () => {
    const obstacles = buildCabinObstacles();
    expect(obstacles.some((o) => o.kind === 'galley_cart')).toBe(true);
    expect(obstacles.some((o) => o.kind === 'bulkhead')).toBe(true);

    // Center aisle at z = 9.8 is walkable
    const step = resolveCabinMovement(0, 9.8, 0, 9.0, 0.25, obstacles);
    expect(step.z).toBeCloseTo(9.0, 3);

    // Trying to walk straight into the left seat bank at z = 8.8 is blocked
    const blocked = resolveCabinMovement(0, 8.8, -1.5, 8.8, 0.25, obstacles);
    expect(blocked.x).toBe(0);

    // Standing next to beverage cart-1 (-0.58..-0.06, 2.05..3.15) counts as cover
    expect(isNearCover(0.18, 2.6, obstacles)).toBe(true);
    // Open rear vestibule far from obstacles is exposed
    expect(isNearCover(0, CABIN_BOUNDS.maxZ - 0.1, obstacles, 0.35)).toBe(false);
  });

  it('blocks shots with galley carts and bulkheads cleanly', () => {
    const obstacles = buildCabinObstacles();
    // Shot from behind cart-1 across cart-1 is blocked
    const cartBlocked = segmentHitsObstacle(-0.3, 4.0, -0.3, 1.0, obstacles, false);
    expect(cartBlocked.hit).toBe(true);

    // Clear center-right aisle shot around cart-1 is unobstructed
    const clearShot = segmentHitsObstacle(0.32, 4.0, 0.32, 1.0, obstacles, false);
    expect(clearShot.hit).toBe(false);
  });

  it('evaluates Air Marshal mission victory bonuses and civilian penalties', () => {
    const mission = FLIGHT_MISSIONS[0];
    const cleanWin = evaluateFlightMission(mission, true, 'Secured', 2, 100, 100, 0, 42);
    const messyWin = evaluateFlightMission(mission, true, 'Secured', 2, 70, 50, 1, 55);
    const defeat = evaluateFlightMission(mission, false, 'Breached', 1, 0, 80, 0, 60);

    expect(cleanWin.victory).toBe(true);
    expect(cleanWin.xpEarned).toBeGreaterThan(messyWin.xpEarned);
    expect(cleanWin.creditsEarned).toBeGreaterThan(messyWin.creditsEarned);
    expect(defeat.victory).toBe(false);
    expect(defeat.xpEarned).toBe(35);
  });
});
