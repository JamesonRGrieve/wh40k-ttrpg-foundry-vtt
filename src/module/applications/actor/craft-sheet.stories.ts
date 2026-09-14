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
import componentsTabSrc from '../../../templates/actor/craft/tab-components.hbs?raw';
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

function renderCraftComponents(ctx: SheetContextLike): HTMLElement {
    return renderSheetParts([{ template: headerSrc }, { template: tabsSrc }, { template: componentsTabSrc, partClass: 'wh40k-body tw-p-2' }], ctx, {
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
    manoeuverabilityLabel: '5',
    passengers: 12,
    carryingCapacity: 500,
    carryingCapacityLabel: '500',
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

const craftSystem = {
    ...mockVehicleSheetContext({ systemId: 'dh2' }).system,
    sizeLabel: 'Enormous',
};

const defaultCraftCtx: SheetContextLike = {
    ...mockVehicleSheetContext({ systemId: 'dh2' }),
    system: craftSystem,
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
        await expect(view.getAllByText('Enormous').length).toBeGreaterThan(0);
        // Read-only overview renders the manoeuverability label ("5") and the
        // speed input; manoeuverability is a label out of edit mode (#572/#27).
        await expect(view.getByText('5')).toBeVisible();
        assertField(canvasElement, 'system.speed.cruising', 18);
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

export const Components: Story = {
    name: 'Components — owned vehicle upgrades',
    args: {
        ...defaultCraftCtx,
        components: [
            {
                _id: 'component-1',
                name: 'Reinforced Hull',
                system: { description: '<p>Improves structural resilience.</p>', active: true },
            },
        ],
        vehicleUpgrades: [],
    },
    render: (args) => renderCraftComponents(args),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Reinforced Hull')).toBeVisible();
    },
};

export const MountedLoadout: Story = {
    name: 'Mounted loadout — readable weapon stats and components',
    args: {
        ...defaultCraftCtx,
        weapons: [
            {
                _id: 'weapon-1',
                name: 'Twin-linked Autocannon',
                system: { damageLabel: '4d10+5 I', rangeLabel: '300m' },
            },
        ],
        components: [
            {
                _id: 'component-1',
                name: 'Reinforced Hull',
                system: { description: '<p>Improves structural resilience.</p>', active: true },
            },
        ],
        vehicleUpgrades: [],
    },
    render: (args) => renderCraftCombat(args),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Twin-linked Autocannon')).toBeVisible();
        await expect(view.getByText('4d10+5 I')).toBeVisible();
        await expect(view.getByText('300m')).toBeVisible();
    },
};

// ── Named-hardpoint loadout (Dreadnought arms) ────────────────────────────────

export const HardpointLoadout: Story = {
    name: 'Hardpoints — Dreadnought arms with available picker',
    args: {
        ...defaultCraftCtx,
        inEditMode: true,
        editable: true,
        hardpointGroups: [
            {
                id: 'left-arm',
                label: 'Left Arm',
                capacity: 1,
                used: 1,
                full: true,
                mounted: [{ _id: 'w-las', name: 'Twin-linked Lascannons', system: { damageLabel: '6d10+10 E', rangeLabel: '300m' } }],
                available: [],
            },
            {
                id: 'right-arm',
                label: 'Right Arm',
                capacity: 1,
                used: 0,
                full: false,
                mounted: [],
                available: [
                    { _id: 'w-ac', name: 'Assault Cannon', system: { damageLabel: '3d10+6 I', rangeLabel: '150m' } },
                    { _id: 'w-mm', name: 'Multi-melta', system: { damageLabel: '4d10+6 E', rangeLabel: '60m' } },
                ],
            },
        ],
        innateWeapons: [{ _id: 'w-melee', name: 'Dreadnought Basic Melee Attack', system: { damageLabel: '1d10+14 I', rangeLabel: 'Melee' } }],
        unassignedWeapons: [],
    },
    render: (args) => renderCraftCombat(args),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        // Each hardpoint renders with its capacity readout.
        await expect(view.getByText('Left Arm')).toBeVisible();
        await expect(view.getByText('Right Arm')).toBeVisible();
        // The mounted weapon shows in its hardpoint; the empty arm offers its eligible options.
        await expect(view.getByText('Twin-linked Lascannons')).toBeVisible();
        const addAssault = view.getByText('Assault Cannon').closest('button');
        await expect(addAssault).not.toBeNull();
        await expect(addAssault).toHaveAttribute('data-action', 'mountWeapon');
        await expect(addAssault).toHaveAttribute('data-hardpoint', 'right-arm');
        // The innate Basic Melee Attack is always present, in its own section.
        await expect(view.getByText('Dreadnought Basic Melee Attack')).toBeVisible();
    },
};

// ── Dreadnought profile: pilot-provided / not-applicable characteristics ───────

const dreadnoughtCharacteristics = {
    weaponSkill: { label: 'Weapon Skill', short: 'WS', base: 0, modifier: 0, unnatural: 0, total: 0, bonus: 0, source: 'pilot' },
    ballisticSkill: { label: 'Ballistic Skill', short: 'BS', base: 0, modifier: 0, unnatural: 0, total: 0, bonus: 0, source: 'pilot' },
    strength: { label: 'Strength', short: 'S', base: 70, modifier: 0, unnatural: 0, total: 70, bonus: 14, source: 'fixed' },
    toughness: { label: 'Toughness', short: 'T', base: 0, modifier: 0, unnatural: 0, total: 0, bonus: 0, source: 'na' },
    agility: { label: 'Agility', short: 'Ag', base: 20, modifier: 0, unnatural: 0, total: 20, bonus: 2, source: 'fixed' },
    intelligence: { label: 'Intelligence', short: 'Int', base: 0, modifier: 0, unnatural: 0, total: 0, bonus: 0, source: 'pilot' },
    perception: { label: 'Perception', short: 'Per', base: 0, modifier: 0, unnatural: 0, total: 0, bonus: 0, source: 'pilot' },
    willpower: { label: 'Willpower', short: 'WP', base: 0, modifier: 0, unnatural: 0, total: 0, bonus: 0, source: 'pilot' },
    fellowship: { label: 'Fellowship', short: 'Fel', base: 0, modifier: 0, unnatural: 0, total: 0, bonus: 0, source: 'pilot' },
};

export const DreadnoughtProfile: Story = {
    name: 'Dreadnought profile — pilot (*) and N/A (—) characteristics',
    args: {
        ...defaultCraftCtx,
        characteristics: dreadnoughtCharacteristics,
    },
    render: (args) => renderCraftCombat(args),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        // Fixed chassis stat renders its number as an editable base.
        assertField(canvasElement, 'system.characteristics.strength.base', 70);
        // Pilot-provided characteristics print `*`, not a false 0.
        await expect(view.getAllByText('*').length).toBeGreaterThan(0);
        // Toughness is not applicable to a vehicle: printed `—`.
        await expect(view.getAllByText('—').length).toBeGreaterThan(0);
    },
};

