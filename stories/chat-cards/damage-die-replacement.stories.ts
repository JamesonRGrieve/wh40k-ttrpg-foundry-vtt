import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import damageRollChatSrc from '../../src/templates/chat/damage-roll-chat.hbs?raw';
import { mockDamageRollData } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

/**
 * Chat-card story for the "Replace damage die with DoS" action (#129, DH2).
 * Verifies that the amber accent button renders
 * alongside the standard damage card when the parent context exposes
 * `canReplaceDie: true` and the hit carries a positive `dos` value.
 */
initializeStoryHandlebars();

const meta: Meta = {
    title: 'Chat/Damage Die Replacement (#129)',
};

export default meta;

type Story = StoryObj;

export const ReplaceDieAvailable: Story = {
    name: 'Damage Card / Replacement button visible',
    render: () =>
        renderSheet(
            damageRollChatSrc,
            mockDamageRollData({
                rollId: 'mock-roll-129',
                canReplaceDie: true,
                hits: [
                    {
                        location: 'Body',
                        damageRoll: { formula: '1d10+5', result: '8 + 5' },
                        modifiers: { MightyShot: 2 },
                        totalDamage: 15,
                        damageType: 'Explosive',
                        totalPenetration: 4,
                        totalFatigue: 0,
                        effects: [],
                        righteousFury: [],
                        dos: 4,
                    },
                ],
            }),
        ),
};

export const ReplaceDieHiddenWhenZeroDoS: Story = {
    name: 'Damage Card / Hidden when DoS = 0',
    render: () =>
        renderSheet(
            damageRollChatSrc,
            mockDamageRollData({
                rollId: 'mock-roll-129',
                canReplaceDie: true,
                hits: [
                    {
                        location: 'Body',
                        damageRoll: { formula: '1d10+5', result: '8 + 5' },
                        modifiers: {},
                        totalDamage: 13,
                        damageType: 'Explosive',
                        totalPenetration: 4,
                        totalFatigue: 0,
                        effects: [],
                        righteousFury: [],
                        dos: 0,
                    },
                ],
            }),
        ),
};

/** A chat card's width in Foundry's default 300px chat sidebar, less the message's padding. */
const SIDEBAR_CARD_WIDTH_PX = 280;

/**
 * At the chat sidebar's width, "Replace die with DoS (10)" and Assign Damage stay
 * inside the card: each label wraps inside its button rather than running past
 * both card edges (the buttons were nowrap and could not shrink).
 */
export const ActionButtonsFitSidebar: Story = {
    name: 'Damage Card / Replace and Assign fit the chat sidebar',
    render: () => {
        const card = document.createElement('div');
        card.className = 'wh40k-rpg';
        card.style.width = `${SIDEBAR_CARD_WIDTH_PX}px`;
        card.dataset['damageCardHost'] = '';
        card.append(
            renderSheet(
                damageRollChatSrc,
                mockDamageRollData({
                    rollId: 'mock-roll-sidebar',
                    canReplaceDie: true,
                    hits: [
                        {
                            location: 'Body',
                            damageRoll: { formula: '1d10+5', result: '8 + 5' },
                            modifiers: {},
                            totalDamage: 15,
                            damageType: 'Explosive',
                            totalPenetration: 4,
                            totalFatigue: 0,
                            effects: [],
                            righteousFury: [],
                            dos: 10,
                        },
                    ],
                }),
            ),
        );
        return card;
    },
    play: async ({ canvasElement }) => {
        const card = canvasElement.querySelector<HTMLElement>('[data-damage-card-host]');
        await expect(card).not.toBeNull();
        if (card === null) return;
        const buttons = Array.from(card.querySelectorAll<HTMLButtonElement>('.roll-control__replace-damage-die, .roll-control__assign-damage'));
        await expect(buttons).toHaveLength(2);
        const box = card.getBoundingClientRect();
        const escaped = buttons.flatMap((button) => {
            const rect = button.getBoundingClientRect();
            const inside = rect.left >= box.left - 0.5 && rect.right <= box.right + 0.5;
            return inside && button.scrollWidth <= button.clientWidth + 1
                ? []
                : [
                      `${button.className.split(' ')[0] ?? ''}: ${Math.round(rect.left)}–${Math.round(rect.right)} in ${Math.round(box.left)}–${Math.round(
                          box.right,
                      )}, scroll ${button.scrollWidth}/${button.clientWidth}`,
                  ];
        });
        await expect(escaped).toEqual([]);
    },
};

export const ReplaceDieHiddenWhenFlagFalse: Story = {
    name: 'Damage Card / Hidden when canReplaceDie is false (re-rendered card)',
    render: () =>
        renderSheet(
            damageRollChatSrc,
            mockDamageRollData({
                canReplaceDie: false,
                hits: [
                    {
                        location: 'Body',
                        damageRoll: { formula: '1d10+5', result: '8 + 5' },
                        modifiers: {},
                        totalDamage: 15,
                        damageType: 'Explosive',
                        totalPenetration: 4,
                        totalFatigue: 0,
                        effects: [],
                        righteousFury: [],
                        dos: 4,
                    },
                ],
            }),
        ),
};
