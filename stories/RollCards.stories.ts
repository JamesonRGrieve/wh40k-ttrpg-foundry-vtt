import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import actionRollChatSrc from '../src/templates/chat/action-roll-chat.hbs?raw';
import damageRollChatSrc from '../src/templates/chat/damage-roll-chat.hbs?raw';
import simpleRollChatSrc from '../src/templates/chat/simple-roll-chat.hbs?raw';
import { mockActionRollData, mockDamageRollData, mockRollData } from './mocks';
import { initializeStoryHandlebars } from './template-support';
import { renderSheet } from './test-helpers';

initializeStoryHandlebars();

const meta: Meta = {
    id: 'chat-roll-cards',
    title: 'Chat/General/Roll Cards',
};

export default meta;

type Story = StoryObj;

/** The global Spend-Fate re-roll variant, as ActionData.rerollOptions emits it. */
const fateRerollOption = { id: 'fate', kind: 'fate', label: 'Re-roll', modifier: 0, source: 'Fate', disabled: false, frequency: 'at-will' };

export const SimpleSuccess: Story = {
    name: 'Simple Roll / Success',
    render: () => renderSheet(simpleRollChatSrc, mockRollData()),
    // No re-roll options in the base mock → the re-roll/Fate controls stay hidden.
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.roll-control__variant-reroll')).toBeNull();
        await expect(canvasElement.querySelector('.roll-control__fate-add-dos')).toBeNull();
    },
};

export const SimpleSuccessWithFateControls: Story = {
    name: 'Simple Roll / Success + Fate (reroll & +DoS)',
    render: () => renderSheet(simpleRollChatSrc, mockRollData({ id: 'roll-fate-success', sourceFatePoints: 2, rerollOptions: [fateRerollOption] })),
    play: async ({ canvasElement }) => {
        // Success + a Fate re-roll option → both controls, wired to this roll's id.
        const reroll = canvasElement.querySelector('.roll-control__variant-reroll');
        const addDoS = canvasElement.querySelector('.roll-control__fate-add-dos');
        await expect(reroll).not.toBeNull();
        await expect(addDoS).not.toBeNull();
        await expect(reroll?.getAttribute('data-roll-id')).toBe('roll-fate-success');
        await expect(reroll?.getAttribute('data-variant-kind')).toBe('fate');
        await expect(addDoS?.getAttribute('data-roll-id')).toBe('roll-fate-success');
    },
};

export const SimpleFailureWithFateReroll: Story = {
    name: 'Simple Roll / Failure + Fate reroll',
    render: () =>
        renderSheet(
            simpleRollChatSrc,
            mockRollData({
                id: 'roll-fate-fail',
                sourceFatePoints: 3,
                rerollOptions: [fateRerollOption],
                rollData: { success: false, dos: 0, dof: 2, roll: { total: 78 } },
            }),
        ),
    play: async ({ canvasElement }) => {
        // Failure → reroll is offered; there is no Degree of Success to add.
        await expect(canvasElement.querySelector('.roll-control__variant-reroll')).not.toBeNull();
        await expect(canvasElement.querySelector('.roll-control__fate-add-dos')).toBeNull();
    },
};

export const SimpleFailureWithTalentReroll: Story = {
    name: 'Simple Roll / Failure + talent reroll (Keen Intuition) + Fate',
    render: () =>
        renderSheet(
            simpleRollChatSrc,
            mockRollData({
                id: 'roll-talent-fail',
                sourceFatePoints: 1,
                rerollOptions: [
                    { id: 'keen:at-will', kind: 'item', label: 'Keen Intuition', modifier: 0, source: 'Keen Intuition', disabled: false, frequency: 'at-will' },
                    fateRerollOption,
                ],
                rollData: { success: false, dos: 0, dof: 1, roll: { total: 55 } },
            }),
        ),
    play: async ({ canvasElement }) => {
        // A talent re-roll button renders SEPARATE from the global Fate one.
        const buttons = canvasElement.querySelectorAll('.roll-control__variant-reroll');
        await expect(buttons.length).toBe(2);
        await expect(buttons[0].getAttribute('data-variant-id')).toBe('keen:at-will');
        await expect(buttons[1].getAttribute('data-variant-kind')).toBe('fate');
    },
};

export const SimpleManualRollNoFateControls: Story = {
    name: 'Simple Roll / Manual entry suppresses re-roll controls',
    render: () =>
        renderSheet(
            simpleRollChatSrc,
            mockRollData({ id: 'roll-manual', sourceFatePoints: 3, rerollOptions: [fateRerollOption], rollData: { isManualRoll: true } }),
        ),
    play: async ({ canvasElement }) => {
        // A manually-entered physical roll can't be auto-rerolled → no buttons.
        await expect(canvasElement.querySelector('.roll-control__variant-reroll')).toBeNull();
        await expect(canvasElement.querySelector('.roll-control__fate-add-dos')).toBeNull();
    },
};

export const SimpleTargetOnly: Story = {
    name: 'Simple Roll / Target Only',
    render: () =>
        renderSheet(
            simpleRollChatSrc,
            mockRollData({
                sourceFatePoints: 3,
                rerollOptions: [fateRerollOption],
                rollData: {
                    isTargetOnly: true,
                    success: false,
                    activeModifiers: {
                        Aim: 10,
                    },
                },
            }),
        ),
    play: async ({ canvasElement }) => {
        // A target-only post has no resolved result yet → no re-roll controls even
        // when the actor has points to spend.
        await expect(canvasElement.querySelector('.roll-control__variant-reroll')).toBeNull();
    },
};

export const DamageWithAssignableHit: Story = {
    name: 'Damage Roll / Assignable',
    render: () => renderSheet(damageRollChatSrc, mockDamageRollData()),
};

export const ActionSuccessWithControls: Story = {
    name: 'Action Roll / Success',
    render: () => renderSheet(actionRollChatSrc, mockActionRollData()),
};

export const ActionFailureWithoutDamage: Story = {
    name: 'Action Roll / Failure',
    render: () =>
        renderSheet(
            actionRollChatSrc,
            mockActionRollData({
                effectOutput: [],
                rollData: {
                    success: false,
                    dos: 0,
                    dof: 3,
                    roll: { total: 91 },
                    showDamage: false,
                    hitLocation: '',
                },
            }),
        ),
};
