/**
 * Stories for VoidcraftActorSheet — the Rogue Trader voidcraft (ship-scale)
 * actor sheet (renamed from StarshipSheet). Covers the header (hull type/class
 * + stat boxes), the tab strip, and the stats tab with
 * speed/manoeuvrability/armour fields. Tests rollInitiative action and the
 * Rogue Trader per-system variant.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { mockActor } from '../../../../stories/mocks';
import { seedRandom, randomId, withSystem, type SystemId } from '../../../../stories/mocks/extended';
import { mockStarshipSheetContext, type SheetContextLike } from '../../../../stories/mocks/sheet-contexts';
import { storyLocalize } from '../../../../stories/mocks/ship-assault';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { captureActionClicks, clickAction, assertField, renderSheetParts } from '../../../../stories/test-helpers';
import tabsSrc from '../../../templates/actor/player/tabs.hbs?raw';
import headerSrc from '../../../templates/actor/voidcraft/header.hbs?raw';
import crewTabSrc from '../../../templates/actor/voidcraft/tab-crew.hbs?raw';
import extendedActionsTabSrc from '../../../templates/actor/voidcraft/tab-extended-actions.hbs?raw';
import manoeuvreActionsTabSrc from '../../../templates/actor/voidcraft/tab-manoeuvre-actions.hbs?raw';
import statsTabSrc from '../../../templates/actor/voidcraft/tab-stats.hbs?raw';
import type { ShipEffectData } from '../../rules/ship-action-effects.ts';
import { shipActionRows, type ShipActionOrderView } from '../../rules/ship-actions.ts';
import { shipActionModifierRows } from '../ship-action/ship-action-flow.ts';

initializeStoryHandlebars();

const rng = seedRandom(0xca5cade5);

/** Actor types are `<systemId>-<role>`; the prefix is the active game-system id. */
function systemIdOf(ctx: SheetContextLike): string {
    const [systemId = 'rt'] = ctx.actor.type.split('-');
    return systemId;
}

