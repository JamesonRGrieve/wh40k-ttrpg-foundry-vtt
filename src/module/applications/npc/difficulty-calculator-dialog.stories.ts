/**
 * Stories for DifficultyCalculatorDialog — the encounter-balance readout that
 * compares an NPC's threat (× quantity) against the active party. Renders the
 * dialog's `.hbs` against a prepared context covering the difficulty rating,
 * party composition, and the empty-party state.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/dialogs/difficulty-calculator.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

interface NpcSummary {
    name: string;
    img: string;
    threatLevel: number;
    type: string;
    isHorde: boolean;
}

interface PartyMember {
    name: string;
    img: string;
    rank: number;
}

interface Difficulty {
    label: string;
    description: string;
    color: string;
}

interface Args {
    npc: NpcSummary;
    quantity: number;
    partyMembers: PartyMember[];
    partySize: number;
    partyLevel: number;
    partyThreat: number;
    totalThreat: number;
    threatRatio: number;
    difficulty: Difficulty;
}

const NPC: NpcSummary = {
    name: 'Tyranid Warrior',
    img: 'icons/svg/mystery-man.svg',
    threatLevel: 18,
    type: 'Xenos',
    isHorde: false,
};

const PARTY: PartyMember[] = [
    { name: 'Acolyte Vael', img: 'icons/svg/mystery-man.svg', rank: 3 },
    { name: 'Sister Quill', img: 'icons/svg/mystery-man.svg', rank: 2 },
    { name: 'Tech-Priest Orr', img: 'icons/svg/mystery-man.svg', rank: 4 },
];

const meta = {
    title: 'NPC/DifficultyCalculatorDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        npc: NPC,
        quantity: 2,
        partyMembers: PARTY,
        partySize: 3,
        partyLevel: 3,
        partyThreat: 27,
        totalThreat: 36,
        threatRatio: 1.33,
        difficulty: { label: 'Deadly', description: 'A serious fight — the party may take casualties.', color: '#f44336' },
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Deadly: Story = {
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('Tyranid Warrior')).toBeTruthy();
        await expect(scope.getByText('Deadly')).toBeTruthy();
        await expect(scope.getByText('Acolyte Vael')).toBeTruthy();
    },
};

export const Trivial: Story = {
    args: {
        npc: { ...NPC, name: 'Hive Scum', threatLevel: 2 },
        quantity: 1,
        totalThreat: 2,
        threatRatio: 0.07,
        difficulty: { label: 'Trivial', description: 'Barely a speed bump.', color: '#4caf50' },
    },
};

export const NoParty: Story = {
    args: {
        partyMembers: [],
        partySize: 0,
        partyLevel: 0,
        partyThreat: 0,
        threatRatio: 0,
        totalThreat: 36,
    },
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('No active party members found.')).toBeTruthy();
    },
};
