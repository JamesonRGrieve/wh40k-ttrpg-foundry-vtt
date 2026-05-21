import type { Meta, StoryObj } from '@storybook/html-vite';
import HandlebarsLib from 'handlebars';
import { resolvePsyMode, type PsyMode } from '../../src/module/rules/psychic-push.ts';
import psychicPanelSrc from '../../src/templates/prompt/unified/panels/psychic-panel.hbs?raw';
import { renderTemplate as renderMockTemplate } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';

initializeStoryHandlebars();

const psychicPanelTemplate = HandlebarsLib.compile(psychicPanelSrc);

interface PsyContextArgs {
    mode: PsyMode;
    pushLevel: number;
    pr: number;
}

function buildContext(args: PsyContextArgs): Record<string, unknown> {
    const breakdown = resolvePsyMode({ mode: args.mode, basePR: args.pr, pushLevel: args.pushLevel });
    return {
        // Power slot present so the panel renders its config + selector.
        power: { id: 'power-1', name: 'Force Bolt', img: 'icons/svg/explosion.svg', isSelected: true },
        psychicPowers: [],
        powerSelect: false,
        pr: args.pr,
        maxPr: 6,
        hasFocus: true,
        distance: 10,
        rangeName: 'Standard',
        maxRange: 30,
        rollData: { modifiers: { bonus: 0 } },
        psyMode: args.mode,
        pushLevel: args.pushLevel,
        isFettered: args.mode === 'fettered',
        isUnfettered: args.mode === 'unfettered',
        isPush: args.mode === 'push',
        psyModeBreakdown: breakdown,
    };
}

const meta: Meta<PsyContextArgs> = {
    title: 'Dialogs/Psychic Push Selector',
    argTypes: {
        mode: { control: 'inline-radio', options: ['fettered', 'unfettered', 'push'] satisfies PsyMode[] },
        pushLevel: { control: { type: 'number', min: 1, max: 3, step: 1 } },
        pr: { control: { type: 'number', min: 0, max: 12, step: 1 } },
    },
    render: (args) => renderMockTemplate(psychicPanelTemplate, buildContext(args)),
};

export default meta;

type Story = StoryObj<PsyContextArgs>;

export const Fettered: Story = {
    name: 'Fettered (safe — half PR, no phenomena)',
    args: { mode: 'fettered', pushLevel: 1, pr: 4 },
};

export const Unfettered: Story = {
    name: 'Unfettered (baseline — full PR)',
    args: { mode: 'unfettered', pushLevel: 1, pr: 4 },
};

export const PushOne: Story = {
    name: 'Push Level 1 (danger — always phenomena)',
    args: { mode: 'push', pushLevel: 1, pr: 4 },
};

export const PushTwo: Story = {
    name: 'Push Level 2',
    args: { mode: 'push', pushLevel: 2, pr: 4 },
};

export const PushThree: Story = {
    name: 'Push Level 3 (max)',
    args: { mode: 'push', pushLevel: 3, pr: 4 },
};
