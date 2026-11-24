/**
 * Sidebar header fields: the rows under a character's portrait (origins, rank, player).
 * The career **Rank** row shows the rank the character's XP reaches as its placeholder;
 * only a GM edits it, to override that rank (operator ruling 2026-11-16).
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';

initializeStoryHandlebars();

interface FieldArgs {
    label: string;
    name: string;
    type: 'text' | 'number' | 'select';
    value: string | number;
    placeholder: string;
    min?: number;
    inputClass?: string;
    disabled?: boolean;
    valueLabel?: string;
    options?: Record<string, string>;
}

interface Args {
    gameSystem: string;
    headerFields: FieldArgs[];
}

const SOURCE = `<div data-wh40k-system="{{gameSystem}}" class="tw-w-[220px]">{{> systems/wh40k-rpg/templates/actor/partial/sidebar-fields-panel.hbs}}</div>`;

const homeWorld: FieldArgs = { label: 'Home World', name: 'system.originPath.homeWorld', type: 'text', value: 'Feral World', placeholder: 'Home World' };
const rank = (disabled: boolean, value: string | number = ''): FieldArgs => ({
    label: 'Rank',
    name: 'system.rankOverride',
    type: 'number',
    value,
    placeholder: '6',
    min: 1,
    inputClass: 'wh40k-rank-input',
    disabled,
});

const meta = {
    title: 'Actor/Partials/SidebarFields',
    render: (args) => renderSheet(SOURCE, { ...args }),
    args: { gameSystem: 'dh1', headerFields: [homeWorld, rank(false)] },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/** Read the Rank row's input. */
function rankInput(canvasElement: HTMLElement): HTMLInputElement | null {
    return canvasElement.querySelector<HTMLInputElement>('[data-sidebar-field="system.rankOverride"] input');
}

/** A GM: the Rank row is editable, empty, and shows the rank 6,000 XP reaches. */
export const GmRankFromExperience: Story = {
    play: async ({ canvasElement }) => {
        const input = rankInput(canvasElement);
        await expect(input).not.toBeNull();
        await expect(input?.disabled).toBe(false);
        await expect(input?.value).toBe('');
        await expect(input?.placeholder).toBe('6');
        await expect(input?.type).toBe('number');
        await expect(input?.min).toBe('1');
        // The other rows are unchanged.
        await expect(canvasElement.querySelector<HTMLInputElement>('[data-sidebar-field="system.originPath.homeWorld"] input')?.disabled).toBe(false);
    },
};

/** A GM override: the row holds the overriding rank. */
export const GmOverride: Story = {
    args: { headerFields: [homeWorld, rank(false, 2)] },
    play: async ({ canvasElement }) => {
        await expect(rankInput(canvasElement)?.value).toBe('2');
    },
};

const npcFields: FieldArgs[] = [
    { label: 'Threat', name: 'system.threatLevel', type: 'number', value: 6, placeholder: '', valueLabel: 'Standard' },
    { label: 'Tier', name: 'system.tier', type: 'select', value: 'troop', placeholder: '', options: { troop: 'Troop', elite: 'Elite', master: 'Master' } },
    { label: 'Faction', name: 'system.faction', type: 'text', value: '', placeholder: 'Faction' },
];

/**
 * An NPC's rows (operator, 2026-11-24: "a little squished"). Each label sits above
 * its control and the control takes the row: side by side, Threat's input was ~40px
 * between its label and "Standard", and Faction alone wrapped under its label.
 */
export const NpcRowsStacked: Story = {
    args: { gameSystem: 'dh2', headerFields: npcFields },
    play: async ({ canvasElement }) => {
        // Stacked: each control starts below its label, not beside it.
        const stacked = npcFields.map((field) => {
            const fieldRow = canvasElement.querySelector<HTMLElement>(`[data-sidebar-field="${field.name}"]`);
            const label = fieldRow?.querySelector<HTMLElement>('[data-sidebar-field-label]')?.getBoundingClientRect();
            const control = fieldRow?.querySelector<HTMLElement>('input, select')?.getBoundingClientRect();
            return label !== undefined && control !== undefined && control.top >= label.bottom;
        });
        await expect(stacked).toEqual(npcFields.map(() => true));
        const row = canvasElement.querySelector<HTMLElement>('[data-sidebar-field="system.threatLevel"]');
        const threat = row?.querySelector<HTMLInputElement>('input');
        // The number takes most of the row beside its value label.
        await expect((threat?.getBoundingClientRect().width ?? 0) / (row?.getBoundingClientRect().width ?? 1)).toBeGreaterThan(0.5);
        await expect(row?.textContent).toContain('Standard');
    },
};

/** A player: the Rank row shows the rank but cannot be edited. */
export const PlayerSeesRank: Story = {
    args: { headerFields: [homeWorld, rank(true)] },
    play: async ({ canvasElement }) => {
        const input = rankInput(canvasElement);
        await expect(input?.disabled).toBe(true);
        await expect(input?.placeholder).toBe('6');
    },
};
