import { describe, expect, it } from 'vitest';
import {
    adjustPactDisposition,
    DARK_PACT_FLAG,
    type DarkPactEntry,
    type DarkPactTerms,
    holdsPact,
    isFromPact,
    newPactRecord,
    PACT_ENTRY_KINDS,
    pactEntryChoices,
    pactEntryEffectData,
    pactEntryRefOf,
    type PactRecord,
    startingDaemonDisposition,
    togglePactEntry,
} from './dark-pact';
import { DISPOSITION_MODELS } from './disposition';

/** A Daemon's Disposition is the DH2 characteristic one (#73). */
const DISPOSITION_SCALE = DISPOSITION_MODELS.characteristic;

/**
 * Dark Pacts (#84, Enemies Beyond pp. 72–76). Every pact-specific number is the
 * pact item's data; these tests feed the terms the book prints for every example
 * pact ("15+ the character's Corruption total", Hard (−20) bargaining) and check
 * the content-agnostic plumbing.
 */
const BOOK_TERMS: DarkPactTerms = { dispositionBase: 15, addsCorruption: true, testModifier: -20 };
const PACT = 'Compendium.wh40k-rpg.dh2-beyond-items-dark-pacts.Item.EB2PactMight0001';

function entry(identifier: string, modifiers: DarkPactEntry['modifiers'] = {}): DarkPactEntry {
    return { identifier, name: identifier, description: '', modifiers, grants: [] };
}

describe('startingDaemonDisposition (#84)', () => {
    it("is the base plus the character's Corruption when the terms add it", () => {
        expect(startingDaemonDisposition(BOOK_TERMS, 0)).toBe(15);
        expect(startingDaemonDisposition(BOOK_TERMS, 23)).toBe(38);
    });

    it('ignores Corruption when the terms do not add it', () => {
        expect(startingDaemonDisposition({ ...BOOK_TERMS, addsCorruption: false }, 40)).toBe(15);
    });

    it('stays on the 0–100 characteristic scale', () => {
        expect(startingDaemonDisposition(BOOK_TERMS, 120)).toBe(DISPOSITION_SCALE.max);
        expect(startingDaemonDisposition({ ...BOOK_TERMS, dispositionBase: -5, addsCorruption: false }, 0)).toBe(DISPOSITION_SCALE.min);
    });

    it('treats negative or fractional Corruption as whole, non-negative points', () => {
        expect(startingDaemonDisposition(BOOK_TERMS, -10)).toBe(15);
        expect(startingDaemonDisposition(BOOK_TERMS, 4.9)).toBe(19);
    });
});

describe('adjustPactDisposition (#84)', () => {
    it('applies the delta', () => {
        expect(adjustPactDisposition(38, 1)).toBe(39);
        expect(adjustPactDisposition(38, -1)).toBe(37);
    });

    it('clamps to 0–100', () => {
        expect(adjustPactDisposition(99, 5)).toBe(100);
        expect(adjustPactDisposition(1, -5)).toBe(0);
    });

    it('truncates fractional values', () => {
        expect(adjustPactDisposition(10, 1.7)).toBe(11);
        expect(adjustPactDisposition(10.6, 0)).toBe(10);
    });
});

describe('newPactRecord / holdsPact (#84)', () => {
    it('starts undiscovered, paid up, with no entries chosen and the starting Disposition', () => {
        expect(newPactRecord(PACT, BOOK_TERMS, 12)).toEqual({
            pactUuid: PACT,
            discovered: false,
            disposition: 27,
            paymentCurrent: true,
            boons: [],
            banes: [],
        } satisfies PactRecord);
    });

    it('finds a held pact by UUID', () => {
        const records = [newPactRecord(PACT, BOOK_TERMS, 0)];
        expect(holdsPact(records, PACT)).toBe(true);
        expect(holdsPact(records, 'Compendium.wh40k-rpg.dh2-beyond-items-dark-pacts.Item.EB2PactPower0001')).toBe(false);
        expect(holdsPact([], PACT)).toBe(false);
    });
});

