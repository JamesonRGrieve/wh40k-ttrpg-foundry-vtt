/**
 * Storybook stories for the DW Vehicle Crit / Repair chat card (#170).
 * Covers the three chat-card outcomes the runtime emits:
 *
 *   1. JarringBlow      — low-end crit; Routine repair.
 *   2. Wrecked          — high-end crit; Hard repair.
 *   3. RepairOnly       — Repair Test posted without a fresh crit roll.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { renderSheet } from '../../../stories/test-helpers';
import cardSrc from './dw-vehicle-crit-chat.hbs?raw';

initializeStoryHandlebars();

interface VehicleCritChatCtx {
    gameSystem: 'dw';
    headerKey: string;
    resultKey: string;
    rolled: number;
    overIntegrity: number;
    finalRoll: number;
    description: string;
    repairDifficultyKey: string | null;
    skipRoll: boolean;
}

function renderCard(ctx: VehicleCritChatCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'dw';
    wrapper.appendChild(renderSheet(cardSrc, ctx));
    return wrapper;
}

const meta: Meta<VehicleCritChatCtx> = {
    title: 'Chat/DwVehicleCritChat',
};
export default meta;
type Story = StoryObj<VehicleCritChatCtx>;

export const JarringBlow: Story = {
    name: 'Jarring Blow — low-end crit, Routine repair',
    args: {
        gameSystem: 'dw',
        headerKey: 'WH40K.DW.Vehicle.Crit.Header',
        resultKey: 'WH40K.DW.Vehicle.Crit.Result.Minor',
        rolled: 1,
        overIntegrity: 0,
        finalRoll: 1,
        description: 'Jarring Blow — crew shaken, shots go wide.',
        repairDifficultyKey: 'WH40K.DW.Vehicle.Repair.Difficulty.Routine',
        skipRoll: false,
    },
    render: (args) => renderCard(args),
};

export const Wrecked: Story = {
    name: 'Wrecked — clamped to row 10, Hard repair',
    args: {
        gameSystem: 'dw',
        headerKey: 'WH40K.DW.Vehicle.Crit.Header',
        resultKey: 'WH40K.DW.Vehicle.Crit.Result.Wrecked',
        rolled: 7,
        overIntegrity: 5,
        finalRoll: 10,
        description: 'Explodes — the vehicle is reduced to a burning hulk.',
        repairDifficultyKey: 'WH40K.DW.Vehicle.Repair.Difficulty.Hard',
        skipRoll: false,
    },
    render: (args) => renderCard(args),
};

export const RepairOnly: Story = {
    name: 'Repair Test — difficulty derived from prior crit, no fresh roll',
    args: {
        gameSystem: 'dw',
        headerKey: 'WH40K.DW.Vehicle.Repair.Header',
        resultKey: 'WH40K.DW.Vehicle.RepairTest',
        rolled: 0,
        overIntegrity: 0,
        finalRoll: 0,
        description: '',
        repairDifficultyKey: 'WH40K.DW.Vehicle.Repair.Difficulty.Challenging',
        skipRoll: true,
    },
    render: (args) => renderCard(args),
};
