/**
 * Regression guard (#615): the damage card's chrome reads from the langpack, and its
 * Effective value never wraps.
 *
 * The card's "Damage Roll" overline (and its wounds callout's "Damage" header) were
 * literal English in the template, so a translation never reached them; and the
 * Effective value's span could shrink, so "Effective vs Near Target" pushed a
 * two-digit value onto two lines. The card is rendered through the same Handlebars
 * setup the stories use.
 */

import Hbs from 'handlebars';
import { describe, expect, it } from 'vitest';
import damageRollChatSrc from '../src/templates/chat/damage-roll-chat.hbs?raw';
import { mockDamageRollData } from '../stories/mocks';
import { localizeKey } from '../stories/mocks/lang-localize';
import { initializeStoryHandlebars } from '../stories/template-support';

initializeStoryHandlebars();

function renderCard(): HTMLElement {
    const root = document.createElement('div');
    const hit = {
        location: 'head',
        damageRoll: { formula: '1d10+9', result: '6 + 9' },
        modifiers: {},
        totalDamage: 15,
        damageType: 'energy',
        totalPenetration: 2,
        totalFatigue: 0,
        effects: [],
        righteousFury: [],
        hasEffective: true,
        effectiveDamage: 15,
        effectiveArmour: 0,
        effectiveTb: 0,
    };
    root.innerHTML = Hbs.compile(damageRollChatSrc)(mockDamageRollData({ weaponName: 'Conversion Beamer', targetName: 'Near Target', hits: [hit] }));
    return root;
}

describe('damage card chrome (#615)', () => {
    it('passes no literal English to its overline, label, title or subtitle hash params', () => {
        expect(damageRollChatSrc).not.toMatch(/\b(?:overline|label|title|subtitle)="[A-Z][a-z]/);
    });

    it('renders the langpack overline and wounds-callout header', () => {
        const text = renderCard().textContent;
        expect(text).toContain(localizeKey('WH40K.Chat.Damage.Overline'));
        expect(text).toContain(localizeKey('WH40K.Weapon.Damage'));
    });

    it('keeps the Effective value from shrinking or wrapping', () => {
        const value = renderCard().querySelector('[data-damage-effective-value]');
        expect(value?.textContent.trim()).toBe('15');
        expect(value?.classList.contains('tw-whitespace-nowrap')).toBe(true);
        expect(value?.classList.contains('tw-shrink-0')).toBe(true);
    });
});
