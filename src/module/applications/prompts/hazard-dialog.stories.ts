import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/hazard-dialog.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';
import { ALL_SYSTEM_IDS, type GameSystemId } from '../../config/game-systems/types.ts';
import {
    buildHazardSubjectView,
    canResolveHazard,
    HAZARD_KINDS,
    type HazardKind,
    type HazardSubject,
    type HazardSubjectView,
    type VacuumInput,
} from './hazard-view.ts';

interface Args {
    kind: HazardKind;
    metres: number;
    strenuous: boolean;
    lines: GameSystemId[];
    vacuum: VacuumInput;
}

const KIND_LABEL_KEYS: Record<HazardKind, string> = {
    falling: 'WH40K.Hazard.Falling.Title',
    suffocation: 'WH40K.Hazard.Suffocation.Title',
    vacuum: 'WH40K.Hazard.Vacuum.Title',
};

function subject(line: GameSystemId, index: number): HazardSubject {
    return { uuid: `Actor.hazard${index}`, name: `Acolyte ${line.toUpperCase()}`, img: 'icons/svg/mystery-man.svg', line, toughnessBonus: 3 + (index % 3) };
}

interface HazardDialogStoryContext {
    kinds: Array<{ value: HazardKind; labelKey: string; selected: boolean }>;
    isFalling: boolean;
    isVacuum: boolean;
    metres: number;
    strenuous: boolean;
    exposureGradual: boolean;
    inSpace: boolean;
    oxygenSource: boolean;
    subjects: HazardSubjectView[];
    cannotResolve: boolean;
}

function buildContext(args: Args): HazardDialogStoryContext {
    const input = { kind: args.kind, metres: args.metres, strenuous: args.strenuous, vacuum: args.vacuum };
    const subjects = args.lines.map((line, index) => buildHazardSubjectView(subject(line, index), input));
    return {
        kinds: HAZARD_KINDS.map((value) => ({ value, labelKey: KIND_LABEL_KEYS[value], selected: value === args.kind })),
        isFalling: args.kind === 'falling',
        isVacuum: args.kind === 'vacuum',
        metres: args.metres,
        strenuous: args.strenuous,
        exposureGradual: args.vacuum.exposure === 'gradual',
        inSpace: args.vacuum.inSpace,
        oxygenSource: args.vacuum.oxygenSource,
        subjects,
        cannotResolve: !canResolveHazard(subjects, args.kind),
    };
}

const meta = {
    title: 'Dialogs/HazardDialog',
    render: (args) => renderSheet(templateSrc, buildContext(args)),
    args: { kind: 'falling', metres: 4, strenuous: false, lines: ['dh2'], vacuum: { exposure: 'sudden', inSpace: true, oxygenSource: false } },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/** A 4 m fall for one DH2 acolyte: 1d10+4, resolvable. */
export const Falling: Story = {
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(canvasElement.querySelector('input[name="metres"]')).toBeTruthy();
        await expect(view.getByText('1d10+4')).toBeTruthy();
        await expect(canvasElement.querySelector('button[data-action="resolve"]')?.hasAttribute('disabled')).toBe(false);
    },
};

/** Every line selected at once: DH1 reads its table, IM is explicitly unsupported. */
export const FallingEverySystem: Story = {
    args: { kind: 'falling', metres: 7, lines: [...ALL_SYSTEM_IDS] },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getAllByText('1d10+7').length).toBe(5);
        await expect(view.getByText('1d10+5')).toBeTruthy();
        await expect(view.getByText('No rule for this game line')).toBeTruthy();
    },
};

/** A DH1 fall below Table 7-27's first row deals nothing, so the dialog cannot resolve. */
export const FallingTooShort: Story = {
    args: { kind: 'falling', metres: 2, lines: ['dh1'] },
    play: async ({ canvasElement }) => {
        await expect(within(canvasElement).getByText('Too short to harm')).toBeTruthy();
        await expect(canvasElement.querySelector('button[data-action="resolve"]')?.hasAttribute('disabled')).toBe(true);
    },
};

/** Strenuous suffocation: rounds = 2 × TB; DH1 falls back to its minutes allotment. */
export const SuffocationStrenuous: Story = {
    args: { kind: 'suffocation', strenuous: true, lines: ['dh2', 'dh1'] },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(canvasElement.querySelector('input[name="strenuous"]')).toBeTruthy();
        await expect(view.getByText('6 rounds')).toBeTruthy();
        await expect(view.getByText('4 minutes')).toBeTruthy();
    },
};

/** Vacuum (#604): exposure inputs, and each subject's safe rounds + damage per its own line. */
export const VacuumEveryShape: Story = {
    args: { kind: 'vacuum', lines: ['dh2', 'rt', 'im'] },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(canvasElement.querySelector<HTMLSelectElement>('select[name="exposure"]')?.value).toBe('sudden');
        await expect(canvasElement.querySelector<HTMLInputElement>('input[name="inSpace"]')?.checked).toBe(true);
        await expect(canvasElement.querySelector('input[name="oxygenSource"]')).toBeTruthy();
        // DH2 (TB 3): 1d10 a round; RT (TB 4): 1d10+3; IM is unsupported.
        await expect(view.getByText('3 rounds safe, then 1d10')).toBeTruthy();
        await expect(view.getByText('4 rounds safe, then 1d10+3')).toBeTruthy();
        await expect(view.getByText('No rule for this game line')).toBeTruthy();
        await expect(canvasElement.querySelector('button[data-action="resolve"]')?.hasAttribute('disabled')).toBe(false);
    },
};

/** A venting atmosphere: twice TB safe rounds, then the smaller die. */
export const VacuumVenting: Story = {
    args: { kind: 'vacuum', lines: ['bc'], vacuum: { exposure: 'gradual', inSpace: false, oxygenSource: false } },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector<HTMLSelectElement>('select[name="exposure"]')?.value).toBe('gradual');
        await expect(within(canvasElement).getByText('6 rounds safe, then 1d5')).toBeTruthy();
    },
};

/** No tokens selected: a hint, and the resolve button is disabled. */
export const NoSelection: Story = {
    args: { lines: [] },
    play: async ({ canvasElement }) => {
        await expect(within(canvasElement).getByText(/Select the tokens the hazard befalls/)).toBeTruthy();
        await expect(canvasElement.querySelector('button[data-action="resolve"]')?.hasAttribute('disabled')).toBe(true);
    },
};
