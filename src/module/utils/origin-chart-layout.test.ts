import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OriginChartLayout } from './origin-chart-layout.ts';

/**
 * Coverage for the origin-chart layout algorithm: the positional connectivity
 * rule (a confirmed selection opens positions ±1, clamped 0–8; an origin is
 * reachable if ANY of its positions intersect), card grid placement, guided-mode
 * disabling, requirement gating, and most-recent-selection resolution. The only
 * Foundry coupling is the i18n step label, stubbed here.
 */

type Origin = Parameters<typeof OriginChartLayout.resolvePathPositions>[0];

function origin(opts: {
    id?: string;
    step?: string;
    primaryPosition?: number;
    positions?: number[];
    identifier?: string;
    previousSteps?: string[];
    excludedSteps?: string[];
}): Origin {
    return {
        id: opts.id ?? 'o',
        name: opts.id ?? 'o',
        system: {
            ...(opts.step !== undefined ? { step: opts.step } : {}),
            ...(opts.primaryPosition !== undefined ? { primaryPosition: opts.primaryPosition } : {}),
            ...(opts.positions !== undefined ? { positions: opts.positions } : {}),
            ...(opts.identifier !== undefined ? { identifier: opts.identifier } : {}),
            requirements: {
                ...(opts.previousSteps !== undefined ? { previousSteps: opts.previousSteps } : {}),
                ...(opts.excludedSteps !== undefined ? { excludedSteps: opts.excludedSteps } : {}),
            },
        },
    };
}