// ── Vehicle traits rendered as items (not [object Object]) ────────────────────

export const VehicleTraits: Story = {
    name: 'Vehicle traits — rendered as items with descriptions',
    args: {
        ...defaultCraftCtx,
        vehicleTraits: [
            {
                _id: 'vt-walker',
                name: 'Walker',
                system: { description: { value: '<p>Ignores difficult terrain.</p>' }, descriptionText: 'Ignores difficult terrain.' },
            },
            { _id: 'vt-rein', name: 'Reinforced Hull', system: { description: { value: '' }, descriptionText: 'Halve Critical Hit results, rounding up.' } },
        ],
    },
    render: (args) => renderCraftCombat(args),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        // Trait names render as items; descriptions render from `.value` (or the
        // plain descriptionText fallback) — never the raw object ("[object Object]").
        await expect(view.getByText('Walker')).toBeVisible();
        await expect(view.getByText('Ignores difficult terrain.')).toBeVisible();
        await expect(view.getByText('Halve Critical Hit results, rounding up.')).toBeVisible();
        await expect(view.queryByText('[object Object]')).toBeNull();
    },
};

// ── Not-applicable stats (Dreadnought manoeuverability / carry) ────────────────

export const NotApplicableStats: Story = {
    name: 'Not-applicable stats — Dreadnought (— manoeuverability / carry)',
    args: {
        ...defaultCraftCtx,
        craftStats: {
            ...craftStats,
            size: 6,
            manoeuverability: null,
            manoeuverabilityLabel: '—',
            carryingCapacity: null,
            carryingCapacityLabel: '—',
        },
        system: { ...craftSystem, sizeLabel: 'Enormous' },
    },
    render: (args) => renderCraftSheet(args),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        // Manoeuverability AND carrying capacity both print an em-dash, not 0.
        await expect(view.getAllByText('—').length).toBeGreaterThanOrEqual(2);
        await expect(view.getAllByText('Enormous').length).toBeGreaterThan(0);
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
            assertField(canvasElement, 'system.speed.cruising', 18);
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
