/**
 * Tests for the Cogitator Terminal's pure record/presentation logic.
 */

import { describe, expect, it } from 'vitest';
import { buildTerminalIndex, findRecordById, isInternalRecord, resolveActiveRecord, type CogitatorRecordItem } from './cogitator-records.ts';

const RESTRICTED = '▓ RESTRICTED ▓';

/** Build a record with sane defaults; override any field per test. */
function record(overrides: Partial<CogitatorRecordItem> & { uuid: string; name: string }): CogitatorRecordItem {
    return {
        id: overrides.id ?? overrides.uuid,
        uuid: overrides.uuid,
        name: overrides.name,
        body: overrides.body ?? `<p>${overrides.name} body</p>`,
        sort: overrides.sort ?? 0,
        accessible: overrides.accessible ?? true,
    };
}

describe('buildTerminalIndex', () => {
    it('orders by sort weight, then name', () => {
        const records = [
            record({ uuid: 'Item.c', name: 'Charlie', sort: 200 }),
            record({ uuid: 'Item.a', name: 'Alpha', sort: 100 }),
            record({ uuid: 'Item.b', name: 'Bravo', sort: 100 }),
        ];
        const index = buildTerminalIndex(records, { activeUuid: null, restrictedLabel: RESTRICTED });
        expect(index.map((e) => e.uuid)).toEqual(['Item.a', 'Item.b', 'Item.c']);
    });

    it('shows a redacted label for records the viewer cannot read', () => {
        const records = [record({ uuid: 'Item.secret', name: 'Sealed File', accessible: false })];
        const index = buildTerminalIndex(records, { activeUuid: null, restrictedLabel: RESTRICTED });
        expect(index[0]?.label).toBe(RESTRICTED);
        expect(index[0]?.accessible).toBe(false);
    });

    it('keeps the real name for accessible records', () => {
        const records = [record({ uuid: 'Item.open', name: 'Open File', accessible: true })];
        const index = buildTerminalIndex(records, { activeUuid: null, restrictedLabel: RESTRICTED });
        expect(index[0]?.label).toBe('Open File');
    });

    it('omits restricted records entirely when hideRestricted is set', () => {
        const records = [record({ uuid: 'Item.open', name: 'Open', accessible: true }), record({ uuid: 'Item.sealed', name: 'Sealed', accessible: false })];
        const index = buildTerminalIndex(records, { activeUuid: null, restrictedLabel: RESTRICTED, hideRestricted: true });
        expect(index.map((e) => e.uuid)).toEqual(['Item.open']);
    });

    it('marks the active record', () => {
        const records = [record({ uuid: 'Item.a', name: 'Alpha' }), record({ uuid: 'Item.b', name: 'Bravo' })];
        const index = buildTerminalIndex(records, { activeUuid: 'Item.b', restrictedLabel: RESTRICTED });
        expect(index.find((e) => e.uuid === 'Item.b')?.active).toBe(true);
        expect(index.find((e) => e.uuid === 'Item.a')?.active).toBe(false);
    });

    it('does not mutate the input array order', () => {
        const records = [record({ uuid: 'Item.z', name: 'Zeta', sort: 300 }), record({ uuid: 'Item.a', name: 'Alpha', sort: 100 })];
        buildTerminalIndex(records, { activeUuid: null, restrictedLabel: RESTRICTED });
        expect(records.map((r) => r.uuid)).toEqual(['Item.z', 'Item.a']);
    });
});

describe('findRecordById', () => {
    it('finds by terminal id', () => {
        const records = [record({ id: 'x1', uuid: 'Item.x', name: 'X' })];
        expect(findRecordById(records, 'x1')?.uuid).toBe('Item.x');
    });
    it('returns undefined for an unknown id', () => {
        expect(findRecordById([], 'nope')).toBeUndefined();
    });
});

describe('isInternalRecord', () => {
    const uuids = ['Item.a', 'Item.b'];
    it('is true for a UUID in the terminal set', () => {
        expect(isInternalRecord('Item.a', uuids)).toBe(true);
    });
    it('is false for a UUID outside the set (falls through to Foundry)', () => {
        expect(isInternalRecord('Actor.npc', uuids)).toBe(false);
    });
});

describe('resolveActiveRecord', () => {
    const records = [
        record({ uuid: 'Item.open', name: 'Open', body: '<p>hi</p>', accessible: true }),
        record({ uuid: 'Item.sealed', name: 'Sealed', accessible: false }),
    ];

    it('returns null for the landing screen (no active record)', () => {
        expect(resolveActiveRecord(records, null)).toBeNull();
    });

    it('returns null when the active UUID is not in the set', () => {
        expect(resolveActiveRecord(records, 'Item.ghost')).toBeNull();
    });

    it('returns the body for an accessible record', () => {
        const view = resolveActiveRecord(records, 'Item.open');
        expect(view).toEqual({ name: 'Open', body: '<p>hi</p>', accessible: true });
    });

    it('returns a null body (→ REDACTED) for a restricted record, without leaking its content', () => {
        const view = resolveActiveRecord(records, 'Item.sealed');
        expect(view?.accessible).toBe(false);
        expect(view?.body).toBeNull();
    });
});
