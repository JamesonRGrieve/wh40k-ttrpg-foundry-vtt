import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { soakRows } from '../../src/module/rules/target-soak.ts';
import damageRollChatSrc from '../../src/templates/chat/damage-roll-chat.hbs?raw';
import { mockDamageRollData } from '../mocks';
import { localizeKey } from '../mocks/lang-localize';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

/**
 * The damage card's Effective line, part by part (#248): a PC's Machine trait and
 * worn armour soak together, Penetration takes back what it can of that armour,
 * then the Toughness Bonus. The rows come from the damage path's own `soakRows`.
 */
initializeStoryHandlebars();

const meta: Meta = { title: 'Chat/Damage Card Soak Rows (#248)' };
export default meta;
type Story = StoryObj;

function card(): HTMLElement {
    const rows = soakRows(
        15,
        [
            { key: 'worn', value: 3 },
            { key: 'trait', value: 4 },
        ],
        0,
        2,
        3,
        false,
    ).map((row) => ({ label: localizeKey(row.labelKey), value: row.value > 0 ? `+${row.value}` : `${row.value}` }));
    const frame = document.createElement('div');
    frame.style.width = '300px';
    frame.append(
        renderSheet(
            damageRollChatSrc,
            mockDamageRollData({
                targetName: 'Held Tech-Thrall',
                hits: [
                    {
                        location: 'body',
                        damageRoll: { formula: '1d10+5', result: '10 + 5' },
                        totalDamage: 15,
                        damageType: 'Impact',
                        totalPenetration: 2,
                        totalFatigue: 0,
                        effects: [],
                        righteousFury: [],
                        hasEffective: true,
                        effectiveDamage: 7,
                        effectiveArmour: 5,
                        effectiveTb: 3,
                        effectiveRows: rows,
                    },
                ],
            }),
        ),
    );
    return frame;
}

export const MachineOverWornArmour: Story = {
    name: 'Machine 4 over worn 3, Pen 2, TB 3',
    render: () => card(),
    play: async ({ canvasElement }) => {
        const rows = [...canvasElement.querySelectorAll('[data-damage-soak-row]')].map((row) =>
            [...row.querySelectorAll('span')].map((span) => span.textContent.trim()),
        );
        await expect(rows).toEqual([
            [localizeKey('WH40K.Chat.Damage.Soak.Damage'), '+15'],
            [localizeKey('WH40K.Chat.Damage.Soak.Worn'), '-3'],
            [localizeKey('WH40K.Chat.Damage.Soak.Trait'), '-4'],
            [localizeKey('WH40K.Chat.Damage.Soak.Penetration'), '+2'],
            [localizeKey('WH40K.Chat.Damage.Soak.Toughness'), '-3'],
        ]);
        await expect(canvasElement.querySelector('[data-damage-effective-value]')?.textContent).toBe('7');
    },
};
