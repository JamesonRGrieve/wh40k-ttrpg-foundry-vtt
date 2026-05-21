import { describe, expect, it } from 'vitest';
import { DISORDERS_TABLE, type DisorderId, getDisorder, listDisordersBySeverity, rollDisorder } from './disorders-table';

describe('DISORDERS_TABLE (#116)', () => {
    it('has between 8 and 10 canonical entries', () => {
        expect(DISORDERS_TABLE.length).toBeGreaterThanOrEqual(8);
        expect(DISORDERS_TABLE.length).toBeLessThanOrEqual(10);
    });

    it('every entry declares at least one severity', () => {
        for (const d of DISORDERS_TABLE) {
            expect(d.severities.length).toBeGreaterThanOrEqual(1);
        }
    });

    it('entry ids are unique', () => {
        const ids = new Set(DISORDERS_TABLE.map((d) => d.id));
        expect(ids.size).toBe(DISORDERS_TABLE.length);
    });

    it('every severity tier has at least one disorder', () => {
        expect(listDisordersBySeverity('minor').length).toBeGreaterThanOrEqual(1);
        expect(listDisordersBySeverity('severe').length).toBeGreaterThanOrEqual(1);
        expect(listDisordersBySeverity('acute').length).toBeGreaterThanOrEqual(1);
    });

    it('includes the canonical core-rulebook entries', () => {
        const ids = new Set(DISORDERS_TABLE.map((d) => d.id));
        for (const expected of ['phobia', 'paranoia', 'delusion', 'catatonia'] satisfies DisorderId[]) {
            expect(ids.has(expected)).toBe(true);
        }
    });
});

describe('getDisorder (#116)', () => {
    it('returns the matching entry by id', () => {
        const d = getDisorder('phobia');
        expect(d).not.toBeNull();
        expect(d?.id).toBe('phobia');
    });

    it('returns null for unknown ids', () => {
        expect(getDisorder('ghost-of-titan')).toBeNull();
    });
});

describe('listDisordersBySeverity (#116)', () => {
    it('only returns entries declaring the given tier', () => {
        for (const d of listDisordersBySeverity('acute')) {
            expect(d.severities).toContain('acute');
        }
    });

    it('returns a fresh array (callers can mutate safely)', () => {
        const a = listDisordersBySeverity('minor');
        const b = listDisordersBySeverity('minor');
        expect(a).not.toBe(b);
    });
});

describe('rollDisorder (#116)', () => {
    it('returns an entry from the requested tier', () => {
        const d = rollDisorder('minor', () => 0);
        expect(d).not.toBeNull();
        expect(d?.severities).toContain('minor');
    });

    it('is deterministic given a seeded rng', () => {
        const a = rollDisorder('severe', () => 0.5);
        const b = rollDisorder('severe', () => 0.5);
        expect(a?.id).toBe(b?.id);
    });

    it('hits the last bucket for rng near 1', () => {
        const pool = listDisordersBySeverity('minor');
        const result = rollDisorder('minor', () => 0.999999);
        expect(result?.id).toBe(pool[pool.length - 1]?.id);
    });

    it('hits the first bucket for rng = 0', () => {
        const pool = listDisordersBySeverity('minor');
        const result = rollDisorder('minor', () => 0);
        expect(result?.id).toBe(pool[0]?.id);
    });

    it('handles non-finite rng output by treating it as 0', () => {
        const pool = listDisordersBySeverity('severe');
        const result = rollDisorder('severe', () => Number.NaN);
        expect(result?.id).toBe(pool[0]?.id);
    });
});
