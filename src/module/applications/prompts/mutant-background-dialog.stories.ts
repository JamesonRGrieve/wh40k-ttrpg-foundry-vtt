import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/mutant-background-dialog.hbs?raw';
import { captureActionClicks, renderSheet } from '../../../../stories/test-helpers';
import { MUTANT_STARTING_CORRUPTION } from '../../rules/chaos-backgrounds.ts';

interface Args {
    canApply: boolean;
    actorName: string | null;
}

const meta = {
    title: 'Dialogs/MutantBackgroundDialog',
    render: (args) =>
        renderSheet(templateSrc, {
            startingCorruption: MUTANT_STARTING_CORRUPTION,
            actorName: args.actorName,
            canApply: args.canApply,
        }),
    args: {
        canApply: true,
        actorName: null,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/** No actor selected: the +10 callout from the rule constant, no "Applying to" line. */
export const Default: Story = {
    play: async ({ canvasElement }) => {
        await expect(canvasElement.textContent).toContain(`+${MUTANT_STARTING_CORRUPTION}`);
        await expect(within(canvasElement).queryByText(/Applying to:/)).toBeNull();
    },
};

/** An actor was passed: the dialog names who the background lands on, and Apply / Cancel dispatch their actions. */
export const WithTargetActor: Story = {
    args: {
        actorName: 'Aurelia Vex',
    },
    play: async ({ canvasElement }) => {
        await expect(within(canvasElement).getByText('Aurelia Vex')).toBeTruthy();
        const seen = captureActionClicks(canvasElement);
        canvasElement.querySelector<HTMLButtonElement>('[data-action="apply"]')?.click();
        canvasElement.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.click();
        await expect(seen.map((click) => click.action)).toEqual(['apply', 'cancel']);
    },
};

/** canApply false: Apply is disabled (Cancel stays usable). */
export const DisabledApply: Story = {
    args: { canApply: false },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector<HTMLButtonElement>('[data-action="apply"]')?.disabled).toBe(true);
        await expect(canvasElement.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.disabled).toBe(false);
    },
};

export const TwistedFleshGrantPresent: Story = {
    play: async ({ canvasElement }) => {
        // Scoped to the grant row: the description above it names the talent too,
        // so an unscoped text query matches twice and throws.
        const grant = canvasElement.querySelector<HTMLElement>('[data-talent="twisted-flesh"]');
        await expect(grant).toBeTruthy();
        if (grant === null) return;
        await expect(within(grant).getAllByText(/Twisted Flesh/i).length).toBeGreaterThan(0);
        await expect(canvasElement.querySelector('[data-action="apply"]')?.textContent).toMatch(/Apply/i);
    },
};
