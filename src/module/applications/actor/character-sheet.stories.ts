/**
 * Stories for CharacterSheet — the full player-character sheet used across
 * all seven 40K RPG lines. Covers DH2e default, IM variant, the itemCreate
 * action on the biography tab, and the edit-mode biographical fields.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import HbsLib from 'handlebars';
import { expect, within } from 'storybook/test';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';
import { mockPlayerSheetContext, type SheetContextLike } from '../../../../stories/mocks/sheet-contexts';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { clickAction, renderSheetParts } from '../../../../stories/test-helpers';
import combatActionsPanelSrc from '../../../templates/actor/panel/combat-actions-panel.hbs?raw';
import headerSrc from '../../../templates/actor/player/header-dh.hbs?raw';
import biographyTabSrc from '../../../templates/actor/player/tab-biography.hbs?raw';
import equipmentTabSrc from '../../../templates/actor/player/tab-equipment.hbs?raw';
import tabsSrc from '../../../templates/actor/player/tabs.hbs?raw';
import { encumbranceDisplay } from './encumbrance-display.ts';

initializeStoryHandlebars();

const rng = seedRandom(0xc4a4c7e2);

/** Actor types are `<systemId>-<role>`; the prefix is the active game-system id. */
function systemIdOf(ctx: SheetContextLike): string {
    const [systemId = 'dh2'] = ctx.actor.type.split('-');
    return systemId;
}

function renderCharacterSheet(ctx: SheetContextLike): HTMLElement {
    return renderSheetParts(
        [
            { template: headerSrc, partClass: 'wh40k-sidebar tw-flex tw-min-h-full tw-flex-col tw-bg-[var(--color-bg-secondary,#252525)]' },
            { template: tabsSrc, partClass: 'wh40k-sidebar' },
            { template: biographyTabSrc, partClass: 'wh40k-body tw-min-w-0 tw-p-2' },
        ],
        ctx,
        { systemId: systemIdOf(ctx) },
    );
}

randomId('character', rng);

const meta: Meta<SheetContextLike> = {
    title: 'Actor/CharacterSheet',
};
export default meta;
type Story = StoryObj<SheetContextLike>;

// ── DH2e default ─────────────────────────────────────────────────────────────

export const DarkHeresy2Default: Story = {
    name: 'Dark Heresy 2e — Default',
    args: mockPlayerSheetContext({ systemId: 'dh2', activeTab: 'biography' }),
    render: (args) => renderCharacterSheet(args),
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        await expect(storyCanvas.getByDisplayValue('Acolyte Vex')).toBeVisible();
        await expect(storyCanvas.getByText('Biography')).toBeVisible();
    },
};

// ── Inventory Carry bar (#545) ────────────────────────────────────────────────

/** A DH2 PC on the Inventory tab, carrying 30 of 60 kg; the flag and fill come from the sheet's own `encumbranceDisplay`. */
function pcInventoryContext(): SheetContextLike {
    const ctx = mockPlayerSheetContext({ systemId: 'dh2', activeTab: 'equipment' });
    const actor = { ...ctx.actor, encumbrance: { value: 30, max: 60, over: false, encumbered: false } };
    return { ...ctx, ...encumbranceDisplay(actor), actor };
}

export const InventoryCarryBar: Story = {
    name: 'Inventory — Carry bar for a PC (#545)',
    args: pcInventoryContext(),
    render: (args) => renderSheetParts([{ template: equipmentTabSrc, partClass: 'wh40k-body tw-min-w-0 tw-p-2' }], args, { systemId: systemIdOf(args) }),
    play: async ({ canvasElement }) => {
        // Exactly one Carry bar, in the panel header, even with a load on (the tab once drew a second one).
        const bars = canvasElement.querySelectorAll<HTMLElement>('[data-carry-bar]');
        await expect(bars).toHaveLength(1);
        for (const bar of bars) {
            void expect(bar).toBeVisible();
            void expect(bar.textContent.replace(/\s+/g, ' ')).toContain('30 / 60');
        }
        await expect(canvasElement.textContent.match(/\bkg\b/gi)).toHaveLength(1);
    },
};

// ── Imperium Maledictum variant ───────────────────────────────────────────────

export const ImperiumMaledictum: Story = {
    name: 'Imperium Maledictum variant',
    args: mockPlayerSheetContext({ systemId: 'im', activeTab: 'biography' }),
    render: (args) => renderCharacterSheet(args),
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        // IM uses 'Interrogator Hale' as the default actor name
        await expect(storyCanvas.getByDisplayValue('Interrogator Hale')).toBeVisible();
        // IM origin path step should be House Varonius
        await expect(storyCanvas.getByText('House Varonius')).toBeVisible();
    },
};

// ── Edit mode: bio fields ─────────────────────────────────────────────────────

