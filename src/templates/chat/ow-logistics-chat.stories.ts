/**
 * Storybook stories for the Only War Logistics Test chat card (#154).
 * Exercises three outcomes (success, failure, success with full
 * modifier stack) so review can verify the per-axis breakdown layout
 * against `computeLogisticsTarget()` in `src/module/rules/ow-logistics.ts`.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import HandlebarsLib from 'handlebars';
import { renderTemplate as renderStoryTemplate } from '../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { type LogisticsBreakdown, computeLogisticsTarget, resolveLogisticsTest } from '../../module/rules/ow-logistics.ts';
import chatSrc from './ow-logistics-chat.hbs?raw';

initializeStoryHandlebars();

interface LogisticsChatCtx {
    gameSystem: 'ow';
    success: boolean;
    roll: number;
    target: number;
    degreesOfSuccess: number;
    degreesOfFailure: number;
    breakdown: LogisticsBreakdown;
}

const chatTpl = HandlebarsLib.compile(chatSrc);

function renderChat(ctx: LogisticsChatCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.appendChild(renderStoryTemplate(chatTpl, { ...ctx }));
    return wrapper;
}

/** Baseline "neutral" context — Rating 10, no bonuses, all axes neutral. */
const NEUTRAL = computeLogisticsTarget({
    rating: 10,
    munitorum: false,
    situational: 0,
    troopCount: 'company',
    timeInFront: 'weeks',
    frontActive: 'active',
    warCondition: 'standard',
    standardKit: false,
    craftsmanship: 'common',
});

const NEUTRAL_RESULT = resolveLogisticsTest(
    {
        rating: 10,
        munitorum: false,
        situational: 0,
        troopCount: 'company',
        timeInFront: 'weeks',
        frontActive: 'active',
        warCondition: 'standard',
        standardKit: false,
        craftsmanship: 'common',
    },
    7,
);

/** Full-stack context exercising every breakdown row. */
const STACKED = computeLogisticsTarget({
    rating: 15,
    munitorum: true,
    situational: 5,
    troopCount: 'regiment',
    timeInFront: 'years',
    frontActive: 'lull',
    warCondition: 'standard',
    standardKit: true,
    craftsmanship: 'best',
});

const STACKED_RESULT = resolveLogisticsTest(
    {
        rating: 15,
        munitorum: true,
        situational: 5,
        troopCount: 'regiment',
        timeInFront: 'years',
        frontActive: 'lull',
        warCondition: 'standard',
        standardKit: true,
        craftsmanship: 'best',
    },
    25,
);

/** Hard-failure context — desperate war, brand-new front, Good craftsmanship. */
const FAIL = computeLogisticsTarget({
    rating: 8,
    munitorum: false,
    situational: -5,
    troopCount: 'squad',
    timeInFront: 'days',
    frontActive: 'major',
    warCondition: 'desperate',
    standardKit: false,
    craftsmanship: 'good',
});

const FAIL_RESULT = resolveLogisticsTest(
    {
        rating: 8,
        munitorum: false,
        situational: -5,
        troopCount: 'squad',
        timeInFront: 'days',
        frontActive: 'major',
        warCondition: 'desperate',
        standardKit: false,
        craftsmanship: 'good',
    },
    72,
);

const meta: Meta<LogisticsChatCtx> = {
    title: 'Chat/OwLogisticsCard',
};
export default meta;
type Story = StoryObj<LogisticsChatCtx>;

export const Success: Story = {
    name: 'Success — neutral context, marginal pass',
    args: {
        gameSystem: 'ow',
        success: NEUTRAL_RESULT.success,
        roll: 7,
        target: NEUTRAL.target,
        degreesOfSuccess: NEUTRAL_RESULT.degreesOfSuccess,
        degreesOfFailure: NEUTRAL_RESULT.degreesOfFailure,
        breakdown: NEUTRAL.breakdown,
    },
    render: (args) => renderChat(args),
};

export const FullStack: Story = {
    name: 'Success — Munitorum + situational + standard kit + Best craft',
    args: {
        gameSystem: 'ow',
        success: STACKED_RESULT.success,
        roll: 25,
        target: STACKED.target,
        degreesOfSuccess: STACKED_RESULT.degreesOfSuccess,
        degreesOfFailure: STACKED_RESULT.degreesOfFailure,
        breakdown: STACKED.breakdown,
    },
    render: (args) => renderChat(args),
};

export const Failure: Story = {
    name: 'Failure — desperate war, brand-new front',
    args: {
        gameSystem: 'ow',
        success: FAIL_RESULT.success,
        roll: 72,
        target: FAIL.target,
        degreesOfSuccess: FAIL_RESULT.degreesOfSuccess,
        degreesOfFailure: FAIL_RESULT.degreesOfFailure,
        breakdown: FAIL.breakdown,
    },
    render: (args) => renderChat(args),
};
