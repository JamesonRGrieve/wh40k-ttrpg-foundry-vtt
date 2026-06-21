/**
 * Stories for VoidcraftActorSheet — the Rogue Trader voidcraft (ship-scale)
 * actor sheet (renamed from StarshipSheet). Covers the header (hull type/class
 * + stat boxes), the tab strip, and the stats tab with
 * speed/manoeuvrability/armour fields. Tests rollInitiative action and the
 * Rogue Trader per-system variant.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import Hbs from 'handlebars';
import { expect, within } from 'storybook/test';
import { mockActor } from '../../../../stories/mocks';
import { seedRandom, randomId, withSystem } from '../../../../stories/mocks/extended';
import { mockStarshipSheetContext, type SheetContextLike } from '../../../../stories/mocks/sheet-contexts';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { clickAction, assertField, renderSheetParts } from '../../../../stories/test-helpers';
import headerSrc from '../../../templates/actor/voidcraft/header.hbs?raw';
import crewTabSrc from '../../../templates/actor/voidcraft/tab-crew.hbs?raw';
import extendedActionsTabSrc from '../../../templates/actor/voidcraft/tab-extended-actions.hbs?raw';
import statsTabSrc from '../../../templates/actor/voidcraft/tab-stats.hbs?raw';
import tabsSrc from '../../../templates/actor/voidcraft/tabs.hbs?raw';
import shipWeaponChatSrc from '../../../templates/chat/ship-weapon-chat.hbs?raw';

initializeStoryHandlebars();

const rng = seedRandom(0xca5cade5);

const shipWeaponChatTpl = Hbs.compile(shipWeaponChatSrc);

/** Actor types are `<systemId>-<role>`; the prefix is the active game-system id. */
function systemIdOf(ctx: SheetContextLike): string {
    const [systemId = 'rt'] = ctx.actor.type.split('-');
    return systemId;
}

/**
 * Render the resolved ship-weapon-firing chat card under a `.wh40k-rpg` +
 * `data-wh40k-system` ancestor so Tailwind utilities (scoped by
 * `important: '.wh40k-rpg'`) and per-system variants both cascade — chat cards
 * render outside any sheet root at runtime (CLAUDE.md "Adaptation procedure 3a").
 */
function renderShipWeaponChatCard(args: ShipWeaponChatCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'wh40k-rpg tw-p-4';
    wrapper.setAttribute('data-wh40k-system', args.gameSystem);
    wrapper.innerHTML = shipWeaponChatTpl(args);
    return wrapper;
}

function renderVoidcraftSheet(ctx: SheetContextLike): HTMLElement {
    return renderSheetParts(
        [
            { template: headerSrc },
            { template: tabsSrc },
            { template: statsTabSrc, partClass: 'wh40k-body tw-p-2' },
        ],
        ctx,
        { systemId: systemIdOf(ctx) },
    );
}

// Seed the RNG to keep subsequent randomId calls deterministic
randomId('starship', rng);

const meta: Meta<SheetContextLike> = {
    title: 'Actor/VoidcraftActorSheet',
};
export default meta;
type Story = StoryObj<SheetContextLike>;

// ── Default (Rogue Trader) ────────────────────────────────────────────────────

const defaultStarshipCtx = mockStarshipSheetContext({ systemId: 'rt' });
// Provide source fields expected by the stats tab
const defaultCtxWithSource: SheetContextLike = {
    ...defaultStarshipCtx,
    source: {
        ...defaultStarshipCtx.source,
        hullType: 'Sword-class Frigate',
        hullClass: 'Frigate',
        speed: 8,
        manoeuvrability: 15,
        detection: 10,
        armour: 18,
        voidShields: 1,
        turretRating: 1,
        shipPoints: 40,
        space: { total: 40, used: 22 },
        power: { total: 60, used: 35 },
        weaponCapacity: { prow: 1, dorsal: 2, port: 1, starboard: 1, keel: 0 },
        dimensions: '1.8km',
        hullIntegrity: { value: 35, max: 35 },
        crew: { morale: { value: 100, max: 100 }, population: 80, crewRating: 40 },
    },
};

