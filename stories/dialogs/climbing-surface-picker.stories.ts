import type { Meta, StoryObj } from '@storybook/html-vite';
import HBS from 'handlebars';
import { getClimbingModifier, type ClimbingSurface } from '../../src/module/rules/climbing.ts';
import contextPanelSrc from '../../src/templates/prompt/unified/context-panel.hbs?raw';
import { renderTemplate as renderTpl } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';

initializeStoryHandlebars();

const contextPanelTemplate = HBS.compile(contextPanelSrc);

interface ClimbSurfaceArgs {
    surface: ClimbingSurface;
}

const SURFACE_LABEL: Record<ClimbingSurface, string> = {
    standard: 'Standard (no modifier)',
    sheer: 'Sheer (Hard, -20)',
    easy: 'Easy / assisted (+10)',
};

function buildContext(args: ClimbSurfaceArgs): Record<string, unknown> {
    const options = (['standard', 'sheer', 'easy'] as const).map((value) => ({
        value,
        label: SURFACE_LABEL[value],
        isCurrent: value === args.surface,
    }));
    return {
        hasContextPanel: true,
        contextExpanded: true,
        isWeapon: false,
        isPsychic: false,
        isForceField: false,
        hasSkillPanel: false,
        // #146 — Athletics climbing-surface picker contract.
        isAthletics: true,
        climbSurface: args.surface,
        climbSurfaceOptions: options,
        climbMod: getClimbingModifier({ surfaceType: args.surface }),
    };
}

const meta: Meta<ClimbSurfaceArgs> = {
    title: 'Dialogs/Unified Roll — Climbing Surface Picker (#146)',
    argTypes: {
        surface: { control: 'inline-radio', options: ['standard', 'sheer', 'easy'] },
    },
    render: (args) => renderTpl(contextPanelTemplate, buildContext(args)),
};

export default meta;

type Story = StoryObj<ClimbSurfaceArgs>;

export const Standard: Story = {
    name: 'Standard — no modifier',
    args: { surface: 'standard' },
};

export const Sheer: Story = {
    name: 'Sheer — Hard (-20) per errata L113',
    args: { surface: 'sheer' },
};

export const EasyAssisted: Story = {
    name: 'Easy / assisted — +10',
    args: { surface: 'easy' },
};