function renderVoidcraftSheet(ctx: SheetContextLike): HTMLElement {
    return renderSheetParts([{ template: headerSrc }, { template: tabsSrc }, { template: statsTabSrc, partClass: 'wh40k-body tw-p-2' }], ctx, {
        systemId: systemIdOf(ctx),
    });
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

// ── Per-system homologation: all seven game lines ─────────────────────────────
//
// Voidcraft (ship-scale) is RT-canonical, but the sheet chrome is shared across
// every game line. Each variant flips the actor's system tag (via `withSystem`)
// so RT-only assumptions in the header / stats tab surface, and stamps
// `data-wh40k-system` (through `renderVoidcraftSheet`) so per-system theme
// variants cascade in visual review.

function makePerSystemVoidcraftStory(systemId: SystemId, shipName: string): Story {
    const base = mockActor({
        _id: randomId(`${systemId}-starship`, rng),
        name: shipName,
        type: 'rt-starship',
    });
    const systemActor = withSystem(base, systemId, 'vehicle');
    return {
        name: `Per-system — ${systemId.toUpperCase()} (${shipName})`,
        args: {
            ...defaultCtxWithSource,
            actor: systemActor as SheetContextLike['actor'],
            system: systemActor.system,
        },
        render: (args) => renderVoidcraftSheet(args),
        play: async ({ canvasElement }) => {
            const storyCanvas = within(canvasElement);
            // Header keeps the ship name and the stats tab keeps its fields
            // regardless of which game line owns the actor.
            await expect(storyCanvas.getByDisplayValue(shipName)).toBeVisible();
            assertField(canvasElement, 'system.speed', 8);
        },
    };
}

export const SystemDH2: Story = makePerSystemVoidcraftStory('dh2', 'Aquila Lander');
export const SystemDH1: Story = makePerSystemVoidcraftStory('dh1', 'Hellebore-class Frigate');
export const SystemRT: Story = makePerSystemVoidcraftStory('rt', 'Sword-class Frigate');
export const SystemBC: Story = makePerSystemVoidcraftStory('bc', 'Despoiler-class Battleship');
export const SystemOW: Story = makePerSystemVoidcraftStory('ow', 'Carrack-class Transport');
export const SystemDW: Story = makePerSystemVoidcraftStory('dw', 'Strike Cruiser');
export const SystemIM: Story = makePerSystemVoidcraftStory('im', 'Vagabond-class Merchantman');

// ── Issue #186 — Starship Extended Actions panel ─────────────────────────────
//
// Renders the Extended and Manoeuvre Action tabs from one mixed list of
// `order` views — the RT Core Table 8-10 / 8-11 names and tests — run
// through the sheet's own `shipActionRows`, so the story exercises the same
// actionType split the sheet uses on the real pack (no compendium access
// from inside a Storybook story).

/** No automated effect: the row is a rules card only. */
const NO_SHIP_EFFECT: ShipEffectData = { kind: '', targets: [], base: 0, step: 0, per: 1, rounds: 0, expiry: '' };

/** The seven actions with an authored effect (#186, #189), as the RT pack carries them. */
const RT_SHIP_EFFECTS: Readonly<Record<string, ShipEffectData>> = {
    'Hold Fast!': { kind: 'reducePriorTurnDamage', targets: ['morale'], base: 1, step: 1, per: 1, rounds: 0, expiry: '' },
    'Triage': { kind: 'reducePriorTurnDamage', targets: ['crewPopulation'], base: 1, step: 1, per: 1, rounds: 0, expiry: '' },
    'Aid the Machine Spirit': { kind: 'shipModifier', targets: ['manoeuvrability', 'detection'], base: 5, step: 5, per: 2, rounds: 0, expiry: 'turnEnd' },
    'Flank Speed': { kind: 'shipModifier', targets: ['speed'], base: 1, step: 1, per: 1, rounds: 0, expiry: 'turnEnd' },
    'Lock on Target': { kind: 'shipModifier', targets: ['weaponBallisticSkill'], base: 5, step: 5, per: 2, rounds: 0, expiry: 'turnEnd' },
    'Come to New Heading': { kind: 'shipModifier', targets: ['ballisticSkill'], base: -20, step: 0, per: 1, rounds: 0, expiry: 'turnEnd' },
    'Evasive Manoeuvres': { kind: 'shipModifier', targets: ['ballisticSkill'], base: -10, step: -10, per: 1, rounds: 1, expiry: 'turnStart' },
};

/** One RT ship order as the sheet sees it after load: name, action type and test. */
function rtOrder(name: string, actionType: string, skill: string, modifier: number, characteristic = ''): ShipActionOrderView {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return {
        uuid: `Compendium.wh40k-rpg.rt-core-items-ship-orders.Item.${id}`,
        id,
        name,
        img: '',
        system: {
            actionType,
            test: { skill, characteristic, modifier, shipStat: '' },
            duration: name === 'Emergency Repairs' ? '1d5 Turns' : '',
            requirements: '',
            typeAndAction: actionType === 'maneuver-action' ? 'Manoeuvre Action' : 'Extended Action',
            description: { value: '' },
            shipEffect: RT_SHIP_EFFECTS[name] ?? NO_SHIP_EFFECT,
        },
    };
}

const rtShipOrders: ShipActionOrderView[] = [
    rtOrder('Active Augury', 'extended-action', 'Scrutiny', 0),
    rtOrder('Aid the Machine Spirit', 'extended-action', 'Tech-Use', 0),
    rtOrder('Disinformation', 'extended-action', 'Deceive or Blather', -10),
    rtOrder('Emergency Repairs', 'extended-action', 'Tech-Use', -10),
    rtOrder('Flank Speed', 'extended-action', 'Tech-Use', 0),
    rtOrder('Focused Augury', 'extended-action', 'Scrutiny', 0),
    rtOrder('Hail the Enemy', 'extended-action', 'Interaction Skill', 0),
    rtOrder('Hit and Run', 'extended-action', 'Pilot (Spacecraft)', 0),
    rtOrder('Hold Fast!', 'extended-action', '', 0, 'Willpower'),
    rtOrder('Jam Communications', 'extended-action', 'Tech-Use', -10),
    rtOrder('Lock on Target', 'extended-action', 'Scrutiny', 0),
    rtOrder('Prepare to Repel Boarders!', 'extended-action', 'Command', 0),
    rtOrder('Put Your Backs Into It!', 'extended-action', 'Intimidate or Charm', 0),
    rtOrder('Triage', 'extended-action', 'Medicae', -10),
    rtOrder('Standard Move', 'maneuver-action', 'Pilot (Spacecraft)', 0),
    rtOrder('Adjust Bearing', 'maneuver-action', 'Pilot (Spacecraft)', 0),
    rtOrder('Adjust Speed', 'maneuver-action', 'Pilot (Spacecraft)', 0),
    rtOrder('Adjust Speed & Bearing', 'maneuver-action', 'Pilot (Spacecraft)', -20),
    rtOrder('Come to New Heading', 'maneuver-action', 'Pilot (Spacecraft)', -10),
    rtOrder('Disengage', 'maneuver-action', 'Pilot (Spacecraft)', 0),
    rtOrder('Evasive Manoeuvres', 'maneuver-action', 'Pilot (Spacecraft)', -10),
    rtOrder('Ramming Speed', 'maneuver-action', 'Pilot (Spacecraft)', -20),
];

function renderActionsPanel(tabSrc: string, ctx: SheetContextLike): HTMLElement {
    const panel = renderSheetParts([{ template: headerSrc }, { template: tabsSrc }, { template: tabSrc, partClass: 'wh40k-body tw-p-2' }], ctx, {
        systemId: systemIdOf(ctx),
    });
    panel.classList.add('voidcraft', 'tw-flex', 'tw-flex-col');
    return panel;
}

// ── Issues #184 / #187 — Damage Control panel on the Stats tab ──────────────
//
// The raised void shields (with their raise / lower / restore controls) and the
// Critical Hits the hull carries, each with its Table 8-12 name, roll and text
// and a Clear control. One story per state: criticals recorded, and a sound hull.

const RECORDED_CRITICALS = [
    {
        index: 0,
        label: 'Fire!',
        rolled: 5,
        text: '<p><b>Fire!</b>: Alarms scream through the hull as hungry flames roar through passageways and compartments.</p>',
    },
    {
        index: 1,
        label: 'Sensors Damaged',
        rolled: 3,
        text: "<p><b>Sensors Damaged</b>: The ship's auspex arrays have been knocked out, leaving the vessel blind.</p>",
    },
];

export const DamageControlCriticals: Story = {
    name: 'Issues #184 / #187 — Damage Control with Critical Hits',
    args: { ...defaultCtxWithSource, voidShieldsUp: 0, voidShieldsMax: 1, shipCriticals: RECORDED_CRITICALS },
    render: (args) => renderVoidcraftSheet(args),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Damage Control')).toBeVisible();
        const shields = canvasElement.querySelector<HTMLElement>('[data-wh40k-hook="ship-void-shields"] [data-shields-up]');
        await expect(shields?.textContent.trim()).toBe('0 / 1');
        const criticals = [...canvasElement.querySelectorAll<HTMLElement>('[data-wh40k-hook="ship-criticals"] li')];
        await expect(criticals.map((row) => row.querySelector('span')?.firstChild?.textContent?.trim())).toEqual(['Fire!', 'Sensors Damaged']);
        await expect(view.getByText(/Rolled 5 on 1d5/)).toBeVisible();
        // The table's HTML renders as text, not escaped markup.
        await expect(canvasElement.querySelector('[data-wh40k-hook="ship-criticals"] b')?.textContent).toBe('Fire!');
        const clicks = captureActionClicks(canvasElement);
        const clear = [...canvasElement.querySelectorAll<HTMLElement>('[data-action="removeShipStatus"]')].at(1);
        clear?.click();
        clickAction(canvasElement, 'restoreVoidShields');
        await expect(clicks.map((click) => [click.action, click.dataset['statusIndex'] ?? ''])).toEqual([
            ['removeShipStatus', '1'],
            ['restoreVoidShields', ''],
        ]);
    },
};

