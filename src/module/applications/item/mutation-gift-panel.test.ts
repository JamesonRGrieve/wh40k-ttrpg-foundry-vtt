/**
 * Unit tests for the mutation sheet's Gift of the Gods panel view model (#597).
 */
import { describe, expect, it } from 'vitest';
import type { GiftData } from '../../rules/bc-gifts.ts';
import {
    buildGiftPanelContext,
    GIFT_GRANT_ACCEPT,
    NEW_ROLL_FORMULA,
    newCharacteristicRoll,
    newGiftRider,
    nextRiderAlignment,
    riderAlignmentLabelKey,
    showsGiftPanel,
    subTableLabelKey,
} from './mutation-gift-panel.ts';

const characteristics = {
    strength: { label: 'WH40K.Characteristic.Strength', abbreviation: 'S' },
    intelligence: { label: 'WH40K.Characteristic.Intelligence', abbreviation: 'Int' },
};

const emptyGift = (): GiftData => ({ grants: [], riders: [], subTable: '', characteristicRolls: [] });

const sampleGift = (): GiftData => ({
    grants: ['Compendium.wh40k-rpg.bc-traits.Item.horns'],
    riders: [
        {
            alignment: 'khorne',
            description: '<p>Blood for the Blood God.</p>',
            characteristics: { strength: 5, intelligence: 0 },
            skills: { intimidate: 10 },
            grants: ['Compendium.wh40k-rpg.bc-traits.Item.frenzy'],
            activeEffect: 'fx1',
        },
    ],
    subTable: 'limb',
    characteristicRolls: [{ characteristic: 'intelligence', formula: '1d10+5', direction: 'loss' }],
});

const resolveName = (uuid: string): string => uuid.split('.').at(-1) ?? uuid;

describe('showsGiftPanel', () => {
    it('shows only for the gift category', () => {
        expect(showsGiftPanel('gift')).toBe(true);
        for (const category of ['minor', 'major', 'malignancy']) expect(showsGiftPanel(category)).toBe(false);
    });
});

describe('rider helpers', () => {
    it('picks the first alignment without a rider', () => {
        expect(nextRiderAlignment([])).toBe('khorne');
        expect(nextRiderAlignment([{ alignment: 'khorne' }, { alignment: 'nurgle' }])).toBe('slaanesh');
        expect(nextRiderAlignment([{ alignment: 'khorne' }, { alignment: 'slaanesh' }, { alignment: 'nurgle' }, { alignment: 'tzeentch' }])).toBeNull();
    });

    it('builds a blank rider that satisfies the schema', () => {
        expect(newGiftRider('tzeentch')).toEqual({ alignment: 'tzeentch', description: '', characteristics: {}, skills: {}, grants: [], activeEffect: '' });
    });

    it('keys alignment and sub-table labels into the langpack', () => {
        expect(riderAlignmentLabelKey('slaanesh')).toBe('WH40K.BC.Gifts.Rider.Slaanesh');
        expect(subTableLabelKey('animal')).toBe('WH40K.BC.Gifts.SubTable.Animal');
        expect(subTableLabelKey('')).toBe('WH40K.ItemSheet.Gift.SubTableNone');
    });
});

describe('newCharacteristicRoll', () => {
    it('starts on the first characteristic with a valid formula', () => {
        expect(newCharacteristicRoll(['weaponSkill', 'strength'])).toEqual({ characteristic: 'weaponSkill', formula: NEW_ROLL_FORMULA, direction: 'gain' });
    });

    it('returns null without a characteristic table', () => {
        expect(newCharacteristicRoll([])).toBeNull();
    });
});

