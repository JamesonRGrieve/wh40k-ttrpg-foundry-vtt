import { describe, expect, it } from 'vitest';
import { advanceGrantCards, SISTER_OF_BATTLE_ADVANCE_IDENTIFIER } from './sister-of-battle';

/**
 * The Sister of Battle dialog lists what the elite advance document grants
 * (DH2 Enemies Within pp38-39) — never a talent list held in `src/`.
 */
describe('Sister of Battle elite advance (#134)', () => {
    it('is found by the advance document identifier', () => {
        expect(SISTER_OF_BATTLE_ADVANCE_IDENTIFIER).toBe('sister-of-battle');
    });

    it('lists granted talents with their specialisation, then special abilities as plain text', () => {
        const cards = advanceGrantCards({
            talents: [
                { name: 'Peer', specialization: 'Adepta Sororitas', uuid: 'Compendium.x.Item.peer' },
                { name: 'Weapon Training', specialization: 'Bolt', uuid: 'Compendium.x.Item.wt' },
            ],
            specialAbilities: [{ name: 'Unlocked Advances', description: '<p>The character gains access to the <em>suite</em>.</p>' }],
        });
        expect(cards).toEqual([
            { id: 'Compendium.x.Item.peer', label: 'Peer (Adepta Sororitas)', summary: '', unlocked: false },
            { id: 'Compendium.x.Item.wt', label: 'Weapon Training (Bolt)', summary: '', unlocked: false },
            { id: 'ability-0', label: 'Unlocked Advances', summary: 'The character gains access to the suite.', unlocked: false },
        ]);
    });

    // The nine Sister of Battle talents (EW pp38-39) are made PURCHASABLE, not
    // granted — `grants.unlockedTalents` lists them, flagged so the UI says so.
    it('lists unlocked-for-purchase talents after granted ones, flagged as unlocked', () => {
        const cards = advanceGrantCards({
            talents: [{ name: 'Peer', specialization: 'Adepta Sororitas', uuid: 'Compendium.x.Item.peer' }],
            unlockedTalents: [
                { name: 'Blessed Martyrdom', uuid: 'Compendium.x.Item.bm' },
                { name: 'Furious Zeal', uuid: 'Compendium.x.Item.fz' },
            ],
        });
        expect(cards.map((card) => [card.label, card.unlocked])).toEqual([
            ['Peer (Adepta Sororitas)', false],
            ['Blessed Martyrdom', true],
            ['Furious Zeal', true],
        ]);
    });

    it('omits the specialisation suffix when there is none and drops unnamed rows', () => {
        expect(advanceGrantCards({ talents: [{ name: 'Jaded' }, { name: '' }] })).toEqual([{ id: 'talent-0', label: 'Jaded', summary: '', unlocked: false }]);
    });

    it('returns no rows for an empty grants block', () => {
        expect(advanceGrantCards({})).toEqual([]);
    });
});
