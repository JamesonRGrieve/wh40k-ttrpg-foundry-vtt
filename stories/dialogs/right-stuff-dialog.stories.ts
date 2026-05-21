import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../src/templates/prompt/right-stuff-dialog.hbs?raw';
import { renderSheet } from '../test-helpers';

/**
 * Dialog story for the Ace role's Right Stuff Fate spend
 * (#100 — without.md L948-L980). Covers the eligible state
 * (button enabled, skill picker visible), the no-Fate state,
 * and the non-Ace state (button disabled with explanatory copy).
 */

interface Args {
    actorName: string;
    isAce: boolean;
    hasFate: boolean;
    eligible: boolean;
    agilityBonus: number;
    fateValue: number;
    selectedSkill: 'operate' | 'survival';
    gameSystem: string;
}

const SKILLS = [
    { key: 'operate', labelKey: 'WH40K.RightStuff.Skill.operate' },
    { key: 'survival', labelKey: 'WH40K.RightStuff.Skill.survival' },
];

function buildContext(args: Args): Record<string, unknown> {
    return {
        actorName: args.actorName,
        isAce: args.isAce,
        hasFate: args.hasFate,
        eligible: args.eligible,
        agilityBonus: args.agilityBonus,
        fateValue: args.fateValue,
        skills: SKILLS,
        selectedSkill: args.selectedSkill,
        gameSystem: args.gameSystem,
    };
}

const meta = {
    title: 'Dialogs/RightStuffDialog',
    render: (args: Args) => renderSheet(templateSrc, buildContext(args)),
    args: {
        actorName: 'Vex Tannor',
        isAce: true,
        hasFate: true,
        eligible: true,
        agilityBonus: 4,
        fateValue: 3,
        selectedSkill: 'operate',
        gameSystem: 'dh2e',
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Eligible: Story = {};

export const NoFate: Story = {
    args: { hasFate: false, eligible: false, fateValue: 0 },
};

export const NotAce: Story = {
    args: { isAce: false, eligible: false },
};

export const RenderSmoke: Story = {
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        const spend = canvasElement.querySelector('button[data-action="spendRightStuff"]');
        const cancel = canvasElement.querySelector('button[data-action="cancel"]');
        const selectButtons = canvasElement.querySelectorAll('button[data-action="selectSkill"]');
        await expect(spend).toBeTruthy();
        await expect(cancel).toBeTruthy();
        // Eligible default → spend button enabled.
        await expect((spend as HTMLButtonElement).disabled).toBe(false);
        // Two applicable skills (Operate / Survival).
        await expect(selectButtons.length).toBe(2);
        await expect(view.getByText(/Vex Tannor/i)).toBeTruthy();
    },
};

export const NoFateDisablesButton: Story = {
    args: { hasFate: false, eligible: false, fateValue: 0 },
    play: async ({ canvasElement }) => {
        const spend = canvasElement.querySelector('button[data-action="spendRightStuff"]');
        await expect((spend as HTMLButtonElement).disabled).toBe(true);
    },
};

export const NotAceDisablesButton: Story = {
    args: { isAce: false, eligible: false },
    play: async ({ canvasElement }) => {
        const spend = canvasElement.querySelector('button[data-action="spendRightStuff"]');
        await expect((spend as HTMLButtonElement).disabled).toBe(true);
        // The eligibility-fail panel surfaces an Ace-only message.
        const text = canvasElement.textContent ?? '';
        await expect(text.length).toBeGreaterThan(0);
    },
};