export const DamageControlSound: Story = {
    name: 'Issues #184 / #187 — Damage Control, hull sound',
    args: { ...defaultCtxWithSource, voidShieldsUp: 1, voidShieldsMax: 1, shipCriticals: [] },
    render: (args) => renderVoidcraftSheet(args),
    play: async ({ canvasElement }) => {
        await expect(within(canvasElement).getByText(/The hull is sound/)).toBeVisible();
        await expect(canvasElement.querySelectorAll('[data-action="removeShipStatus"]').length).toBe(0);
        await expect(canvasElement.querySelector('[data-wh40k-hook="ship-void-shields"] [data-shields-up]')?.textContent.trim()).toBe('1 / 1');
    },
};

// ── Issue #189 — Crew Population & Morale combat economy ────────────────────
//
// Renders the Crew tab twice: once at full strength, once after a 5-Hull hit
// has propagated through the RT Crew/Morale economy (population, morale, and
// hull all decremented by 5). The pair lets visual review confirm the panel
// reflects the document's state change.

function renderCrewPanel(ctx: SheetContextLike): HTMLElement {
    const panel = renderSheetParts([{ template: headerSrc }, { template: tabsSrc }, { template: crewTabSrc, partClass: 'wh40k-body tw-p-2' }], ctx, {
        systemId: systemIdOf(ctx),
    });
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
        extendedActions: shipActionRows(rtShipOrders, 'extended'),
    },
    render: (args) => renderActionsPanel(extendedActionsTabSrc, args),
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        // List heading must localize-render
        await expect(storyCanvas.getByText(/Extended Actions/i)).toBeVisible();
        // #186: the intro paragraph reads in the sheet's primary text colour, not dim brown on the dark body.
        const intro = canvasElement.querySelector<HTMLElement>('[data-wh40k-hook="ship-action-tab-description"]');
        await expect(intro?.className).toContain('tw-text-[color:var(--color-text-primary)]');
        await expect(intro?.className).not.toContain('tw-opacity-80');
        // Every one of the 14 RAW extended actions appears, and no manoeuvre leaks in
        await expect(storyCanvas.getByText('Active Augury')).toBeVisible();
        await expect(storyCanvas.getByText('Lock on Target')).toBeVisible();
        await expect(storyCanvas.getByText('Triage')).toBeVisible();
        await expect(storyCanvas.queryByText('Standard Move')).toBeNull();
        // Hold Fast! tests a characteristic, shown in place of a skill
        await expect(storyCanvas.getByText(/Willpower/)).toBeVisible();
        const dispatchButtons = canvasElement.querySelectorAll('[data-action="dispatchExtendedAction"]');
        await expect(dispatchButtons.length).toBe(14);
        // #186/#189: only the five Extended Actions with an authored effect roll.
        const rollButtons = [...canvasElement.querySelectorAll<HTMLElement>('[data-action="rollShipAction"]')];
        await expect(rollButtons.map((button) => button.closest('li')?.querySelector('span')?.textContent.trim())).toEqual([
            'Aid the Machine Spirit',
            'Flank Speed',
            'Hold Fast!',
            'Lock on Target',
            'Triage',
        ]);
        await expect(rollButtons[0]?.dataset['actionUuid']).toContain('aid-the-machine-spirit');
    },
};

