/**
 * Storybook stories for the Deathwatch Mission panel (#169).
 *
 * Three states:
 *   1. BetweenMissions    — no active mission; panel renders the empty
 *                           state placeholder.
 *   2. InProgress         — Priority mission with a mix of objective
 *                           statuses + one untriggered complication.
 *   3. ReadyForPayout     — Critical mission, all objectives resolved,
 *                           one complication triggered.
 *
 * Per "Seeded RNG in stories" — every value is fixed for diff stability.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import panelSrc from './dw-mission-panel.hbs?raw';

initializeStoryHandlebars();

type MissionRating = 'standard' | 'extended' | 'priority' | 'critical';
type ObjectiveStatus = 'pending' | 'complete' | 'failed';

interface ObjectiveCtx {
    id: string;
    description: string;
    renownReward: number;
    xpReward: number;
    status: ObjectiveStatus;
    statusLabel: string;
}

interface ComplicationCtx {
    id: string;
    description: string;
    renownPenalty: number;
    triggered: boolean;
}

interface MissionPanelCtx {
    missionPanel: {
        hasMission: boolean;
        mission: {
            id: string;
            name: string;
            rating: MissionRating;
            ratingLabel: string;
            objectives: ObjectiveCtx[];
            complications: ComplicationCtx[];
        } | null;
    };
}

const panelTpl = Handlebars.compile(panelSrc);

function renderPanel(ctx: MissionPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'dw';
    wrapper.appendChild(renderTemplate(panelTpl, ctx));
    return wrapper;
}

const meta: Meta<MissionPanelCtx> = {
    title: 'Actor/Character/DwMissionPanel',
};
export default meta;
type Story = StoryObj<MissionPanelCtx>;

export const BetweenMissions: Story = {
    name: 'Between missions — empty state',
    args: {
        missionPanel: {
            hasMission: false,
            mission: null,
        },
    },
    render: (args) => renderPanel(args),
};

export const InProgress: Story = {
    name: 'In progress — Priority mission, mixed objective statuses',
    args: {
        missionPanel: {
            hasMission: true,
            mission: {
                id: 'mission-blackthorn-vii',
                name: 'Strike on Blackthorn VII',
                rating: 'priority',
                ratingLabel: 'Priority',
                objectives: [
                    {
                        id: 'obj-1',
                        description: 'Secure the manufactorum vault',
                        renownReward: 5,
                        xpReward: 200,
                        status: 'complete',
                        statusLabel: 'Complete',
                    },
                    {
                        id: 'obj-2',
                        description: 'Capture the cult magus alive',
                        renownReward: 10,
                        xpReward: 400,
                        status: 'pending',
                        statusLabel: 'Pending',
                    },
                    {
                        id: 'obj-3',
                        description: 'Recover the lost STC fragment',
                        renownReward: 5,
                        xpReward: 200,
                        status: 'failed',
                        statusLabel: 'Failed',
                    },
                ],
                complications: [
                    {
                        id: 'comp-1',
                        description: 'Civilian casualties exceed acceptable losses',
                        renownPenalty: 3,
                        triggered: false,
                    },
                ],
            },
        },
    },
    render: (args) => renderPanel(args),
};

export const ReadyForPayout: Story = {
    name: 'Ready for payout — Critical mission, all resolved, complication triggered',
    args: {
        missionPanel: {
            hasMission: true,
            mission: {
                id: 'mission-helion-cordon',
                name: 'Helion Cordon Breach',
                rating: 'critical',
                ratingLabel: 'Critical',
                objectives: [
                    {
                        id: 'obj-a',
                        description: 'Hold the relay until extraction',
                        renownReward: 10,
                        xpReward: 300,
                        status: 'complete',
                        statusLabel: 'Complete',
                    },
                    {
                        id: 'obj-b',
                        description: 'Destroy the xenos broodlord',
                        renownReward: 15,
                        xpReward: 500,
                        status: 'complete',
                        statusLabel: 'Complete',
                    },
                ],
                complications: [
                    {
                        id: 'comp-a',
                        description: 'Codicier killed in action — chapter shame',
                        renownPenalty: 5,
                        triggered: true,
                    },
                ],
            },
        },
    },
    render: (args) => renderPanel(args),
};
