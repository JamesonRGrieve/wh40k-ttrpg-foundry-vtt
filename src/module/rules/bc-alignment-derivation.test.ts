/**
 * Unit coverage for BC Alignment derivation (#173).
 *
 * RAW sources (`.pdf/bc/core/core.md`):
 *   - "The Five Alignments" / Aligned definition: :2549, :2559
 *   - "Checking Alignment" 10-CP re-check: :2569
 *   - Archetype-granted advance exclusion: :2561
 *   - Khorne psyker lock: :2750
 */
import { describe, expect, it } from 'vitest';
import {
    type ChaosAdvanceEntry,
    deriveAlignmentFromTally,
    nextAlignmentCheckpoint,
    psykerLockedByAlignment,
    shouldRecheckAlignment,
    tallyAdvancesByAlignment,
} from './bc-alignment-derivation.ts';

function advance(alignment: ChaosAdvanceEntry['alignment'], fromArchetype = false, key = 'k'): ChaosAdvanceEntry {
    return { category: 'skill', key, xpCost: 100, alignment, fromArchetype };
}

describe('tallyAdvancesByAlignment (core.md :2559, :2561)', () => {
    it('counts non-archetype advances per god', () => {
        const tally = tallyAdvancesByAlignment([advance('khorne'), advance('khorne'), advance('nurgle'), advance('slaanesh'), advance('tzeentch')]);
        expect(tally).toEqual({ khorne: 2, nurgle: 1, slaanesh: 1, tzeentch: 1 });
    });

    it('excludes advances marked fromArchetype (core.md :2561)', () => {
        const tally = tallyAdvancesByAlignment([
            advance('khorne', true), // free Archetype bonus — ignored
            advance('khorne'),
            advance('nurgle'),
            advance('nurgle', true), // free Archetype bonus — ignored
        ]);
        expect(tally).toEqual({ khorne: 1, nurgle: 1, slaanesh: 0, tzeentch: 0 });
    });

    it('excludes unaligned advances entirely', () => {
        const tally = tallyAdvancesByAlignment([advance('unaligned'), advance('unaligned'), advance('khorne')]);
        expect(tally).toEqual({ khorne: 1, nurgle: 0, slaanesh: 0, tzeentch: 0 });
    });

    it('returns all zeros for an empty log', () => {
        expect(tallyAdvancesByAlignment([])).toEqual({ khorne: 0, nurgle: 0, slaanesh: 0, tzeentch: 0 });
    });
});

describe('deriveAlignmentFromTally — 5-over-next-highest rule (core.md :2559)', () => {
    it('returns unaligned when no god leads by 5+ advances', () => {
        // Largest gap = 4, below threshold.
        expect(deriveAlignmentFromTally({ khorne: 6, nurgle: 2, slaanesh: 0, tzeentch: 0 })).toBe('unaligned');
    });

    it('flips to a god exactly when the gap to the runner-up hits 5', () => {
        // Khorne 5, Nurgle 0 → gap 5 → Khorne (boundary case).
        expect(deriveAlignmentFromTally({ khorne: 5, nurgle: 0, slaanesh: 0, tzeentch: 0 })).toBe('khorne');
        // Khorne 5, Nurgle 1 → gap 4 → still unaligned.
        expect(deriveAlignmentFromTally({ khorne: 5, nurgle: 1, slaanesh: 0, tzeentch: 0 })).toBe('unaligned');
    });

    it('uses the second-place god (not summed others) as the comparison', () => {
        // Slaanesh 12, Tzeentch 8, others 0 → gap 4 → unaligned (not affected by other gods being 0).
        expect(deriveAlignmentFromTally({ khorne: 0, nurgle: 0, slaanesh: 12, tzeentch: 8 })).toBe('unaligned');
        // Slaanesh 13, Tzeentch 8 → gap 5 → Slaanesh.
        expect(deriveAlignmentFromTally({ khorne: 0, nurgle: 0, slaanesh: 13, tzeentch: 8 })).toBe('slaanesh');
    });

    it('treats a tie at the top as Unaligned', () => {
        // Both gods at 10: gap 0 → no lead → unaligned.
        expect(deriveAlignmentFromTally({ khorne: 10, nurgle: 10, slaanesh: 0, tzeentch: 0 })).toBe('unaligned');
    });

    it('returns unaligned at zero tally', () => {
        expect(deriveAlignmentFromTally({ khorne: 0, nurgle: 0, slaanesh: 0, tzeentch: 0 })).toBe('unaligned');
    });
});

describe('shouldRecheckAlignment / nextAlignmentCheckpoint (core.md :2569)', () => {
    it('does not fire before the first 10-CP threshold', () => {
        expect(shouldRecheckAlignment(0, 0)).toBe(false);
        expect(shouldRecheckAlignment(9, 0)).toBe(false);
    });

    it('fires when a new 10-CP threshold has been crossed', () => {
        // At 10 CP, last checkpoint 0 → currentThreshold 10 > 0 → fire.
        expect(shouldRecheckAlignment(10, 0)).toBe(true);
        expect(shouldRecheckAlignment(27, 20)).toBe(false); // floor(27/10)*10 = 20, not greater
        expect(shouldRecheckAlignment(30, 20)).toBe(true);
    });

    it('does not fire again until the next threshold is crossed', () => {
        expect(shouldRecheckAlignment(15, 10)).toBe(false);
        expect(shouldRecheckAlignment(19, 10)).toBe(false);
        expect(shouldRecheckAlignment(20, 10)).toBe(true);
    });

    it('rounds the next checkpoint down to a 10-CP multiple', () => {
        expect(nextAlignmentCheckpoint(0)).toBe(0);
        expect(nextAlignmentCheckpoint(9)).toBe(0);
        expect(nextAlignmentCheckpoint(10)).toBe(10);
        expect(nextAlignmentCheckpoint(27)).toBe(20);
        expect(nextAlignmentCheckpoint(30)).toBe(30);
    });
});

describe('psykerLockedByAlignment (core.md :2750)', () => {
    it('locks psykers iff Aligned to Khorne', () => {
        expect(psykerLockedByAlignment('khorne')).toBe(true);
        expect(psykerLockedByAlignment('nurgle')).toBe(false);
        expect(psykerLockedByAlignment('slaanesh')).toBe(false);
        expect(psykerLockedByAlignment('tzeentch')).toBe(false);
        expect(psykerLockedByAlignment('unaligned')).toBe(false);
    });
});