export const ManoeuvreActions: Story = {
    name: 'Issue #186 — Manoeuvre Actions panel',
    args: {
        ...defaultCtxWithSource,
        tab: { id: 'manoeuvreActions', group: 'primary', active: true, cssClass: 'tab-manoeuvre-actions' },
        // eslint-disable-next-line no-restricted-syntax -- boundary: SheetContextLike is an open record for story context
        manoeuvreActions: shipActionRows(rtShipOrders, 'manoeuvre'),
    },
    render: (args) => renderActionsPanel(manoeuvreActionsTabSrc, args),
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        await expect(storyCanvas.getByText('Standard Move')).toBeVisible();
        await expect(storyCanvas.getByText('Disengage')).toBeVisible();
        const intro = canvasElement.querySelector<HTMLElement>('[data-wh40k-hook="ship-action-tab-description"]');
        await expect(intro?.className).toContain('tw-text-[color:var(--color-text-primary)]');
        await expect(storyCanvas.queryByText('Triage')).toBeNull();
        const dispatchButtons = canvasElement.querySelectorAll('[data-action="dispatchManoeuvreAction"]');
        await expect(dispatchButtons.length).toBe(8);
        // #186: Come to New Heading and Evasive Manoeuvres roll; movement-only manoeuvres stay rules cards.
        await expect(canvasElement.querySelectorAll('[data-action="rollShipAction"]').length).toBe(2);
    },
};

