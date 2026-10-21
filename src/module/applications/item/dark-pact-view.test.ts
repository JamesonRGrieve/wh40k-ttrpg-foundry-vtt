import { describe, expect, it } from 'vitest';
import type { DarkPactEntry, PactRecord } from '../../rules/dark-pact';
import { darkPactPanelView, darkPactSheetView, pactEntryMechanics, pactEntryView, type PactDefinitionView } from './dark-pact-view';

/** Dark Pacts display models (#84): the pact item sheet and the actor's panel. */
const MIGHT = 'Compendium.wh40k-rpg.dh2-beyond-items-dark-pacts.Item.EB2PactMight0001';
const POWER = 'Compendium.wh40k-rpg.dh2-beyond-items-dark-pacts.Item.EB2PactPower0001';
const UNNATURAL = 'Compendium.wh40k-rpg.dh2-core-items-traits.Item.UnnatCharDh2TrX1';
const FRENZY = 'Compendium.wh40k-rpg.dh2-core-items-talents.Item.DH2aTlnt00000011';

function entry(identifier: string, extra: Partial<DarkPactEntry> = {}): DarkPactEntry {
    return { identifier, name: identifier.toUpperCase(), description: `<p>${identifier}</p>`, modifiers: {}, grants: [], ...extra };
}

const mighty = entry('mighty', { grants: [{ uuid: UNNATURAL, specialization: 'Strength', level: 2 }] });
const lordOfBattle = entry('lord-of-battle', { modifiers: { characteristics: { weaponSkill: 5 } } });
const reaver = entry('reaver', { grants: [{ uuid: FRENZY, specialization: '', level: null }] });
const bloodRage = entry('blood-rage');
const might: PactDefinitionView = { boons: [mighty, lordOfBattle, reaver], banes: [bloodRage] };

function record(pactUuid: string, extra: Partial<PactRecord> = {}): PactRecord {
    return { pactUuid, discovered: false, disposition: 30, paymentCurrent: true, boons: [], banes: [], ...extra };
}

describe('pactEntryMechanics (#84)', () => {
    it('lists a characteristic change by its langpack key, signed', () => {
        expect(pactEntryMechanics(lordOfBattle)).toEqual([{ labelKey: 'WH40K.Characteristic.WeaponSkill', value: '+5' }]);
        expect(pactEntryMechanics(entry('detached', { modifiers: { characteristics: { fellowship: -10 } } }))).toEqual([
            { labelKey: 'WH40K.Characteristic.Fellowship', value: '-10' },
        ]);
    });

    it('lists a grant by UUID with its specialization and level', () => {
        expect(pactEntryMechanics(mighty)).toEqual([{ grantUuid: UNNATURAL, grantDetail: 'Strength (2)' }]);
        expect(pactEntryMechanics(reaver)).toEqual([{ grantUuid: FRENZY }]);
    });

    it('skips zero changes', () => {
        expect(pactEntryMechanics(entry('none', { modifiers: { characteristics: { strength: 0 } } }))).toEqual([]);
    });
});

describe('pactEntryView (#84)', () => {
    it("marks an entry with no mechanics as the GM's to adjudicate", () => {
        expect(pactEntryView(bloodRage)).toEqual({
            identifier: 'blood-rage',
            name: 'BLOOD-RAGE',
            description: '<p>blood-rage</p>',
            mechanics: [],
            narrative: true,
        });
        expect(pactEntryView(mighty).narrative).toBe(false);
    });
});

describe('darkPactSheetView (#84)', () => {
    it('shows the terms and every Boon and Bane', () => {
        const view = darkPactSheetView({
            corruptionFormula: '2d10+10',
            negotiation: { dispositionBase: 15, addsCorruption: true, testModifier: -20 },
            ...might,
        });
        expect(view.terms).toEqual({ corruptionFormula: '2d10+10', dispositionBase: 15, addsCorruption: true, testModifier: '-20' });
        expect(view.boons.map((b) => b.identifier)).toEqual(['mighty', 'lord-of-battle', 'reaver']);
        expect(view.banes.map((b) => b.identifier)).toEqual(['blood-rage']);
    });

    // #694: a pact with no Corruption formula showed a blank "Corruption gained".
    it('reads an unset Corruption formula as 0, and keeps a set one', () => {
        const terms = (corruptionFormula: string): string =>
            darkPactSheetView({ corruptionFormula, negotiation: { dispositionBase: 0, addsCorruption: false, testModifier: 0 }, boons: [], banes: [] }).terms
                .corruptionFormula;
        expect(terms('')).toBe('0');
        expect(terms('   ')).toBe('0');
        expect(terms('2d10+10')).toBe('2d10+10');
    });

    it('signs a positive or zero test modifier', () => {
        expect(
            darkPactSheetView({ corruptionFormula: '', negotiation: { dispositionBase: 0, addsCorruption: false, testModifier: 10 }, boons: [], banes: [] })
                .terms.testModifier,
        ).toBe('+10');
        expect(
            darkPactSheetView({ corruptionFormula: '', negotiation: { dispositionBase: 0, addsCorruption: false, testModifier: 0 }, boons: [], banes: [] })
                .terms.testModifier,
        ).toBe('0');
    });
});

describe('darkPactPanelView (#84)', () => {
    it('shows to the GM with no pacts (to add one), and hides from a player with none', () => {
        expect(darkPactPanelView([], new Map(), true)).toEqual({ visible: true, canEdit: true, rows: [] });
        expect(darkPactPanelView([], new Map(), false)).toEqual({ visible: false, canEdit: false, rows: [] });
    });

    it('shows a player their struck pacts read-only', () => {
        const view = darkPactPanelView([record(MIGHT)], new Map([[MIGHT, might]]), false);
        expect(view).toMatchObject({ visible: true, canEdit: false });
        expect(view.rows).toHaveLength(1);
    });

    it("splits each pact's Boons and Banes into taken and on offer", () => {
        const view = darkPactPanelView(
            [record(MIGHT, { boons: ['reaver', 'mighty'], banes: ['blood-rage'], disposition: 41 })],
            new Map([[MIGHT, might]]),
            true,
        );
        const row = view.rows.at(0);
        expect(row).toMatchObject({ index: 0, pactUuid: MIGHT, disposition: 41, resolved: true });
        const boons = row?.columns.at(0);
        const banes = row?.columns.at(1);
        expect(boons?.kind).toBe('boons');
        expect(boons?.labelKey).toBe('WH40K.DarkPact.Boons');
        expect(boons?.taken.map((b) => b.identifier)).toEqual(['mighty', 'reaver']);
        expect(boons?.available).toEqual([{ identifier: 'lord-of-battle', name: 'LORD-OF-BATTLE' }]);
        expect(banes?.labelKey).toBe('WH40K.DarkPact.Banes');
        expect(banes?.taken.map((b) => b.identifier)).toEqual(['blood-rage']);
        expect(banes?.available).toEqual([]);
    });

    it('keeps a row whose pact no longer resolves, empty and unresolved, so it can be removed', () => {
        const view = darkPactPanelView(
            [record(MIGHT), record(POWER, { boons: ['wyrd'] })],
            new Map([
                [MIGHT, might],
                [POWER, null],
            ]),
            true,
        );
        expect(view.rows.map((r) => r.index)).toEqual([0, 1]);
        expect(view.rows.at(1)).toMatchObject({ pactUuid: POWER, resolved: false });
        expect(view.rows.at(1)?.columns.map((c) => [c.taken, c.available])).toEqual([
            [[], []],
            [[], []],
        ]);
    });
});
