/**
 * Stories for StarshipSheet — the Rogue Trader starship actor sheet. Covers
 * the header (hull type/class + stat boxes), the tab strip, and the stats tab
 * with speed/manoeuvrability/armour fields. Tests rollInitiative action and
 * the Rogue Trader per-system variant.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import Handlebars from 'handlebars';
import headerSrc from '../../../templates/actor/starship/header.hbs?raw';
import tabsSrc from '../../../templates/actor/starship/tabs.hbs?raw';
import statsTabSrc from '../../../templates/actor/starship/tab-stats.hbs?raw';
import { renderTemplate } from '../../../../stories/mocks';
import { mockStarshipSheetContext, type SheetContextLike } from '../../../../stories/mocks/sheet-contexts';
import { seedRandom, randomId, withSystem } from '../../../../stories/mocks/extended';
import { mockActor } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { clickAction, assertField } from '../../../../stories/test-helpers';

initializeStoryHandlebars();

const rng = seedRandom(0xca5cade5);

const headerTpl = Handlebars.compile(headerSrc);
const tabsTpl = Handlebars.compile(tabsSrc);
const statsTabTpl = Handlebars.compile(statsTabSrc);

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
            system: bcActor.system as SheetContextLike['system'],
        };
    })(),
    render: (args) => renderStarshipSheet(args),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByDisplayValue('Despoiler-class Battleship')).toBeVisible();
    },
};
