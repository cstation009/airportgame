import { describe, expect, it } from 'vitest';
import { AIR_MARSHAL_UNLOCK_LEVEL, getRankForXp, getShiftConfig } from '../../data/levels';
import { getSearchBagRect, hitTestSearchBagItem } from '../bagSearchRenderer';
import { evaluateDecision } from '../evaluator';
import { createSeededRng, generatePassengerCase, generateWatchlist } from '../generator';
import { getBagScreenOrigin, hitTestBagItem, sampleMaterialAtCursor } from '../xrayRenderer';

describe('SkyGuard checkpoint simulation', () => {
  it('generates consistent shift configs and Air Marshal ranks', () => {
    const lvl1 = getShiftConfig(1);
    const lvl3 = getShiftConfig(3);
    const lvl5 = getShiftConfig(AIR_MARSHAL_UNLOCK_LEVEL);

    expect(lvl1.allowUvForgery).toBe(false);
    expect(lvl1.allowWatchlist).toBe(false);
    expect(lvl3.allowUvForgery).toBe(true);
    expect(lvl3.allowPhotoMismatch).toBe(true);
    expect(lvl3.allowWatchlist).toBe(true);
    expect(lvl5.allowLeadLining).toBe(true);

    expect(getRankForXp(0).level).toBe(1);
    expect(getRankForXp(2200).level).toBe(5);
    expect(getRankForXp(2200).title).toBe('Federal Air Marshal');
  });

  it('generates valid passenger cases with matching violation metadata', () => {
    const rng = createSeededRng(20261125);
    const cfg = getShiftConfig(3);
    const watchlist = generateWatchlist(cfg, rng);
    expect(watchlist.length).toBeGreaterThanOrEqual(2);

    let sawClean = false;
    let sawContraband = false;
    let sawIdIssue = false;

    for (let i = 0; i < 40; i++) {
      const pax = generatePassengerCase(i, cfg, watchlist, rng);
      const contrabandItems = pax.bag.items.filter((item) => item.template.contraband);
      const xrayViolations = pax.violations.filter((v) => v.source === 'xray');
      expect(xrayViolations.length).toBe(contrabandItems.length);

      if (pax.violations.length === 0) sawClean = true;
      if (contrabandItems.length > 0) sawContraband = true;
      if (pax.violations.some((v) => v.source === 'id')) sawIdIssue = true;
    }

    expect(sawClean).toBe(true);
    expect(sawContraband).toBe(true);
    expect(sawIdIssue).toBe(true);
  });

  it('evaluates CLEAR, DENY_ID, and CONFISCATE_DETAIN with contraband tag bonus', () => {
    const rng = createSeededRng(777);
    const cfg = getShiftConfig(2);
    const cases = Array.from({ length: 30 }, (_, i) => generatePassengerCase(i, cfg, [], rng));

    const cleanPax = cases.find((p) => p.violations.length === 0)!;
    expect(cleanPax).toBeDefined();
    expect(evaluateDecision(cleanPax, 'CLEAR').correct).toBe(true);
    expect(evaluateDecision(cleanPax, 'CONFISCATE_DETAIN').correct).toBe(false);

    const smuggler = cases.find((p) => p.violations.some((v) => v.code === 'CONTRABAND_ITEM'))!;
    expect(smuggler).toBeDefined();

    // Passing a smuggler is a security breach
    const breach = evaluateDecision(smuggler, 'CLEAR');
    expect(breach.correct).toBe(false);
    expect(breach.xpDelta).toBeLessThan(0);

    // Detaining without flagging vs with flagging contraband gives +30 bonus XP
    const untagged = evaluateDecision(smuggler, 'CONFISCATE_DETAIN');
    const contrabandItem = smuggler.bag.items.find((i) => i.template.contraband)!;
    contrabandItem.flagged = true;
    const tagged = evaluateDecision(smuggler, 'CONFISCATE_DETAIN');

    expect(untagged.correct).toBe(true);
    expect(tagged.correct).toBe(true);
    expect(tagged.xpDelta).toBeGreaterThan(untagged.xpDelta);
  });

  it('hit-tests and probes X-ray bag items accurately', () => {
    const rng = createSeededRng(9911);
    const cfg = getShiftConfig(1);
    const pax = generatePassengerCase(0, cfg, [], rng);
    const target = pax.bag.items[pax.bag.items.length - 1];
    const { ox, oy } = getBagScreenOrigin(680, 330, pax.bag, 0);

    const hit = hitTestBagItem(680, 330, pax.bag, 0, ox + target.x, oy + target.y);
    expect(hit).not.toBeNull();
    expect(hit?.instanceId).toBe(target.instanceId);

    const reading = sampleMaterialAtCursor(680, 330, pax.bag, 0, ox + target.x, oy + target.y);
    expect(reading.material).not.toBe('air');
    expect(reading.densityPct).toBeGreaterThan(0);
  });

  it('supports physical bag inspection, false-bottom gating, and seizure bonus XP', () => {
    const rng = createSeededRng(4444);
    const cfg = getShiftConfig(2);
    const cases = Array.from({ length: 30 }, (_, i) => generatePassengerCase(i, cfg, [], rng));
    const smuggler = cases.find((p) => p.violations.some((v) => v.code === 'CONTRABAND_ITEM'))!;
    expect(smuggler).toBeDefined();

    const contraband = smuggler.bag.items.find((i) => i.template.contraband)!;
    const { ox, oy, scale } = getSearchBagRect(560, 330, smuggler.bag);

    // Lead-lined false bottom blocks grabbing items until peeled open
    smuggler.bag.hasLeadLining = true;
    smuggler.bag.falseBottomOpened = false;
    expect(
      hitTestSearchBagItem(560, 330, smuggler.bag, ox + contraband.x * scale, oy + contraband.y * scale),
    ).toBeNull();

    // Opening the false bottom exposes the item for physical inspection & seizure
    smuggler.bag.falseBottomOpened = true;
    const found = hitTestSearchBagItem(
      560,
      330,
      smuggler.bag,
      ox + contraband.x * scale,
      oy + contraband.y * scale,
    );
    expect(found).not.toBeNull();

    // Physically seizing awards higher XP than X-ray tagging alone
    contraband.flagged = true;
    const taggedOnly = evaluateDecision(smuggler, 'CONFISCATE_DETAIN');
    contraband.seized = true;
    const seizedResult = evaluateDecision(smuggler, 'CONFISCATE_DETAIN');
    expect(seizedResult.xpDelta).toBeGreaterThan(taggedOnly.xpDelta);
    expect(seizedResult.headline).toContain('PHYSICALLY CONFISCATED');
  });
});