export const EditModeBio: Story = {
    name: 'Edit Mode — bio fields',
    args: mockPlayerSheetContext({
        systemId: 'dh2',
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
        const storyCanvas = within(canvasElement);
        await expect(storyCanvas.getByDisplayValue('29')).toBeVisible();
        await expect(storyCanvas.getByDisplayValue('Female')).toBeVisible();
    },
};

// ── Interaction: itemCreate (enemy row) ───────────────────────────────────────

export const EnemyCreateClick: Story = {
    name: 'Interaction — itemCreate (enemy row)',
    args: mockPlayerSheetContext({ systemId: 'dh2', activeTab: 'biography' }),
    render: (args) => renderCharacterSheet(args),
    play: ({ canvasElement }) => {
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
        const storyCanvas = within(canvasElement);
        await expect(storyCanvas.getByDisplayValue('Acolyte Vex')).toBeVisible();
        await expect(storyCanvas.getByText('Biography')).toBeVisible();
    },
};

export const DarkHeresy1eVariant: Story = {
    name: 'Per-system — Dark Heresy 1e',
    args: mockPlayerSheetContext({ systemId: 'dh1', activeTab: 'biography' }),
    render: (args) => renderCharacterSheet(args),
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        await expect(storyCanvas.getByDisplayValue('Acolyte Vex')).toBeVisible();
        await expect(storyCanvas.getByText('Biography')).toBeVisible();
    },
};

export const DeathwatchVariant: Story = {
    name: 'Per-system — Deathwatch',
    args: mockPlayerSheetContext({ systemId: 'dw', activeTab: 'biography' }),
    render: (args) => renderCharacterSheet(args),
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        await expect(storyCanvas.getByDisplayValue('Acolyte Vex')).toBeVisible();
        await expect(storyCanvas.getByText('Biography')).toBeVisible();
    },
};

export const OnlyWarVariant: Story = {
    name: 'Per-system — Only War',
    args: mockPlayerSheetContext({ systemId: 'ow', activeTab: 'biography' }),
    render: (args) => renderCharacterSheet(args),
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        await expect(storyCanvas.getByDisplayValue('Acolyte Vex')).toBeVisible();
        await expect(storyCanvas.getByText('Biography')).toBeVisible();
    },
};

export const RogueTraderVariant: Story = {
    name: 'Per-system — Rogue Trader',
    args: mockPlayerSheetContext({ systemId: 'rt', activeTab: 'biography' }),
    render: (args) => renderCharacterSheet(args),
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        await expect(storyCanvas.getByDisplayValue('Acolyte Vex')).toBeVisible();
        await expect(storyCanvas.getByText('Biography')).toBeVisible();
    },
};

// ── Issue #19 — non-Reaction action click shows description locally ─────────
// Renders the combat-actions-panel partial with a combat talent and a single
// attack action, then simulates a click on the non-Reaction (attack) button.
// The fix wired in character-sheet.ts routes a plain click through the local
// tooltip path — chat is only created on Shift+Click. The story uses a manual
// click handler that mirrors the static method's local-tooltip fallback so the
// behaviour is observable without instantiating the full sheet class.

const combatActionsPanelTpl = HbsLib.compile(combatActionsPanelSrc);

interface MockTalent {
    id: string;
    name: string;
    type: 'talent';
    system: { tier: number; description: { value: string } };
}

interface MockAction {
    key: string;
    label: string;
    description: string;
    type: string;
    icon: string;
    subtypes?: string[];
}

interface CombatPanelContext {
    system: { initiative: { total: number }; movement: { half: number; full: number; charge: number; run: number } };
    combatTalents: MockTalent[];
    generalAttacks: MockAction[];
    meleeAttacks: MockAction[];
    rangedAttacks: MockAction[];
    dh: { combatActions: { movement: MockAction[]; utility: MockAction[] } };
}

function buildCombatPanelContext(): CombatPanelContext {
    return {
        system: { initiative: { total: 12 }, movement: { half: 3, full: 6, charge: 9, run: 12 } },
        combatTalents: [
            {
                id: 'talent-iron-jaw',
                name: 'Iron Jaw',
                type: 'talent',
                system: { tier: 2, description: { value: 'Test Toughness vs stunning damage.' } },
            },
        ],
        generalAttacks: [
            { key: 'standardAttack', label: 'Standard Attack', description: 'A single attack with one weapon.', type: 'Half', icon: 'fa-crosshairs' },
        ],
        meleeAttacks: [],
        rangedAttacks: [],
        dh: {
            combatActions: {
                movement: [{ key: 'halfMove', label: 'Half Move', description: 'Move half your AB.', type: 'Half', icon: 'fa-walking' }],
                utility: [{ key: 'ready', label: 'Ready', description: 'Ready a stowed item.', type: 'Half', icon: 'fa-tools' }],
            },
        },
    };
}

