import type { Meta, StoryObj } from '@storybook/html-vite';
import Hbs from 'handlebars';
import damageRollChatSrc from '../../src/templates/chat/damage-roll-chat.hbs?raw';
import { mockDamageRollData, renderTemplate as renderTpl } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';

/**
 * Chat-card story for the "Replace damage die with DoS" action (#129 —
 * DH2 core L10398-10414). Verifies that the amber accent button renders
 * alongside the standard damage card when the parent context exposes
 * `canReplaceDie: true` and the hit carries a positive `dos` value.
 */
initializeStoryHandlebars();

const damageRollTemplate = Hbs.compile(damageRollChatSrc);

const meta: Meta = {
    title: 'Chat/Damage Die Replacement (#129)',
};

export default meta;

type Story = StoryObj;

export const ReplaceDieAvailable: Story = {
    name: 'Damage Card / Replacement button visible',
    render: () =>
        renderTpl(
            damageRollTemplate,
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
        renderTpl(
            damageRollTemplate,
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

export const ReplaceDieHiddenWhenFlagFalse: Story = {
    name: 'Damage Card / Hidden when canReplaceDie is false (re-rendered card)',
    render: () =>
        renderTpl(
            damageRollTemplate,
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
