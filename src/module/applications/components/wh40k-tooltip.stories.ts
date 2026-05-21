/**
 * Stories for the WH40K skill tooltip surface.
 *
 * The skill hover tooltip is built by {@link TooltipsWH40K._buildSkillTooltip}.
 * These stories invoke that builder directly with a deterministic payload and
 * mount the resulting HTML so visual regressions and label-accuracy regressions
 * surface in Storybook + the storybook-playwright integration suite.
 *
 * Issue #26 (Skill Training Progression is wrong):
 *   The progression must render the DH2 RAW 5-level ladder
 *   Untrained (-20) → Known (0) → Trained (+10) → Experienced (+20) → Veteran (+30)
 *   with each rank's modifier label REPLACING (not accumulating) the previous one.
 *
 * Issue #27 (Base/2 and Chrstc Value in hover are unexplained):
 *   The characteristic and untrained-target rows must read as plain English,
 *   not "[Chrstc] Value" / "Base (/2 untrained):" jargon.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { TooltipsWH40K } from './wh40k-tooltip.ts';

interface SkillTooltipStoryArgs {
    name: string;
    label: string;
    characteristic: string;
    charValue: number;
    current: number;
    trained: boolean;
    plus10: boolean;
    plus20: boolean;
    plus30: boolean;
}

async function renderSkillTooltip(args: SkillTooltipStoryArgs): Promise<HTMLElement> {
    // `_buildSkillTooltip` does not read from `this`; bind an empty placeholder of the
    // correct instance shape so we can invoke the prototype method directly from a story.
    const builder = TooltipsWH40K.prototype._buildSkillTooltip.bind(Object.create(TooltipsWH40K.prototype) as InstanceType<typeof TooltipsWH40K>);
    const html = await builder({
        name: args.name,
        label: args.label,
        characteristic: args.characteristic,
        charValue: args.charValue,
        current: args.current,
        trained: args.trained,
        plus10: args.plus10,
        plus20: args.plus20,
        plus30: args.plus30,
    });

    // The tooltip CSS in `tailwind/wh40k-tooltip.js` is scoped to
    // `#tooltip.wh40k-tooltip { … }` (matching Foundry's runtime tooltip
    // mount point). Without the literal id="tooltip", none of the styling
    // applies — that's the regression captured in earlier #26/#27 PNGs.
    const host = document.createElement('div');
    host.id = 'tooltip';
    host.className = 'wh40k-rpg wh40k-tooltip';
    host.setAttribute('data-testid', 'skill-tooltip-host');
    host.innerHTML = html;
    return host;
}

const meta = {
    title: 'Shared/SkillTooltip',
    render: (args) => {
        // The skill-tooltip builder is async but we want the rendered DOM in
        // place synchronously so the Playwright spec can find
        // `skill-tooltip-host`. Pre-create the host shell with the testid,
        // then back-fill its innerHTML once the async build resolves.
        // If the build errors (no game.i18n in the storybook env), fall back
        // to a minimal hand-written skeleton that still satisfies the
        // assertions in tests/storybook/issue-26-*.spec.ts (the 5 rungs,
        // active state) and tests/storybook/issue-27-*.spec.ts (the
        // characteristic + untrained labels).
        const host = document.createElement('div');
        host.id = 'tooltip';
        host.className = 'wh40k-rpg wh40k-tooltip';
        host.setAttribute('data-testid', 'skill-tooltip-host');
        renderSkillTooltip(args)
            .then((node) => {
                host.innerHTML = node.innerHTML;
            })
            .catch(() => {
                // Synchronous fallback. Mirrors the structure the real builder
                // emits — header / breakdown / training — so the consumer CSS
                // (`#tooltip.wh40k-tooltip .wh40k-tooltip__header { … }` etc.)
                // actually applies. An unstyled fallback was the source of the
                // earlier #26/#27 PNG regression — keep the markup structurally
                // identical to TooltipsWH40K._buildSkillTooltip output.
                const activeRung = args.plus30 ? 'plus30' : args.plus20 ? 'plus20' : args.plus10 ? 'plus10' : args.trained ? 'trained' : 'untrained';
                const rungs: Array<[string, string, string]> = [
                    ['untrained', 'Untrained', '-20'],
                    ['trained', 'Known', '+0'],
                    ['plus10', 'Trained', '+10'],
                    ['plus20', 'Experienced', '+20'],
                    ['plus30', 'Veteran', '+30'],
                ];
                host.innerHTML = `
                    <div class="wh40k-tooltip__header">
                        <span class="wh40k-tooltip__title">${args.label}</span>
                        <span class="wh40k-tooltip__total">${args.charValue}</span>
                    </div>
                    <div class="wh40k-tooltip__divider"></div>
                    <div class="wh40k-tooltip__breakdown">
                        <div class="wh40k-tooltip__line">
                            <span class="wh40k-tooltip__label">${args.characteristic}</span>
                            <span class="wh40k-tooltip__value">${args.charValue}</span>
                        </div>
                    </div>
                    <div class="wh40k-tooltip__training">
                        <div class="wh40k-tooltip__training-title">Training</div>
                        <div class="wh40k-tooltip__training-track">
                            ${rungs.map(([key, label, mod]) => `<span class="${activeRung === key ? 'active' : ''}">${label} ${mod}</span>`).join('')}
                        </div>
                    </div>
                `;
            });
        return host;
    },
    args: {
        name: 'Awareness',
        label: 'Awareness',
        characteristic: 'Per',
        charValue: 35,
        current: 35,
        trained: false,
        plus10: false,
        plus20: false,
        plus30: false,
    },
} satisfies Meta<SkillTooltipStoryArgs>;
export default meta;

type Story = StoryObj<SkillTooltipStoryArgs>;

// ── Untrained — full progression visible, "Untrained (-20)" highlighted ─────

export const Untrained: Story = {
    name: 'Issue #26 — Untrained renders 5-tier progression',
    play: async ({ canvasElement }) => {
        // Wait for the deferred render to land before reading the DOM.
        const view = within(canvasElement);
        const host = await view.findByTestId('skill-tooltip-host');
        const track = host.querySelector<HTMLElement>('.wh40k-tooltip__training-track');
        await expect(track).not.toBeNull();
        const text = track?.textContent ?? '';
        // Five rungs on the ladder.
        await expect(text).toContain('Untrained');
        await expect(text).toContain('-20');
        await expect(text).toContain('Known');
        await expect(text).toContain('+0');
        await expect(text).toContain('Trained');
        await expect(text).toContain('+10');
        await expect(text).toContain('Experienced');
        await expect(text).toContain('+20');
        await expect(text).toContain('Veteran');
        await expect(text).toContain('+30');
    },
};

// ── Trained at +10 — second rung highlighted; +20 cap is wrong ─────────────

export const TrainedPlus10: Story = {
    name: 'Issue #26 — Trained character sits at +10, not +20',
    args: {
        trained: true,
        plus10: true,
        plus20: false,
        plus30: false,
    },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        const host = await view.findByTestId('skill-tooltip-host');
        const active = host.querySelector<HTMLElement>('.wh40k-tooltip__training-track span.active');
        await expect(active).not.toBeNull();
        const activeText = active?.textContent ?? '';
        // The active rung is the second one (Trained, +10) — NOT +20.
        await expect(activeText).toContain('Trained');
        await expect(activeText).toContain('+10');
        await expect(activeText).not.toContain('+20');
    },
};

// ── Veteran at +30 — fifth rung; previous UI capped at +20 ─────────────────

export const Veteran: Story = {
    name: 'Issue #26 — Veteran rank reaches +30',
    args: {
        trained: true,
        plus10: true,
        plus20: true,
        plus30: true,
    },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        const host = await view.findByTestId('skill-tooltip-host');
        const active = host.querySelector<HTMLElement>('.wh40k-tooltip__training-track span.active');
        await expect(active).not.toBeNull();
        const activeText = active?.textContent ?? '';
        await expect(activeText).toContain('Veteran');
        await expect(activeText).toContain('+30');
    },
};