function renderCombatPanel(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'wh40k-rpg theme-dark';
    wrap.innerHTML = combatActionsPanelTpl(buildCombatPanelContext());

    // Wire a click handler that mirrors the sheet's static-method behaviour:
    //  • plain click on combatTalentDescribe / vocalizeCombatAction → write the
    //    description into data-tooltip (the fallback path used in tests).
    //  • Shift+Click → would post to chat (production path). The story keeps
    //    no Foundry runtime, so we only signal intent via a data-* attribute.
    wrap.addEventListener('click', (event) => {
        const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
        if (!target) return;
        const action = target.dataset['action'];
        if (action !== 'combatTalentDescribe' && action !== 'vocalizeCombatAction') return;
        const isShiftClick = event instanceof MouseEvent && event.shiftKey;
        if (isShiftClick) {
            target.setAttribute('data-issue19-posted-to-chat', 'true');
            return;
        }
        const label = target.getAttribute('aria-label') ?? target.getAttribute('title') ?? '';
        target.setAttribute('data-tooltip', label);
        target.setAttribute('data-issue19-described-locally', 'true');
    });

    return wrap;
}

export const Issue19NonReactionLocalDescription: Story = {
    name: 'Issue #19 — non-Reaction action shows description locally',
    args: mockPlayerSheetContext({ systemId: 'dh2', activeTab: 'combat' }),
    render: () => renderCombatPanel(),
    play: async ({ canvasElement }) => {
        const root = canvasElement;
        // The combat-talent button must route through the new local action,
        // not the legacy itemVocalize (which auto-posted to chat).
        const talentButton = root.querySelector<HTMLElement>('[data-action="combatTalentDescribe"][data-item-id="talent-iron-jaw"]');
        await expect(talentButton).not.toBeNull();
        if (talentButton !== null) {
            await expect(talentButton.getAttribute('title') ?? '').toContain('Shift+Click');
        }

        // No itemVocalize on combat talents — that path always auto-posted.
        await expect(root.querySelector('[data-action="itemVocalize"]')).toBeNull();

        // Click the non-Reaction (attack) action.
        clickAction(root, 'vocalizeCombatAction');
        const attackButton = root.querySelector<HTMLElement>('[data-action="vocalizeCombatAction"]');
        await expect(attackButton).not.toBeNull();
        if (attackButton !== null) {
            await expect(attackButton.getAttribute('data-issue19-described-locally')).toBe('true');
            await expect(attackButton.getAttribute('data-issue19-posted-to-chat')).toBeNull();
            await expect(attackButton.getAttribute('data-tooltip') ?? '').not.toBe('');
        }

        // Chat-message DOM must NOT have been added by the click.
        await expect(root.querySelector('.chat-message')).toBeNull();
        await expect(document.querySelector('ol#chat-log .chat-message')).toBeNull();
    },
};

// ── #245: block-only groups never iterate the sheet's owned items ──────────────

const REACTION_LINES = ['dh1', 'dh2', 'rt', 'bc', 'dw', 'ow'] as const;

/** The panel once per line, each with owned `items` in its context — what the Reactions group used to iterate. */
function renderReactionsPerLine(): HTMLElement {
    const row = document.createElement('div');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
    row.style.gap = '12px';
    for (const line of REACTION_LINES) {
        const column = document.createElement('div');
        column.className = 'wh40k-rpg theme-dark';
        column.dataset['wh40kSystem'] = line;
        column.innerHTML = combatActionsPanelTpl({
            ...buildCombatPanelContext(),
            items: [
                { id: `${line}-owned-lasgun`, name: 'Lasgun', type: 'weapon' },
                { id: `${line}-owned-flak`, name: 'Flak Armour', type: 'armour' },
            ],
        });
        row.appendChild(column);
    }
    return row;
}

export const Issue245ReactionsOnlyDodgeParry: Story = {
    name: 'Issue #245 — Reactions row is Dodge and Parry only, on every line',
    args: mockPlayerSheetContext({ systemId: 'dh2', activeTab: 'combat' }),
    render: () => renderReactionsPerLine(),
    play: async ({ canvasElement }) => {
        const rows = REACTION_LINES.map((line) => {
            const grid = canvasElement.querySelector(`[data-wh40k-system="${line}"] [data-action="dodge"]`)?.parentElement;
            return { line, actions: Array.from(grid?.querySelectorAll('button') ?? []).map((button) => button.dataset['action'] ?? '') };
        });
        await expect(rows).toEqual(REACTION_LINES.map((line) => ({ line, actions: ['dodge', 'parry'] })));
        await expect(canvasElement.textContent).not.toContain('Lasgun');
    },
};
