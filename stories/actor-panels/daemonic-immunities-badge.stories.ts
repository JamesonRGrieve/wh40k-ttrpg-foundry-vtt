/**
 * Storybook stories for the Daemonic Immunities badge (issue #143) and the NPC
 * sidebar it sits in (#630).
 *
 * The badge renders for an actor carrying the Daemonic trait. DH2 Errata L69-73
 * makes the trait grant disease + poison immunity plus the Undying trait; the
 * pill summarises all three on one line, and the tooltip elaborates.
 *
 * #630: the pill used to sit in the sidebar column under the origin bubbles,
 * where its wrapped text overflowed and pushed Threat / Tier below the fold. It
 * is now overlaid on the portrait's bottom edge, kept to one line (the
 * immunities end in an ellipsis), and a long NPC name steps its font size down
 * to fit the narrow name field with the full name in a tooltip. Layout itself is
 * measured in the Tier B spec (`tests/e2e/npc-sidebar-fit.spec.ts`); these plays
 * pin the structure that layout depends on.
 *
 * The companion vitest suites cover the rules predicates
 * (`src/module/rules/daemonic-immunities.test.ts`) and the name-fit steps
 * (`src/module/handlebars/name-fit.test.ts`).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import type { GameSystemId } from '../../src/module/config/game-systems/types';
import badgeSrc from '../../src/templates/actor/partial/daemonic-immunities-badge.hbs?raw';
import headerSrc from '../../src/templates/actor/player/header-dh.hbs?raw';
import { mockNpcSheetContext } from '../mocks/sheet-contexts';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

initializeStoryHandlebars();

const BADGE = '[data-wh40k-hook="daemonic-immunities-badge"]';
const PORTRAIT = '[data-wh40k-hook="actor-portrait"]';
const LONG_NAME = 'Asphodel Kroot Warrior';
const LINES: readonly GameSystemId[] = ['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt'];

interface SidebarArgs {
    systemId: GameSystemId;
    name: string;
    isDaemonic: boolean;
    withJournal: boolean;
}

function renderSidebar(args: SidebarArgs): HTMLElement {
    const context = mockNpcSheetContext({
        systemId: args.systemId,
        actorOverrides: { name: args.name },
        contextOverrides: {
            isDaemonic: args.isDaemonic,
            portraitJournal: args.withJournal ? { uuid: 'JournalEntry.aaaaaaaaaaaaaaaa', canClear: false } : null,
        },
    });
    const root = renderSheet(`<aside class="wh40k-sidebar tw-w-[200px]" data-wh40k-system="${args.systemId}">${headerSrc}</aside>`, context);
    root.dataset['wh40kSystem'] = args.systemId;
    return root;
}

/** The name input of a rendered sidebar. */
function nameInput(root: HTMLElement): HTMLInputElement | null {
    return root.querySelector<HTMLInputElement>('input[name="name"]');
}

/** Assert the badge sits on the portrait, not in the sidebar column's flow. */
async function expectBadgeOnPortrait(root: HTMLElement): Promise<void> {
    const badge = root.querySelector<HTMLElement>(BADGE);
    await expect(badge).not.toBeNull();
    await expect(badge?.closest(PORTRAIT)).not.toBeNull();
    // The overlay wrapper is absolutely positioned inside the portrait.
    await expect(badge?.parentElement?.classList.contains('tw-absolute')).toBe(true);
    await expect(badge?.parentElement?.classList.contains('tw-bottom-1')).toBe(true);
}

const meta: Meta<SidebarArgs> = {
    title: 'Actor/Panels/DaemonicImmunitiesBadge',
    args: { systemId: 'bc', name: 'Bloodletter', isDaemonic: true, withJournal: false },
};
export default meta;
type Story = StoryObj<SidebarArgs>;

