import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import damageRollChatSrc from '../../src/templates/chat/damage-roll-chat.hbs?raw';
import { mockDamageRollData } from '../mocks';
import { localizeKey } from '../mocks/lang-localize';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

/**
 * The damage card's chrome (#615): its "Damage Roll" overline is the langpack's
 * string, and the Effective value against a named target stays on one line up to
 * three digits at the chat sidebar's width, where a long "Effective vs <target>"
 * label used to push a two-digit value onto two lines.
 */
initializeStoryHandlebars();

const meta: Meta = {
    title: 'Chat/Damage Roll Card Layout (#615)',
};

export default meta;

type Story = StoryObj;

/** The chat sidebar's card width. */
const CHAT_CARD_WIDTH_PX = 300;

/** A damage card against a named target, one hit per Effective value, at the chat sidebar's width. */
function card(effectiveValues: readonly number[]): HTMLElement {
    const hits = effectiveValues.map((effective) => ({
        location: 'head',
        damageRoll: { formula: '1d10+9', result: '6 + 9' },
        modifiers: {},
        totalDamage: effective,
        damageType: 'energy',
        totalPenetration: 2,
        totalFatigue: 0,
        effects: [],
        righteousFury: [],
        hasEffective: true,
        effectiveDamage: effective,
        effectiveArmour: 0,
        effectiveTb: 0,
    }));
    const el = renderSheet(damageRollChatSrc, mockDamageRollData({ weaponName: 'Conversion Beamer', gameSystem: 'dh1', targetName: 'Near Target', hits }));
    const frame = document.createElement('div');
    frame.style.width = `${CHAT_CARD_WIDTH_PX}px`;
    frame.append(el);
    return frame;
}

export const OverlineFromLangpack: Story = {
    name: 'Overline — the langpack string',
    render: () => card([15]),
    play: async ({ canvasElement }) => {
        await expect(localizeKey('WH40K.Chat.Damage.Overline')).toBe('Damage Roll');
        await expect(canvasElement.textContent).toContain(localizeKey('WH40K.Chat.Damage.Overline'));
        // The wounds callout's header is the langpack's "Damage", not a literal.
        await expect(canvasElement.textContent).toContain(localizeKey('WH40K.Weapon.Damage'));
    },
};

export const EffectiveValueOnOneLine: Story = {
    name: 'Effective value — one line up to three digits',
    render: () => card([7, 15, 123]),
    play: async ({ canvasElement }) => {
        const values = [...canvasElement.querySelectorAll<HTMLElement>('[data-damage-effective-value]')];
        await expect(values.map((value) => value.textContent.trim())).toEqual(['7', '15', '123']);
        for (const value of values) {
            // One line box: the value is not broken across lines.
            // eslint-disable-next-line no-await-in-loop -- each value asserted in turn
            await expect(value.getClientRects().length).toBe(1);
            // Two lines of text would be at least twice the font size tall.
            const fontSize = Number.parseFloat(getComputedStyle(value).fontSize);
            // eslint-disable-next-line no-await-in-loop -- each value asserted in turn
            await expect(value.getBoundingClientRect().height).toBeLessThan(fontSize * 2);
            // And it stays inside its row.
            const row = value.closest<HTMLElement>('[data-damage-effective]');
            // eslint-disable-next-line no-await-in-loop -- each value asserted in turn
            await expect(row !== null && value.getBoundingClientRect().right <= row.getBoundingClientRect().right + 1).toBe(true);
        }
    },
};
