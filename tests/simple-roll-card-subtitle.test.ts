import { describe, expect, it } from 'vitest';
import simpleRollChatSrc from '../src/templates/chat/simple-roll-chat.hbs?raw';
import { mockRollData } from '../stories/mocks';
import { initializeStoryHandlebars } from '../stories/template-support';
import { renderSheet } from '../stories/test-helpers';

initializeStoryHandlebars();

/**
 * The simple roll card's subtitle names the test type. It used to append
 * " • <difficulty>", looked up by a `difficulty` field roll data never carries,
 * so every skill card read "Skill •" with a dangling separator. The difficulty
 * is already a provenance row in the modifier breakdown.
 */
describe('simple roll card subtitle', () => {
    it('is the test type alone, with no dangling separator', () => {
        const card = renderSheet(simpleRollChatSrc, mockRollData({ rollData: { name: 'Parry Test', type: 'Skill' } }));
        const subtitle = card.querySelector('h2')?.nextElementSibling?.textContent.trim();
        expect(subtitle).toBe('Skill');
        expect(card.textContent).not.toMatch(/Skill\s*•/u);
    });
});
