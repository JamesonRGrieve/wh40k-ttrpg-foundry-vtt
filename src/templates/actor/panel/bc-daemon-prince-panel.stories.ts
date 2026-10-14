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
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { captureActionClicks, clickAction, renderSheet } from '../../../../stories/test-helpers';
import { APOTHEOSIS_CORRUPTION, resolveApotheosis, type DaemonPrinceAlignment } from '../../../module/rules/bc-daemon-prince';
import panelSrc from './bc-daemon-prince-panel.hbs?raw';

initializeStoryHandlebars();

/** The GM's Infamy threshold the stories assume (the setting's default). */
const STORY_INFAMY_THRESHOLD = 100;

/** The include exactly as `tab-overview.hbs` gates it (#596: no apotheosis off Black Crusade). */
const GATED_PANEL = `{{#if isBC}}${panelSrc}{{/if}}`;

interface DaemonPrincePanelCtx {
    systemId: 'bc' | 'dh2';
    isBC: boolean;
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
    wrapper.dataset['wh40kSystem'] = ctx.systemId;
    wrapper.appendChild(renderSheet(GATED_PANEL, ctx));
    return wrapper;
}

interface BuildArgs {
    infamy: number;
    corruption: number;
    ascendedAt: number | null;
    alignmentAtAscension: DaemonPrinceAlignment;
}

function buildCtx(args: BuildArgs, systemId: DaemonPrincePanelCtx['systemId'] = 'bc'): DaemonPrincePanelCtx {
    const ascended = args.ascendedAt !== null;
    const readout = resolveApotheosis({ corruption: args.corruption, infamy: args.infamy, infamyThreshold: STORY_INFAMY_THRESHOLD });
    return {
        systemId,
        isBC: systemId === 'bc',
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

function ascendButton(canvasElement: HTMLElement): HTMLButtonElement | null {
    return canvasElement.querySelector<HTMLButtonElement>('[data-action="bcAscend"]');
}

const meta: Meta<DaemonPrincePanelCtx> = {
    title: 'Actor/Character/BcDaemonPrincePanel',
    render: (args) => renderPanel(args),
};
export default meta;
type Story = StoryObj<DaemonPrincePanelCtx>;

export const NotAscended: Story = {
    name: 'Not claimed — Corruption below 100 (button disabled), spawndom projected',
    args: buildCtx({ infamy: 42, corruption: 31, ascendedAt: null, alignmentAtAscension: 'unaligned' }),
    play: async ({ canvasElement }) => {
        await expect(ascendButton(canvasElement)?.disabled).toBe(true);
        // A disabled button sends nothing.
        const clicks = captureActionClicks(canvasElement);
        ascendButton(canvasElement)?.click();
        await expect(clicks).toEqual([]);
    },
};

export const Claimable: Story = {
    name: 'Claimable — 100 Corruption, Infamy under the threshold: the button sends bcAscend',
    args: buildCtx({ infamy: 60, corruption: 100, ascendedAt: null, alignmentAtAscension: 'unaligned' }),
    play: async ({ canvasElement }) => {
        await expect(ascendButton(canvasElement)?.disabled).toBe(false);
        const clicks = captureActionClicks(canvasElement);
        clickAction(canvasElement, 'bcAscend');
        await expect(clicks.map((c) => c.action)).toEqual(['bcAscend']);
    },
};

export const Ascended: Story = {
    name: 'Claimed — Tzeentch patron, Daemon Prince',
    args: buildCtx({ infamy: 100, corruption: 100, ascendedAt: 12, alignmentAtAscension: 'tzeentch' }),
    play: async ({ canvasElement }) => {
        const panel = canvasElement.querySelector<HTMLElement>('.wh40k-bc-daemon-prince-panel');
        await expect(panel?.dataset['bcAscended']).toBe('true');
        await expect(panel?.dataset['bcAlignment']).toBe('tzeentch');
        // The claim fires once: no button once ascended.
        await expect(ascendButton(canvasElement)).toBeNull();
    },
};

export const OtherLine: Story = {
    name: 'Other line (DH2) — no apotheosis panel',
    args: buildCtx({ infamy: 60, corruption: 100, ascendedAt: null, alignmentAtAscension: 'unaligned' }, 'dh2'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.wh40k-bc-daemon-prince-panel')).toBeNull();
        await expect(ascendButton(canvasElement)).toBeNull();
    },
};
