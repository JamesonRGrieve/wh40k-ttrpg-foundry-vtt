/**
 * Storybook stories for the DW Mission reward chat card (#169).
 *
 * Three reward outcomes from `computeMissionRewards`:
 *
 *   1. CleanPayout      — every objective complete, no complications
 *                          triggered.
 *   2. WithComplication — every objective complete, one complication
 *                          triggered (Renown clamped above floor).
 *   3. PartialPayout    — mixed objective resolution, one complication
 *                          triggered. Cohesion only refunds for
 *                          completed objectives.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { renderSheet } from '../../../stories/test-helpers';
import cardSrc from './dw-mission-reward-chat.hbs?raw';

initializeStoryHandlebars();

interface RewardObjectiveCtx {
    id: string;
    description: string;
    renown: number;
    xp: number;
}

interface RewardComplicationCtx {
    id: string;
    description: string;
    renownPenalty: number;
}

interface MissionRewardChatCtx {
    gameSystem: 'dw';
    mission: {
        id: string;
        name: string;
        rating: 'standard' | 'extended' | 'priority' | 'critical';
        ratingLabel: string;
    };
    reward: {
        totalRenown: number;
        totalXp: number;
        cohesionRecovered: number;
        perObjective: RewardObjectiveCtx[];
        complicationsTriggered: RewardComplicationCtx[];
    };
}

function renderCard(ctx: MissionRewardChatCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'dw';
    wrapper.appendChild(renderSheet(cardSrc, ctx));
    return wrapper;
}

const meta: Meta<MissionRewardChatCtx> = {
    title: 'Chat/DwMissionRewardChat',
};
export default meta;
type Story = StoryObj<MissionRewardChatCtx>;

export const CleanPayout: Story = {
    name: 'Clean payout — all objectives complete, no complications',
    args: {
        gameSystem: 'dw',
        mission: {
            id: 'mission-helion-cordon',
            name: 'Helion Cordon Breach',
            rating: 'critical',
            ratingLabel: 'Critical',
        },
        reward: {
            totalRenown: 25,
            totalXp: 800,
            cohesionRecovered: 2,
            perObjective: [
                { id: 'obj-a', description: 'Hold the relay until extraction', renown: 10, xp: 300 },
                { id: 'obj-b', description: 'Destroy the xenos broodlord', renown: 15, xp: 500 },
            ],
            complicationsTriggered: [],
        },
    },
    render: (args) => renderCard(args),
};

export const WithComplication: Story = {
    name: 'With complication — Renown reduced by triggered penalty',
    args: {
        gameSystem: 'dw',
        mission: {
            id: 'mission-blackthorn-vii',
            name: 'Strike on Blackthorn VII',
            rating: 'priority',
            ratingLabel: 'Priority',
        },
        reward: {
            totalRenown: 17,
            totalXp: 800,
            cohesionRecovered: 3,
            perObjective: [
                { id: 'obj-1', description: 'Secure the manufactorum vault', renown: 5, xp: 200 },
                { id: 'obj-2', description: 'Capture the cult magus alive', renown: 10, xp: 400 },
                { id: 'obj-3', description: 'Recover the lost STC fragment', renown: 5, xp: 200 },
            ],
            complicationsTriggered: [
                {
                    id: 'comp-1',
                    description: 'Civilian casualties exceed acceptable losses',
                    renownPenalty: 3,
                },
            ],
        },
    },
    render: (args) => renderCard(args),
};

export const PartialPayout: Story = {
    name: 'Partial payout — only completed objectives award Cohesion + XP',
    args: {
        gameSystem: 'dw',
        mission: {
            id: 'mission-tarnis-rift',
            name: 'Recon of Tarnis Rift',
            rating: 'standard',
            ratingLabel: 'Standard',
        },
        reward: {
            totalRenown: 2,
            totalXp: 200,
            cohesionRecovered: 1,
            perObjective: [
                { id: 'obj-x', description: 'Map the perimeter sensor net', renown: 5, xp: 200 },
                { id: 'obj-y', description: 'Identify the warp anomaly source', renown: 0, xp: 0 },
            ],
            complicationsTriggered: [
                {
                    id: 'comp-x',
                    description: 'Recon team detected — intel leaked to xenos',
                    renownPenalty: 3,
                },
            ],
        },
    },
    render: (args) => renderCard(args),
};
