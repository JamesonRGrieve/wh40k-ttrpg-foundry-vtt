import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GiftCharacteristicRoll } from '../rules/bc-gifts.ts';
import { bcRollGiftCharacteristic } from './bc-gift-actions.ts';

/**
 * `bcRollGiftCharacteristic` (#180): rolls a Gift's pending acquisition roll,
 * posts it to chat and stores the signed result on the owned Gift's
 * `modifiers.characteristics` — and does nothing for a roll that is not pending,
 * a non-Gift item, or a non-BC actor.
 */

/** Fixed die result every stubbed Roll evaluates to. */
const ROLLED = 7;

class StubRoll {
    readonly formula: string;
    /** The stub's dice always come up {@link ROLLED}; `evaluate` resolves to the roll itself. */
    readonly total = ROLLED;
    static readonly made: StubRoll[] = [];
    readonly toMessage = vi.fn().mockResolvedValue(undefined);
    readonly evaluate = vi.fn().mockResolvedValue(this);
    constructor(formula: string) {
        this.formula = formula;
        StubRoll.made.push(this);
    }
}

interface StubItem {
    name: string;
    type: string;
    system: {
        category: string;
        effect: string;
        modifiers: { characteristics: Record<string, number>; skills: Record<string, number> };
        gift: { grants: string[]; riders: never[]; subTable: ''; characteristicRolls: GiftCharacteristicRoll[] };
    };
    update: ReturnType<typeof vi.fn>;
}

function gift(category: string, rolls: GiftCharacteristicRoll[], rolled: Record<string, number> = {}): StubItem {
    return {
        name: 'Fixture Gift',
        type: 'mutation',
        system: {
            category,
            effect: '',
            modifiers: { characteristics: rolled, skills: {} },
            gift: { grants: [], riders: [], subTable: '', characteristicRolls: rolls },
        },
        update: vi.fn().mockResolvedValue(undefined),
    };
}

const LOSS: GiftCharacteristicRoll = { characteristic: 'intelligence', formula: '1d10+5', direction: 'loss' };

function sheet(item: StubItem, gameSystem = 'bc'): ThisParameterType<typeof bcRollGiftCharacteristic> {
    const actor = {
        items: { get: (id: string) => (id === 'gift-1' ? item : undefined) },
        system: { characteristics: { intelligence: { label: 'Intelligence' } } },
    };
    // eslint-disable-next-line no-restricted-syntax -- boundary: the handler's `this` is a sheet bound to a Foundry WH40KBaseActor document; the stub supplies only the surface it reads
    return { _gameSystemId: gameSystem, actor } as unknown as ThisParameterType<typeof bcRollGiftCharacteristic>;
}

function button(characteristic: string): HTMLElement {
    const el = document.createElement('button');
    el.dataset['itemId'] = 'gift-1';
    el.dataset['characteristic'] = characteristic;
    return el;
}

beforeEach(() => {
    StubRoll.made.length = 0;
    vi.stubGlobal('Roll', StubRoll);
    vi.stubGlobal('ChatMessage', { getSpeaker: () => ({ alias: 'Heretic' }) });
    vi.stubGlobal('game', {
        i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, string>) => `${key}|${data['gift']}|${data['characteristic']}` },
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('bcRollGiftCharacteristic', () => {
    it('rolls the pending formula, posts it, and stores the signed result on the Gift', async () => {
        const item = gift('gift', [LOSS]);
        await bcRollGiftCharacteristic.call(sheet(item), new Event('click'), button('intelligence'));

        expect(StubRoll.made.map((r) => r.formula)).toEqual(['1d10+5']);
        expect(StubRoll.made[0]?.toMessage).toHaveBeenCalledWith(expect.objectContaining({ flavor: 'WH40K.BC.Gifts.RollFlavor|Fixture Gift|Intelligence' }));
        expect(item.update).toHaveBeenCalledWith({ 'system.modifiers.characteristics.intelligence': -ROLLED });
    });

    it('does not roll again once the result is stored', async () => {
        const item = gift('gift', [LOSS], { intelligence: -9 });
        await bcRollGiftCharacteristic.call(sheet(item), new Event('click'), button('intelligence'));

        expect(StubRoll.made).toEqual([]);
        expect(item.update).not.toHaveBeenCalled();
    });

    it('ignores a non-Gift mutation and a non-BC actor', async () => {
        const dh = gift('minor', [LOSS]);
        await bcRollGiftCharacteristic.call(sheet(dh), new Event('click'), button('intelligence'));
        const otherLine = gift('gift', [LOSS]);
        await bcRollGiftCharacteristic.call(sheet(otherLine, 'dh2'), new Event('click'), button('intelligence'));

        expect(StubRoll.made).toEqual([]);
        expect(dh.update).not.toHaveBeenCalled();
        expect(otherLine.update).not.toHaveBeenCalled();
    });
});
