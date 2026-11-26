import type {
  DecisionAction,
  DecisionEvaluation,
  PassengerCase,
} from './types';

export function evaluateDecision(
  pax: PassengerCase,
  action: DecisionAction,
): DecisionEvaluation {
  const idViolations = pax.violations.filter((v) => v.source === 'id');
  const xrayViolations = pax.violations.filter((v) => v.source === 'xray');
  const hasIdIssue = idViolations.length > 0;
  const hasContraband = xrayViolations.length > 0;
  const hasWatchlist = idViolations.some((v) => v.code === 'WATCHLIST_HIT');
  const hasAnyViolation = pax.violations.length > 0;

  const flaggedItems = pax.bag.items.filter((i) => i.flagged || i.seized);
  const flaggedContrabandCount = flaggedItems.filter((i) => i.template.contraband).length;
  const seizedContrabandCount = pax.bag.items.filter((i) => i.seized && i.template.contraband).length;
  const falseFlagCount = flaggedItems.filter((i) => !i.template.contraband).length;

  // Case 1: Passenger is completely clean
  if (!hasAnyViolation) {
    if (action === 'CLEAR') {
      const bonus = falseFlagCount === 0 ? 1 : 0;
      return {
        correct: true,
        partial: false,
        action,
        xpDelta: 70 + bonus * 10,
        creditsDelta: 45,
        headline: 'PASSENGER CLEARED',
        explanation: 'All travel documents valid and carry-on X-ray clear. Smooth throughput!',
        missedViolations: [],
        caughtViolations: [],
        falseFlagCount,
      };
    }

    return {
      correct: false,
      partial: false,
      action,
      xpDelta: -10,
      creditsDelta: -15,
      headline: 'FALSE POSITIVE — CITATION ISSUED',
      explanation:
        'This passenger had valid credentials and no prohibited items in their luggage. Double-check dates, UV seals, and open the bag [4] to inspect ambiguous items before detaining.',
      missedViolations: [],
      caughtViolations: [],
      falseFlagCount,
    };
  }

  // Case 2: Player mistakenly cleared a violator
  if (action === 'CLEAR') {
    const severityPenalty = hasContraband || hasWatchlist ? -25 : -15;
    return {
      correct: false,
      partial: false,
      action,
      xpDelta: severityPenalty,
      creditsDelta: hasContraband || hasWatchlist ? -25 : -15,
      headline:
        hasContraband || hasWatchlist
          ? 'SECURITY BREACH — THREAT PASSED!'
          : 'SCREENING ERROR — INVALID DOCS PASSED',
      explanation: pax.violations.map((v) => `${v.label}: ${v.detail}`).join(' • '),
      missedViolations: pax.violations,
      caughtViolations: [],
      falseFlagCount,
    };
  }

  // Case 3: Player stopped the passenger via DENY_ID or CONFISCATE_DETAIN
  if (action === 'CONFISCATE_DETAIN') {
    // Ideal action for contraband OR watchlist OR forged UV/photo impersonation
    const severeIdThreat = idViolations.some(
      (v) => v.code === 'WATCHLIST_HIT' || v.code === 'FORGED_UV' || v.code === 'PHOTO_MISMATCH',
    );
    if (hasContraband || severeIdThreat) {
      const tagBonus = hasContraband && flaggedContrabandCount > 0 ? 30 : 0;
      const physicalSeizeBonus = seizedContrabandCount > 0 ? 20 : 0;
      const cleanTagPenalty = falseFlagCount * 5;
      const xp = Math.max(60, 105 + tagBonus + physicalSeizeBonus - cleanTagPenalty);
      const credits = Math.max(
        40,
        70 + (tagBonus > 0 ? 25 : 0) + (physicalSeizeBonus > 0 ? 15 : 0) - cleanTagPenalty,
      );
      return {
        correct: true,
        partial: hasContraband && flaggedContrabandCount === 0,
        action,
        xpDelta: xp,
        creditsDelta: credits,
        headline:
          seizedContrabandCount > 0
            ? 'CONTRABAND PHYSICALLY CONFISCATED!'
            : hasContraband && flaggedContrabandCount > 0
              ? 'CONTRABAND TAGGED & SEIZED!'
              : hasWatchlist
                ? 'WATCHLIST SUSPECT DETAINED!'
                : 'THREAT NEUTRALIZED!',
        explanation:
          pax.violations.map((v) => `${v.label} — ${v.detail}`).join(' • ') +
          (hasContraband && flaggedContrabandCount === 0
            ? ' (Tip: Tag on X-Ray or open the bag [4] to physically seize contraband for bonus XP!)'
            : ''),
        missedViolations: [],
        caughtViolations: pax.violations,
        falseFlagCount,
      };
    }

    // Minor ID issue (expired/name/date) detained instead of denied boarding -> partial credit
    return {
      correct: true,
      partial: true,
      action,
      xpDelta: 55,
      creditsDelta: 35,
      headline: 'DENIED — OVER-ESCALATED TO DETAIN',
      explanation: `Good catch on ${idViolations[0].label}, though "Deny Boarding" is the standard action for routine document issues without contraband.`,
      missedViolations: [],
      caughtViolations: idViolations,
      falseFlagCount,
    };
  }

  // Case 4: action === 'DENY_ID'
  if (hasIdIssue && !hasContraband && !hasWatchlist) {
    return {
      correct: true,
      partial: false,
      action,
      xpDelta: 95,
      creditsDelta: 65,
      headline: 'BOARDING DENIED — DOCUMENT VIOLATION CAUGHT',
      explanation: idViolations.map((v) => `${v.label}: ${v.detail}`).join(' • '),
      missedViolations: [],
      caughtViolations: idViolations,
      falseFlagCount,
    };
  }

  if (hasWatchlist || hasContraband) {
    // Stopped them at checkpoint, but failed to confiscate/detain a serious threat!
    return {
      correct: true,
      partial: true,
      action,
      xpDelta: 45,
      creditsDelta: 30,
      headline: 'STOPPED — SHOULD HAVE CONFISCATED & DETAINED',
      explanation: `Passenger was turned away, but ${
        hasContraband ? 'prohibited contraband in the bag' : 'a Federal BOLO Watchlist suspect'
      } required CONFISCATE & DETAIN!`,
      missedViolations: hasContraband ? xrayViolations : idViolations,
      caughtViolations: hasIdIssue ? idViolations : [],
      falseFlagCount,
    };
  }

  return {
    correct: false,
    partial: false,
    action,
    xpDelta: -20,
    creditsDelta: -20,
    headline: 'PROCEDURE ERROR',
    explanation: 'Unexpected screening discrepancy.',
    missedViolations: pax.violations,
    caughtViolations: [],
    falseFlagCount,
  };
}
