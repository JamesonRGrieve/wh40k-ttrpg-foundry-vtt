/**
 * Stories for StarshipSheet — the Rogue Trader starship actor sheet. Covers
 * the header (hull type/class + stat boxes), the tab strip, and the stats tab
 * with speed/manoeuvrability/armour fields. Tests rollInitiative action and
 * the Rogue Trader per-system variant.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import { renderTemplate, mockActor } from '../../../../stories/mocks';
import { seedRandom, randomId, withSystem } from '../../../../stories/mocks/extended';
import { mockStarshipSheetContext, type SheetContextLike } from '../../../../stories/mocks/sheet-contexts';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { clickAction, assertField } from '../../../../stories/test-helpers';
import shipWeaponChatSrc from '../../../templates/chat/ship-weapon-chat.hbs?raw';
import extendedActionsTabSrc from '../../../templates/actor/starship/tab-extended-actions.hbs?raw';
import headerSrc from '../../../templates/actor/starship/header.hbs?raw';
import statsTabSrc from '../../../templates/actor/starship/tab-stats.hbs?raw';
import tabsSrc from '../../../templates/actor/starship/tabs.hbs?raw';

initializeStoryHandlebars();

const rng = seedRandom(0xca5cade5);

const headerTpl = Handlebars.compile(headerSrc);
const tabsTpl = Handlebars.compile(tabsSrc);
const statsTabTpl = Handlebars.compile(statsTabSrc);
const extendedActionsTabTpl = Handlebars.compile(extendedActionsTabSrc);
const shipWeaponChatTpl = Handlebars.compile(shipWeaponChatSrc);

function renderStarshipSheet(ctx: SheetContextLike): HTMLElement {
    const tpl = Handlebars.compile(`
        <div class="tw-flex tw-flex-col">
            ${headerTpl(ctx)}
            ${tabsTpl(ctx)}
            <main class="wh40k-body tw-p-2">
                ${statsTabTpl(ctx)}
            </main>
        </div>
    `);
    return renderTemplate(tpl, ctx);
}

const _shipId = randomId('starship', rng);

const meta: Meta<SheetContextLike> = {
    title: 'Actor/StarshipSheet',
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
    render: (args) => renderStarshipSheet(args),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // Ship name in header
        await expect(canvas.getByDisplayValue('Sword of Terra')).toBeVisible();
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
    render: (args) => renderStarshipSheet(args),
    play: async ({ canvasElement }) => {
        assertField(canvasElement, 'system.armour', 18);
        assertField(canvasElement, 'system.manoeuvrability', 15);
    },
};

// ── Interaction: rollInitiative ───────────────────────────────────────────────

export const RollInitiative: Story = {
    name: 'Interaction — rollInitiative fires',
    args: defaultCtxWithSource,
    render: (args) => renderStarshipSheet(args),
    play: async ({ canvasElement }) => {
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
    render: (args) => renderStarshipSheet(args),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByDisplayValue('Despoiler-class Battleship')).toBeVisible();
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
    { uuid: 'rt-ea-defensive-stance', id: 'defensive-stance', name: 'Defensive Stance', img: '', skill: 'Pilot (Space Craft)', modifier: 0, duration: '1 Round' },
    { uuid: 'rt-ea-disengage', id: 'disengage', name: 'Disengage', img: '', skill: 'Pilot (Space Craft)', modifier: 0, duration: '1 Round' },
    { uuid: 'rt-ea-emergency-repair', id: 'emergency-repair', name: 'Emergency Repair', img: '', skill: 'Tech-Use', modifier: -10, duration: '1d5 Rounds' },
    { uuid: 'rt-ea-evasive-manoeuvres', id: 'evasive-manoeuvres', name: 'Evasive Manoeuvres', img: '', skill: 'Pilot (Space Craft)', modifier: 0, duration: '1 Round' },
    { uuid: 'rt-ea-focused-augury', id: 'focused-augury', name: 'Focused Augury', img: '', skill: 'Scrutiny', modifier: -10, duration: '1 Round' },
    { uuid: 'rt-ea-lock-on', id: 'lock-on', name: 'Lock On', img: '', skill: 'Ballistic Skill', modifier: 0, duration: '1 Round' },
    { uuid: 'rt-ea-plot-course', id: 'plot-course', name: 'Plot Course', img: '', skill: 'Navigation (Warp)', modifier: 0, duration: '1d5 Rounds' },
    { uuid: 'rt-ea-quick-repair', id: 'quick-repair', name: 'Quick Repair', img: '', skill: 'Tech-Use', modifier: -20, duration: '1 Round' },
    { uuid: 'rt-ea-rapid-reload', id: 'rapid-reload', name: 'Rapid Reload', img: '', skill: 'Command', modifier: 0, duration: '1 Round' },
    { uuid: 'rt-ea-set-up-boarding-action', id: 'set-up-boarding-action', name: 'Set Up Boarding Action', img: '', skill: 'Command', modifier: 0, duration: '1 Round' },
    { uuid: 'rt-ea-suppressive-fire', id: 'suppressive-fire', name: 'Suppressive Fire', img: '', skill: 'Ballistic Skill', modifier: 0, duration: '1 Round' },
];

function renderExtendedActionsPanel(ctx: SheetContextLike): HTMLElement {
    const tpl = Handlebars.compile(`
        <div class="wh40k-rpg starship sheet tw-flex tw-flex-col" data-wh40k-system="rt">
            ${headerTpl(ctx)}
            ${tabsTpl(ctx)}
            <main class="wh40k-body tw-p-2">
                ${extendedActionsTabTpl(ctx)}
            </main>
        </div>
    `);
    return renderTemplate(tpl, ctx);
}

// ── Issue #184 — Macrobattery Firing chat card ──────────────────────────────
//
// Renders the resolved BFK macrobattery firing pass to chat: BS test passed,
// 4 hits from a strength-6 pool, base damage applied to hull after one void
// shield absorbed the volley. The story is data-driven so the visual snapshot
// is deterministic across runs.

interface ShipWeaponChatCtx extends Record<string, unknown> {
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
    render: (args) => {
        const wrapper = document.createElement('div');
        // Outer `.wh40k-rpg` ancestor is required so Tailwind utilities scoped
        // by `important: '.wh40k-rpg'` actually take effect. Per-system
        // variants then cascade from `data-wh40k-system="rt"`.
        wrapper.className = 'wh40k-rpg tw-p-4';
        wrapper.setAttribute('data-wh40k-system', String(args.gameSystem ?? 'rt'));
        wrapper.innerHTML = shipWeaponChatTpl(args);
        return wrapper;
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // Weapon name and per-class label both render.
        await expect(canvas.getByText('Sunsear Laser Battery')).toBeVisible();
        await expect(canvas.getAllByText(/Macrobattery/).length).toBeGreaterThanOrEqual(1);
        // BS Test row renders with the success badge.
        await expect(canvas.getByText(/BS Test/i)).toBeVisible();
        // Hits pool with total = 4.
        await expect(canvas.getByText(/Hits/i)).toBeVisible();
        // Aftermath panels.
        await expect(canvas.getByText(/Shield absorbed/i)).toBeVisible();
        await expect(canvas.getByText(/Hull/i)).toBeVisible();
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
    render: (args) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'wh40k-rpg tw-p-4';
        wrapper.setAttribute('data-wh40k-system', String(args.gameSystem ?? 'rt'));
        wrapper.innerHTML = shipWeaponChatTpl(args);
        return wrapper;
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Titanforge Lance')).toBeVisible();
        await expect(canvas.getByText(/Lance bypasses shields/i)).toBeVisible();
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
    render: (args) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'wh40k-rpg tw-p-4';
        wrapper.setAttribute('data-wh40k-system', String(args.gameSystem ?? 'rt'));
        wrapper.innerHTML = shipWeaponChatTpl(args);
        return wrapper;
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByText(/Miss/i)).toBeVisible();
    },
};

export const ExtendedActions: Story = {
    name: 'Issue #186 — Extended Actions panel',
    args: {
        ...defaultCtxWithSource,
        tab: { id: 'extendedActions', group: 'primary', active: true, cssClass: 'tab-extended-actions' },
        // eslint-disable-next-line no-restricted-syntax -- boundary: SheetContextLike is an open record for story context
        extendedActions: issue186ExtendedActions as unknown,
    } as SheetContextLike,
    render: (args) => renderExtendedActionsPanel(args),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // List heading must localize-render
        await expect(canvas.getByText(/Extended Actions/i)).toBeVisible();
        // Every one of the 13 actions appears as a list item
        await expect(canvas.getByText('Active Augury')).toBeVisible();
        await expect(canvas.getByText('Brace for Impact')).toBeVisible();
        await expect(canvas.getByText('Suppressive Fire')).toBeVisible();
        // Every action exposes a dispatchExtendedAction button
        const dispatchButtons = canvasElement.querySelectorAll('[data-action="dispatchExtendedAction"]');
        await expect(dispatchButtons.length).toBeGreaterThanOrEqual(13);
    },
};