beforeEach(() => {
    vi.stubGlobal('game', { i18n: { localize: (key: string): string => key } });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('OriginChartLayout._getAllowedPositions', () => {
    it('is null without a prior selection', () => {
        expect(OriginChartLayout._getAllowedPositions(null)).toBeNull();
    });

    it('opens position ±1 around the selection', () => {
        const allowed = OriginChartLayout._getAllowedPositions(origin({ positions: [4] }));
        expect([...(allowed ?? [])].sort((a, b) => a - b)).toEqual([3, 4, 5]);
    });

    it('clamps at the low edge (no -1 below 0)', () => {
        const allowed = OriginChartLayout._getAllowedPositions(origin({ positions: [0] }));
        expect([...(allowed ?? [])].sort((a, b) => a - b)).toEqual([0, 1]);
    });

    it('clamps at the high edge (no +1 above 8)', () => {
        const allowed = OriginChartLayout._getAllowedPositions(origin({ positions: [8] }));
        expect([...(allowed ?? [])].sort((a, b) => a - b)).toEqual([7, 8]);
    });

    it('unions the windows of a multi-position selection', () => {
        const allowed = OriginChartLayout._getAllowedPositions(origin({ positions: [2, 5] }));
        expect([...(allowed ?? [])].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    });
});

describe('OriginChartLayout._isPositionAllowed', () => {
    it('is true when there is no constraint set', () => {
        expect(OriginChartLayout._isPositionAllowed(origin({ positions: [7] }), null)).toBe(true);
    });

    it('is true when any origin position intersects the allowed set', () => {
        expect(OriginChartLayout._isPositionAllowed(origin({ positions: [5, 7] }), new Set([3, 4, 5]))).toBe(true);
    });

    it('is false when no origin position intersects', () => {
        expect(OriginChartLayout._isPositionAllowed(origin({ positions: [7] }), new Set([3, 4, 5]))).toBe(false);
    });
});

describe('OriginChartLayout.resolvePathPositions', () => {
    it('returns the origin positions when there is no prior selection', () => {
        expect(OriginChartLayout.resolvePathPositions(origin({ positions: [2, 6] }), null)).toEqual([2, 6]);
    });

    it('narrows to the positions that intersect the allowed window', () => {
        const last = origin({ positions: [4] }); // opens {3,4,5}
        expect(OriginChartLayout.resolvePathPositions(origin({ positions: [4, 8] }), last)).toEqual([4]);
    });

    it('falls back to the full positions when none intersect', () => {
        const last = origin({ positions: [0] }); // opens {0,1}
        expect(OriginChartLayout.resolvePathPositions(origin({ positions: [7, 8] }), last)).toEqual([7, 8]);
    });
});

describe('OriginChartLayout._getLastSelection', () => {
    const stepOrder = ['s0', 's1', 's2'];

    it('forward: returns the nearest prior selected step', () => {
        const selections = new Map([
            ['s0', origin({ id: 'a' })],
            ['s1', origin({ id: 'b' })],
        ]);
        expect(OriginChartLayout._getLastSelection(2, selections, 'forward', stepOrder)?.id).toBe('b');
    });

    it('forward: returns null when nothing earlier is selected', () => {
        const selections = new Map([['s2', origin({ id: 'c' })]]);
        expect(OriginChartLayout._getLastSelection(0, selections, 'forward', stepOrder)).toBeNull();
    });

    it('backward: returns the nearest later selected step', () => {
        const selections = new Map([
            ['s1', origin({ id: 'b' })],
            ['s2', origin({ id: 'c' })],
        ]);
        expect(OriginChartLayout._getLastSelection(0, selections, 'backward', stepOrder)?.id).toBe('b');
    });
});

type Chart = ReturnType<typeof OriginChartLayout.computeFullChart>;
type Card = Chart['steps'][number]['cards'][number];

// Look cards up by id rather than by index: `.find()` returns `Card | undefined`
// in both tsconfig variants, so the `?.` on the result is genuinely necessary
// and doesn't trip the noUncheckedIndexedAccess parser mismatch that bare
// `chart.steps[i]?.cards[j]` indexing would.
function cardById(chart: Chart, id: string): Card | undefined {
    return chart.steps.flatMap((s) => s.cards).find((c) => c.id === id);
}

function stepByKey(chart: Chart, key: string): Chart['steps'][number] | undefined {
    return chart.steps.find((s) => s.stepKey === key);
}

describe('OriginChartLayout.computeFullChart', () => {
    const stepKeys = ['homeWorld', 'background'];

    function chartWithSelectedHomeWorld(): { hw: Origin; bgNear: Origin; bgFar: Origin; selections: Map<string, Origin> } {
        const hw = origin({ id: 'hw', step: 'homeWorld', primaryPosition: 4, positions: [4], identifier: 'hive' });
        const bgNear = origin({ id: 'bgNear', step: 'background', primaryPosition: 4, positions: [4] });
        const bgFar = origin({ id: 'bgFar', step: 'background', primaryPosition: 8, positions: [8] });
        const selections = new Map([['homeWorld', hw]]);
        return { hw, bgNear, bgFar, selections };
    }

    it('places cards on a position+1 / step+1 grid and tracks maxColumns', () => {
        const { hw, bgNear, bgFar, selections } = chartWithSelectedHomeWorld();
        const chart = OriginChartLayout.computeFullChart([hw, bgNear, bgFar], selections, true, 'forward', stepKeys);

        expect(chart.steps).toHaveLength(2);
        const hwCard = cardById(chart, 'hw');
        expect(hwCard?.gridColumn).toBe(5); // position 4 + 1
        expect(hwCard?.gridRow).toBe(1); // stepIndex 0 + 1
        expect(hwCard?.isSelected).toBe(true);
        // maxColumns covers the position-8 card: 8 + 1 = 9
        expect(chart.maxColumns).toBe(9);
        expect(stepByKey(chart, 'homeWorld')?.hasSelection).toBe(true);
    });

    it('guided mode disables an origin disconnected from the prior selection', () => {
        const { hw, bgNear, bgFar, selections } = chartWithSelectedHomeWorld();
        const chart = OriginChartLayout.computeFullChart([hw, bgNear, bgFar], selections, true, 'forward', stepKeys);

        const near = cardById(chart, 'bgNear');
        const far = cardById(chart, 'bgFar');
        expect(near?.isSelectable).toBe(true);
        expect(near?.isDisabled).toBe(false);
        expect(far?.isSelectable).toBe(false);
        expect(far?.isDisabled).toBe(true);
    });

    it('non-guided mode leaves every origin selectable', () => {
        const { hw, bgNear, bgFar, selections } = chartWithSelectedHomeWorld();
        const chart = OriginChartLayout.computeFullChart([hw, bgNear, bgFar], selections, false, 'forward', stepKeys);

        for (const card of stepByKey(chart, 'background')?.cards ?? []) {
            expect(card.isSelectable).toBe(true);
            expect(card.isDisabled).toBe(false);
        }
    });

    it('requirements gate selectability: previousSteps must include the last identifier', () => {
        const hw = origin({ id: 'hw', step: 'homeWorld', primaryPosition: 4, positions: [4], identifier: 'hive' });
        // positionally reachable, but requires a different prior step
        const gated = origin({ id: 'gated', step: 'background', primaryPosition: 4, positions: [4], previousSteps: ['voidborn'] });
        const selections = new Map([['homeWorld', hw]]);
        const chart = OriginChartLayout.computeFullChart([hw, gated], selections, true, 'forward', stepKeys);

        expect(cardById(chart, 'gated')?.isSelectable).toBe(false);
    });

    it('requirements gate selectability: excludedSteps blocks the last identifier', () => {
        const hw = origin({ id: 'hw', step: 'homeWorld', primaryPosition: 4, positions: [4], identifier: 'hive' });
        const excluded = origin({ id: 'excluded', step: 'background', primaryPosition: 4, positions: [4], excludedSteps: ['hive'] });
        const selections = new Map([['homeWorld', hw]]);
        const chart = OriginChartLayout.computeFullChart([hw, excluded], selections, true, 'forward', stepKeys);

        expect(cardById(chart, 'excluded')?.isSelectable).toBe(false);
    });
});
