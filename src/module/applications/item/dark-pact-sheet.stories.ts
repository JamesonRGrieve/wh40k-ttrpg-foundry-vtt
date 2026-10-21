/**
 * Stories for the Dark Pact item sheet (#84, Enemies Beyond pp. 72–76).
 *
 * The context is built by the sheet's own view (`darkPactSheetView`) from the
 * Pact of Might / Pact of Knowledge fixtures, and granted-item names render
 * through `uuidNameCache` exactly as at runtime.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-dark-pact-sheet.hbs?raw';
import { BOOK_TERMS, CORRUPTION_FORMULA, KNOWLEDGE, MIGHT, registerPactNames } from '../../../../stories/mocks/dark-pacts';
import type { SystemId } from '../../../../stories/mocks/extended';
import { renderSheet, storyRoot } from '../../../../stories/test-helpers';
import { type DarkPactSheetView, darkPactSheetView, type PactDefinitionView } from './dark-pact-view';

registerPactNames();

interface DarkPactSheetArgs {
    item: { name: string; img: string };
    system: { description: { value: string } };
    pact: DarkPactSheetView;
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
}

const IMG = 'https://cdn.jsdelivr.net/gh/game-icons/icons@master/skoll/pentacle.svg';

function args(name: string, definition: PactDefinitionView, canEdit = false, inEditMode = false): DarkPactSheetArgs {
    return {
        item: { name, img: IMG },
        system: { description: { value: `<p>See Enemies Beyond.</p>` } },
        pact: darkPactSheetView({ corruptionFormula: CORRUPTION_FORMULA, negotiation: BOOK_TERMS, ...definition }),
        canEdit,
        inEditMode,
        editable: canEdit,
    };
}

function renderFor(systemId: SystemId, story: DarkPactSheetArgs): HTMLElement {
    const el = renderSheet(templateSrc, story);
    el.dataset['wh40kSystem'] = systemId;
    return el;
}

const meta = {
    title: 'Item Sheets/DarkPactSheet',
    render: (story) => renderSheet(templateSrc, story),
    args: args('Pact of Might', MIGHT),
} satisfies Meta<DarkPactSheetArgs>;
export default meta;

type Story = StoryObj<DarkPactSheetArgs>;

/** The terms, then every Boon and Bane with the mechanics the system applies. */
async function assertMight(canvasElement: HTMLElement): Promise<void> {
    await expect(canvasElement.querySelector('h1')?.textContent).toBe('Pact of Might');
    await expect(canvasElement.querySelector('[data-dark-pact-term="corruption"]')?.textContent).toBe('2d10+10');
    await expect(canvasElement.querySelector('[data-dark-pact-term="disposition"]')?.textContent.trim()).toBe("15 + the character's Corruption");
    await expect(canvasElement.querySelector('[data-dark-pact-term="test"]')?.textContent).toBe('-20');

    const boons = Array.from(canvasElement.querySelectorAll('[data-dark-pact-entries="boons"] [data-dark-pact-entry]')).map((li) =>
        li.getAttribute('data-dark-pact-entry'),
    );
    await expect(boons).toEqual(['mighty', 'lord-of-battle', 'reaver', 'unassailable']);
    const banes = Array.from(canvasElement.querySelectorAll('[data-dark-pact-entries="banes"] [data-dark-pact-entry]')).map((li) =>
        li.getAttribute('data-dark-pact-entry'),
    );
    await expect(banes).toEqual(['aspect-of-war', 'blood-rage', 'bloodthirsty']);

    const mechanics = (id: string): string =>
        (canvasElement.querySelector(`[data-dark-pact-entry="${id}"] [data-dark-pact-mechanics]`)?.textContent ?? '').replace(/\s+/g, ' ').trim();
    await expect(mechanics('mighty')).toBe('Unnatural Characteristic (X) — Strength (2)');
    await expect(mechanics('lord-of-battle')).toBe('Weapon Skill +5');
    await expect(mechanics('unassailable')).toBe('Combat Master Counter Attack Step Aside');
    await expect(canvasElement.textContent).not.toContain('[broken link]');

    // Narrative entries are flagged for the GM; entries with mechanics are not.
    await expect(canvasElement.querySelector('[data-dark-pact-entry="blood-rage"] [data-dark-pact-narrative]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-dark-pact-entry="mighty"] [data-dark-pact-narrative]')).toBeNull();
    // The sheet shows content; removing entries is the panel's job.
    await expect(canvasElement.querySelector('[data-action="togglePactEntry"]')).toBeNull();
}