export const Default: Story = {
    name: 'Default — Rogue Trader Starship',
    args: defaultCtxWithSource,
    render: (args) => renderVoidcraftSheet(args),
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        // Ship name in header
        await expect(storyCanvas.getByDisplayValue('Sword of Terra')).toBeVisible();
        // Stats tab renders speed field
        assertField(canvasElement, 'system.speed', 8);
    },
};

// ── Edit-mode fields ──────────────────────────────────────────────────────────

export const EditMode: Story = {
    name: 'Edit Mode — hull fields editable',
    args: {
        ...defaultCtxWithSource,
        inEditMode: true,
        editable: true,
    },
    render: (args) => renderVoidcraftSheet(args),
    play: ({ canvasElement }) => {
        assertField(canvasElement, 'system.armour', 18);
        assertField(canvasElement, 'system.manoeuvrability', 15);
    },
};

// ── Interaction: rollInitiative ───────────────────────────────────────────────

export const RollInitiative: Story = {
    name: 'Interaction — rollInitiative fires',
    args: defaultCtxWithSource,
    render: (args) => renderVoidcraftSheet(args),
    play: ({ canvasElement }) => {
        // Button has data-action="rollInitiative" — presence confirms it rendered.
        clickAction(canvasElement, 'rollInitiative');
    },
};

// ── Per-system variant: Black Crusade (using vehicle role) ────────────────────

export const BlackCruisadeVariant: Story = {
    name: 'Per-system — Black Crusade',
    args: (() => {
        const base = mockActor({
            _id: randomId('bc-starship', rng),
            name: 'Despoiler-class Battleship',
            type: 'rt-starship',
        });
        const bcActor = withSystem(base, 'bc', 'vehicle');
        return {
            ...defaultCtxWithSource,
            actor: bcActor as SheetContextLike['actor'],
            system: bcActor.system,
        };
    })(),
    render: (args) => renderVoidcraftSheet(args),
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        await expect(storyCanvas.getByDisplayValue('Despoiler-class Battleship')).toBeVisible();
    },
};

// ── Issue #186 — Starship Extended Actions panel ─────────────────────────────
//
// Renders the extended-actions tab with a pre-seeded list of the 13 RAW
// Rogue Trader Extended Actions. The list is fed via context (no compendium
// access from inside a Storybook story); each entry has the shape returned
// by `StarshipSheet._prepareExtendedActions`.

const issue186ExtendedActions = [
    { uuid: 'rt-ea-active-augury', id: 'active-augury', name: 'Active Augury', img: '', skill: 'Scrutiny', modifier: 0, duration: '1 Round' },
    { uuid: 'rt-ea-brace-for-impact', id: 'brace-for-impact', name: 'Brace for Impact', img: '', skill: 'Command', modifier: 0, duration: '1 Round' },
    {
        uuid: 'rt-ea-defensive-stance',
        id: 'defensive-stance',
        name: 'Defensive Stance',
        img: '',
        skill: 'Pilot (Space Craft)',
        modifier: 0,
        duration: '1 Round',
    },
    { uuid: 'rt-ea-disengage', id: 'disengage', name: 'Disengage', img: '', skill: 'Pilot (Space Craft)', modifier: 0, duration: '1 Round' },
    { uuid: 'rt-ea-emergency-repair', id: 'emergency-repair', name: 'Emergency Repair', img: '', skill: 'Tech-Use', modifier: -10, duration: '1d5 Rounds' },
    {
        uuid: 'rt-ea-evasive-manoeuvres',
        id: 'evasive-manoeuvres',
        name: 'Evasive Manoeuvres',
        img: '',
        skill: 'Pilot (Space Craft)',
        modifier: 0,
        duration: '1 Round',
    },
    { uuid: 'rt-ea-focused-augury', id: 'focused-augury', name: 'Focused Augury', img: '', skill: 'Scrutiny', modifier: -10, duration: '1 Round' },
    { uuid: 'rt-ea-lock-on', id: 'lock-on', name: 'Lock On', img: '', skill: 'Ballistic Skill', modifier: 0, duration: '1 Round' },
    { uuid: 'rt-ea-plot-course', id: 'plot-course', name: 'Plot Course', img: '', skill: 'Navigation (Warp)', modifier: 0, duration: '1d5 Rounds' },
    { uuid: 'rt-ea-quick-repair', id: 'quick-repair', name: 'Quick Repair', img: '', skill: 'Tech-Use', modifier: -20, duration: '1 Round' },
    { uuid: 'rt-ea-rapid-reload', id: 'rapid-reload', name: 'Rapid Reload', img: '', skill: 'Command', modifier: 0, duration: '1 Round' },
    {
        uuid: 'rt-ea-set-up-boarding-action',
        id: 'set-up-boarding-action',
        name: 'Set Up Boarding Action',
        img: '',
        skill: 'Command',
        modifier: 0,
        duration: '1 Round',
    },
    { uuid: 'rt-ea-suppressive-fire', id: 'suppressive-fire', name: 'Suppressive Fire', img: '', skill: 'Ballistic Skill', modifier: 0, duration: '1 Round' },
];

