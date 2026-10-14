/**
 * Storybook stories for the Combat tab (`combat-station-panel.hbs`).
 *
 * This surface had no story, which is why #494 went two rounds: the layout was
 * reworked twice with nothing to look at. Its acceptance is explicitly visual —
 * "exactly ONE Vitals heading", "exactly ONE Active Effects list", "verified at
 * compact and full widths" — so the story exists to make that checkable, and the
 * visual-regression baseline is what makes a future regression visible.
 *
 * The layout under test (#494 as revised):
 *   Row 1 left  — the Vitals panel, whose BODY is the shared Overview Vitals +
 *                 Active Effects partials (`showHeader=false`, so the panel's
 *                 own header is the only heading), with Armour beneath it.
 *   Row 1 right — Combat Actions, with Movement directly under it.
 *   Row 2       — Weapons, full width.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import combatStationSrc from '../../src/templates/actor/panel/combat-station-panel.hbs?raw';
import { mockNpcSheetContext, mockPlayerSheetContext } from '../mocks/sheet-contexts';
import { renderSheet } from '../test-helpers';

/** Width of the "compact" viewport the acceptance asks about. */
const COMPACT_WIDTH_PX = 720;

/** The Combat tab reads a handful of sheet-context fields beyond the actor. */
function combatContext(base: object, extra: object = {}): object {
    return {
        ...base,
        tab: { id: 'combat', group: 'primary', cssClass: 'tab-combat', active: true },
        armourDisplay: {
            head: { total: 4 },
            rightArm: { total: 4 },
            leftArm: { total: 4 },
            body: { total: 5 },
            rightLeg: { total: 4 },
            leftLeg: { total: 4 },
        },
        equippedGear: [],
        hasForceField: false,
        weapons: [],
        ...extra,
    };
}

const meta: Meta = {
    id: 'actor-panels-combatstationpanel',
    title: 'Actor/Panels/CombatStationPanel',
    render: (args: object) => renderSheet(combatStationSrc, args),
};
export default meta;
type Story = StoryObj;

/** A DH2 player character — the canonical case. */
export const PlayerDH2: Story = {
    args: combatContext(mockPlayerSheetContext({ systemId: 'dh2', activeTab: 'combat' })),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        // #494's load-bearing assertion: the shared Vitals partial carries its
        // own heading, so nesting it under the panel header rendered "Vitals"
        // twice. `showHeader=false` is what makes this exactly one.
        await expect(view.getAllByText(/^Vitals$/i)).toHaveLength(1);
    },
};

/**
 * A Corruption gain has queued Malignancy Tests: the Vitals body surfaces the
 * owed count as a button wired to `rollMalignancyTest`. With none owed the
 * button is absent (the PlayerDH2 story above).
 */
export const PlayerDH2MalignancyDue: Story = {
    args: combatContext(mockPlayerSheetContext({ systemId: 'dh2', activeTab: 'combat' }), { malignancyTestsDue: 2 }),
    play: async ({ canvasElement }) => {
        const button = canvasElement.querySelector<HTMLButtonElement>('[data-action="rollMalignancyTest"]');
        await expect(button).not.toBeNull();
        await expect(button?.textContent).toContain('2');
    },
};

/** No test owed — the Malignancy button must not render. */
export const PlayerDH2NoMalignancyDue: Story = {
    args: combatContext(mockPlayerSheetContext({ systemId: 'dh2', activeTab: 'combat' }), { malignancyTestsDue: 0 }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-action="rollMalignancyTest"]')).toBeNull();
    },
};

/**
 * The same tab at the compact width the acceptance names. The Row-1 grid is
 * `minmax(0,2fr) minmax(320px,1fr)`, so this is where the right column would
 * crowd the left if the change had broken the layout.
 */
export const PlayerDH2Compact: Story = {
    args: combatContext(mockPlayerSheetContext({ systemId: 'dh2', activeTab: 'combat' })),
    parameters: { viewport: { defaultViewport: 'combatCompact' } },
    globals: { viewport: { value: 'combatCompact' } },
    render: (args: object) => {
        const el = renderSheet(combatStationSrc, args);
        el.style.width = `${COMPACT_WIDTH_PX}px`;
        return el;
    },
};

