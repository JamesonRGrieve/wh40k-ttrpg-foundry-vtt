import { describe, expect, it } from 'vitest';
import { buildWoundTransition, woundTransitionRows } from './wound-transition.ts';

const state = (wounds: number, critical = 0, max = 12, fatigue?: number) => ({
    wounds: { value: wounds, max, critical },
    ...(fatigue === undefined ? {} : { fatigue: { value: fatigue, max: 6 } }),
});

describe('buildWoundTransition (#504)', () => {
    it('records the wound transition with max for context', () => {
        const t = buildWoundTransition(state(12), { damageTaken: 8, criticalTaken: 0 });
        expect(t.wounds).toEqual({ before: 12, after: 4, max: 12 });
        expect(t.critical).toBeUndefined();
    });

    it('splits an overflow hit into the wound portion and the critical portion', () => {
        // The case the card could not previously distinguish: 2 wounds left,
        // 6 damage → 2 absorbed, 4 overflow into critical.
        const t = buildWoundTransition(state(2, 1), { damageTaken: 2, criticalTaken: 4 });
        expect(t.wounds).toEqual({ before: 2, after: 0, max: 12 });
        expect(t.critical).toEqual({ before: 1, after: 5 });
        expect(t.damageTaken).toBe(2);
        expect(t.criticalTaken).toBe(4);
    });

    it('omits the critical row entirely when nothing overflowed', () => {
        // An unconditional "critical +0" would be noise on most cards.
        expect(buildWoundTransition(state(12), { damageTaken: 3, criticalTaken: 0 }).critical).toBeUndefined();
    });

    it('records fatigue only when some was applied and the actor tracks it', () => {
        expect(buildWoundTransition(state(12, 0, 12, 1), { damageTaken: 1, criticalTaken: 0, fatigueTaken: 2 }).fatigue).toEqual({
            before: 1,
            after: 3,
            max: 6,
        });
        expect(buildWoundTransition(state(12, 0, 12, 1), { damageTaken: 1, criticalTaken: 0 }).fatigue).toBeUndefined();
        // No fatigue track on the actor → nothing recorded, no throw.
        expect(buildWoundTransition(state(12), { damageTaken: 1, criticalTaken: 0, fatigueTaken: 2 }).fatigue).toBeUndefined();
    });

    it('is a snapshot of the state passed in, so a later hit cannot rewrite it', () => {
        // The acceptance's load-bearing requirement: the card stores values, it
        // does not recompute them from the actor's CURRENT state.
        const before = state(12);
        const first = buildWoundTransition(before, { damageTaken: 8, criticalTaken: 0 });
        // A second hit lands; the actor moves on.
        buildWoundTransition(state(4), { damageTaken: 4, criticalTaken: 0 });
        expect(first.wounds).toEqual({ before: 12, after: 4, max: 12 });
    });

    it('tolerates absent / non-finite tracked values rather than emitting NaN', () => {
        const t = buildWoundTransition({ wounds: { value: Number.NaN, critical: Number.NaN } }, { damageTaken: 3, criticalTaken: 2 });
        expect(t.wounds).toEqual({ before: 0, after: -3, max: undefined });
        expect(t.critical).toEqual({ before: 0, after: 2 });
    });

    it('records a negative after-value rather than clamping — the overflow is the point', () => {
        const t = buildWoundTransition(state(2), { damageTaken: 2, criticalTaken: 6 });
        expect(t.wounds.after).toBe(0);
        expect(t.criticalTaken).toBe(6);
    });
});

describe('woundTransitionRows', () => {
    it('renders `before → after / max` for the tooltip payload', () => {
        const rows = woundTransitionRows(buildWoundTransition(state(12), { damageTaken: 8, criticalTaken: 0 }));
        expect(rows).toEqual([{ name: 'Wounds', value: '12 → 4 / 12' }]);
    });

    it('renders the split as two rows, with the critical delta spelled out', () => {
        const rows = woundTransitionRows(buildWoundTransition(state(2, 1), { damageTaken: 2, criticalTaken: 4 }));
        expect(rows).toEqual([
            { name: 'Wounds', value: '2 → 0 / 12' },
            { name: 'Critical', value: '1 → 5 (+4)' },
        ]);
    });

    it('drops the max segment when the track is unbounded', () => {
        const rows = woundTransitionRows(buildWoundTransition({ wounds: { value: 5, critical: 0 } }, { damageTaken: 2, criticalTaken: 0 }));
        expect(rows).toEqual([{ name: 'Wounds', value: '5 → 3' }]);
    });
});
