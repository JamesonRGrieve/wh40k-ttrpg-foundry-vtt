/**
 * Storybook stories for the DW Vehicle Crit / Repair panel (#170 —
 * rites.md §"DAMAGING VEHICLES", §"REPAIRING VEHICLES"). Covers the
 * three visual states an operator needs to verify in review:
 *
 *   1. Pristine     — fresh vehicle, no over-Integrity damage, both
 *                     affordances disabled (no crit / no repair).
 *   2. Damaged      — over-Integrity > 0, both affordances enabled.
 *   3. Wrecked      — Integrity zeroed, large over-Integrity; both
 *                     affordances live (final-stage repair workflow).
 *
 * Every value is fixed for diff stability (no Math.random).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import panelSrc from './dw-vehicle-panel.hbs?raw';

initializeStoryHandlebars();

interface VehiclePanelCtx {
    vehiclePanel: {
        integrity: number;
        overIntegrity: number;
        canRollCrit: boolean;
        canRepair: boolean;
    };
}

const panelTpl = Handlebars.compile(panelSrc);

function renderPanel(ctx: VehiclePanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'dw';
    wrapper.appendChild(renderTemplate(panelTpl, ctx));
    return wrapper;
}

const meta: Meta<VehiclePanelCtx> = {
    title: 'Actor/Character/DwVehiclePanel',
};
export default meta;
type Story = StoryObj<VehiclePanelCtx>;

export const Pristine: Story = {
    name: 'Pristine — fresh vehicle, no damage',
    args: {
        vehiclePanel: {
            integrity: 25,
            overIntegrity: 0,
            canRollCrit: false,
            canRepair: false,
        },
    },
    render: (args) => renderPanel(args),
};

export const Damaged: Story = {
    name: 'Damaged — accumulated over-Integrity; both affordances live',
    args: {
        vehiclePanel: {
            integrity: 4,
            overIntegrity: 3,
            canRollCrit: true,
            canRepair: true,
        },
    },
    render: (args) => renderPanel(args),
};

export const Wrecked: Story = {
    name: 'Wrecked — Integrity zeroed, severe over-Integrity buildup',
    args: {
        vehiclePanel: {
            integrity: 0,
            overIntegrity: 7,
            canRollCrit: true,
            canRepair: true,
        },
    },
    render: (args) => renderPanel(args),
};
