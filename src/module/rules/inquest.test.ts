import { describe, expect, it } from 'vitest';
import { DH2_INQUEST_RULES } from '../config/game-systems/dh2-config.ts';
import {
    applyInvestigationPoints,
    clueInvestigationPoints,
    createInquest,
    inquestFromRow,
    inquestInfluenceOutcome,
    inquestProgress,
    inquestRequiredPoints,
    inquestRevelationEvents,
    inquestRevelationsCrossed,
    inquestRevelationsReached,
    inquestRevelationThresholds,
    type InquestState,
    leadTestInvestigationPoints,
    parseInquests,
    parseThresholdList,
    rowFromInquest,
} from './inquest';

const rules = DH2_INQUEST_RULES;

describe('DH2 Inquest tables', () => {
    it('scope totals are 600 / 900 / 1200 IP', () => {
        expect(rules.scopes.minoris.requiredPoints).toBe(600);
        expect(rules.scopes.majoris.requiredPoints).toBe(900);
        expect(rules.scopes.extremis.requiredPoints).toBe(1200);
    });
    it('scope rewards are 3 / 5 / 7 Influence (the Inquest rewards table)', () => {
        expect([rules.scopes.minoris.influenceReward, rules.scopes.majoris.influenceReward, rules.scopes.extremis.influenceReward]).toEqual([3, 5, 7]);
    });
    it('clue values are 50 / 100 / 200 (the clue values table)', () => {
        expect(rules.clueValues).toEqual({ minor: 50, major: 100, vital: 200 });
    });
});

describe('inquestRequiredPoints', () => {
    it('adds any extra requirement (Catspaws +200) to the scope total', () => {
        expect(inquestRequiredPoints(rules, { scope: 'majoris', extraRequiredPoints: 0 })).toBe(900);
        expect(inquestRequiredPoints(rules, { scope: 'majoris', extraRequiredPoints: 200 })).toBe(1100);
    });
});

describe('inquestRevelationThresholds', () => {
    // Regression (#90): the module used to hardcode 200/400/600/900/1200 for
    // every Inquest — the printed sample adventure's example, not the rule.
    it('defaults to one Revelation every 300 IP, ending at the scope total', () => {
        expect(inquestRevelationThresholds(rules, createInquest('a', { scope: 'minoris' }))).toEqual([300, 600]);
        expect(inquestRevelationThresholds(rules, createInquest('a', { scope: 'majoris' }))).toEqual([300, 600, 900]);
        expect(inquestRevelationThresholds(rules, createInquest('a', { scope: 'extremis' }))).toEqual([300, 600, 900, 1200]);
    });
    it('uses GM-tailored thresholds and always ends at the completion total', () => {
        // The printed sample adventure's thresholds: 200 / 400 / 600 / 900 / 1200.
        expect(inquestRevelationThresholds(rules, createInquest('a', { scope: 'extremis', revelationThresholds: [900, 200, 400, 600] }))).toEqual([
            200, 400, 600, 900, 1200,
        ]);
    });
    it('drops tailored thresholds at or past the completion total', () => {
        expect(inquestRevelationThresholds(rules, createInquest('a', { scope: 'minoris', revelationThresholds: [200, 600, 700] }))).toEqual([200, 600]);
    });
    it('follows an added requirement', () => {
        expect(inquestRevelationThresholds(rules, createInquest('a', { scope: 'minoris', extraRequiredPoints: 200 }))).toEqual([300, 600, 800]);
    });
});

describe('inquestRevelationsCrossed / inquestRevelationsReached', () => {
    const thresholds = [300, 600, 900];
    it('counts thresholds crossed upward only', () => {
        expect(inquestRevelationsCrossed(thresholds, 250, 350)).toBe(1);
        expect(inquestRevelationsCrossed(thresholds, 0, 900)).toBe(3);
        expect(inquestRevelationsCrossed(thresholds, 350, 250)).toBe(0);
        expect(inquestRevelationsCrossed(thresholds, 300, 300)).toBe(0);
    });
    it('reports Revelations reached', () => {
        expect(inquestRevelationsReached(thresholds, 299)).toBe(0);
        expect(inquestRevelationsReached(thresholds, 600)).toBe(2);
        expect(inquestRevelationsReached(thresholds, 5000)).toBe(3);
    });
});

describe('clue and lead-test IP', () => {
    it('adds the lead-investigator bonus to a relevant clue', () => {
        expect(clueInvestigationPoints(rules, 'major', false)).toBe(100);
        expect(clueInvestigationPoints(rules, 'major', true)).toBe(125);
    });
    it('is ±10 IP per degree on a lead test', () => {
        expect(leadTestInvestigationPoints(rules, 3)).toBe(30);
        expect(leadTestInvestigationPoints(rules, -2)).toBe(-20);
        expect(leadTestInvestigationPoints(rules, Number.NaN)).toBe(0);
    });
    it('floors the running total at 0', () => {
        expect(applyInvestigationPoints(20, -50)).toBe(0);
        expect(applyInvestigationPoints(20, 30)).toBe(50);
    });
});

