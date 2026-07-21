import type { Meta, StoryObj } from '@storybook/html-vite';
import { ASSIST_BONUS_PER_ALLY, DEFAULT_ASSISTANT_CAP, getAssistanceBonus } from '../../src/module/rules/assistance.ts';
import modifiersSrc from '../../src/templates/prompt/unified/modifiers.hbs?raw';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

initializeStoryHandlebars();

/**
 * Assistance chips (#60) — one toggleable chip per ally on the scene who is
 * friendly, not the roller, and trained in the skill being rolled. Replaces the
 * former bare +/- integer stepper, which let a player claim aid from allies who
 * weren't present or couldn't perform the skill and gave the chat card no names.
 */
interface AssistArgs {
    /** How many of the offered allies are toggled on. */
    selectedCount: number;
}

interface AssistChipCtx {
    id: string;
    name: string;
    isSelected: boolean;
    atCap: boolean;
}

interface AssistCtx {
    isForceField: boolean;
    hasSituationalModifiers: boolean;
    situationalModifiers: never[];
    hasPassiveModifiers: boolean;
    passiveModifiers: never[];
    showCustomModifier: boolean;
    customMod: number;
    hasAssistChips: boolean;
    assistChips: AssistChipCtx[];
    assistantCount: number;
    assistanceBonus: number;
    assistantMax: number;
    assistBonusPerAlly: number;
}

/** Three plausible allies; the first `selectedCount` are toggled on. */
const ALLIES = ['Ibnad Kesh', 'Sister Ophelia', 'Magos Vult'];

function buildContext(args: AssistArgs): AssistCtx {
    const selected = Math.max(0, Math.min(args.selectedCount, DEFAULT_ASSISTANT_CAP));
    const chips = ALLIES.map((name, index) => ({
        id: `token-${index}`,
        name,
        isSelected: index < selected,
        // Unselected chips disable once the RAW cap is reached, so the visible
        // state always matches the bonus actually applied.
        atCap: index >= selected && selected >= DEFAULT_ASSISTANT_CAP,
    }));
    return {
        isForceField: false,
        hasSituationalModifiers: false,
        situationalModifiers: [],
        hasPassiveModifiers: false,
        passiveModifiers: [],
        showCustomModifier: false,
        customMod: 0,
        hasAssistChips: true,
        assistChips: chips,
        assistantCount: selected,
        assistanceBonus: getAssistanceBonus(selected),
        assistantMax: DEFAULT_ASSISTANT_CAP,
        assistBonusPerAlly: ASSIST_BONUS_PER_ALLY,
    };
}

const meta: Meta<AssistArgs> = {
    title: 'Dialogs/Unified Roll — Assistance Chips (#60)',
    argTypes: {
        selectedCount: { control: { type: 'number', min: 0, max: DEFAULT_ASSISTANT_CAP, step: 1 } },
    },
    render: (args) => renderSheet(modifiersSrc, buildContext(args)),
};

export default meta;

type Story = StoryObj<AssistArgs>;

export const NoneSelected: Story = {
    name: 'Allies offered, none selected (+0)',
    args: { selectedCount: 0 },
};

export const OneSelected: Story = {
    name: 'One ally assisting (+10)',
    args: { selectedCount: 1 },
};

export const AtCap: Story = {
    name: 'Two allies assisting (+20, remaining chips disabled at cap)',
    args: { selectedCount: 2 },
};

/** No eligible ally (characteristic test, or nobody trained on-scene) — group hidden. */
export const NoEligibleAllies: Story = {
    name: 'No eligible allies (chip group hidden)',
    args: { selectedCount: 0 },
    render: () => renderSheet(modifiersSrc, { ...buildContext({ selectedCount: 0 }), hasAssistChips: false, assistChips: [] }),
};
