/**
 * Storybook stories for the Black Crusade Chaos Ritual chat card (#179).
 *
 * Covers the canonical chat outcomes the action produces:
 *
 *   1. Success     — modifiers favourable, roll under target by ≥ 20.
 *   2. Failure     — no stacked modifiers, roll over base target by ≥ 30.
 *   3. NoModifiers — clean roll with no Table 6-7 stack, marginal success.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HB from 'handlebars';
import { renderTemplate as compileAndRender } from '../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import {
    computeRitualTarget,
    resolveContemptOfTheWarp,
    type RitualModifier,
    type RitualModifierKind,
    type RitualTemplate,
} from '../../module/rules/bc-chaos-ritual';
import cardSrc from './bc-ritual-chat.hbs?raw';

initializeStoryHandlebars();

interface RitualModRow {
    readonly kind: RitualModifierKind;
    readonly labelKey: string;
    readonly signed: string;
    readonly positive: boolean;
    readonly negative: boolean;
    readonly description?: string;
}

interface RitualChatCtx {
    gameSystem: 'bc';
    templateId: string;
    baseTarget: number;
    modifierSum: number;
    finalTarget: number;
    roll: number;
    success: boolean;
    degreesOfSuccess: number;
    degreesOfFailure: number;
    breakdown: ReadonlyArray<RitualModRow>;
}

const MODIFIER_LABEL_KEYS: Record<RitualModifierKind, string> = {
    'cult-affiliation': 'WH40K.BC.Ritual.Modifier.CultAffiliation',
    'sacrifice': 'WH40K.BC.Ritual.Modifier.Sacrifice',
    'sanctified-ground': 'WH40K.BC.Ritual.Modifier.SanctifiedGround',
    'component-reagent': 'WH40K.BC.Ritual.Modifier.ComponentReagent',
    'daemonic-mastery': 'WH40K.BC.Ritual.Modifier.DaemonicMastery',
    'gm-other': 'WH40K.BC.Ritual.Modifier.GmOther',
};

const cardTpl = HB.compile(cardSrc);

function renderCard(ctx: RitualChatCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'bc';
    wrapper.appendChild(compileAndRender(cardTpl, ctx));
    return wrapper;
}

function buildBreakdown(modifiers: readonly RitualModifier[]): RitualModRow[] {
    return modifiers.map((m) => ({
        kind: m.kind,
        labelKey: MODIFIER_LABEL_KEYS[m.kind],
        signed: m.value > 0 ? `+${m.value}` : `${m.value}`,
        positive: m.value > 0,
        negative: m.value < 0,
        ...(m.description === undefined ? {} : { description: m.description }),
    }));
}

function buildCtx(input: { template: RitualTemplate; modifiers: readonly RitualModifier[]; roll: number }): RitualChatCtx {
    const { target, breakdown } = computeRitualTarget({ template: input.template, modifiers: input.modifiers });
    const resolved = resolveContemptOfTheWarp({ target, roll: input.roll });
    const modifierSum = breakdown.reduce((acc, m) => acc + m.value, 0);
    return {
        gameSystem: 'bc',
        templateId: input.template.id,
        baseTarget: input.template.baseTarget,
        modifierSum,
        finalTarget: target,
        roll: input.roll,
        success: resolved.success,
        degreesOfSuccess: resolved.degreesOfSuccess,
        degreesOfFailure: resolved.degreesOfFailure,
        breakdown: buildBreakdown(breakdown),
    };
}

const DEMO_TEMPLATE: RitualTemplate = {
    id: 'binding-of-the-shrieking-host',
    description: "Bind a flock of warp-things to the ritualist's will.",
    requirements: 'A consecrated circle and a sacrificial offering.',
    effects: 'Daemons of equal-or-lower Mastery rating obey for a day.',
    duration: 'One hour of chanting.',
    cost: '1d5 Corruption Points.',
    priceOfFailure: 'The daemon turns on the ritualist.',
    baseTarget: 40,
};

const meta: Meta<RitualChatCtx> = {
    title: 'Chat/BcRitualChat',
};
export default meta;
type Story = StoryObj<RitualChatCtx>;

export const Success: Story = {
    name: 'Success — stacked modifiers, roll under target by 20+',
    args: buildCtx({
        template: DEMO_TEMPLATE,
        modifiers: [
            { kind: 'cult-affiliation', value: 10, description: 'Black Legion adept' },
            { kind: 'sacrifice', value: 15 },
            { kind: 'daemonic-mastery', value: 5 },
        ],
        roll: 24,
    }),
    render: (args) => renderCard(args),
};

export const Failure: Story = {
    name: 'Failure — no stacked modifiers, roll over by 30+',
    args: buildCtx({
        template: DEMO_TEMPLATE,
        modifiers: [{ kind: 'gm-other', value: -10, description: 'Hostile ground' }],
        roll: 78,
    }),
    render: (args) => renderCard(args),
};

export const NoModifiers: Story = {
    name: 'No modifiers — marginal success',
    args: buildCtx({
        template: DEMO_TEMPLATE,
        modifiers: [],
        roll: 38,
    }),
    render: (args) => renderCard(args),
};
