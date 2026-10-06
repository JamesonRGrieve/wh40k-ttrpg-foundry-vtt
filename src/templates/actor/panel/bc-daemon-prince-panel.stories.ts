/**
 * Storybook stories for the Black Crusade apotheosis panel (#182 — BC Core p267).
 *
 * Two canonical states an operator needs to verify in review:
 *
 *   1. NotAscended — mortal champion below 100 Corruption → the Resolve
 *                    button is rendered but disabled; the projected fate
 *                    (Chaos Spawn: Infamy under the threshold) is shown.
 *   2. Ascended    — the claim has fired with Infamy at the threshold →
 *                    the record and the Daemon Prince outcome text.
 *
 * Story factories pull the eligibility and outcome from the pure engine
 * ({@link resolveApotheosis}) so the readouts cannot drift from the resolver.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import { APOTHEOSIS_CORRUPTION, resolveApotheosis, type DaemonPrinceAlignment } from '../../../module/rules/bc-daemon-prince';
import panelSrc from './bc-daemon-prince-panel.hbs?raw';

initializeStoryHandlebars();

/** The GM's Infamy threshold the stories assume (the setting's default). */
const STORY_INFAMY_THRESHOLD = 100;

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
        isDaemonPrince: boolean;
    };
}

function renderPanel(ctx: DaemonPrincePanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'bc';
    wrapper.appendChild(renderSheet(panelSrc, ctx));
    return wrapper;
}

interface BuildArgs {
    infamy: number;
    corruption: number;
    ascendedAt: number | null;
    alignmentAtAscension: DaemonPrinceAlignment;
}

function buildCtx(args: BuildArgs): DaemonPrincePanelCtx {
    const ascended = args.ascendedAt !== null;
    const readout = resolveApotheosis({ corruption: args.corruption, infamy: args.infamy, infamyThreshold: STORY_INFAMY_THRESHOLD });
    return {
        daemonPrincePanel: {
            ascended,
            ascendedAt: args.ascendedAt,
            alignmentAtAscension: args.alignmentAtAscension,
            infamy: args.infamy,
            corruption: args.corruption,
            infamyThreshold: STORY_INFAMY_THRESHOLD,
            corruptionThreshold: APOTHEOSIS_CORRUPTION,
            canAscend: !ascended && readout.claimed,
            isDaemonPrince: readout.outcome === 'daemonPrince',
        },
    };
}

const meta: Meta<DaemonPrincePanelCtx> = {
    title: 'Actor/Character/BcDaemonPrincePanel',
};
export default meta;
type Story = StoryObj<DaemonPrincePanelCtx>;

export const NotAscended: Story = {
    name: 'Not claimed — Corruption below 100 (button disabled), spawndom projected',
    args: buildCtx({ infamy: 42, corruption: 31, ascendedAt: null, alignmentAtAscension: 'unaligned' }),
    render: (args) => renderPanel(args),
};

export const Ascended: Story = {
    name: 'Claimed — Tzeentch patron, Daemon Prince',
    args: buildCtx({ infamy: 100, corruption: 100, ascendedAt: 12, alignmentAtAscension: 'tzeentch' }),
    render: (args) => renderPanel(args),
};
