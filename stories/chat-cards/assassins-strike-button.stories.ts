import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import actionRollChatSrc from '../../src/templates/chat/action-roll-chat.hbs?raw';
import { mockActionRollData, renderTemplate } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';

/**
 * Chat-card story for the Assassin's Strike post-attack action
 * (#149 — DH2 errata L75). Verifies the dark-grey button renders on
 * the melee attack chat card when:
 *
 *   1. The actor carries the Assassin's Strike talent (driven via the
 *      `hasAssassinsStrike` flag added to the chat-card context).
 *   2. The attack roll itself succeeded — the errata only grants the
 *      Acrobatics + Half Move test on a hit.
 *
 * A failure-state story confirms the button is suppressed when the
 * attack misses, and a no-talent story confirms the flag gates the
 * button surface entirely.
 */
initializeStoryHandlebars();

const actionRollTemplate = Handlebars.compile(actionRollChatSrc);

const meta: Meta = {
    title: "Chat/Assassin's Strike (#149)",
};

export default meta;

type Story = StoryObj;

export const TalentSuccessShowsButton: Story = {
    name: 'Melee attack hit + talent present',
    render: () =>
        renderTemplate(
            actionRollTemplate,
            mockActionRollData({
                label: 'Melee Attack',
                hasAssassinsStrike: true,
                rollData: {
                    name: 'Power Knife',
                    action: 'Standard Attack',
                    success: true,
                    dos: 2,
                    roll: { total: 32 },
                    hitLocation: 'Body',
                    showDamage: true,
                },
            }),
        ),
};

export const TalentMissHidesButton: Story = {
    name: 'Melee attack miss — button suppressed',
    render: () =>
        renderTemplate(
            actionRollTemplate,
            mockActionRollData({
                label: 'Melee Attack',
                hasAssassinsStrike: true,
                rollData: {
                    name: 'Power Knife',
                    action: 'Standard Attack',
                    success: false,
                    dos: 0,
                    dof: 3,
                    roll: { total: 78 },
                    showDamage: false,
                },
            }),
        ),
};

export const NoTalentHidesButton: Story = {
    name: 'Melee attack hit — no Assassin\'s Strike talent',
    render: () =>
        renderTemplate(
            actionRollTemplate,
            mockActionRollData({
                label: 'Melee Attack',
                hasAssassinsStrike: false,
                rollData: {
                    name: 'Mono-Sword',
                    action: 'Standard Attack',
                    success: true,
                    dos: 1,
                    roll: { total: 41 },
                    hitLocation: 'Right Arm',
                    showDamage: true,
                },
            }),
        ),
};
