/**
 * Stories for BaseActorSheet — the shared actor-sheet chrome used by all
 * seven game systems. Tests the sidebar header, tab navigation strip, and
 * the biography body panel via the player template wiring. Covers the
 * `itemCreate` action (biography tab) and the per-system Rogue Trader variant.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import Handlebars from 'handlebars';
import headerSrc from '../../../templates/actor/player/header-dh.hbs?raw';
import tabsSrc from '../../../templates/actor/player/tabs.hbs?raw';
import biographyTabSrc from '../../../templates/actor/player/tab-biography.hbs?raw';
import { renderTemplate } from '../../../../stories/mocks';
import { mockPlayerSheetContext, type SheetContextLike } from '../../../../stories/mocks/sheet-contexts';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { clickAction } from '../../../../stories/test-helpers';

initializeStoryHandlebars();

const rng = seedRandom(0xba5eba11);

const headerTpl = Handlebars.compile(headerSrc);
const tabsTpl = Handlebars.compile(tabsSrc);
const biographyTpl = Handlebars.compile(biographyTabSrc);

function renderBaseActorSheet(ctx: SheetContextLike): HTMLElement {
    const tpl = Handlebars.compile(`
        <div class="tw-grid tw-grid-cols-[260px_minmax(0,1fr)]">
            <aside class="wh40k-sidebar tw-flex tw-min-h-full tw-flex-col">
                ${headerTpl(ctx)}
                ${tabsTpl(ctx)}
            </aside>
            <main class="wh40k-body tw-min-w-0 tw-p-2">
                ${biographyTpl(ctx)}
            </main>
        </div>
    `);
    return renderTemplate(tpl, ctx);
}

const _actorId = randomId('base-actor', rng);

const meta: Meta<SheetContextLike> = {
    title: 'Actor/BaseActorSheet',
};
export default meta;
type Story = StoryObj<SheetContextLike>;

// ── Default (DH2e) ────────────────────────────────────────────────────────────

export const Default: Story = {
    name: 'Default — DH2e Player',
    args: mockPlayerSheetContext({ systemId: 'dh2e', activeTab: 'biography' }),
    render: (args) => renderBaseActorSheet(args),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // Sidebar header renders the actor name
        await expect(canvas.getByDisplayValue('Acolyte Vex')).toBeVisible();
        // Biography tab content is present
        await expect(canvas.getByText('Biography')).toBeVisible();
    },
};

// ── Edit-mode shows bio fields ────────────────────────────────────────────────

export const EditMode: Story = {
    name: 'Edit Mode — bio fields visible',
    args: mockPlayerSheetContext({
        systemId: 'dh2e',
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
        const canvas = within(canvasElement);
        // Age field should show the value
        await expect(canvas.getByDisplayValue('35')).toBeVisible();
    },
};

// ── Interaction: itemCreate click (peer row) ──────────────────────────────────

export const ItemCreateClick: Story = {
    name: 'Interaction — itemCreate fires',
    args: mockPlayerSheetContext({ systemId: 'dh2e', activeTab: 'biography' }),
    render: (args) => renderBaseActorSheet(args),
    play: async ({ canvasElement }) => {
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
        const canvas = within(canvasElement);
        // RT system still renders the actor name in the header
        await expect(canvas.getByDisplayValue('Acolyte Vex')).toBeVisible();
    },
};
