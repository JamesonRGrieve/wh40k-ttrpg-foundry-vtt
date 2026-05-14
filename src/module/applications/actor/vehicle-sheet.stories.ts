/**
 * Stories for VehicleSheet — the vehicle/walker/flyer actor sheet. Covers the
 * horizontal header (name + type select + quick-stats), the tab strip, and the
 * overview tab with speed/hull/size fields. Tests submitForm on hull fields and
 * an Only War per-system variant.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import Handlebars from 'handlebars';
import headerSrc from '../../../templates/actor/vehicle/header.hbs?raw';
import tabsSrc from '../../../templates/actor/vehicle/tabs.hbs?raw';
import overviewTabSrc from '../../../templates/actor/vehicle/tab-overview.hbs?raw';
import { renderTemplate } from '../../../../stories/mocks';
import { mockVehicleSheetContext, type SheetContextLike } from '../../../../stories/mocks/sheet-contexts';
import { seedRandom, randomId, withSystem } from '../../../../stories/mocks/extended';
import { mockActor } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { assertField, submitForm } from '../../../../stories/test-helpers';

initializeStoryHandlebars();

const rng = seedRandom(0xf00dcafe);

const headerTpl = Handlebars.compile(headerSrc);
const tabsTpl = Handlebars.compile(tabsSrc);
const overviewTpl = Handlebars.compile(overviewTabSrc);

function renderVehicleSheet(ctx: SheetContextLike): HTMLElement {
    const tpl = Handlebars.compile(`
        <div class="tw-flex tw-flex-col">
            ${headerTpl(ctx)}
            ${tabsTpl(ctx)}
            <main class="wh40k-body tw-p-2">
                ${overviewTpl(ctx)}
            </main>
        </div>
    `);
    return renderTemplate(tpl, ctx);
}

const _vehicleId = randomId('vehicle', rng);

const meta: Meta<SheetContextLike> = {
    title: 'Actor/VehicleSheet',
};
export default meta;
type Story = StoryObj<SheetContextLike>;

// Shared vehicle stats shape expected by tab-overview.hbs
const vehicleStats = {
    speed: { cruising: 18, tactical: 12, notes: '' },
    handling: 10,
    structure: { value: 30, max: 30, percent: 100 },
    hull: 25,
    manoeuvrability: 15,
    size: 4,
};

const defaultVehicleCtx: SheetContextLike = {
    ...mockVehicleSheetContext({ systemId: 'dh2e' }),
    vehicleStats,
    source: {
        ...mockVehicleSheetContext({ systemId: 'dh2e' }).source,
        type: 'vehicle',
        faction: 'Imperial Guard',
        wounds: { value: 30, max: 30 },
        armour: { total: 22 },
        size: 4,
        speed: { cruising: 18, tactical: 12, notes: '' },
        handling: 10,
        hull: 25,
    },
    crewStats: {
        required: 3,
        rating: 35,
        morale: 70,
        notes: '',
    },
};

// ── Default ───────────────────────────────────────────────────────────────────

export const Default: Story = {
    name: 'Default — DH2e Chimera',
    args: defaultVehicleCtx,
    render: (args) => renderVehicleSheet(args),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // Vehicle name in header
        await expect(canvas.getByDisplayValue('Chimera APC')).toBeVisible();
        // Overview tab renders handling field
        assertField(canvasElement, 'system.handling', 10);
    },
};

// ── Edit-mode fields ──────────────────────────────────────────────────────────

export const EditMode: Story = {
    name: 'Edit Mode — hull speed fields editable',
    args: {
        ...defaultVehicleCtx,
        inEditMode: true,
        editable: true,
    },
    render: (args) => renderVehicleSheet(args),
    play: async ({ canvasElement }) => {
        assertField(canvasElement, 'system.speed.cruising', 18);
        assertField(canvasElement, 'system.speed.tactical', 12);
        assertField(canvasElement, 'system.hull', 25);
    },
};

// ── Interaction: submit form with updated size ────────────────────────────────

export const SubmitSizeChange: Story = {
    name: 'Interaction — submit size field change',
    args: {
        ...defaultVehicleCtx,
        inEditMode: true,
        editable: true,
    },
    render: (args) => renderVehicleSheet(args),
    play: async ({ canvasElement }) => {
        // Fill the size field and submit — submitForm throws if the named
        // element is absent, so this doubles as a render assertion.
        submitForm(canvasElement, { 'system.size': 5 });
        assertField(canvasElement, 'system.size', 5);
    },
};

// ── Per-system: Only War ──────────────────────────────────────────────────────

export const OnlyWarVariant: Story = {
    name: 'Per-system — Only War',
    args: (() => {
        const base = mockActor({
            _id: randomId('ow-vehicle', rng),
            name: 'Leman Russ Battle Tank',
            type: 'ow-vehicle',
        });
        const owActor = withSystem(base, 'ow', 'vehicle');
        return {
            ...defaultVehicleCtx,
            actor: owActor as SheetContextLike['actor'],
            system: owActor.system as SheetContextLike['system'],
        };
    })(),
    render: (args) => renderVehicleSheet(args),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByDisplayValue('Leman Russ Battle Tank')).toBeVisible();
    },
};
