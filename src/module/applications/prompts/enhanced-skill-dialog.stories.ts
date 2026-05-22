import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/enhanced-skill-roll.hbs?raw';
import { clickAction, renderSheet } from '../../../../stories/test-helpers';

interface DifficultyRow {
    key: string;
    label: string;
    modifier: number;
    icon: string;
    description: string;
    selected: boolean;
    cssClass: string;
}

interface CommonModifierRow {
    key: string;
    label: string;
    value: number;
    description: string;
    checked: boolean;
}

interface RecentRoll {
    name: string;
    modifier: number;
    timestamp: number;
}

interface Args {
    skillName: string;
    baseTarget: number;
    finalTarget: number;
    difficulties: DifficultyRow[];
    commonModifiers: CommonModifierRow[];
    customModifier: number;
    totalModifier: number;
    difficultyMod: number;
    commonMod: number;
    recentRolls: RecentRoll[];
    hasRecentRolls: boolean;
}

const DIFFICULTIES: Array<Omit<DifficultyRow, 'selected' | 'cssClass'>> = [
    { key: 'easy', label: 'Easy', modifier: 30, icon: 'fa-grin', description: 'Simple tasks with no pressure' },
    { key: 'routine', label: 'Routine', modifier: 20, icon: 'fa-meh', description: 'Standard tasks with time' },
    { key: 'challenging', label: 'Challenging', modifier: 0, icon: 'fa-grimace', description: 'No modifier (baseline)' },
    { key: 'difficult', label: 'Difficult', modifier: -10, icon: 'fa-frown', description: 'Complex or contested tasks' },
    { key: 'hard', label: 'Hard', modifier: -20, icon: 'fa-dizzy', description: 'Very challenging circumstances' },
    { key: 'veryHard', label: 'Very Hard', modifier: -30, icon: 'fa-tired', description: 'Exceptional difficulty' },
];

const COMMON_MODIFIERS: Array<Omit<CommonModifierRow, 'checked'>> = [
    { key: 'goodTools', label: 'Good Tools', value: 10, description: 'Quality equipment aids the task' },
    { key: 'poorTools', label: 'Poor Tools', value: -10, description: 'Inadequate or damaged equipment' },
    { key: 'rushed', label: 'Rushed', value: -10, description: 'Insufficient time to work carefully' },
    { key: 'extraTime', label: 'Extra Time', value: 10, description: 'Taking time to work methodically' },
];

function buildDifficulties(selectedModifier: number): DifficultyRow[] {
    return DIFFICULTIES.map((d) => ({
        ...d,
        selected: d.modifier === selectedModifier,
        cssClass: d.modifier === selectedModifier ? 'selected' : '',
    }));
}

function buildCommonModifiers(active: ReadonlySet<string>): CommonModifierRow[] {
    return COMMON_MODIFIERS.map((m) => ({ ...m, checked: active.has(m.key) }));
}

const meta = {
    title: 'Prompts/EnhancedSkillDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        skillName: 'Awareness',
        baseTarget: 40,
        finalTarget: 40,
        difficulties: buildDifficulties(0),
        commonModifiers: buildCommonModifiers(new Set()),
        customModifier: 0,
        totalModifier: 0,
        difficultyMod: 0,
        commonMod: 0,
        recentRolls: [],
        hasRecentRolls: false,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/** Baseline skill test, no modifiers applied. */
export const Baseline: Story = {};

/** Easy difficulty plus good tools, with recent rolls shown. */
export const Modified: Story = {
    args: {
        skillName: 'Tech-Use',
        baseTarget: 35,
        difficulties: buildDifficulties(30),
        commonModifiers: buildCommonModifiers(new Set(['goodTools'])),
        difficultyMod: 30,
        commonMod: 10,
        totalModifier: 40,
        finalTarget: 75,
        recentRolls: [
            { name: 'Tech-Use', modifier: 20, timestamp: 1 },
            { name: 'Awareness', modifier: -10, timestamp: 2 },
        ],
        hasRecentRolls: true,
    },
};

/** Confirms difficulty buttons and the roll action are wired. */
export const RollFlow: Story = {
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Awareness')).toBeTruthy();
        await expect(canvasElement.querySelectorAll('[data-action="selectDifficulty"]').length).toBe(6);
        clickAction(canvasElement, 'roll');
    },
};
