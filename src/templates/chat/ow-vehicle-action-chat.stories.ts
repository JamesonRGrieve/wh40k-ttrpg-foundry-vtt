/**
 * Storybook stories for the OW Vehicle Movement chat card (#156).
 * Covers the three chat-card outcomes the runtime emits:
 *
 *   1. EvasiveManoeuvring — half-action driver test, no active chase.
 *   2. FloorIt            — full-action straight-line dash, no chase.
 *   3. JinkInChase        — reaction-timed Jink mid-chase; chase
 *                            tracker fires the Danger Zone flag.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { renderSheet } from '../../../stories/test-helpers';
import cardSrc from './ow-vehicle-action-chat.hbs?raw';

initializeStoryHandlebars();

interface ChaseChatState {
    pursuerDistance: number;
    dangerZone: boolean;
    turnCount: number;
}

interface VehicleActionChatCtx {
    gameSystem: 'ow';
    actionId: string;
    actionNameKey: string;
    descriptionKey: string;
    timingKey: string;
    chase: ChaseChatState | null;
}

function renderCard(ctx: VehicleActionChatCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'ow';
    wrapper.appendChild(renderSheet(cardSrc, ctx));
    return wrapper;
}

const meta: Meta<VehicleActionChatCtx> = {
    title: 'Chat/OwVehicleActionChat',
};
export default meta;
type Story = StoryObj<VehicleActionChatCtx>;

export const EvasiveManoeuvring: Story = {
    name: 'Evasive Manoeuvring — half-action, no active chase',
    args: {
        gameSystem: 'ow',
        actionId: 'evasive-manoeuvring',
        actionNameKey: 'WH40K.OW.VehicleMovement.Action.EvasiveManoeuvring',
        descriptionKey: 'WH40K.OW.VehicleMovement.Description.EvasiveManoeuvring',
        timingKey: 'WH40K.OW.VehicleMovement.Timing.Half',
        chase: null,
    },
    render: (args) => renderCard(args),
};

export const FloorIt: Story = {
    name: 'Floor It! — full-action straight-line dash',
    args: {
        gameSystem: 'ow',
        actionId: 'floor-it',
        actionNameKey: 'WH40K.OW.VehicleMovement.Action.FloorIt',
        descriptionKey: 'WH40K.OW.VehicleMovement.Description.FloorIt',
        timingKey: 'WH40K.OW.VehicleMovement.Timing.Full',
        chase: null,
    },
    render: (args) => renderCard(args),
};

export const JinkInChase: Story = {
    name: 'Jink — reaction mid-chase; Danger Zone fires',
    args: {
        gameSystem: 'ow',
        actionId: 'jink',
        actionNameKey: 'WH40K.OW.VehicleMovement.Action.Jink',
        descriptionKey: 'WH40K.OW.VehicleMovement.Description.Jink',
        timingKey: 'WH40K.OW.VehicleMovement.Timing.Reaction',
        chase: {
            pursuerDistance: 0,
            dangerZone: true,
            turnCount: 4,
        },
    },
    render: (args) => renderCard(args),
};