export const PactOfMight: Story = {
    args: args('Pact of Might', MIGHT),
    play: async ({ canvasElement }) => {
        await assertMight(canvasElement);
        await expect(canvasElement.querySelector('[data-action="toggleEditMode"]')).toBeNull();
    },
};

export const PactOfKnowledge: Story = {
    args: args('Pact of Knowledge', KNOWLEDGE),
    play: async ({ canvasElement }) => {
        const mechanics = (id: string): string =>
            (canvasElement.querySelector(`[data-dark-pact-entry="${id}"] [data-dark-pact-mechanics]`)?.textContent ?? '').trim();
        await expect(mechanics('dark-genius')).toBe('Intelligence +5');
        await expect(mechanics('detached')).toBe('Fellowship -10');
        await expect(canvasElement.querySelectorAll('[data-dark-pact-entries="banes"] [data-dark-pact-entry]').length).toBe(3);
    },
};

export const EmptyPact: Story = {
    args: args('Unwritten Pact', { boons: [], banes: [] }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-dark-pact-empty="boons"]')).not.toBeNull();
        await expect(canvasElement.querySelector('[data-dark-pact-empty="banes"]')).not.toBeNull();
    },
};

export const EditMode: Story = {
    args: args('Pact of Might', MIGHT, true, true),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-action="toggleEditMode"]')).not.toBeNull();
        await expect(canvasElement.querySelector('input[name="name"]')).not.toBeNull();
        await expect(canvasElement.querySelectorAll('[data-dark-pact-entries="boons"] [data-dark-pact-entry]').length).toBe(4);
    },
};

// ── Per-system homologation ──────────────────────────────────────────────────
// Only DH2 prints pacts, but every line can hold one: the sheet must render the
// same content under each line's theme.

function homologation(systemId: SystemId): Story {
    return {
        args: args('Pact of Might', MIGHT),
        render: (story) => renderFor(systemId, story),
        play: async ({ canvasElement }) => {
            await expect(storyRoot(canvasElement).dataset['wh40kSystem']).toBe(systemId);
            await assertMight(canvasElement);
        },
    };
}

export const HomologationDH2: Story = homologation('dh2');
export const HomologationDH1: Story = homologation('dh1');
export const HomologationRT: Story = homologation('rt');
export const HomologationBC: Story = homologation('bc');
export const HomologationOW: Story = homologation('ow');
export const HomologationDW: Story = homologation('dw');

// ── The window body is opaque (#694) ─────────────────────────────────────────

/** The alpha of an element's computed background colour (1 for an opaque fill). */
function backgroundAlpha(el: Element): number {
    const parts = /rgba?\(([^)]+)\)/u.exec(getComputedStyle(el).backgroundColor)?.[1]?.split(',') ?? [];
    if (parts.length < 3) return 0;
    return parts.length === 3 ? 1 : Number.parseFloat(parts[3] ?? '0');
}

/**
 * The sheet inside the live window frame (`DEFAULT_OPTIONS.classes` on the root,
 * ApplicationV2's `.window-content` body), whose body must paint opaque on both
 * themes. It was transparent, so the sheet behind read through (#694).
 */
export const OpaqueWindowBody: Story = {
    render: (story) => {
        const frame = document.createElement('form');
        frame.className = 'application sheet wh40k-rpg item dark-pact';
        const body = document.createElement('section');
        body.className = 'window-content';
        body.appendChild(renderSheet(templateSrc, story));
        frame.appendChild(body);
        return frame;
    },
    play: async ({ canvasElement }) => {
        const body = canvasElement.querySelector(':scope > form > .window-content');
        if (body === null) throw new Error('the window body did not render');
        const themes = document.body.classList;
        const original = [...themes].filter((name) => name.startsWith('theme-'));
        try {
            for (const theme of ['theme-dark', 'theme-light']) {
                themes.remove('theme-dark', 'theme-light');
                themes.add(theme);
                // eslint-disable-next-line no-await-in-loop -- each theme is checked in turn on the one body
                await expect(backgroundAlpha(body), `${theme} body alpha`).toBe(1);
            }
        } finally {
            themes.remove('theme-dark', 'theme-light');
            themes.add(...original);
        }
    },
};
