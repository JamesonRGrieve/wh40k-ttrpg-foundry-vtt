/**
 * Stories for BaseActorSheet — the shared actor-sheet chrome used by all
 * seven game systems. Tests the sidebar header, tab navigation strip, and
 * the biography body panel via the player template wiring. Covers the
 * `itemCreate` action (biography tab) and the per-system Rogue Trader variant.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';
import { mockPlayerSheetContext, type GameSystemId, type SheetContextLike } from '../../../../stories/mocks/sheet-contexts';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { clickAction, renderSheetParts } from '../../../../stories/test-helpers';
import headerSrc from '../../../templates/actor/player/header-dh.hbs?raw';
import biographyTabSrc from '../../../templates/actor/player/tab-biography.hbs?raw';
import tabsSrc from '../../../templates/actor/player/tabs.hbs?raw';

initializeStoryHandlebars();

const rng = seedRandom(0xba5eba11);

/** Actor types are `<systemId>-<role>`; the prefix is the active game-system id. */
function systemIdOf(ctx: SheetContextLike): string {
    const [systemId = 'dh2'] = ctx.actor.type.split('-');
    return systemId;
}

function renderBaseActorSheet(ctx: SheetContextLike): HTMLElement {
    return renderSheetParts(
        [
            { template: headerSrc, partClass: 'wh40k-sidebar tw-flex tw-min-h-full tw-flex-col' },
            { template: tabsSrc, partClass: 'wh40k-sidebar' },
            { template: biographyTabSrc, partClass: 'wh40k-body tw-min-w-0 tw-p-2' },
        ],
        ctx,
        { systemId: systemIdOf(ctx) },
    );
}

void randomId('base-actor', rng);

const meta: Meta<SheetContextLike> = {
    title: 'Actor/BaseActorSheet',
};
export default meta;
type Story = StoryObj<SheetContextLike>;

// ── Default (DH2e) ────────────────────────────────────────────────────────────

export const Default: Story = {
    name: 'Default — DH2e Player',
    args: mockPlayerSheetContext({ systemId: 'dh2', activeTab: 'biography' }),
    render: (args) => renderBaseActorSheet(args),
    play: async ({ canvasElement }) => {
        const cv = within(canvasElement);
        // Sidebar header renders the actor name
        await expect(cv.getByDisplayValue('Acolyte Vex')).toBeVisible();
        // Biography tab content is present
        await expect(cv.getByText('Biography')).toBeVisible();
    },
};

// ── Edit-mode shows bio fields ────────────────────────────────────────────────

export const EditMode: Story = {
    name: 'Edit Mode — bio fields visible',
    args: mockPlayerSheetContext({
        systemId: 'dh2',
        activeTab: 'biography',
        actorOverrides: {
            system: {
                bio: {
                    gender: 'Male',
                    age: '35',
                    quirks: 'Obsessive note-taking.',
                },
            },
        },
        contextOverrides: { inEditMode: true, editable: true },
    }),
    render: (args) => renderBaseActorSheet(args),
    play: async ({ canvasElement }) => {
        const cv = within(canvasElement);
        // Age field should show the value
        await expect(cv.getByDisplayValue('35')).toBeVisible();
    },
};

// ── Interaction: itemCreate click (peer row) ──────────────────────────────────

export const ItemCreateClick: Story = {
    name: 'Interaction — itemCreate fires',
    args: mockPlayerSheetContext({ systemId: 'dh2', activeTab: 'biography' }),
    render: (args) => renderBaseActorSheet(args),
    play: ({ canvasElement }) => {
        // clickAction throws if the element is not present — its presence
        // confirms the biography tab rendered the peer section.
        clickAction(canvasElement, 'itemCreate');
    },
};

// ── Per-system: Rogue Trader ──────────────────────────────────────────────────

export const RogueTrader: Story = {
    name: 'Per-system — Rogue Trader',
    args: mockPlayerSheetContext({ systemId: 'rt', activeTab: 'biography' }),
    render: (args) => renderBaseActorSheet(args),
    play: async ({ canvasElement }) => {
        const cv = within(canvasElement);
        // RT system still renders the actor name in the header
        await expect(cv.getByDisplayValue('Acolyte Vex')).toBeVisible();
    },
};

// ── Per-system homologation: all seven game lines ─────────────────────────────
//
// The base actor chrome is shared across every game line. Each variant builds a
// system-aware player context (`mockPlayerSheetContext` flips the actor type tag
// and pulls per-system header fields from the system config) and stamps
// `data-wh40k-system` (through `renderBaseActorSheet`) so per-system theme
// variants cascade in visual review. The default actor name is system-aware
// (`Interrogator Hale` for IM, `Acolyte Vex` otherwise), so the assertion keys
// off the value the factory chose.

function makePerSystemBaseActorStory(systemId: GameSystemId): Story {
    // mockPlayerSheetContext names the IM actor differently; mirror its choice.
    const expectedName = systemId === 'im' ? 'Interrogator Hale' : 'Acolyte Vex';
    return {
        name: `Per-system — ${systemId.toUpperCase()}`,
        args: mockPlayerSheetContext({ systemId, activeTab: 'biography' }),
        render: (args) => renderBaseActorSheet(args),
        play: async ({ canvasElement }) => {
            const cv = within(canvasElement);
            // Sidebar header renders the actor name and the biography tab is present.
            await expect(cv.getByDisplayValue(expectedName)).toBeVisible();
            await expect(cv.getByText('Biography')).toBeVisible();
        },
    };
}

export const SystemDH2: Story = makePerSystemBaseActorStory('dh2');
export const SystemDH1: Story = makePerSystemBaseActorStory('dh1');
export const SystemRT: Story = makePerSystemBaseActorStory('rt');
export const SystemBC: Story = makePerSystemBaseActorStory('bc');
export const SystemOW: Story = makePerSystemBaseActorStory('ow');
export const SystemDW: Story = makePerSystemBaseActorStory('dw');
export const SystemIM: Story = makePerSystemBaseActorStory('im');