describe('inquestInfluenceOutcome', () => {
    const minoris = (points: number): InquestState => createInquest('a', { scope: 'minoris', investigationPoints: points });
    it('pays the scope reward when goals are met', () => {
        expect(inquestInfluenceOutcome(rules, minoris(600), true)).toEqual({ total: 3, scopeReward: 3, surplusBonus: 0, shortfallPenalty: 0 });
    });
    it('adds 1 per full 300 surplus IP, capped at 3', () => {
        expect(inquestInfluenceOutcome(rules, minoris(899), true).total).toBe(3);
        expect(inquestInfluenceOutcome(rules, minoris(900), true).total).toBe(4);
        expect(inquestInfluenceOutcome(rules, minoris(5000), true)).toMatchObject({ total: 6, surplusBonus: 3 });
    });
    it('halves the reward, rounded down, when the goals failed', () => {
        expect(inquestInfluenceOutcome(rules, minoris(900), false)).toEqual({ total: 1, scopeReward: 1, surplusBonus: 0, shortfallPenalty: 0 });
    });
    it('loses 1 per 300 IP (or part) short', () => {
        expect(inquestInfluenceOutcome(rules, minoris(599), true).total).toBe(-1);
        expect(inquestInfluenceOutcome(rules, minoris(0), true).total).toBe(-2);
        expect(inquestInfluenceOutcome(rules, minoris(299), false).total).toBe(-2);
    });
});

describe('parseInquests', () => {
    it('rejects non-arrays and id-less entries', () => {
        expect(parseInquests({})).toEqual([]);
        expect(parseInquests([{ target: 'x' }, null, 'x'])).toEqual([]);
    });
    it('falls back to defaults for unknown enum values and bad numbers', () => {
        const [q] = parseInquests([{ id: 'q1', scope: 'omega', approach: 'loud', status: 'done', investigationPoints: -40, revelationThresholds: [200, 'x'] }]);
        expect(q).toMatchObject({ id: 'q1', scope: 'minoris', approach: 'covert', status: 'active', investigationPoints: 0, revelationThresholds: [200] });
    });
    it('round-trips a stored Inquest', () => {
        const stored = createInquest('q2', {
            target: 'League of Purple Flowers',
            scope: 'majoris',
            approach: 'open',
            investigationPoints: 450,
            extraRequiredPoints: 200,
            status: 'goalsMet',
        });
        expect(parseInquests(JSON.parse(JSON.stringify([stored])))).toEqual([stored]);
    });
});

describe('form rows', () => {
    it('round-trips through rowFromInquest / inquestFromRow', () => {
        const q = createInquest('q3', { target: 'Zethor', scope: 'extremis', investigationPoints: 250, revelationThresholds: [200, 500] });
        expect(rowFromInquest(q).revelationThresholds).toBe('200, 500');
        expect(inquestFromRow(rowFromInquest(q))).toEqual(q);
    });
    it('parses typed thresholds leniently', () => {
        expect(parseThresholdList('200, 500;x 600')).toEqual([200, 500, 600]);
        expect(parseThresholdList('')).toEqual([]);
    });
    it('returns null for a row without an id', () => {
        expect(inquestFromRow({ ...rowFromInquest(createInquest('x')), id: '' })).toBeNull();
    });
});

describe('inquestRevelationEvents', () => {
    it('reports an active Inquest that crossed a threshold', () => {
        const before = [createInquest('q', { scope: 'minoris', investigationPoints: 250 })];
        const after = [createInquest('q', { scope: 'minoris', investigationPoints: 350 })];
        const [event] = inquestRevelationEvents(rules, before, after);
        expect(event).toMatchObject({ revelation: 1, revelationCount: 2, isFinal: false });
    });
    it('flags the final Revelation', () => {
        const before = [createInquest('q', { scope: 'minoris', investigationPoints: 550 })];
        const after = [createInquest('q', { scope: 'minoris', investigationPoints: 600 })];
        expect(inquestRevelationEvents(rules, before, after)[0]?.isFinal).toBe(true);
    });
    it('ignores no-crossing edits and resolved Inquests', () => {
        const before = [createInquest('q', { investigationPoints: 100 })];
        expect(inquestRevelationEvents(rules, before, [createInquest('q', { investigationPoints: 200 })])).toEqual([]);
        expect(inquestRevelationEvents(rules, before, [createInquest('q', { investigationPoints: 400, status: 'goalsMet' })])).toEqual([]);
    });
    it('counts a new Inquest from 0 IP', () => {
        expect(inquestRevelationEvents(rules, [], [createInquest('n', { investigationPoints: 300 })])).toHaveLength(1);
    });
});

describe('inquestProgress', () => {
    it('summarises points, Revelations and percent', () => {
        expect(inquestProgress(rules, createInquest('q', { scope: 'majoris', investigationPoints: 450 }))).toEqual({
            required: 900,
            thresholds: [300, 600, 900],
            revelationsReached: 1,
            revelationCount: 3,
            nextThreshold: 600,
            percent: 50,
        });
    });
    it('caps percent at 100 and reports no next threshold once complete', () => {
        const p = inquestProgress(rules, createInquest('q', { scope: 'minoris', investigationPoints: 700 }));
        expect(p.percent).toBe(100);
        expect(p.nextThreshold).toBeNull();
    });
});