describe('pactEntryChoices / togglePactEntry (#84)', () => {
    const entries = [entry('mighty'), entry('lord-of-battle'), entry('reaver')];

    it("splits a pact's entries into taken and still on offer, in authored order", () => {
        const { taken, available } = pactEntryChoices(entries, ['reaver', 'mighty']);
        expect(taken.map((e) => e.identifier)).toEqual(['mighty', 'reaver']);
        expect(available.map((e) => e.identifier)).toEqual(['lord-of-battle']);
    });

    it('ignores chosen identifiers the pact no longer has', () => {
        expect(pactEntryChoices(entries, ['gone']).taken).toEqual([]);
    });

    it('adds and removes one kind without touching the other', () => {
        const record = newPactRecord(PACT, BOOK_TERMS, 0);
        const added = togglePactEntry(record, 'boons', 'mighty');
        expect(added.boons).toEqual(['mighty']);
        expect(added.banes).toEqual([]);
        expect(record.boons).toEqual([]);
        const bane = togglePactEntry(added, 'banes', 'blood-rage');
        expect(bane).toMatchObject({ boons: ['mighty'], banes: ['blood-rage'] });
        expect(togglePactEntry(bane, 'boons', 'mighty').boons).toEqual([]);
    });

    it('names both kinds', () => {
        expect(PACT_ENTRY_KINDS).toEqual(['boons', 'banes']);
    });
});

describe('pactEntryEffectData (#84)', () => {
    const ref = { pactUuid: PACT, kind: 'boons' as const, entry: 'lord-of-battle' };

    it("projects an entry's modifiers through the central ActiveEffect path", () => {
        const effect = pactEntryEffectData(ref, entry('lord-of-battle', { characteristics: { weaponSkill: 5 } }), 'pentacle.svg');
        expect(effect).toEqual({
            name: 'lord-of-battle',
            img: 'pentacle.svg',
            origin: PACT,
            changes: [{ key: 'system.characteristics.weaponSkill.modifier', mode: 2, value: 5 }],
            flags: { 'wh40k-rpg': { [DARK_PACT_FLAG]: ref } },
        });
    });

    it("carries a Bane's penalty as a negative change", () => {
        const effect = pactEntryEffectData({ ...ref, kind: 'banes', entry: 'detached' }, entry('detached', { characteristics: { fellowship: -10 } }), '');
        expect(effect?.changes).toEqual([{ key: 'system.characteristics.fellowship.modifier', mode: 2, value: -10 }]);
    });

    it('is null for an entry with no modifiers (narrative, or grants only)', () => {
        expect(pactEntryEffectData(ref, entry('reaver'), '')).toBeNull();
        expect(pactEntryEffectData(ref, entry('zero', { characteristics: { strength: 0 } }), '')).toBeNull();
    });
});

describe('pactEntryRefOf / isFromPact (#84)', () => {
    const flags = { 'wh40k-rpg': { [DARK_PACT_FLAG]: { pactUuid: PACT, kind: 'banes', entry: 'blood-rage' } } };

    it('reads the entry a document came from', () => {
        expect(pactEntryRefOf(flags)).toEqual({ pactUuid: PACT, kind: 'banes', entry: 'blood-rage' });
    });

    it('rejects missing or malformed flags', () => {
        expect(pactEntryRefOf(null)).toBeNull();
        expect(pactEntryRefOf(undefined)).toBeNull();
        expect(pactEntryRefOf({})).toBeNull();
        expect(pactEntryRefOf({ 'wh40k-rpg': {} })).toBeNull();
        expect(pactEntryRefOf({ 'wh40k-rpg': { [DARK_PACT_FLAG]: { pactUuid: PACT, kind: 'curses', entry: 'x' } } })).toBeNull();
        expect(pactEntryRefOf({ 'wh40k-rpg': { [DARK_PACT_FLAG]: { pactUuid: 7, kind: 'boons', entry: 'x' } } })).toBeNull();
    });

    it('matches by pact, then optionally by kind and entry', () => {
        expect(isFromPact(flags, PACT)).toBe(true);
        expect(isFromPact(flags, PACT, 'banes')).toBe(true);
        expect(isFromPact(flags, PACT, 'banes', 'blood-rage')).toBe(true);
        expect(isFromPact(flags, PACT, 'boons')).toBe(false);
        expect(isFromPact(flags, PACT, 'banes', 'bloodthirsty')).toBe(false);
        expect(isFromPact(flags, 'Compendium.other')).toBe(false);
        expect(isFromPact({}, PACT)).toBe(false);
    });
});
