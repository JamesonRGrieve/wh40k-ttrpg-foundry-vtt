/**
 * Stories for CraftActorSheet — the shared conventional-craft actor sheet
 * (terracraft / aircraft / watercraft). Covers the horizontal header (name +
 * locomotion select + quick-stats), the tab strip, and the overview tab with
 * speed / manoeuverability / size fields plus the aircraft-only altitude /
 * ceiling block. Tests submitForm on craft fields and an Only War per-system
 * variant.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { mockActor } from '../../../../stories/mocks';
import { seedRandom, randomId, withSystem, type SystemId } from '../../../../stories/mocks/extended';
import { mockVehicleSheetContext, type SheetContextLike } from '../../../../stories/mocks/sheet-contexts';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { assertField, submitForm, renderSheetParts } from '../../../../stories/test-helpers';
import headerSrc from '../../../templates/actor/craft/header.hbs?raw';
import combatTabSrc from '../../../templates/actor/craft/tab-combat.hbs?raw';
import overviewTabSrc from '../../../templates/actor/craft/tab-overview.hbs?raw';
import tabsSrc from '../../../templates/actor/craft/tabs.hbs?raw';

initializeStoryHandlebars();

const rng = seedRandom(0xf00dcafe);

/** Actor types are `<systemId>-<role>`; the prefix is the active game-system id. */
function systemIdOf(ctx: SheetContextLike): string {
    const [systemId = 'dh2'] = ctx.actor.type.split('-');
    return systemId;
}

function renderCraftSheet(ctx: SheetContextLike): HTMLElement {
    return renderSheetParts([{ template: headerSrc }, { template: tabsSrc }, { template: overviewTabSrc, partClass: 'wh40k-body tw-p-2' }], ctx, {
        systemId: systemIdOf(ctx),
    });
}

/** Render the combat tab (holds the animate-craft characteristics profile grid). */
function renderCraftCombat(ctx: SheetContextLike): HTMLElement {
    return renderSheetParts([{ template: headerSrc }, { template: tabsSrc }, { template: combatTabSrc, partClass: 'wh40k-body tw-p-2' }], ctx, {
        systemId: systemIdOf(ctx),
    });
}

/**
 * A daemon-engine characteristics profile in the derived shape the sheet reads
 * (base = printed value, total/bonus computed). Defiler (OW Core p.355):
 * WS/BS 25, S 75 with Unnatural Strength (7) → SB 49, T — (0).
 */
const daemonEngineCharacteristics = {
    weaponSkill: { label: 'Weapon Skill', short: 'WS', base: 25, modifier: 0, unnatural: 0, total: 25, bonus: 2 },
    ballisticSkill: { label: 'Ballistic Skill', short: 'BS', base: 25, modifier: 0, unnatural: 0, total: 25, bonus: 2 },
    strength: { label: 'Strength', short: 'S', base: 75, modifier: 0, unnatural: 7, total: 75, bonus: 49 },
    toughness: { label: 'Toughness', short: 'T', base: 0, modifier: 0, unnatural: 0, total: 0, bonus: 0 },
    agility: { label: 'Agility', short: 'Ag', base: 35, modifier: 0, unnatural: 0, total: 35, bonus: 3 },
    intelligence: { label: 'Intelligence', short: 'Int', base: 10, modifier: 0, unnatural: 0, total: 10, bonus: 1 },
    perception: { label: 'Perception', short: 'Per', base: 40, modifier: 0, unnatural: 0, total: 40, bonus: 4 },
    willpower: { label: 'Willpower', short: 'WP', base: 40, modifier: 0, unnatural: 0, total: 40, bonus: 4 },
    fellowship: { label: 'Fellowship', short: 'Fel', base: 1, modifier: 0, unnatural: 0, total: 1, bonus: 0 },
};

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

// ── Animate craft (daemon-engine profile) ────────────────────────────────────

export const DaemonEngine: Story = {
    name: 'Daemon-engine — OW Defiler (characteristics profile)',
    args: {
        ...defaultCraftCtx,
        characteristics: daemonEngineCharacteristics,
        profileAbilities: [
            { _id: 'ab-str', name: 'Unnatural Strength (7)' },
            { _id: 'ab-swift', name: 'Swift Attack' },
            { _id: 'ab-twm', name: 'Two-Weapon Wielder (Melee)' },
        ],
    },
    render: (args) => renderCraftCombat(args),
    play: async ({ canvasElement }) => {
        // The profile grid renders the Strength base (75) and the abilities list.
        assertField(canvasElement, 'system.characteristics.strength.base', 75);
        const view = within(canvasElement);
        await expect(view.getByText('Unnatural Strength (7)')).toBeVisible();
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

// ── Per-system homologation: all seven game lines ─────────────────────────────
//
// The craft sheet is shared chrome; every game line renders the same speed /
// manoeuverability / size fields. Each variant flips the actor's system tag
// (via `withSystem`) so DH2-only assumptions in the header / overview surface,
// and stamps `data-wh40k-system` (through `renderCraftSheet`) so per-system
// theme variants cascade in visual review.

function makePerSystemCraftStory(systemId: SystemId, craftName: string): Story {
    const base = mockActor({
        _id: randomId(`${systemId}-terracraft`, rng),
        name: craftName,
        type: 'terracraft',
    });
    const systemActor = withSystem(base, systemId, 'vehicle');
    return {
        name: `Per-system — ${systemId.toUpperCase()} (${craftName})`,
        args: {
            ...defaultCraftCtx,
            actor: systemActor as SheetContextLike['actor'],
            system: systemActor.system,
        },
        render: (args) => renderCraftSheet(args),
        play: async ({ canvasElement }) => {
            const view = within(canvasElement);
            // Header renders the craft name and the overview tab keeps its fields
            // regardless of which game line owns the actor.
            await expect(view.getByDisplayValue(craftName)).toBeVisible();
            assertField(canvasElement, 'system.manoeuverability', 5);
        },
    };
}

export const SystemDH2: Story = makePerSystemCraftStory('dh2', 'Chimera APC');
export const SystemDH1: Story = makePerSystemCraftStory('dh1', 'Salamander Scout');
export const SystemRT: Story = makePerSystemCraftStory('rt', 'Arvus Lighter');
export const SystemBC: Story = makePerSystemCraftStory('bc', 'Hellblade Skiff');
export const SystemOW: Story = makePerSystemCraftStory('ow', 'Leman Russ Battle Tank');
export const SystemDW: Story = makePerSystemCraftStory('dw', 'Land Raider Crusader');
export const SystemIM: Story = makePerSystemCraftStory('im', 'Goliath Truck');