/**
 * An NPC. The shared Vitals partial gates Fatigue/Fate/mental rows behind
 * `{{#unless isNPC}}`, and the NPC Fate control (#258) is the separate
 * `npcFateHidden`-gated block — so this is the story that would catch the Fate
 * control going missing again, which is exactly what the first #494 pass did.
 */
export const NpcWithFate: Story = {
    args: combatContext(mockNpcSheetContext({ systemId: 'dh2' }), { isNPC: true, npcFateHidden: false }),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getAllByText(/^Vitals$/i)).toHaveLength(1);
        // The Fate control must be present for an elite/master NPC.
        await expect(canvasElement.querySelector('[data-field="system.fate.value"]')).not.toBeNull();
    },
};

/** An NPC below elite tier: `npcFateHidden` suppresses the Fate control. */
export const NpcFateHidden: Story = {
    args: combatContext(mockNpcSheetContext({ systemId: 'dh2' }), { isNPC: true, npcFateHidden: true }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-field="system.fate.value"]')).toBeNull();
    },
};

/** Widths of the Combat tab body across the sheet's range: its minimum up to a widened sheet. */
const LAYOUT_WIDTHS_PX = [560, 720, 960] as const;

/** The armour locations and the selected move-mode check that drew outside their box. */
function clippedPieces(root: HTMLElement): string[] {
    const clipped: string[] = [];
    const outside = (inner: Element, outer: Element | null): boolean => {
        if (outer === null) return true;
        const a = inner.getBoundingClientRect();
        const b = outer.getBoundingClientRect();
        return a.left < b.left - 1 || a.right > b.right + 1;
    };
    for (const location of root.querySelectorAll('[data-location]')) {
        if (outside(location, location.closest('.wh40k-panel'))) clipped.push(location.getAttribute('data-location') ?? '?');
    }
    for (const check of root.querySelectorAll('[data-move-mode-selected]')) {
        if (outside(check, check.closest('[aria-pressed]'))) clipped.push('move-mode check');
    }
    return clipped;
}

/** The Combat tab at each width, with Run selected, for one sheet context. */
function atEveryWidth(context: object): HTMLElement {
    const root = document.createElement('div');
    for (const width of LAYOUT_WIDTHS_PX) {
        const el = renderSheet(combatStationSrc, { ...context, combatMovement: { inCombat: true, disabled: false, selectedMode: 'run', remaining: 18 } });
        el.style.width = `${width}px`;
        el.dataset['layoutWidth'] = String(width);
        root.append(el);
    }
    return root;
}

/**
 * Every armour location (L.ARM / L.LEG were cut off, #620) and the selected move
 * mode's check (#617) lie inside their panel at every width: Armour and Movement sit
 * side by side only when both fit, else they stack.
 */
export const PlayerArmourAndMovementFitEveryWidth: Story = {
    render: () => atEveryWidth(combatContext(mockPlayerSheetContext({ systemId: 'dh2', activeTab: 'combat' }))),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelectorAll('[data-location]').length).toBe(6 * LAYOUT_WIDTHS_PX.length);
        await expect(canvasElement.querySelectorAll('[data-move-mode-selected]').length).toBe(LAYOUT_WIDTHS_PX.length);
        await expect(clippedPieces(canvasElement)).toEqual([]);
    },
};

/** The NPC Combat tab shares the layout (#620 was seen on NPC sheets first). */
export const NpcArmourAndMovementFitEveryWidth: Story = {
    render: () => atEveryWidth(combatContext(mockNpcSheetContext({ systemId: 'dh2' }), { isNPC: true, npcFateHidden: true })),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelectorAll('[data-location]').length).toBe(6 * LAYOUT_WIDTHS_PX.length);
        await expect(clippedPieces(canvasElement)).toEqual([]);
    },
};
