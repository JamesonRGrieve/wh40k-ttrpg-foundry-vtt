import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/mutant-background-dialog.hbs?raw';
import { captureActionClicks, renderSheet } from '../../../../stories/test-helpers';

interface Args {
    canApply: boolean;
    actorName: string | null;
}

/** The Mutant origin's content (Within p. 32), as the dialog reads it off the character's origin. */
const MUTANT_ORIGIN = { startingCorruption: 10, mutationFormula: '5d10' };

const meta = {
    title: 'Dialogs/MutantBackgroundDialog',
    render: (args) =>
        renderSheet(templateSrc, {
            startingCorruption: args.canApply ? MUTANT_ORIGIN.startingCorruption : 0,
            mutationFormula: args.canApply ? MUTANT_ORIGIN.mutationFormula : null,
            actorName: args.actorName,
            canApply: args.canApply,
        }),
    args: {
        canApply: true,
        actorName: 'Aurelia Vex',
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/**
 * A Mutant character: the origin's starting Corruption, the statement that it
 * owes no Malignancy Test, and the starting-mutation roll that replaces it.
 */
export const Default: Story = {
    play: async ({ canvasElement }) => {
        const corruption = canvasElement.querySelector<HTMLElement>('[data-mutant-row="corruption"]');
        await expect(corruption?.textContent).toContain('+10');
        await expect(canvasElement.querySelector('[data-mutant-row="no-malignancy"]')?.textContent).toMatch(/no Malignancy Test/i);
        await expect(canvasElement.querySelector('[data-mutant-row="mutation"]')?.textContent).toContain('5d10');
        await expect(within(canvasElement).getByText('Aurelia Vex')).toBeTruthy();
    },
};

/** Roll Starting Mutation and Cancel dispatch their actions. */
export const RollAndCancel: Story = {
    play: async ({ canvasElement }) => {
        const seen = captureActionClicks(canvasElement);
        const apply = canvasElement.querySelector<HTMLButtonElement>('[data-action="apply"]');
        await expect(apply?.textContent).toMatch(/Roll Starting Mutation/i);
        apply?.click();
        canvasElement.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.click();
        await expect(seen.map((click) => click.action)).toEqual(['apply', 'cancel']);
    },
};

/** No Mutant origin on the character: no roll to make, so Apply is disabled and the dialog says why. */
export const WithoutMutantOrigin: Story = {
    args: { canApply: false, actorName: null },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-mutant-row="no-origin"]')).toBeTruthy();
        await expect(canvasElement.querySelector('[data-mutant-row="corruption"]')).toBeNull();
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
    },
};