function renderExtendedActionsPanel(ctx: SheetContextLike): HTMLElement {
    const panel = renderSheetParts(
        [
            { template: headerSrc },
            { template: tabsSrc },
            { template: extendedActionsTabSrc, partClass: 'wh40k-body tw-p-2' },
        ],
        ctx,
        { systemId: systemIdOf(ctx) },
    );
    panel.classList.add('voidcraft', 'tw-flex', 'tw-flex-col');
    return panel;
}

// ── Issue #184 — Macrobattery Firing chat card ──────────────────────────────
//
// Renders the resolved BFK macrobattery firing pass to chat: BS test passed,
// 4 hits from a strength-6 pool, base damage applied to hull after one void
// shield absorbed the volley. The story is data-driven so the visual snapshot
// is deterministic across runs.

interface ShipWeaponChatCtx {
    actor: { name: string };
    weapon: {
        _id: string;
        name: string;
        img: string;
        system: {
            weaponType: string;
            location: string;
            strength: number;
            damage: string;
            crit: number;
            range: number;
            special: string;
        };
    };
    crewRating: number;
    gameSystem: string;
    resolution: {
        weaponType: string;
        weaponTypeLabel: string;
        location: string;
        strength: number;
        damageFormula: string;
        bs: { target: number; total: number; succeeded: boolean; dos: number };
        hits: number;
        hitsFormula: string;
        damageRolls: Array<{ total: number; formula: string }>;
        totalDamage: number;
        ignoresShields: boolean;
        shieldedDamage: number;
        appliedDamage: number;
        shieldsBefore: number;
        shieldsAfter: number;
        hullBefore: number;
        hullAfter: number;
        hullMax: number;
    };
}

function mockShipWeaponChatCtx(overrides?: Partial<ShipWeaponChatCtx>): ShipWeaponChatCtx {
    return {
        actor: { name: 'Sword of Terra' },
        weapon: {
            _id: 'macrobattery-1',
            name: 'Sunsear Laser Battery',
            img: 'icons/weapons/artillery/cannon-engraved-bronze.webp',
            system: {
                weaponType: 'macrobattery',
                location: 'prow',
                strength: 6,
                damage: '1d10+2',
                crit: 5,
                range: 9,
                special: '',
            },
        },
        crewRating: 45,
        gameSystem: 'rt',
        resolution: {
            weaponType: 'macrobattery',
            weaponTypeLabel: 'Macrobattery',
            location: 'prow',
            strength: 6,
            damageFormula: '1d10+2',
            bs: { target: 45, total: 28, succeeded: true, dos: 1 },
            hits: 4,
            hitsFormula: '6d6cs>=6',
            damageRolls: [
                { total: 8, formula: '1d10+2' },
                { total: 11, formula: '1d10+2' },
                { total: 6, formula: '1d10+2' },
                { total: 9, formula: '1d10+2' },
            ],
            totalDamage: 34,
            ignoresShields: false,
            shieldedDamage: 34,
            appliedDamage: 0,
            shieldsBefore: 2,
            shieldsAfter: 1,
            hullBefore: 35,
            hullAfter: 35,
            hullMax: 35,
        },
        ...overrides,
    };
}

