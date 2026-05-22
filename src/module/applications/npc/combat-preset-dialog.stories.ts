/**
 * Stories for CombatPresetDialog — the save / load / library dialog for NPC
 * combat stat presets. The template branches on `mode`; these stories render
 * each of the three modes plus the empty-library state, and drive the
 * save / select / load action handles.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/dialogs/combat-preset.hbs?raw';
import { renderSheet, clickAction } from '../../../../stories/test-helpers';

interface NpcSummary {
    name: string;
    img: string;
    threatLevel: number;
    type: string;
    role: string;
}

interface Preset {
    id: string;
    name: string;
    description?: string;
    createdDate: string;
    threatLevel: number;
    type: string;
    role?: string;
    faction?: string;
    selected?: boolean;
}

interface Args {
    mode: 'save' | 'load' | 'library';
    npc?: NpcSummary;
    presets: Preset[];
    hasPresets: boolean;
    selectedPreset?: string;
}

const NPC: NpcSummary = {
    name: 'Ork Nob',
    img: 'icons/svg/mystery-man.svg',
    threatLevel: 14,
    type: 'Xenos',
    role: 'Elite',
};

const PRESETS: Preset[] = [
    {
        id: 'p1',
        name: 'Elite Guard',
        description: 'Veteran stormtrooper loadout',
        createdDate: '2026-05-01',
        threatLevel: 12,
        type: 'Human',
        role: 'Elite',
        faction: 'Astra Militarum',
    },
    { id: 'p2', name: 'Chaos Cultist', createdDate: '2026-05-10', threatLevel: 6, type: 'Human', role: 'Minion' },
];

const meta = {
    title: 'NPC/CombatPresetDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        mode: 'save',
        npc: NPC,
        presets: PRESETS,
        hasPresets: true,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const SaveMode: Story = {
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('Save Combat Preset')).toBeTruthy();
        clickAction(canvasElement, 'saveNew');
    },
};

export const LoadMode: Story = {
    args: { mode: 'load', selectedPreset: 'p1', presets: PRESETS.map((p, i) => ({ ...p, selected: i === 0 })) },
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('Elite Guard')).toBeTruthy();
        clickAction(canvasElement, 'selectPreset');
        clickAction(canvasElement, 'loadSelected');
    },
};

export const LibraryMode: Story = {
    args: { mode: 'library' },
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('Preset Library')).toBeTruthy();
        clickAction(canvasElement, 'exportPreset');
    },
};

export const EmptyLibrary: Story = {
    args: { mode: 'library', presets: [], hasPresets: false },
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText(/No presets saved yet/)).toBeTruthy();
    },
};
