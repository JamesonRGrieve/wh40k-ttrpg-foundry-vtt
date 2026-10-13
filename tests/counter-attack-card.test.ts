import { describe, expect, it } from 'vitest';
import simpleRollChatSrc from '../src/templates/chat/simple-roll-chat.hbs?raw';
import { mockRollData } from '../stories/mocks';
import { initializeStoryHandlebars } from '../stories/template-support';
import { renderSheet } from '../stories/test-helpers';

initializeStoryHandlebars();

/** A Counter Attack offer as `EvasionActionData` puts it on the Parry card (#603). */
const OFFER = {
    sourceName: 'Counter Attack',
    attackModifier: -20,
    limit: 'perRound',
    actorUuid: 'Actor.lucius',
    attackerUuid: 'Actor.heretic',
    attackerName: 'Heretic',
    weaponId: 'sword',
};

function parryCard(extra: object): HTMLElement {
    return renderSheet(simpleRollChatSrc, mockRollData({ rollData: { name: 'Parry Test', type: 'Skill' }, ...extra }));
}

describe('the Parry card’s Counter Attack states (#603)', () => {
    it('an earned Counter Attack is a control', () => {
        const card = parryCard({ counterAttack: OFFER });
        expect(card.querySelector('.roll-control__counter-attack')).not.toBeNull();
        expect(card.querySelector('[data-counter-attack-spent]')).toBeNull();
    });

    it('a per-round Counter Attack already used this round says so instead of vanishing', () => {
        const card = parryCard({ counterAttackSpent: 'Counter Attack' });
        expect(card.querySelector('.roll-control__counter-attack')).toBeNull();
        expect(card.querySelector('[data-counter-attack-spent]')?.textContent).toContain('Counter Attack already used this round');
    });

    it('a Parry with no Counter Attack hook shows neither', () => {
        const card = parryCard({});
        expect(card.querySelector('.roll-control__counter-attack')).toBeNull();
        expect(card.querySelector('[data-counter-attack-spent]')).toBeNull();
    });
});