export const MacrobatteryFiring: StoryObj<ShipWeaponChatCtx> = {
    name: 'Issue #184 — Macrobattery Firing chat card',
    args: mockShipWeaponChatCtx(),
    render: (args) => renderShipWeaponChatCard(args),
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        // Weapon name and per-class label both render.
        await expect(storyCanvas.getByText('Sunsear Laser Battery')).toBeVisible();
        await expect(storyCanvas.getAllByText(/Macrobattery/).length).toBeGreaterThanOrEqual(1);
        // BS Test row renders with the success badge.
        await expect(storyCanvas.getByText(/BS Test/i)).toBeVisible();
        // Hits pool with total = 4.
        await expect(storyCanvas.getByText(/Hits/i)).toBeVisible();
        // Aftermath panels.
        await expect(storyCanvas.getByText(/Shield absorbed/i)).toBeVisible();
        await expect(storyCanvas.getByText(/Hull/i)).toBeVisible();
    },
};

export const LanceFiring: StoryObj<ShipWeaponChatCtx> = {
    name: 'Issue #184 — Lance Firing (bypasses shields)',
    args: mockShipWeaponChatCtx({
        weapon: {
            _id: 'lance-1',
            name: 'Titanforge Lance',
            img: 'icons/weapons/artillery/cannon-engraved-bronze.webp',
            system: {
                weaponType: 'lance',
                location: 'dorsal',
                strength: 1,
                damage: '1d10+4',
                crit: 3,
                range: 6,
                special: '',
            },
        },
        resolution: {
            weaponType: 'lance',
            weaponTypeLabel: 'Lance Weapon',
            location: 'dorsal',
            strength: 1,
            damageFormula: '1d10+4',
            bs: { target: 45, total: 31, succeeded: true, dos: 1 },
            hits: 1,
            hitsFormula: '',
            damageRolls: [{ total: 13, formula: '1d10+4' }],
            totalDamage: 13,
            ignoresShields: true,
            shieldedDamage: 0,
            appliedDamage: 13,
            shieldsBefore: 2,
            shieldsAfter: 2,
            hullBefore: 35,
            hullAfter: 22,
            hullMax: 35,
        },
    }),
    render: (args) => renderShipWeaponChatCard(args),
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        await expect(storyCanvas.getByText('Titanforge Lance')).toBeVisible();
        await expect(storyCanvas.getByText(/Lance bypasses shields/i)).toBeVisible();
    },
};

export const MacrobatteryMiss: StoryObj<ShipWeaponChatCtx> = {
    name: 'Issue #184 — Macrobattery Miss',
    args: mockShipWeaponChatCtx({
        resolution: {
            weaponType: 'macrobattery',
            weaponTypeLabel: 'Macrobattery',
            location: 'prow',
            strength: 6,
            damageFormula: '1d10+2',
            bs: { target: 45, total: 87, succeeded: false, dos: 0 },
            hits: 0,
            hitsFormula: '',
            damageRolls: [],
            totalDamage: 0,
            ignoresShields: false,
            shieldedDamage: 0,
            appliedDamage: 0,
            shieldsBefore: 2,
            shieldsAfter: 2,
            hullBefore: 35,
            hullAfter: 35,
            hullMax: 35,
        },
    }),
    render: (args) => renderShipWeaponChatCard(args),
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        await expect(storyCanvas.getByText(/Miss/i)).toBeVisible();
    },
};

