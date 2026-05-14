/**
 * Stories for CharacterSheet — the full player-character sheet used across
 * all seven 40K RPG lines. Covers DH2e default, IM variant, the itemCreate
 * action on the biography tab, and the edit-mode biographical fields.
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

const rng = seedRandom(0xc4a4c7e2);

const headerTpl = Handlebars.compile(headerSrc);
const tabsTpl = Handlebars.compile(tabsSrc);
const biographyTpl = Handlebars.compile(biographyTabSrc);

function renderCharacterSheet(ctx: SheetContextLike): HTMLElement {
    const tpl = Handlebars.compile(`
        <div class="tw-grid tw-grid-cols-[280px_minmax(0,1fr)]">
            <aside class="wh40k-sidebar tw-flex tw-min-h-full tw-flex-col tw-bg-[var(--color-bg-secondary,#252525)]">
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

const _actorId = randomId('character', rng);

const meta: Meta<SheetContextLike> = {
    title: 'Actor/CharacterSheet',
};
export default meta;
type Story = StoryObj<SheetContextLike>;

// ── DH2e default ─────────────────────────────────────────────────────────────

export const DarkHeresy2Default: Story = {
    name: 'Dark Heresy 2e — Default',
    args: mockPlayerSheetContext({ systemId: 'dh2e', activeTab: 'biography' }),
    render: (args) => renderCharacterSheet(args),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByDisplayValue('Acolyte Vex')).toBeVisible();
        await expect(canvas.getByText('Biography')).toBeVisible();
    },
};

// ── Imperium Maledictum variant ───────────────────────────────────────────────

export const ImperiumMaledictum: Story = {
    name: 'Imperium Maledictum variant',
    args: mockPlayerSheetContext({ systemId: 'im', activeTab: 'biography' }),
    render: (args) => renderCharacterSheet(args),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // IM uses 'Interrogator Hale' as the default actor name
        await expect(canvas.getByDisplayValue('Interrogator Hale')).toBeVisible();
        // IM origin path step should be House Varonius
        await expect(canvas.getByText('House Varonius')).toBeVisible();
    },
};

// ── Edit mode: bio fields ─────────────────────────────────────────────────────

export const EditModeBio: Story = {
    name: 'Edit Mode — bio fields',
    args: mockPlayerSheetContext({
        systemId: 'dh2e',
        activeTab: 'biography',
        actorOverrides: {
            system: {
                bio: {
                    gender: 'Female',
                    age: '29',
                    build: 'Athletic',
                    complexion: 'Dark',
                    hair: 'Shaved',
                    eyes: 'Brown',
                },
            },
        },
        contextOverrides: { inEditMode: true, editable: true },
    }),
    render: (args) => renderCharacterSheet(args),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByDisplayValue('29')).toBeVisible();
        await expect(canvas.getByDisplayValue('Female')).toBeVisible();
    },
};

// ── Interaction: itemCreate (enemy row) ───────────────────────────────────────

export const EnemyCreateClick: Story = {
    name: 'Interaction — itemCreate (enemy row)',
    args: mockPlayerSheetContext({ systemId: 'dh2e', activeTab: 'biography' }),
    render: (args) => renderCharacterSheet(args),
    play: async ({ canvasElement }) => {
        // The biography tab renders two itemCreate buttons (peer + enemy).
        // clickAction fires the first matching element; presence confirms rendering.
        clickAction(canvasElement, 'itemCreate');
    },
};

// ── Per-system homologation variants ─────────────────────────────────────────
// Each variant exercises the biography tab through a different game-system
// config so per-system header fields, tab labels, and origin-path shapes
// surface in visual review without hand-authoring separate mock objects.

export const BlackCrusadeVariant: Story = {
    name: 'Per-system — Black Crusade',
    args: mockPlayerSheetContext({ systemId: 'bc', activeTab: 'biography' }),
    render: (args) => renderCharacterSheet(args),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByDisplayValue('Acolyte Vex')).toBeVisible();
        await expect(canvas.getByText('Biography')).toBeVisible();
    },
};

export const DarkHeresy1eVariant: Story = {
    name: 'Per-system — Dark Heresy 1e',
    args: mockPlayerSheetContext({ systemId: 'dh1e', activeTab: 'biography' }),
    render: (args) => renderCharacterSheet(args),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByDisplayValue('Acolyte Vex')).toBeVisible();
        await expect(canvas.getByText('Biography')).toBeVisible();
    },
};

export const DeathwatchVariant: Story = {
    name: 'Per-system — Deathwatch',
    args: mockPlayerSheetContext({ systemId: 'dw', activeTab: 'biography' }),
    render: (args) => renderCharacterSheet(args),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByDisplayValue('Acolyte Vex')).toBeVisible();
        await expect(canvas.getByText('Biography')).toBeVisible();
    },
};

export const OnlyWarVariant: Story = {
    name: 'Per-system — Only War',
    args: mockPlayerSheetContext({ systemId: 'ow', activeTab: 'biography' }),
    render: (args) => renderCharacterSheet(args),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByDisplayValue('Acolyte Vex')).toBeVisible();
        await expect(canvas.getByText('Biography')).toBeVisible();
    },
};

export const RogueTraderVariant: Story = {
    name: 'Per-system — Rogue Trader',
    args: mockPlayerSheetContext({ systemId: 'rt', activeTab: 'biography' }),
    render: (args) => renderCharacterSheet(args),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByDisplayValue('Acolyte Vex')).toBeVisible();
        await expect(canvas.getByText('Biography')).toBeVisible();
    },
};
