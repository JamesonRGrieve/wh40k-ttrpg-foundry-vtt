import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import actionRollChatSrc from '../src/templates/chat/action-roll-chat.hbs?raw';
import damageRollChatSrc from '../src/templates/chat/damage-roll-chat.hbs?raw';
import simpleRollChatSrc from '../src/templates/chat/simple-roll-chat.hbs?raw';
import { mockActionRollData, mockDamageRollData, mockRollData, renderTemplate } from './mocks';
import { initializeStoryHandlebars } from './template-support';

initializeStoryHandlebars();

const simpleRollTemplate = Handlebars.compile(simpleRollChatSrc);
const damageRollTemplate = Handlebars.compile(damageRollChatSrc);
const actionRollTemplate = Handlebars.compile(actionRollChatSrc);

const meta: Meta = {
    title: 'Chat/Roll Cards',
};

export default meta;

type Story = StoryObj;

export const SimpleSuccess: Story = {
    name: 'Simple Roll / Success',
    render: () => renderTemplate(simpleRollTemplate, mockRollData()),
};

export const SimpleTargetOnly: Story = {
    name: 'Simple Roll / Target Only',
    render: () =>
        renderTemplate(
            simpleRollTemplate,
            mockRollData({
                rollData: {
                    isTargetOnly: true,
                    success: false,
                    activeModifiers: {
                        Aim: 10,
                    },
                },
            }),
        ),
};

export const DamageWithAssignableHit: Story = {
    name: 'Damage Roll / Assignable',
    render: () => renderTemplate(damageRollTemplate, mockDamageRollData()),
};

export const ActionSuccessWithControls: Story = {
    name: 'Action Roll / Success',
    render: () => renderTemplate(actionRollTemplate, mockActionRollData()),
};

export const ActionFailureWithoutDamage: Story = {
    name: 'Action Roll / Failure',
    render: () =>
        renderTemplate(
            actionRollTemplate,
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
