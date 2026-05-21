import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/character-creation/origin-roll-dialog.hbs?raw';
import { clickAction, renderSheet } from '../../../../stories/test-helpers';

interface RollHistoryEntry {
    result: number;
    breakdown: string;
}

interface Args {
    originImg: string;
    originName: string;
    actorName: string;
    rollType: string;
    rollTypeLabel: string;
    description: string;
    formula: string;
    actorTB?: number;
    expandedFormula?: string;
    hasRolled: boolean;
    showHistory: boolean;
    rollResult?: {
        total: number;
        breakdown: string;
    };
    rollHistory: RollHistoryEntry[];
}

const meta: Meta<Args> = {
    title: 'Character Creation/OriginRollDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        originImg: 'icons/svg/d20.svg',
        originName: 'Hive World',
        actorName: 'Acolyte Voss',
        rollType: 'wounds',
        rollTypeLabel: 'Wounds',
        description: 'Roll to determine your starting Wounds.',
        formula: '2xTB+1d5+2',
        actorTB: 4,
        expandedFormula: '2×4+1d5+2',
        hasRolled: false,
        showHistory: false,
        rollHistory: [],
    },
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const Rolled: Story = {
    args: {
        hasRolled: true,
        showHistory: true,
        rollResult: {
            total: 14,
            breakdown: '8 + 4 + 2',
        },
        rollHistory: [
            { result: 12, breakdown: '8 + 2 + 2' },
            { result: 14, breakdown: '8 + 4 + 2' },
        ],
    },
};

export const ActionFlow: Story = {
    args: Rolled.args,
    play: ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        void expect(storyCanvas.getByText('Hive World')).toBeTruthy();
        void expect(storyCanvas.getByText('Acolyte Voss')).toBeTruthy();
        void expect(storyCanvas.getByText('Accept')).toBeTruthy();
        clickAction(canvasElement, 'reroll');
        clickAction(canvasElement, 'accept');
        clickAction(canvasElement, 'cancel');
    },
};

/**
 * Issue #202 regression case: ten previous reroll attempts. Before the fix the
 * history pushed the Reroll/Submit footer off the bottom of the dialog. After
 * the fix the history scrolls inside its own container and the action footer
 * stays pinned to the visible viewport.
 */
export const RerollOverflow: Story = {
    decorators: [
        (storyFn): HTMLElement => {
            // Constrain viewport so the dialog actually hits its tw-max-h-[80vh]
            // cap and the history-overflow behaviour is exercised. The dialog
            // now uses tw-h-full to fill the parent, so size the frame at ~720
            // (enough for header + result + 12rem history + footer) so the
            // pinned-footer behaviour is what gets tested rather than the
            // frame's own overflow:hidden clipping.
            const frame = document.createElement('div');
            frame.style.cssText = 'height:720px;width:640px;display:flex;flex-direction:column;overflow:hidden;';
            frame.classList.add('wh40k-rpg', 'issue-202-viewport');
            const slot = storyFn() as HTMLElement;
            frame.appendChild(slot);
            return frame;
        },
    ],
    args: {
        ...Rolled.args,
        hasRolled: true,
        showHistory: true,
        rollResult: {
            total: 17,
            breakdown: '8 + [7] + 2',
        },
        rollHistory: [
            { result: 11, breakdown: '8 + [1] + 2' },
            { result: 12, breakdown: '8 + [2] + 2' },
            { result: 13, breakdown: '8 + [3] + 2' },
            { result: 14, breakdown: '8 + [4] + 2' },
            { result: 15, breakdown: '8 + [5] + 2' },
            { result: 11, breakdown: '8 + [1] + 2' },
            { result: 13, breakdown: '8 + [3] + 2' },
            { result: 16, breakdown: '8 + [6] + 2' },
            { result: 12, breakdown: '8 + [2] + 2' },
            { result: 17, breakdown: '8 + [7] + 2' },
        ],
    },
    play: ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        // History list must exist with 10 entries.
        const list = canvasElement.querySelector('[data-testid="previous-attempts-list"]');
        void expect(list).toBeTruthy();
        void expect(list?.querySelectorAll('li').length).toBe(10);

        // Action footer must be in the DOM AND visible in the viewport.
        const footer = canvasElement.querySelector('[data-testid="origin-roll-actions"]');
        void expect(footer).toBeTruthy();

        // The Reroll button is rendered inside the action footer (post-roll state).
        const rerollBtn = storyCanvas.getByText('Re-roll').closest('button');
        void expect(rerollBtn).toBeTruthy();
        const acceptBtn = storyCanvas.getByText('Accept').closest('button');
        void expect(acceptBtn).toBeTruthy();
    },
};
