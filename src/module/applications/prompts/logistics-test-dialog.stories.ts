/**
 * Storybook stories for the OW Logistics Test dialog (#154).
 * Exercises the axis picker grid + craftsmanship + standard-kit toggle
 * + live target preview against fixed seed states.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/logistics-test-dialog.hbs?raw';
import { clickAction, renderSheet } from '../../../../stories/test-helpers';
import {
    type Craftsmanship,
    type FrontActive,
    type TimeInFront,
    type TroopCount,
    type WarCondition,
    computeLogisticsTarget,
} from '../../rules/ow-logistics.ts';

interface OptionRow<T extends string> {
    id: T;
    labelKey: string;
    selected: boolean;
}

interface Args {
    baseRating: number;
    troopCountOptions: OptionRow<TroopCount>[];
    timeInFrontOptions: OptionRow<TimeInFront>[];
    frontActiveOptions: OptionRow<FrontActive>[];
    warConditionOptions: OptionRow<WarCondition>[];
    craftsmanshipOptions: OptionRow<Craftsmanship>[];
    standardKit: boolean;
    computedTarget: number;
}

function makeTroopCountOptions(selected: TroopCount): OptionRow<TroopCount>[] {
    return (['squad', 'platoon', 'company', 'regiment'] as const).map((id) => ({
        id,
        labelKey: `WH40K.OW.Logistics.TroopCount.${id.charAt(0).toUpperCase()}${id.slice(1)}`,
        selected: id === selected,
    }));
}
function makeTimeInFrontOptions(selected: TimeInFront): OptionRow<TimeInFront>[] {
    return (['days', 'weeks', 'months', 'years'] as const).map((id) => ({
        id,
        labelKey: `WH40K.OW.Logistics.TimeInFront.${id.charAt(0).toUpperCase()}${id.slice(1)}`,
        selected: id === selected,
    }));
}
function makeFrontActiveOptions(selected: FrontActive): OptionRow<FrontActive>[] {
    return (['lull', 'active', 'major'] as const).map((id) => ({
        id,
        labelKey: `WH40K.OW.Logistics.FrontActive.${id.charAt(0).toUpperCase()}${id.slice(1)}`,
        selected: id === selected,
    }));
}
function makeWarConditionOptions(selected: WarCondition): OptionRow<WarCondition>[] {
    return (['standard', 'hostile', 'desperate'] as const).map((id) => ({
        id,
        labelKey: `WH40K.OW.Logistics.WarCondition.${id.charAt(0).toUpperCase()}${id.slice(1)}`,
        selected: id === selected,
    }));
}
function makeCraftsmanshipOptions(selected: Craftsmanship): OptionRow<Craftsmanship>[] {
    return (['poor', 'common', 'good', 'best'] as const).map((id) => ({
        id,
        labelKey: `WH40K.OW.Logistics.Craftsmanship.${id.charAt(0).toUpperCase()}${id.slice(1)}`,
        selected: id === selected,
    }));
}

const DEFAULT_TARGET = computeLogisticsTarget({
    rating: 10,
    munitorum: false,
    situational: 0,
    troopCount: 'company',
    timeInFront: 'weeks',
    frontActive: 'active',
    warCondition: 'standard',
    standardKit: false,
    craftsmanship: 'common',
}).target;

const meta = {
    title: 'Prompts/LogisticsTestDialog',
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: {
        baseRating: 10,
        troopCountOptions: makeTroopCountOptions('company'),
        timeInFrontOptions: makeTimeInFrontOptions('weeks'),
        frontActiveOptions: makeFrontActiveOptions('active'),
        warConditionOptions: makeWarConditionOptions('standard'),
        craftsmanshipOptions: makeCraftsmanshipOptions('common'),
        standardKit: false,
        computedTarget: DEFAULT_TARGET,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/** Neutral baseline — Rating 10, Company / Weeks / Active / Standard / Common. */
export const Default: Story = {};

/** Veteran regiment, lull on the front, Standard war, Best craftsmanship requested. */
export const VeteranBest: Story = {
    args: {
        baseRating: 15,
        troopCountOptions: makeTroopCountOptions('regiment'),
        timeInFrontOptions: makeTimeInFrontOptions('years'),
        frontActiveOptions: makeFrontActiveOptions('lull'),
        warConditionOptions: makeWarConditionOptions('standard'),
        craftsmanshipOptions: makeCraftsmanshipOptions('best'),
        standardKit: true,
        computedTarget: computeLogisticsTarget({
            rating: 15,
            munitorum: true,
            situational: 5,
            troopCount: 'regiment',
            timeInFront: 'years',
            frontActive: 'lull',
            warCondition: 'standard',
            standardKit: true,
            craftsmanship: 'best',
        }).target,
    },
};

/** Roll-button click flow (smoke). */
export const RollFlow: Story = {
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        await expect(storyCanvas.getByText(/Logistics/)).toBeTruthy();
        clickAction(canvasElement, 'owRollLogistics');
    },
};
