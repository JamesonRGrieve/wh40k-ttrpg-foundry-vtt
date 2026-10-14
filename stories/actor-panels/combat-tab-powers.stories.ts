/**
 * Storybook stories for the Combat tab's power panels (#194).
 *
 * The character sheet's Powers tab was never in `CharacterSheet.TABS`, so its
 * panels never showed. They now live on the Combat tab (`tab-combat.hbs`), under
 * the combat station:
 *
 *   - Navigator powers (Use Power), rituals and ship orders, each shown only when
 *     the character owns items of that type — on every line;
 *   - the psyker controls (Psy Rating, sustained powers, Phenomena / Perils), in
 *     the station's psychic panel, shown for anyone with a Psy Rating or a power.
 *
 * Each story renders the real tab template over a per-line player context
 * (`mockPlayerSheetContext`), so a line that drops a panel shows here.
 * Fixtures are structural (Direction #7); ids are fixed for diff stability.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import type { GameSystemId } from '../../src/module/config/game-systems/types';
import combatTabSrc from '../../src/templates/actor/player/tab-combat.hbs?raw';
import { mockPlayerSheetContext } from '../mocks/sheet-contexts';
import { captureActionClicks, renderSheet } from '../test-helpers';

interface ListRow {
    id: string;
    name: string;
    img: string;
    system: Record<string, string | object>;
}

function row(id: string, name: string, system: Record<string, string | object>): ListRow {
    return { id, name, img: 'icons/svg/eye.svg', system };
}

const NAVIGATOR_POWER = row('navPowerFixture1', 'Fixture Sight', {
    pills: [],
    testLabel: 'Perception',
    activationLabel: 'Full Action',
    levels: { novice: { effect: '' }, adept: { effect: '' }, master: { effect: '' } },
});
const RITUAL = row('ritualFixture001', 'Fixture Rite', { pill: {}, testLabel: 'Willpower', activationLabel: 'Extended', test: {} });
const ORDER = row('orderFixture0001', 'Fixture Order', { pill: {}, category: 'manoeuvre', testLabel: 'Command', actionTypeLabel: 'Extended' });

interface StoryArgs {
    systemId: GameSystemId;
    navigatorPowers: ListRow[];
    rituals: ListRow[];
    orders: ListRow[];
    psyker: boolean;
}

function render(args: StoryArgs): HTMLElement {
    const base = mockPlayerSheetContext({ systemId: args.systemId, activeTab: 'combat' });
    const ctx = {
        ...base,
        tab: { id: 'combat', group: 'primary', cssClass: 'tab-combat', active: true },
        weapons: [],
        equippedGear: [],
        hasForceField: false,
        psychicPowers: [],
        showPsychicPanel: args.psyker,
        psyRating: args.psyker ? 3 : 0,
        system: { ...base.actor.system, psy: { rating: args.psyker ? 3 : 0, currentRating: 3, sustained: 0, class: 'bound', hasFocus: false } },
        navigatorPowers: args.navigatorPowers,
        navigatorPowersCount: args.navigatorPowers.length,
        rituals: args.rituals,
        ritualsCount: args.rituals.length,
        orders: args.orders,
        ordersCount: args.orders.length,
        orderCategories: [],
        activeOrderCategory: '',
    };
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = args.systemId;
    wrapper.appendChild(renderSheet(combatTabSrc, ctx));
    return wrapper;
}

function panels(canvasElement: HTMLElement): { navigator: boolean; rituals: boolean; orders: boolean; psykerControls: boolean } {
    return {
        navigator: canvasElement.querySelector('.wh40k-panel-navigator-powers') !== null,
        rituals: canvasElement.querySelector('.wh40k-panel-rituals') !== null,
        orders: canvasElement.querySelector('.wh40k-panel-orders') !== null,
        psykerControls: canvasElement.querySelector('.wh40k-combat-psyker-controls') !== null,
    };
}

function storyArgs(systemId: GameSystemId, owned: Partial<Omit<StoryArgs, 'systemId'>> = {}): StoryArgs {
    return { systemId, navigatorPowers: [], rituals: [], orders: [], psyker: false, ...owned };
}

const meta: Meta<StoryArgs> = {
    title: 'Actor/Panels/CombatTabPowers',
    render: (a) => render(a),
};
export default meta;
type Story = StoryObj<StoryArgs>;

export const NavigatorRT: Story = {
    name: 'Rogue Trader Navigator — Use Power on the Combat tab',
    args: storyArgs('rt', { navigatorPowers: [NAVIGATOR_POWER] }),
    play: async ({ canvasElement }) => {
        await expect(panels(canvasElement)).toEqual({ navigator: true, rituals: false, orders: false, psykerControls: false });
        const clicks = captureActionClicks(canvasElement);
        canvasElement.querySelector<HTMLElement>('.wh40k-panel-navigator-powers [data-action="rollPower"]')?.click();
        await expect(clicks.map((c) => [c.action, c.dataset['itemId']])).toEqual([['rollPower', NAVIGATOR_POWER.id]]);
    },
};

export const RitualsAndOrdersDH2: Story = {
    name: 'DH2 — rituals and ship orders show when owned',
    args: storyArgs('dh2', { rituals: [RITUAL], orders: [ORDER] }),
    play: async ({ canvasElement }) => {
        await expect(panels(canvasElement)).toEqual({ navigator: false, rituals: true, orders: true, psykerControls: false });
        const clicks = captureActionClicks(canvasElement);
        canvasElement.querySelector<HTMLElement>('[data-action="rollRitual"]')?.click();
        canvasElement.querySelector<HTMLElement>('[data-action="rollOrder"]')?.click();
        await expect(clicks.map((c) => c.action)).toEqual(['rollRitual', 'rollOrder']);
    },
};

export const PsykerDH2: Story = {
    name: 'DH2 psyker — Phenomena and Perils on the Combat tab',
    args: storyArgs('dh2', { psyker: true }),
    play: async ({ canvasElement }) => {
        await expect(panels(canvasElement).psykerControls).toBe(true);
        const clicks = captureActionClicks(canvasElement);
        canvasElement.querySelector<HTMLElement>('[data-action="rollPhenomena"]')?.click();
        canvasElement.querySelector<HTMLElement>('[data-action="rollPerils"]')?.click();
        await expect(clicks.map((c) => c.action)).toEqual(['rollPhenomena', 'rollPerils']);
    },
};

/** Homologation: a character owning none of these items gets none of the panels, on every line. */
function emptyOnLine(systemId: GameSystemId): Story {
    return {
        name: `${systemId.toUpperCase()} — nothing owned, no power panels`,
        args: storyArgs(systemId),
        play: async ({ canvasElement }) => {
            await expect(panels(canvasElement)).toEqual({ navigator: false, rituals: false, orders: false, psykerControls: false });
            await expect(canvasElement.querySelector('.wh40k-combat-power-panels')).toBeNull();
        },
    };
}

export const EmptyBC: Story = emptyOnLine('bc');
export const EmptyDH1: Story = emptyOnLine('dh1');
export const EmptyDH2: Story = emptyOnLine('dh2');
export const EmptyDW: Story = emptyOnLine('dw');
export const EmptyOW: Story = emptyOnLine('ow');
export const EmptyRT: Story = emptyOnLine('rt');

/** The same Navigator power on a non-RT line still gets its panel — the gate is ownership. */
export const NavigatorOnBC: Story = {
    name: 'BC — an owned Navigator power still shows (ownership gate, not line gate)',
    args: storyArgs('bc', { navigatorPowers: [NAVIGATOR_POWER] }),
    play: async ({ canvasElement }) => {
        await expect(panels(canvasElement).navigator).toBe(true);
    },
};
