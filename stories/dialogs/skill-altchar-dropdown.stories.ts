import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import contextPanelSrc from '../../src/templates/prompt/unified/context-panel.hbs?raw';
import { renderTemplate } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';
import { resolveUntrainedTarget } from '../../src/module/rules/untrained-skill.ts';

initializeStoryHandlebars();

const contextPanelTemplate = Handlebars.compile(contextPanelSrc);

interface SkillContextArgs {
    /** Active characteristic value selected in the dropdown. */
    activeCharacteristic: 'agility' | 'strength' | 'toughness';
    /** Advance value — 0 = untrained, >=1 trained. */
    advance: 0 | 1 | 2;
    /** Whether the skill descriptor declares Basic — controls the untrained-advanced indicator. */
    isBasic: boolean;
}

const CHAR_LABEL: Record<string, string> = {
    strength: 'Strength',
    toughness: 'Toughness',
    agility: 'Agility',
};

function buildContext(args: SkillContextArgs): Record<string, unknown> {
    // Athletics — characteristic strength, alt = toughness, agility.
    const listedChar = 'strength';
    const altCharacteristics = ['toughness', 'agility'];
    const usingAlt = args.activeCharacteristic !== listedChar;
    const resolved = resolveUntrainedTarget({
        advance: args.advance,
        isBasic: args.isBasic,
        characteristicTotal: 35,
        altCharacteristicTotal: usingAlt ? 42 : undefined,
        halveOnNonBasic: args.advance === 0 && !args.isBasic,
    });
    const altOptions = [
        { value: listedChar, label: `${CHAR_LABEL[listedChar]} (default)`, isCurrent: !usingAlt },
        ...altCharacteristics.map((c) => ({ value: c, label: CHAR_LABEL[c] ?? c, isCurrent: args.activeCharacteristic === c })),
    ];
    return {
        hasContextPanel: true,
        hasSkillPanel: true,
        contextExpanded: true,
        isWeapon: false,
        isPsychic: false,
        isForceField: false,
        skillPanel: {
            visible: true,
            characteristic: args.activeCharacteristic,
            characteristicLabel: CHAR_LABEL[args.activeCharacteristic] ?? args.activeCharacteristic,
            altOptions,
            halved: resolved.halved,
            untrainedAdvanced: resolved.untrainedAdvanced,
        },
    };
}

const meta: Meta<SkillContextArgs> = {
    title: 'Dialogs/Skill Alt-Characteristic Dropdown',
    argTypes: {
        activeCharacteristic: { control: 'inline-radio', options: ['strength', 'toughness', 'agility'] },
        advance: { control: { type: 'number', min: 0, max: 2, step: 1 } },
        isBasic: { control: 'boolean' },
    },
    render: (args) => renderTemplate(contextPanelTemplate, buildContext(args)),
};

export default meta;

type Story = StoryObj<SkillContextArgs>;

export const TrainedDefault: Story = {
    name: 'Trained — default characteristic (Strength)',
    args: { activeCharacteristic: 'strength', advance: 1, isBasic: true },
};

export const TrainedAltToughness: Story = {
    name: 'Trained — alt Toughness',
    args: { activeCharacteristic: 'toughness', advance: 1, isBasic: true },
};

export const UntrainedBasicHalved: Story = {
    name: 'Untrained Basic — halving indicator',
    args: { activeCharacteristic: 'strength', advance: 0, isBasic: true },
    render: (args) => {
        const ctx = buildContext(args);
        const panel = ctx['skillPanel'] as Record<string, unknown>;
        // Story override: force the legacy halving rule on top of the resolver
        // so the visual indicator is exercised independently of the rules module.
        panel['halved'] = true;
        return renderTemplate(contextPanelTemplate, ctx);
    },
};

export const UntrainedAdvancedBlocked: Story = {
    name: 'Untrained Advanced — blocked indicator',
    args: { activeCharacteristic: 'strength', advance: 0, isBasic: false },
};
