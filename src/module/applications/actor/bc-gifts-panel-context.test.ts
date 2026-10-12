import { describe, expect, it } from 'vitest';
import type { GiftData, GiftRider } from '../../rules/bc-gifts.ts';
import { buildBcGiftsPanel, type GiftPanelItem } from './bc-gifts-panel-context.ts';

/** Structural fixtures — the catalogue itself lives in the compendium (Direction #7). */
function rider(alignment: GiftRider['alignment'], characteristics: Record<string, number>, grants: string[] = []): GiftRider {
    return { alignment, description: `<p>${alignment} rider</p>`, characteristics, skills: {}, grants, activeEffect: '' };
}

function item(id: string, characteristics: Record<string, number>, gift: Partial<GiftData> = {}, skills: Record<string, number> = {}): GiftPanelItem {
    return {
        id,
        name: `Gift ${id}`,
        img: null,
        system: {
            effect: `<p>base ${id}</p>`,
            modifiers: { characteristics, skills },
            gift: { grants: [], riders: [], subTable: '', characteristicRolls: [], ...gift },
        },
    };
}

const LABELS: Record<string, string> = { strength: 'Strength', toughness: 'Toughness', intelligence: 'Intelligence', awareness: 'Awareness' };

function build(alignment: Parameters<typeof buildBcGiftsPanel>[0]['alignment'], items: GiftPanelItem[]): ReturnType<typeof buildBcGiftsPanel> {
    return buildBcGiftsPanel({
        alignment,
        items,
        characteristicLabel: (key) => LABELS[key] ?? key,
        skillLabel: (key) => LABELS[key] ?? key,
        grantName: (uuid) => `name-of:${uuid}`,
    });
}

describe('buildBcGiftsPanel', () => {
    const alpha = item(
        'a',
        { strength: 3 },
        { riders: [rider('khorne', { strength: 5 }, ['uuid.rider'])], grants: ['uuid.base'], subTable: 'limb' },
        { awareness: 10 },
    );
    const beta = item('b', { toughness: 4 }, { riders: [rider('nurgle', { toughness: 2 })] });

    it('is empty for an actor with no Gifts', () => {
        expect(build('khorne', [])).toEqual({ currentAlignment: 'khorne', gifts: [], mergedDelta: [] });
    });

    it('lays out the base effect, matching rider, labelled deltas, grant names and sub-table prompt', () => {
        const [entry] = build('khorne', [alpha]).gifts;

        expect(entry).toEqual({
            id: 'a',
            name: 'Gift a',
            img: '',
            baseDescription: '<p>base a</p>',
            riderDescription: '<p>khorne rider</p>',
            appliedAlignment: 'khorne',
            subTableKey: 'WH40K.BC.Gifts.SubTable.Limb',
            characteristicDelta: [{ key: 'strength', label: 'Strength', value: 8 }],
            skillDelta: [{ key: 'awareness', label: 'Awareness', value: 10 }],
            grants: ['name-of:uuid.base', 'name-of:uuid.rider'],
            pendingRolls: [],
        });
    });

    it('applies no rider when the alignment has none', () => {
        expect(build('slaanesh', [alpha]).gifts[0]).toMatchObject({
            appliedAlignment: 'unaligned',
            riderDescription: '',
            characteristicDelta: [{ key: 'strength', label: 'Strength', value: 3 }],
        });
    });

    it('sums characteristic changes across Gifts in the footer, dropping zeros', () => {
        const cancelling = item('c', { strength: -3 });
        expect(build('nurgle', [alpha, beta, cancelling]).mergedDelta).toEqual([{ key: 'toughness', label: 'Toughness', value: 6 }]);
    });

    it('lists acquisition rolls until their result is stored', () => {
        const rolling = item('r', {}, { characteristicRolls: [{ characteristic: 'intelligence', formula: '1d10+5', direction: 'loss' }] });
        expect(build('unaligned', [rolling]).gifts[0]?.pendingRolls).toEqual([
            { characteristic: 'intelligence', label: 'Intelligence', formula: '1d10+5', directionKey: 'WH40K.BC.Gifts.Direction.Loss' },
        ]);

        const rolled = item('r', { intelligence: -9 }, { characteristicRolls: [{ characteristic: 'intelligence', formula: '1d10+5', direction: 'loss' }] });
        expect(build('unaligned', [rolled]).gifts[0]).toMatchObject({
            pendingRolls: [],
            characteristicDelta: [{ key: 'intelligence', label: 'Intelligence', value: -9 }],
        });
    });
});
