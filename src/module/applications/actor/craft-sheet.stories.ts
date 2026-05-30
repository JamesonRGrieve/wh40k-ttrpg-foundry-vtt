/**
 * Stories for CraftActorSheet — the shared conventional-craft actor sheet
 * (terracraft / aircraft / watercraft). Covers the horizontal header (name +
 * locomotion select + quick-stats), the tab strip, and the overview tab with
 * speed / manoeuverability / size fields plus the aircraft-only altitude /
 * ceiling block. Tests submitForm on craft fields and an Only War per-system
 * variant.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import HBS from 'handlebars';
import { expect, within } from 'storybook/test';
import { renderTemplate as renderTpl, mockActor } from '../../../../stories/mocks';
import { seedRandom, randomId, withSystem } from '../../../../stories/mocks/extended';
import { mockVehicleSheetContext, type SheetContextLike } from '../../../../stories/mocks/sheet-contexts';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { assertField, submitForm } from '../../../../stories/test-helpers';
import headerSrc from '../../../templates/actor/craft/header.hbs?raw';
import overviewTabSrc from '../../../templates/actor/craft/tab-overview.hbs?raw';
import tabsSrc from '../../../templates/actor/craft/tabs.hbs?raw';

initializeStoryHandlebars();

const rng = seedRandom(0xf00dcafe);

const headerTpl = HBS.compile(headerSrc);
const tabsTpl = HBS.compile(tabsSrc);
const overviewTpl = HBS.compile(overviewTabSrc);

function renderCraftSheet(ctx: SheetContextLike): HTMLElement {
    const tpl = HBS.compile(`
        <div class="tw-flex tw-flex-col">
            ${headerTpl(ctx)}
            ${tabsTpl(ctx)}
            <main class="wh40k-body tw-p-2">
                ${overviewTpl(ctx)}
            </main>
        </div>
    `);
    return renderTpl(tpl, ctx);
}

const meta: Meta<SheetContextLike> = {
    title: 'Actor/CraftActorSheet',
};
export default meta;
type Story = StoryObj<SheetContextLike>;

// Prepared craft stats shape expected by tab-overview.hbs / header.hbs.
const craftStats = {
    size: 4,
    speed: { cruising: 18, tactical: 12, notes: '' },
    armour: { front: 22, side: 18, rear: 14 },
    manoeuverability: 5,
    passengers: 12,
    carryingCapacity: 500,
    integrity: { value: 30, max: 30, critical: 0, percent: 100 },
    altitude: 'ground',
    ceiling: 0,
};

// Source fields the header inputs bind to.
const craftSource = {
    locomotion: 'tracked',
    faction: 'Imperial Guard',
    size: 4,
    integrity: { value: 30, max: 30, critical: 0 },
    armour: { front: { value: 22 }, side: { value: 18 }, rear: { value: 14 } },
    speed: { cruising: 18, tactical: 12, notes: '' },
    manoeuverability: 5,
    passengers: 12,
    carryingCapacity: 500,
    source: '',
};

const defaultCraftCtx: SheetContextLike = {
    ...mockVehicleSheetContext({ systemId: 'dh2' }),
    isCraft: true,
    isTerracraft: true,
    isAircraft: false,
    isWatercraft: false,
    craftStats,
    crew: { required: 3, notes: '' },
    source: {
        ...mockVehicleSheetContext({ systemId: 'dh2' }).source,
        ...craftSource,
    },
};

// ── Default (terracraft) ────────────────────────────────────────────────────

export const Default: Story = {
    name: 'Default — DH2e Terracraft (Chimera)',
    args: defaultCraftCtx,
    render: (args) => renderCraftSheet(args),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        // Craft name in header
        await expect(view.getByDisplayValue('Chimera APC')).toBeVisible();
        // Overview tab renders manoeuverability field
        assertField(canvasElement, 'system.manoeuverability', 5);
    },
};

// ── Edit-mode fields ──────────────────────────────────────────────────────────

export const EditMode: Story = {
    name: 'Edit Mode — speed fields editable',
    args: {
        ...defaultCraftCtx,
        inEditMode: true,
        editable: true,
    },
    render: (args) => renderCraftSheet(args),
    play: ({ canvasElement }) => {
        assertField(canvasElement, 'system.speed.cruising', 18);
        assertField(canvasElement, 'system.speed.tactical', 12);
        assertField(canvasElement, 'system.size', 4);
    },
};

// ── Interaction: submit form with updated size ────────────────────────────────

export const SubmitSizeChange: Story = {
    name: 'Interaction — submit size field change',
    args: {
        ...defaultCraftCtx,
        inEditMode: true,
        editable: true,
    },
    render: (args) => renderCraftSheet(args),
    play: ({ canvasElement }) => {
        submitForm(canvasElement, { 'system.size': 5 });
        assertField(canvasElement, 'system.size', 5);
    },
};

// ── Aircraft variant: altitude / ceiling block shown ──────────────────────────

export const AircraftVariant: Story = {
    name: 'Aircraft — altitude / ceiling block',
    args: {
        ...defaultCraftCtx,
        isTerracraft: false,
        isAircraft: true,
        craftStats: { ...craftStats, altitude: 'high', ceiling: 30000 },
    },
    render: (args) => renderCraftSheet(args),
    play: ({ canvasElement }) => {
        // The aircraft-only ceiling field renders when isAircraft is true.
        assertField(canvasElement, 'system.ceiling', 30000);
    },
};

// ── Per-system: Only War ──────────────────────────────────────────────────────

export const OnlyWarVariant: Story = {
    name: 'Per-system — Only War (Leman Russ)',
    args: (() => {
        const base = mockActor({
            _id: randomId('ow-terracraft', rng),
            name: 'Leman Russ Battle Tank',
            type: 'terracraft',
        });
        const owActor = withSystem(base, 'ow', 'vehicle');
        return {
            ...defaultCraftCtx,
            actor: owActor as SheetContextLike['actor'],
            system: owActor.system,
        };
    })(),
    render: (args) => renderCraftSheet(args),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByDisplayValue('Leman Russ Battle Tank')).toBeVisible();
    },
};