export const Default: Story = {
    name: 'Daemonic — disease/poison immunity + Undying',
    render: () => renderSheet(badgeSrc, {}),
    play: async ({ canvasElement }) => {
        const badge = canvasElement.querySelector<HTMLElement>(BADGE);
        await expect(badge).not.toBeNull();
        if (badge === null) return;
        // One line, always: the pill never wraps, the immunities truncate.
        await expect(badge.classList.contains('tw-whitespace-nowrap')).toBe(true);
        const immunities = badge.querySelector<HTMLElement>('[data-wh40k-hook="daemonic-immunities-badge__immunities"]');
        await expect(immunities?.classList.contains('tw-truncate')).toBe(true);
        await expect(immunities?.classList.contains('tw-min-w-0')).toBe(true);
        await expect(badge.querySelector('[data-wh40k-hook="daemonic-immunities-badge__label"]')?.textContent.trim()).toBe('Daemonic');
        // The full text survives truncation in the tooltip and the accessible name.
        await expect(badge.getAttribute('role')).toBe('img');
        await expect(badge.getAttribute('aria-label')).toBe('Daemonic: Immune to Disease, Immune to Poison, Undying');
        await expect(badge.dataset['tooltip']).toContain('immune to disease and poison');
    },
};

export const BloodletterSidebar: Story = {
    name: 'Bloodletter sidebar — badge on the portrait (#630)',
    render: renderSidebar,
    play: async ({ canvasElement }) => {
        await expectBadgeOnPortrait(canvasElement);
        // Threat and Tier still render in the sidebar fields.
        const fields = Array.from(canvasElement.querySelectorAll<HTMLElement>('[name="system.threatLevel"], [name="system.tier"]'));
        await expect(fields).toHaveLength(2);
        // Clear of the journal corner when no journal control is shown.
        await expect(canvasElement.querySelector(BADGE)?.parentElement?.classList.contains('tw-right-1')).toBe(true);
    },
};

export const LongNameSidebar: Story = {
    name: 'Long NPC name — shrinks to fit, full name in tooltip (#630)',
    args: { name: LONG_NAME },
    render: renderSidebar,
    play: async ({ canvasElement }) => {
        const input = nameInput(canvasElement);
        await expect(input).not.toBeNull();
        await expect(input?.value).toBe(LONG_NAME);
        await expect(input?.dataset['tooltip']).toBe(LONG_NAME);
        await expect(input?.classList.contains('tw-text-[0.8rem]')).toBe(true);
        await expect(input?.classList.contains('tw-text-[1.05rem]')).toBe(false);
        await expect(input?.classList.contains('tw-text-ellipsis')).toBe(true);
    },
};

export const ShortNameKeepsBaseSize: Story = {
    name: 'Short NPC name keeps the base size',
    args: { name: 'Bloodletter', isDaemonic: false },
    render: renderSidebar,
    play: async ({ canvasElement }) => {
        const input = nameInput(canvasElement);
        await expect(input?.classList.contains('tw-text-[1.05rem]')).toBe(true);
        await expect(input?.dataset['tooltip']).toBe('Bloodletter');
        // No Daemonic trait, no badge.
        await expect(canvasElement.querySelector(BADGE)).toBeNull();
    },
};

export const WithJournalControl: Story = {
    name: 'Badge stays clear of the portrait journal control',
    args: { withJournal: true },
    render: renderSidebar,
    play: async ({ canvasElement }) => {
        await expectBadgeOnPortrait(canvasElement);
        const wrapper = canvasElement.querySelector(BADGE)?.parentElement;
        await expect(wrapper?.classList.contains('tw-right-10')).toBe(true);
        await expect(canvasElement.querySelector('[data-action="openPortraitJournal"]')).not.toBeNull();
    },
};

export const EveryLine: Story = {
    name: 'Daemonic long-named NPC sidebar on every line',
    render: (args) => {
        const grid = document.createElement('div');
        grid.className = 'tw-grid tw-grid-cols-3 tw-gap-4';
        for (const systemId of LINES) grid.appendChild(renderSidebar({ ...args, systemId, name: LONG_NAME }));
        return grid;
    },
    play: async ({ canvasElement }) => {
        const sidebars = Array.from(canvasElement.querySelectorAll<HTMLElement>('aside.wh40k-sidebar'));
        await expect(sidebars).toHaveLength(LINES.length);
        await Promise.all(sidebars.map(async (sidebar) => expectBadgeOnPortrait(sidebar)));
        await expect(sidebars.map((sidebar) => nameInput(sidebar)?.classList.contains('tw-text-[0.8rem]'))).toEqual(LINES.map(() => true));
    },
};
