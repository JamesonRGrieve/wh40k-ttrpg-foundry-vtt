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
    title: 'Chat/Roll Cards',
};

export default meta;

type Story = StoryObj;

export const SimpleSuccess: Story = {
    name: 'Simple Roll / Success',
    render: () => renderSheet(simpleRollChatSrc, mockRollData()),
    // No sourceFatePoints in the base mock → the Fate controls stay hidden.
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.roll-control__fate-reroll')).toBeNull();
        await expect(canvasElement.querySelector('.roll-control__fate-add-dos')).toBeNull();
    },
};

export const SimpleSuccessWithFateControls: Story = {
    name: 'Simple Roll / Success + Fate (reroll & +DoS)',
    render: () => renderSheet(simpleRollChatSrc, mockRollData({ id: 'roll-fate-success', sourceFatePoints: 2 })),
    play: async ({ canvasElement }) => {
        // Success + a Fate Point available → both controls, wired to this roll's id.
        const reroll = canvasElement.querySelector('.roll-control__fate-reroll');
        const addDoS = canvasElement.querySelector('.roll-control__fate-add-dos');
        await expect(reroll).not.toBeNull();
        await expect(addDoS).not.toBeNull();
        await expect(reroll?.getAttribute('data-roll-id')).toBe('roll-fate-success');
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
                rollData: { success: false, dos: 0, dof: 2, roll: { total: 78 } },
            }),
        ),
    play: async ({ canvasElement }) => {
        // Failure → reroll is offered; there is no Degree of Success to add.
        await expect(canvasElement.querySelector('.roll-control__fate-reroll')).not.toBeNull();
        await expect(canvasElement.querySelector('.roll-control__fate-add-dos')).toBeNull();
    },
};

export const SimpleManualRollNoFateControls: Story = {
    name: 'Simple Roll / Manual entry suppresses Fate controls',
    render: () => renderSheet(simpleRollChatSrc, mockRollData({ id: 'roll-manual', sourceFatePoints: 3, rollData: { isManualRoll: true } })),
    play: async ({ canvasElement }) => {
        // A manually-entered physical roll can't be auto-rerolled → no buttons.
        await expect(canvasElement.querySelector('.roll-control__fate-reroll')).toBeNull();
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
        // A target-only post has no resolved result yet → no Fate controls even
        // when the actor has points to spend.
        await expect(canvasElement.querySelector('.roll-control__fate-reroll')).toBeNull();
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
