/**
 * Storybook stories for the OW Logistics Test dialog (#154, #192).
 * Exercises the availability + Table 6-2 front-condition pickers, craftsmanship,
 * the standard-kit toggle and the live target preview, including the two
 * Table 6-2 cells that print no number (Automatic, GM's Discretion).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/logistics-test-dialog.hbs?raw';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { clickAction, renderSheet, toggleControls } from '../../../../stories/test-helpers';
import { type LogisticsContext, type LogisticsTarget, computeLogisticsTarget } from '../../rules/ow-logistics.ts';
import { logisticsOptions } from './logistics-test-rows.ts';

initializeStoryHandlebars();

type Args = ReturnType<typeof logisticsOptions> & {
    baseRating: number;
    standardKit: boolean;
    outcome: LogisticsTarget['kind'];
    computedTarget: number | null;
};

/** The dialog's render context for a request, built as `_prepareContext` builds it. */
function dialogArgs(ctx: LogisticsContext): Args {
    const resolved = computeLogisticsTarget(ctx);
    return {
        ...logisticsOptions(ctx),
        baseRating: ctx.rating,
        standardKit: ctx.standardKit,
        outcome: resolved.kind,
        computedTarget: resolved.kind === 'test' ? resolved.target : null,
    };
}

const DEFAULT_CONTEXT: LogisticsContext = {
    rating: 10,
    munitorum: false,
    situational: 0,
    availability: 'common',
    troopCount: 'company',
    timeInFront: 'months3to6',
    frontActive: 'months3to6',
    warCondition: 'violentImpasse',
    standardKit: false,
    craftsmanship: 'common',
};

const meta = {
    title: 'Prompts/LogisticsTestDialog',
    render: (args) => renderSheet(templateSrc, args),
    args: dialogArgs(DEFAULT_CONTEXT),
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/** Fresh dialog — Common item, Company or Less, 3–6 Months twice, Violent Impasse. */
export const Default: Story = {
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelectorAll('[data-axis="availability"] button')).toHaveLength(11);
        await expect(canvasElement.querySelectorAll('[data-axis="troopCount"] button')).toHaveLength(3);
        await expect(canvasElement.querySelectorAll('[data-axis="warCondition"] button')).toHaveLength(6);
        await expect(canvasElement.querySelector('[data-target-preview]')?.textContent.trim()).toBe('0');
        // #696: Standard Kit is one toggle button, its state on aria-pressed, its square decorative.
        const kit = canvasElement.querySelector<HTMLElement>('[data-action="owToggleStandardKit"]');
        await expect(toggleControls(canvasElement)).toEqual([
            { name: 'Standard Kit (regimental)', pressed: kit?.dataset['toggleState'] === 'on' ? 'true' : 'false', checkboxes: 0, icons: 1, iconsHidden: true },
        ]);
    },
};

/** The p. 163 worked example: Very Rare plasma gun, Multiple Regiments, another regiment's kit. */
export const WorkedExample: Story = {
    args: dialogArgs({
        ...DEFAULT_CONTEXT,
        availability: 'veryRare',
        troopCount: 'regiments',
        timeInFront: 'under3Months',
        frontActive: 'years5plus',
        standardKit: true,
    }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-axis="availability"] [data-selected="on"]')?.getAttribute('data-value')).toBe('veryRare');
        await expect(canvasElement.querySelector('[data-target-preview]')?.textContent.trim()).toBe('20');
    },
};

/** Ubiquitous item with a Single Regiment deployed — Table 6-2 prints "Automatic". */
export const Automatic: Story = {
    args: dialogArgs({ ...DEFAULT_CONTEXT, availability: 'ubiquitous', troopCount: 'regiment' }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-logistics-outcome]')?.getAttribute('data-logistics-outcome')).toBe('automatic');
        await expect(canvasElement.querySelector<HTMLButtonElement>('[data-action="owRollLogistics"]')?.disabled).toBe(false);
    },
};

/** Unique item, Company or Less — Table 6-2 prints "GM's Discretion": the roll is disabled. */
export const GmDiscretion: Story = {
    args: dialogArgs({ ...DEFAULT_CONTEXT, availability: 'unique' }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-logistics-outcome]')?.getAttribute('data-logistics-outcome')).toBe('discretion');
        await expect(canvasElement.querySelector<HTMLButtonElement>('[data-action="owRollLogistics"]')?.disabled).toBe(true);
    },
};

/** Roll-button click flow (smoke). */
export const RollFlow: Story = {
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        await expect(storyCanvas.getAllByText(/Logistics/).length).toBeGreaterThan(0);
        clickAction(canvasElement, 'owRollLogistics');
    },
};