// ── Issue #186 — Ship Actions in Effect, composed into the Extended tab ──────
//
// After Lock on Target and Come to New Heading are rolled, the tab lists both
// live modifiers above the actions, built by the same row builder the sheet
// uses. The composed render shows the panel, the assault panel and the action
// list stacking inside the sheet body.

export const ExtendedActionsInEffect: Story = {
    name: 'Issue #186 — Extended Actions with Ship Actions in Effect',
    args: {
        ...defaultCtxWithSource,
        tab: { id: 'extendedActions', group: 'primary', active: true, cssClass: 'tab-extended-actions' },
        // eslint-disable-next-line no-restricted-syntax -- boundary: SheetContextLike is an open record for story context
        extendedActions: shipActionRows(rtShipOrders, 'extended'),
        shipActionModifiers: shipActionModifierRows(
            {
                shipWeaponChoices: [{ id: 'macro', name: 'Sunsear Laser Battery' }],
                shipActionEffects: [
                    { name: 'Lock on Target', active: true, modifier: { target: 'weaponBallisticSkill', value: 15, weaponId: 'macro' } },
                    { name: 'Come to New Heading', active: true, modifier: { target: 'ballisticSkill', value: -20, weaponId: '' } },
                ],
            },
            storyLocalize,
        ),
    },
    render: (args) => renderActionsPanel(extendedActionsTabSrc, args),
    play: async ({ canvasElement }) => {
        const panel = canvasElement.querySelector<HTMLElement>('[data-wh40k-hook="ship-action-modifiers"]');
        await expect(panel).toBeTruthy();
        const rows = [...(panel?.querySelectorAll('li') ?? [])].map((row) => row.textContent.replace(/\s+/gu, ' ').trim());
        await expect(rows).toEqual([
            'Lock on Target Ballistic Skill Tests to fire Sunsear Laser Battery +15',
            "Come to New Heading every Ballistic Skill Test to fire the ship's weapons -20",
        ]);
        // The live effects sit above the action list, which still offers every Roll.
        const firstRoll = canvasElement.querySelector('[data-action="rollShipAction"]');
        await expect(firstRoll).toBeTruthy();
        const followsPanel = panel !== null && firstRoll !== null && (panel.compareDocumentPosition(firstRoll) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
        await expect(followsPanel).toBe(true);
        await expect(canvasElement.querySelectorAll('[data-action="rollShipAction"]').length).toBe(5);
    },
};
