import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import type { DisorderSeverity } from '../../src/module/rules/disorders-table.ts';
import templateSrc from '../../src/templates/prompt/disorder-roll-dialog.hbs?raw';
import { renderSheet } from '../test-helpers';

interface Args {
    severity: DisorderSeverity;
}

const SEVERITY_OPTIONS = [
    { id: 'minor', labelKey: 'WH40K.DisorderRoll.Minor', threshold: 40 },
    { id: 'severe', labelKey: 'WH40K.DisorderRoll.Severe', threshold: 60 },
    { id: 'acute', labelKey: 'WH40K.DisorderRoll.Acute', threshold: 80 },
] as const;

function buildContext(args: Args): Record<string, unknown> {
    return {
        severities: SEVERITY_OPTIONS,
        severity: args.severity,
    };
}

const meta = {
    title: 'Dialogs/DisorderRollDialog',
    render: (args) => renderSheet(templateSrc, buildContext(args)),
    args: {
        severity: 'minor' as DisorderSeverity,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Minor: Story = {};

export const Severe: Story = {
    args: { severity: 'severe' },
};

export const Acute: Story = {
    args: { severity: 'acute' },
};

export const RenderSmoke: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // Three severity buttons render.
        const buttons = canvasElement.querySelectorAll('button[data-action="selectSeverity"]');
        expect(buttons.length).toBe(3);
        // Roll button is present.
        expect(canvas.getByText(/Roll Disorder/i)).toBeTruthy();
        // All three severity tiers visible.
        expect(canvasElement.querySelector('button[data-severity="minor"]')).toBeTruthy();
        expect(canvasElement.querySelector('button[data-severity="severe"]')).toBeTruthy();
        expect(canvasElement.querySelector('button[data-severity="acute"]')).toBeTruthy();
    },
};
