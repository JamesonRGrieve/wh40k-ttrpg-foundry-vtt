/**
 * Storybook stories for the Only War Logistics Test chat card (#154, #192).
 * Exercises a pass, a fail, a full modifier stack, and an item Table 6-2
 * rates Automatic (no roll), so review can verify the per-component derivation
 * against `computeLogisticsTarget()` in `src/module/rules/ow-logistics.ts`.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { formatKey } from '../../../stories/mocks/lang-localize';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { renderSheet } from '../../../stories/test-helpers';
import type { LogisticsChatContext } from '../../module/applications/prompts/logistics-test-dialog.ts';
import { logisticsRows } from '../../module/applications/prompts/logistics-test-rows.ts';
import { type LogisticsContext, computeLogisticsTarget, resolveLogisticsTest } from '../../module/rules/ow-logistics.ts';
import chatSrc from './ow-logistics-chat.hbs?raw';

initializeStoryHandlebars();

function renderChat(ctx: LogisticsChatContext): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.appendChild(renderSheet(chatSrc, { ...ctx }));
    return wrapper;
}

/** Card context for a rolled test, built exactly as the dialog builds it. */
function rolledCard(ctx: LogisticsContext, roll: number): LogisticsChatContext {
    const test = computeLogisticsTarget(ctx);
    if (test.kind !== 'test') throw new Error(`story context must be rollable, got ${test.kind}`);
    const result = resolveLogisticsTest(test, roll);
    return {
        gameSystem: 'ow',
        automatic: false,
        success: result.success,
        roll,
        target: result.target,
        degreesOfSuccess: result.degreesOfSuccess,
        degreesOfFailure: result.degreesOfFailure,
        rows: logisticsRows(ctx, result.breakdown, formatKey),
    };
}

/** The p. 163 worked example: Very Rare plasma gun, five regiments deployed. */
const WORKED_EXAMPLE: LogisticsContext = {
    rating: 10,
    munitorum: false,
    situational: 0,
    availability: 'veryRare',
    troopCount: 'regiments',
    timeInFront: 'under3Months',
    frontActive: 'years5plus',
    warCondition: 'violentImpasse',
    standardKit: true,
    craftsmanship: 'common',
};

const meta: Meta<LogisticsChatContext> = {
    title: 'Chat/OwLogisticsCard',
    render: (args) => renderChat(args),
};
export default meta;
type Story = StoryObj<LogisticsChatContext>;

export const Success: Story = {
    name: 'Success — the p. 163 worked example',
    args: rolledCard(WORKED_EXAMPLE, 7),
    play: async ({ canvasElement }) => {
        const rows = canvasElement.querySelectorAll('[data-wh40k-tooltip="modifier"]');
        // rating, availability, time in front, front active, war conditions, standard kit, craftsmanship
        await expect(rows.length).toBe(7);
        const availability = canvasElement.querySelector('[data-logistics-row="availability"]');
        await expect(availability?.textContent).toContain('-20');
        await expect(availability?.getAttribute('data-wh40k-tooltip-data')).toContain('Multiple Regiments');
    },
};

export const FullStack: Story = {
    name: 'Success — Munitorum + situational + standard kit + Best craft',
    args: rolledCard(
        {
            rating: 40,
            munitorum: true,
            situational: 5,
            availability: 'scarce',
            troopCount: 'regiment',
            timeInFront: 'years5plus',
            frontActive: 'years1to5',
            warCondition: 'dominant',
            standardKit: true,
            craftsmanship: 'best',
        },
        25,
    ),
};

export const Failure: Story = {
    name: 'Failure — losing badly on a new front',
    args: rolledCard(
        {
            rating: 10,
            munitorum: false,
            situational: -5,
            availability: 'rare',
            troopCount: 'company',
            timeInFront: 'under3Months',
            frontActive: 'under3Months',
            warCondition: 'losingBadly',
            standardKit: false,
            craftsmanship: 'good',
        },
        72,
    ),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-logistics-outcome]')?.getAttribute('data-logistics-outcome')).toBe('failure');
    },
};

export const Automatic: Story = {
    name: 'Automatic — Ubiquitous item, Single Regiment deployed',
    args: {
        gameSystem: 'ow',
        automatic: true,
        success: true,
        roll: null,
        target: null,
        degreesOfSuccess: 0,
        degreesOfFailure: 0,
        rows: [],
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-logistics-outcome]')?.getAttribute('data-logistics-outcome')).toBe('automatic');
        await expect(canvasElement.querySelectorAll('[data-wh40k-tooltip="modifier"]').length).toBe(0);
    },
};
