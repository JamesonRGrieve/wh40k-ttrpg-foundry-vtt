/**
 * Stories for the Dark Pacts panel (#84, Enemies Beyond pp. 72–76).
 *
 * The context is the panel's own view (`darkPactPanelView`) over struck pact
 * records and their resolved pact content (the Pact of Might / Pact of
 * Knowledge fixtures, real pack UUIDs). Pact and granted-item names render
 * through `uuidNameCache`, as at runtime.
 *
 * The companion Tier B spec (`tests/e2e/dark-pact-panel.spec.ts`) strikes the
 * real compendium pacts on a live character and photographs the panel.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { type DarkPactPanelView, darkPactPanelView } from '../../src/module/applications/item/dark-pact-view.ts';
import type { PactRecord } from '../../src/module/rules/dark-pact.ts';
import panelSrc from '../../src/templates/actor/panel/dark-pact-panel.hbs?raw';
import { PACT_DEFINITIONS, PACT_MISSING, PACT_OF_KNOWLEDGE, PACT_OF_MIGHT, pactRecord, registerPactNames } from '../mocks/dark-pacts';
import type { SystemId } from '../mocks/extended';
import { initializeStoryHandlebars } from '../template-support';
import { captureActionClicks, renderSheet, storyRoot } from '../test-helpers';

initializeStoryHandlebars();
registerPactNames();

interface PanelArgs {
    darkPactPanel: DarkPactPanelView;
}

function panel(records: PactRecord[], isGM: boolean): PanelArgs {
    return { darkPactPanel: darkPactPanelView(records, PACT_DEFINITIONS, isGM) };
}

function renderPanel(story: PanelArgs, systemId: SystemId = 'dh2'): HTMLElement {
    const el = renderSheet(panelSrc, story);
    el.dataset['wh40kSystem'] = systemId;
    return el;
}

const MIGHT_BARGAIN = pactRecord(PACT_OF_MIGHT, { boons: ['mighty', 'lord-of-battle'], banes: ['blood-rage'], disposition: 32 });
const KNOWLEDGE_BARGAIN = pactRecord(PACT_OF_KNOWLEDGE, {
    boons: ['dark-genius'],
    banes: ['detached'],
    discovered: true,
    disposition: 18,
    paymentCurrent: false,
});

const meta: Meta<PanelArgs> = {
    title: 'Actor/Panels/DarkPactPanel',
    render: (story) => renderPanel(story),
};
export default meta;
type Story = StoryObj<PanelArgs>;

function rows(canvasElement: HTMLElement): HTMLElement[] {
    return Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-wh40k-hook="dark-pact-row"]'));
}
/** The panel's `index`-th pact row; throws when it is missing, so a play reports the absent row. */
function rowAt(canvasElement: HTMLElement, index: number): HTMLElement {
    const row = rows(canvasElement).at(index);
    if (row === undefined) throw new Error(`no pact row ${index}`);
    return row;
}
function text(root: ParentNode, selector: string): string {
    return (root.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
function entryIds(row: HTMLElement, kind: 'boons' | 'banes'): Array<string | null> {
    return Array.from(row.querySelectorAll(`[data-dark-pact-column="${kind}"] [data-dark-pact-entries] [data-dark-pact-entry]`)).map((li) =>
        li.getAttribute('data-dark-pact-entry'),
    );
}

/** A struck Pact of Might: its name through the cache, its Disposition, and the Boons and Banes the bargain carries. */
async function assertMightRow(canvasElement: HTMLElement): Promise<void> {
    const row = rowAt(canvasElement, 0);
    await expect(text(row, '[data-dark-pact-name]')).toBe('Pact of Might');
    await expect(text(row, '[data-dark-pact-disposition]')).toBe('32');
    await expect(entryIds(row, 'boons')).toEqual(['mighty', 'lord-of-battle']);
    await expect(entryIds(row, 'banes')).toEqual(['blood-rage']);
    await expect(text(row, '[data-dark-pact-entry="mighty"] [data-dark-pact-mechanics]')).toBe('Unnatural Characteristic (X) — Strength (2)');
    await expect(canvasElement.textContent).not.toContain('[broken link]');
}

/** GM view of one struck pact: the bargain, plus controls to add the entries still on offer. */
export const SinglePact: Story = {
    name: 'Single pact — GM, Boons and Banes chosen',
    args: panel([MIGHT_BARGAIN], true),
    play: async ({ canvasElement }) => {
        await assertMightRow(canvasElement);
        const row = rowAt(canvasElement, 0);
        const offered = Array.from(row.querySelectorAll('[data-dark-pact-available="boons"] [data-action="togglePactEntry"]')).map((b) =>
            b.getAttribute('data-entry'),
        );
        await expect(offered).toEqual(['reaver', 'unassailable']);

        // Adding a Boon sends the entry to the sheet's handler.
        const clicks = captureActionClicks(canvasElement);
        row.querySelector<HTMLElement>('[data-dark-pact-available="boons"] [data-entry="reaver"]')?.click();
        await expect(clicks).toEqual([{ action: 'togglePactEntry', dataset: { pactIndex: '0', kind: 'boons', entry: 'reaver' } }]);

        // Taken entries can be removed; Disposition steps; the pact can be removed.
        await expect(row.querySelector('[data-dark-pact-entry="blood-rage"] [data-action="togglePactEntry"]')).not.toBeNull();
        await expect(row.querySelectorAll('[data-action="adjustPactDisposition"]').length).toBe(2);
        await expect(row.querySelector('[data-action="removeDarkPact"]')).not.toBeNull();
    },
};

/** Two pacts in different states, for the GM. */
export const MultiPactMixed: Story = {
    name: 'Multi-pact — mixed discovered / disposition / payment states',
    args: panel([MIGHT_BARGAIN, KNOWLEDGE_BARGAIN], true),
    play: async ({ canvasElement }) => {
        await assertMightRow(canvasElement);
        const knowledge = rowAt(canvasElement, 1);
        await expect(text(knowledge, '[data-dark-pact-name]')).toBe('Pact of Knowledge');
        await expect(knowledge.querySelector('[data-action="togglePactDiscovered"]')?.getAttribute('aria-pressed')).toBe('true');
        await expect(knowledge.querySelector('[data-action="togglePactPayment"]')?.getAttribute('aria-pressed')).toBe('false');
        await expect(text(knowledge, '[data-dark-pact-entry="detached"] [data-dark-pact-mechanics]')).toBe('Fellowship -10');
        await expect(text(knowledge, '[data-dark-pact-entry="dark-genius"] [data-dark-pact-mechanics]')).toBe('Intelligence +5');
    },
};

/** What a player sees of a lapsed, discovered pact: the bargain, no GM controls. */
export const PaymentLapsedEnemy: Story = {
    name: 'Player view — payment lapsed, discovered',
    args: panel([KNOWLEDGE_BARGAIN], false),
    play: async ({ canvasElement }) => {
        const row = rowAt(canvasElement, 0);
        await expect(text(row, '[data-dark-pact-name]')).toBe('Pact of Knowledge');
        await expect(entryIds(row, 'boons')).toEqual(['dark-genius']);
        await expect(canvasElement.querySelector('[data-action="adjustPactDisposition"]')).toBeNull();
        await expect(canvasElement.querySelector('[data-action="removeDarkPact"]')).toBeNull();
        await expect(canvasElement.querySelector('[data-action="togglePactEntry"]')).toBeNull();
        await expect(canvasElement.querySelector('[data-dark-pact-available]')).toBeNull();
        await expect(canvasElement.querySelector('[data-dark-pact-drop]')).toBeNull();
    },
};

/** The GM's empty panel: a drop zone and Add Pact, which dispatches the compendium picker. */
export const AddPact: Story = {
    name: 'GM — no pacts yet, drop zone and Add Pact',
    args: panel([], true),
    play: async ({ canvasElement }) => {
        await expect(rows(canvasElement)).toHaveLength(0);
        await expect(canvasElement.querySelector('[data-dark-pact-drop]')).not.toBeNull();
        const clicks = captureActionClicks(canvasElement);
        canvasElement.querySelector<HTMLElement>('[data-action="addDarkPact"]')?.click();
        await expect(clicks.map((click) => click.action)).toEqual(['addDarkPact']);
    },
};

/** A player with no pacts sees no panel at all. */
export const HiddenFromPlayer: Story = {
    args: panel([], false),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.wh40k-dark-pact-panel')).toBeNull();
    },
};

/** A pact whose document is gone still shows, flagged, so the GM can remove it. */
export const UnresolvedPact: Story = {
    args: panel([pactRecord(PACT_MISSING)], true),
    play: async ({ canvasElement }) => {
        const row = rowAt(canvasElement, 0);
        await expect(row.querySelector('[data-dark-pact-unresolved]')).not.toBeNull();
        await expect(row.querySelector('[data-action="removeDarkPact"]')).not.toBeNull();
    },
};

// ── Per-system homologation ──────────────────────────────────────────────────

function homologation(systemId: SystemId): Story {
    return {
        args: panel([MIGHT_BARGAIN], true),
        render: (story) => renderPanel(story, systemId),
        play: async ({ canvasElement }) => {
            await expect(storyRoot(canvasElement).dataset['wh40kSystem']).toBe(systemId);
            await assertMightRow(canvasElement);
        },
    };
}

export const HomologationDH2: Story = homologation('dh2');
export const HomologationDH1: Story = homologation('dh1');
export const HomologationRT: Story = homologation('rt');
export const HomologationBC: Story = homologation('bc');
export const HomologationOW: Story = homologation('ow');
export const HomologationDW: Story = homologation('dw');
