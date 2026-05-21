/**
 * Storybook stories for the Black Crusade Daemon Prince panel (#182).
 *
 * Two canonical states an operator needs to verify in review:
 *
 *   1. NotAscended — mortal champion, thresholds not yet met → the
 *                    Ascend button is rendered but disabled.
 *   2. Ascended    — apotheosis has fired → record + applied boost
 *                    derived from the live engine ({@link getDaemonPrinceBoost}).
 *
 * Story factories pull the boost from the pure engine so the readouts
 * cannot drift away from the resolver's output (CLAUDE.md "Seeded RNG /
 * deterministic stories"). No randomness, no hand-authored multipliers.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HbsStory from 'handlebars';
import { renderTemplate as renderStoryTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import {
    DAEMON_PRINCE_CORRUPTION_THRESHOLD,
    DAEMON_PRINCE_INFAMY_THRESHOLD,
    getDaemonPrinceBoost,
    type DaemonPrinceAlignment,
    type DaemonPrinceStatBoost,
} from '../../../module/rules/bc-daemon-prince';
import panelSrc from './bc-daemon-prince-panel.hbs?raw';

initializeStoryHandlebars();

interface DaemonPrincePanelCtx {
    daemonPrincePanel: {
        ascended: boolean;
        ascendedAt: number | null;
        alignmentAtAscension: DaemonPrinceAlignment;
        infamy: number;
        corruption: number;
        infamyThreshold: number;
        corruptionThreshold: number;
        canAscend: boolean;
        boost: DaemonPrinceStatBoost | null;
    };
}

const panelTpl = HbsStory.compile(panelSrc);

function renderPanel(ctx: DaemonPrincePanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'bc';
    wrapper.appendChild(renderStoryTemplate(panelTpl, ctx));
    return wrapper;
}

interface BuildArgs {
    infamy: number;
    corruption: number;
    ascended: boolean;
    ascendedAt?: number;
    alignmentAtAscension?: DaemonPrinceAlignment;
}

function buildCtx(args: BuildArgs): DaemonPrincePanelCtx {
    const ascended = args.ascended;
    const alignment: DaemonPrinceAlignment = args.alignmentAtAscension ?? 'unaligned';
    const boost: DaemonPrinceStatBoost | null = ascended ? getDaemonPrinceBoost({ ascendedAt: args.ascendedAt ?? 0, alignmentAtAscension: alignment }) : null;
    const canAscend = !ascended && args.infamy >= DAEMON_PRINCE_INFAMY_THRESHOLD && args.corruption >= DAEMON_PRINCE_CORRUPTION_THRESHOLD;
    return {
        daemonPrincePanel: {
            ascended,
            ascendedAt: ascended ? args.ascendedAt ?? 0 : null,
            alignmentAtAscension: alignment,
            infamy: args.infamy,
            corruption: args.corruption,
            infamyThreshold: DAEMON_PRINCE_INFAMY_THRESHOLD,
            corruptionThreshold: DAEMON_PRINCE_CORRUPTION_THRESHOLD,
            canAscend,
            boost,
        },
    };
}

const meta: Meta<DaemonPrincePanelCtx> = {
    title: 'Actor/Character/BcDaemonPrincePanel',
};
export default meta;
type Story = StoryObj<DaemonPrincePanelCtx>;

export const NotAscended: Story = {
    name: 'Not ascended — thresholds not met (button disabled)',
    args: buildCtx({ infamy: 42, corruption: 31, ascended: false }),
    render: (args) => renderPanel(args),
};

export const Ascended: Story = {
    name: 'Ascended — Tzeentch patron, applied boost rendered',
    args: buildCtx({ infamy: 100, corruption: 70, ascended: true, ascendedAt: 12, alignmentAtAscension: 'tzeentch' }),
    render: (args) => renderPanel(args),
};
