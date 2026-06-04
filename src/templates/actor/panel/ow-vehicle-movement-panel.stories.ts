/**
 * Storybook stories for the OW Vehicle Movement panel (#156 — core.md
 * §"VEHICLE MOVEMENT", p.12305). Covers the three visual states an
 * operator needs to verify in review:
 *
 *   1. NoChase     — five action rows render, chase readout shows the
 *                    "no active chase" empty state.
 *   2. ChaseActive — active chase tracker, no handling hazard this
 *                    tick; pursuer is still closing.
 *   3. DangerZone  — pursuer has caught the target (distance ≤ 0) and
 *                    a handling hazard fires.
 *
 * Every value is fixed for diff stability (no Math.random).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import panelSrc from './ow-vehicle-movement-panel.hbs?raw';

initializeStoryHandlebars();

interface VehicleMovementAction {
    actionId: 'evasive-manoeuvring' | 'floor-it' | 'hit-and-run' | 'jink' | 'tactical-manoeuvring';
    nameKey: string;
    descriptionKey: string;
    timingKey: string;
    timing: 'full' | 'half' | 'reaction';
}

interface ChaseState {
    pursuerDistance: number;
    dangerZone: boolean;
    turnCount: number;
}

interface VehicleMovementPanelCtx {
    vehicleMovementPanel: {
        actions: VehicleMovementAction[];
        chaseState: ChaseState | null;
    };
}

const FIVE_ACTIONS: VehicleMovementAction[] = [
    {
        actionId: 'evasive-manoeuvring',
        nameKey: 'WH40K.OW.VehicleMovement.Action.EvasiveManoeuvring',
        descriptionKey: 'WH40K.OW.VehicleMovement.Description.EvasiveManoeuvring',
        timingKey: 'WH40K.OW.VehicleMovement.Timing.Half',
        timing: 'half',
    },
    {
        actionId: 'floor-it',
        nameKey: 'WH40K.OW.VehicleMovement.Action.FloorIt',
        descriptionKey: 'WH40K.OW.VehicleMovement.Description.FloorIt',
        timingKey: 'WH40K.OW.VehicleMovement.Timing.Full',
        timing: 'full',
    },
    {
        actionId: 'hit-and-run',
        nameKey: 'WH40K.OW.VehicleMovement.Action.HitAndRun',
        descriptionKey: 'WH40K.OW.VehicleMovement.Description.HitAndRun',
        timingKey: 'WH40K.OW.VehicleMovement.Timing.Full',
        timing: 'full',
    },
    {
        actionId: 'jink',
        nameKey: 'WH40K.OW.VehicleMovement.Action.Jink',
        descriptionKey: 'WH40K.OW.VehicleMovement.Description.Jink',
        timingKey: 'WH40K.OW.VehicleMovement.Timing.Reaction',
        timing: 'reaction',
    },
    {
        actionId: 'tactical-manoeuvring',
        nameKey: 'WH40K.OW.VehicleMovement.Action.TacticalManoeuvring',
        descriptionKey: 'WH40K.OW.VehicleMovement.Description.TacticalManoeuvring',
        timingKey: 'WH40K.OW.VehicleMovement.Timing.Half',
        timing: 'half',
    },
];

function renderPanel(ctx: VehicleMovementPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'ow';
    wrapper.appendChild(renderSheet(panelSrc, ctx));
    return wrapper;
}

const meta: Meta<VehicleMovementPanelCtx> = {
    title: 'Actor/Character/OwVehicleMovementPanel',
};
export default meta;
type Story = StoryObj<VehicleMovementPanelCtx>;

export const NoChase: Story = {
    name: 'No chase — five action rows, empty chase readout',
    args: {
        vehicleMovementPanel: {
            actions: FIVE_ACTIONS,
            chaseState: null,
        },
    },
    render: (args) => renderPanel(args),
};

export const ChaseActive: Story = {
    name: 'Chase active — pursuer closing, no handling hazard',
    args: {
        vehicleMovementPanel: {
            actions: FIVE_ACTIONS,
            chaseState: {
                pursuerDistance: 120,
                dangerZone: false,
                turnCount: 3,
            },
        },
    },
    render: (args) => renderPanel(args),
};

export const DangerZone: Story = {
    name: 'Danger Zone — pursuer caught the target; handling hazard fires',
    args: {
        vehicleMovementPanel: {
            actions: FIVE_ACTIONS,
            chaseState: {
                pursuerDistance: 0,
                dangerZone: true,
                turnCount: 6,
            },
        },
    },
    render: (args) => renderPanel(args),
};