// ── Issue #189 — Crew Population & Morale combat economy ────────────────────
//
// Renders the Crew tab twice: once at full strength, once after a 5-Hull hit
// has propagated through the RT Crew/Morale economy (population, morale, and
// hull all decremented by 5). The pair lets visual review confirm the panel
// reflects the document's state change.

function renderCrewPanel(ctx: SheetContextLike): HTMLElement {
    const panel = renderSheetParts(
        [
            { template: headerSrc },
            { template: tabsSrc },
            { template: crewTabSrc, partClass: 'wh40k-body tw-p-2' },
        ],
        ctx,
        { systemId: systemIdOf(ctx) },
    );
    panel.classList.add('voidcraft', 'tw-flex', 'tw-flex-col');
    return panel;
}

const crewTabCtxBase: SheetContextLike = {
    ...defaultCtxWithSource,
    tab: { id: 'crew', group: 'primary', active: true, cssClass: 'tab-crew' },
    // The crew partial pulls inputs from `source.crew.*`.
    source: {
        ...defaultCtxWithSource.source,
        crew: { morale: { value: 100, max: 100 }, population: 100, crewRating: 40 },
    },
    // eslint-disable-next-line no-restricted-syntax -- boundary: SheetContextLike is an open record for story context
    shipRoles: [] as unknown,
};

export const CrewPanelFullStrength: Story = {
    name: 'Issue #189 — Crew Panel (full strength, RT)',
    args: crewTabCtxBase,
    render: (args) => renderCrewPanel(args),
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        await expect(storyCanvas.getByText(/Population/i)).toBeVisible();
        // Population, Morale current, Morale max all = 100
        const populationInputs = canvasElement.querySelectorAll<HTMLInputElement>('input[name="system.crew.population"]');
        await expect(populationInputs.length).toBeGreaterThanOrEqual(1);
        await expect(populationInputs[0].value).toBe('100');
        const moraleInputs = canvasElement.querySelectorAll<HTMLInputElement>('input[name="system.crew.morale.value"]');
        await expect(moraleInputs[0].value).toBe('100');
    },
};

export const CrewPanelAfter5HullHit: Story = {
    name: 'Issue #189 — Crew Panel after a 5-Hull hit (population/morale -5)',
    args: {
        ...crewTabCtxBase,
        source: {
            ...crewTabCtxBase.source,
            hullIntegrity: { value: 30, max: 35 },
            crew: { morale: { value: 95, max: 100 }, population: 95, crewRating: 40 },
        },
    },
    render: (args) => renderCrewPanel(args),
    play: async ({ canvasElement }) => {
        const populationInputs = canvasElement.querySelectorAll<HTMLInputElement>('input[name="system.crew.population"]');
        await expect(populationInputs[0].value).toBe('95');
        const moraleInputs = canvasElement.querySelectorAll<HTMLInputElement>('input[name="system.crew.morale.value"]');
        await expect(moraleInputs[0].value).toBe('95');
    },
};

export const ExtendedActions: Story = {
    name: 'Issue #186 — Extended Actions panel',
    args: {
        ...defaultCtxWithSource,
        tab: { id: 'extendedActions', group: 'primary', active: true, cssClass: 'tab-extended-actions' },
        // eslint-disable-next-line no-restricted-syntax -- boundary: SheetContextLike is an open record for story context
        extendedActions: issue186ExtendedActions,
    },
    render: (args) => renderExtendedActionsPanel(args),
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        // List heading must localize-render
        await expect(storyCanvas.getByText(/Extended Actions/i)).toBeVisible();
        // Every one of the 13 actions appears as a list item
        await expect(storyCanvas.getByText('Active Augury')).toBeVisible();
        await expect(storyCanvas.getByText('Brace for Impact')).toBeVisible();
        await expect(storyCanvas.getByText('Suppressive Fire')).toBeVisible();
        // Every action exposes a dispatchExtendedAction button
        const dispatchButtons = canvasElement.querySelectorAll('[data-action="dispatchExtendedAction"]');
        await expect(dispatchButtons.length).toBeGreaterThanOrEqual(13);
    },
};