describe('buildGiftPanelContext', () => {
    it('renders an empty Gift with no rows', () => {
        const ctx = buildGiftPanelContext({ gift: emptyGift(), characteristics, effects: [], resolveName });
        expect(ctx.grants.entries).toEqual([]);
        expect(ctx.riders).toEqual([]);
        expect(ctx.rolls).toEqual([]);
        expect(ctx.canAddRider).toBe(true);
        expect(ctx.subTableOptions.find((o) => o.selected)?.value).toBe('');
    });

    it('binds base grants to system.gift.grants with the trait/talent accept list', () => {
        const ctx = buildGiftPanelContext({ gift: sampleGift(), characteristics, effects: [], resolveName });
        expect(ctx.grants).toMatchObject({ path: 'system.gift.grants', mode: 'list', accept: GIFT_GRANT_ACCEPT });
        expect(ctx.grants.entries).toEqual([{ uuid: 'Compendium.wh40k-rpg.bc-traits.Item.horns', name: 'horns', index: 0 }]);
    });

    it('builds rider rows whose form paths match the schema', () => {
        const ctx = buildGiftPanelContext({ gift: sampleGift(), characteristics, effects: [{ id: 'fx1', name: 'Blood Rage' }], resolveName });
        expect(ctx.riders).toHaveLength(1);
        const r = ctx.riders.at(0);
        expect(r).toMatchObject({
            alignmentPath: 'system.gift.riders.0.alignment',
            descriptionPath: 'system.gift.riders.0.description',
            activeEffectPath: 'system.gift.riders.0.activeEffect',
            grants: { path: 'system.gift.riders.0.grants' },
        });
        expect(r?.characteristics.map((c) => c.path)).toEqual([
            'system.gift.riders.0.characteristics.strength',
            'system.gift.riders.0.characteristics.intelligence',
        ]);
        expect(r?.characteristics.map((c) => c.value)).toEqual([5, 0]);
        expect(r?.alignmentOptions.find((o) => o.selected)?.value).toBe('khorne');
        expect(r?.activeEffectName).toBe('Blood Rage');
    });

    it('shows only non-zero rider deltas, signed', () => {
        const ctx = buildGiftPanelContext({ gift: sampleGift(), characteristics, effects: [], resolveName });
        expect(ctx.riders[0]?.deltas).toEqual([{ abbreviation: 'S', value: '+5' }]);
    });

    it('reads a blank delta input for a characteristic the rider leaves alone', () => {
        const gift = sampleGift();
        const ctx = buildGiftPanelContext({
            gift: { ...gift, riders: gift.riders.map((r) => ({ ...r, characteristics: {} })) },
            characteristics,
            effects: [],
            resolveName,
        });
        expect(ctx.riders[0]?.characteristics.map((c) => c.value)).toEqual(['', '']);
    });

    it('builds acquisition roll rows whose form paths match the schema', () => {
        const ctx = buildGiftPanelContext({ gift: sampleGift(), characteristics, effects: [], resolveName });
        expect(ctx.rolls).toHaveLength(1);
        expect(ctx.rolls[0]).toMatchObject({
            characteristicPath: 'system.gift.characteristicRolls.0.characteristic',
            formulaPath: 'system.gift.characteristicRolls.0.formula',
            directionPath: 'system.gift.characteristicRolls.0.direction',
            formula: '1d10+5',
            characteristicLabelKey: 'WH40K.Characteristic.Intelligence',
            directionLabelKey: 'WH40K.BC.Gifts.Direction.Loss',
        });
        expect(ctx.rolls[0]?.directionOptions.find((o) => o.selected)?.value).toBe('loss');
    });

    it('selects the stored sub-table', () => {
        const ctx = buildGiftPanelContext({ gift: sampleGift(), characteristics, effects: [], resolveName });
        expect(ctx.subTablePath).toBe('system.gift.subTable');
        expect(ctx.subTableLabelKey).toBe('WH40K.BC.Gifts.SubTable.Limb');
        expect(ctx.subTableOptions.find((o) => o.selected)?.value).toBe('limb');
    });

    it('stops offering new riders once every alignment has one', () => {
        const gift = emptyGift();
        gift.riders = (['khorne', 'slaanesh', 'nurgle', 'tzeentch'] as const).map((alignment) => newGiftRider(alignment));
        expect(buildGiftPanelContext({ gift, characteristics, effects: [], resolveName }).canAddRider).toBe(false);
    });
});
