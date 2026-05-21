/**
 * Storybook stories for the Only War Mission Assignment Gear chat card
 * (#155). Exercises three outcomes (surrender-kit, standard-kit, bonus-
 * items with a Table 6-5 random issue roll) so review can verify the
 * breakdown layout against `applyTable63Modifiers` / `resolveGearOutcome`
 * in `src/module/rules/ow-mission-gear.ts`.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import HBS from 'handlebars';
import { renderTemplate as renderTpl } from '../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { applyTable63Modifiers, resolveGearOutcome, rollRandomIssueGear } from '../../module/rules/ow-mission-gear.ts';
import chatSrc from './ow-mission-gear-chat.hbs?raw';

initializeStoryHandlebars();

interface BreakdownRow {
    readonly labelKey: string;
    readonly value: number;
}

interface MissionGearChatCtx {
    gameSystem: 'ow';
    success: boolean;
    roll: number;
    target: number;
    degreesOfSuccess: number;
    degreesOfFailure: number;
    breakdown: ReadonlyArray<BreakdownRow>;
    outcomeKey: string;
    hasBonusItem: boolean;
    bonusItemRoll: number | null;
}

const chatTpl = HBS.compile(chatSrc);

function renderChat(ctx: MissionGearChatCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.appendChild(renderTpl(chatTpl, ctx as unknown as Record<string, unknown>));
    return wrapper;
}

const OUTCOME_KEYS = {
    'surrender-kit': 'WH40K.OW.MissionGear.Outcome.SurrenderKit',
    'minimum-kit': 'WH40K.OW.MissionGear.Outcome.MinimumKit',
    'standard-kit': 'WH40K.OW.MissionGear.Outcome.StandardKit',
    'bonus-items': 'WH40K.OW.MissionGear.Outcome.BonusItems',
} as const;

const ORDINARY_LABEL_KEY = 'WH40K.OW.MissionGear.Modifier.OrdinaryBonus';

function breakdownFromTarget(modifierLabels: ReadonlyArray<{ description: string; value: number; labelKey: string }>): {
    target: number;
    breakdown: ReadonlyArray<BreakdownRow>;
} {
    const composed = applyTable63Modifiers(
        50,
        modifierLabels.map(({ description, value }) => ({ description, value })),
    );
    const rows: BreakdownRow[] = composed.breakdown.map((row, index) => {
        if (index === 0) {
            return { labelKey: ORDINARY_LABEL_KEY, value: row.value };
        }
        return { labelKey: modifierLabels[index - 1]?.labelKey ?? row.description, value: row.value };
    });
    return { target: composed.target, breakdown: rows };
}

/** Neutral context — only the Ordinary +10 bonus stacked, no Table 6-3 mods. */
const NEUTRAL = breakdownFromTarget([]);
const NEUTRAL_RESOLUTION = resolveGearOutcome({ degreesOfSuccess: 1, degreesOfFailure: 0 });

/** Stacked failure context — desperate situation, Table 6-3 mods drag target down. */
const STACKED_FAIL = breakdownFromTarget([
    { description: 'remote-warzone', value: -10, labelKey: 'WH40K.OW.MissionGear.Modifier.OrdinaryBonus' },
    { description: 'unusual-request', value: -20, labelKey: 'WH40K.OW.MissionGear.Modifier.OrdinaryBonus' },
]);
const FAIL_RESOLUTION = resolveGearOutcome({ degreesOfSuccess: 0, degreesOfFailure: 5 });

/** Stacked success context — favourable Table 6-3 mods, big DoS, bonus item earned. */
const STACKED_SUCCESS = breakdownFromTarget([{ description: 'standard-mission', value: 10, labelKey: 'WH40K.OW.MissionGear.Modifier.OrdinaryBonus' }]);
const SUCCESS_RESOLUTION = resolveGearOutcome({ degreesOfSuccess: 4, degreesOfFailure: 0 });
// Deterministic RNG so the bonus-item screenshot doesn't drift between runs.
const FIXED_RNG = (): number => 0.42;
const BONUS_ROLL = rollRandomIssueGear(FIXED_RNG);

const meta: Meta<MissionGearChatCtx> = {
    title: 'Chat/OwMissionGearCard',
};
export default meta;
type Story = StoryObj<MissionGearChatCtx>;

export const StandardKitNeutral: Story = {
    name: 'Standard Kit — neutral context, marginal success',
    args: {
        gameSystem: 'ow',
        success: true,
        roll: 45,
        target: NEUTRAL.target,
        degreesOfSuccess: 1,
        degreesOfFailure: 0,
        breakdown: NEUTRAL.breakdown,
        outcomeKey: OUTCOME_KEYS[NEUTRAL_RESOLUTION.outcome],
        hasBonusItem: false,
        bonusItemRoll: null,
    },
    render: (args) => renderChat(args),
};

export const SurrenderKitStacked: Story = {
    name: 'Surrender Kit — remote warzone + unusual request, 5 DoF',
    args: {
        gameSystem: 'ow',
        success: false,
        roll: 95,
        target: STACKED_FAIL.target,
        degreesOfSuccess: 0,
        degreesOfFailure: 5,
        breakdown: STACKED_FAIL.breakdown,
        outcomeKey: OUTCOME_KEYS[FAIL_RESOLUTION.outcome],
        hasBonusItem: false,
        bonusItemRoll: null,
    },
    render: (args) => renderChat(args),
};

export const BonusItemsSuccess: Story = {
    name: 'Bonus Items — standard mission, 4 DoS, Table 6-5 bonus rolled',
    args: {
        gameSystem: 'ow',
        success: true,
        roll: 20,
        target: STACKED_SUCCESS.target,
        degreesOfSuccess: 4,
        degreesOfFailure: 0,
        breakdown: STACKED_SUCCESS.breakdown,
        outcomeKey: OUTCOME_KEYS[SUCCESS_RESOLUTION.outcome],
        hasBonusItem: SUCCESS_RESOLUTION.bonusItemCount > 0,
        bonusItemRoll: BONUS_ROLL,
    },
    render: (args) => renderChat(args),
};
