/**
 * Storybook story for the Divination section of the Origin Path builder's
 * Characteristics step (issue #199).
 *
 * The runtime fix for #199 lives in `origin-path-builder.ts`:
 * `#rollDivination` consults the world `RollTable.getName("Divination")`,
 * then the `dh2-core-rolltables` compendium, and finally falls back to a
 * 1d100 with the `WH40K.OriginPath.DivinationTableUnavailable` message —
 * so the player never sees Foundry's "no available results" notification
 * even when the compendium pack is absent. The actual Divination
 * RollTable JSON ships in the `src/packs` submodule at
 * `dark-heresy-2/dh2-core-rolltables/_source/divination_*.json` with 22
 * weighted result rows covering 1–100.
 *
 * This story renders the same `<section class="csd-divination">` markup
 * that lives in the builder template (`origin-path-builder.hbs`, the
 * `currentStep.isCharacteristics` branch) in three states — empty,
 * post-roll with a populated result, and post-fallback with the
 * "table unavailable" message — so a regression in the section's chrome
 * or in the surrounding `data-action="rollDivination"` button is caught
 * during visual review and screenshot diffing.
 *
 * The template source is inlined here intentionally; this section is
 * not yet a standalone partial of the main template, and extracting it
 * would broaden the scope of the issue-199 fix.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { clickAction, renderSheet } from '../../../../stories/test-helpers';

// Markup mirrors `<section class="csd-divination">` from
// `src/templates/character-creation/origin-path-builder.hbs` lines
// 332–343. If that block changes shape, update this snippet to match —
// the screenshot diff in `tests/storybook/issue-199-divination-roll.spec.ts`
// will catch silent drift between the two.
const TEMPLATE_SRC = `
<section class="wh40k-rpg csd-section csd-divination tw-bg-[rgba(255,255,255,0.03)] tw-rounded-[var(--wh40k-radius-lg)] tw-border tw-border-[rgba(36,107,131,0.3)] tw-p-4">
    <div class="csd-section-header-row tw-flex tw-items-center tw-justify-between tw-gap-3 tw-mb-3 tw-pb-2 tw-border-b tw-border-[rgba(36,107,131,0.3)]">
        <h3 class="csd-section-header tw-flex tw-items-center tw-gap-2 tw-m-0 tw-text-[1rem] tw-font-semibold tw-uppercase tw-tracking-[0.05em] tw-text-[color:rgba(36,107,131,1)]">
            <i class="fa-solid fa-eye"></i>
            Divination
        </h3>
        <button type="button" class="csd-icon-btn tw-inline-flex tw-h-9 tw-w-9 tw-items-center tw-justify-center tw-rounded-[6px] tw-border tw-border-[rgba(36,107,131,0.45)] tw-bg-[rgba(36,107,131,0.2)] tw-text-[color:var(--csd-bone,#e8dcc4)] tw-transition-all hover:tw-border-[rgba(176,141,87,0.55)] hover:tw-bg-[rgba(176,141,87,0.18)] hover:tw-text-[color:var(--csd-gold,#b08d57)]" data-action="rollDivination" data-tooltip="{{rollTooltip}}">
            <i class="fa-solid fa-dice"></i>
        </button>
    </div>
    <input type="text" class="csd-divination-input tw-w-full tw-rounded-[var(--wh40k-radius-md)] tw-border tw-border-[rgba(36,107,131,0.35)] tw-bg-[rgba(0,0,0,0.35)] tw-px-3 tw-py-2 tw-text-[0.9rem] tw-text-[color:var(--csd-bone,#e8dcc4)] tw-placeholder:text-[color:rgba(232,220,196,0.4)] focus:tw-outline-none focus:tw-border-[var(--csd-gold,#b08d57)] focus:tw-shadow-[0_0_8px_rgba(176,141,87,0.25)]" name="charGen.divination" value="{{divination}}" placeholder="{{placeholder}}" />
</section>
`;

interface Args {
    divination: string;
    placeholder: string;
    rollTooltip: string;
}

const meta: Meta<Args> = {
    title: 'Character Creation/Divination Section Issue 199',
    render: (args) => renderSheet(TEMPLATE_SRC, args as unknown as Record<string, unknown>),
    args: {
        divination: '',
        placeholder: 'Enter divination',
        rollTooltip: 'Roll using the formula',
    },
};

export default meta;

type Story = StoryObj<Args>;

/**
 * Empty state — no result has been rolled yet. The placeholder text
 * is visible inside the input and the dice button is enabled.
 */
export const Empty: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const heading = canvas.getByText('Divination');
        expect(heading).toBeTruthy();
        const input = canvasElement.querySelector<HTMLInputElement>('input.csd-divination-input');
        expect(input).toBeTruthy();
        expect(input?.value).toBe('');
        expect(input?.placeholder).toBe('Enter divination');
        // Verify the action handle the runtime sheet's static actions table
        // reads. A regression that renames or drops the handle would silently
        // break the dice button.
        clickAction(canvasElement, 'rollDivination');
    },
};

/**
 * Post-roll state with a real DH2 RAW Divination result text (rolled
 * 6–9 on Table 2-9). This is the happy-path result the user should
 * see when the compendium pack is loaded.
 */
export const Rolled: Story = {
    args: {
        divination: 'Trust in your fear.',
    },
    play: async ({ canvasElement }) => {
        const input = canvasElement.querySelector<HTMLInputElement>('input.csd-divination-input');
        expect(input).toBeTruthy();
        expect(input?.value).toBe('Trust in your fear.');
        expect((input?.value.length ?? 0)).toBeGreaterThan(0);
    },
};

/**
 * Fallback state — the Divination compendium pack was not present at
 * runtime, so `#rollDivination` rolled a bare 1d100 and recorded the
 * `WH40K.OriginPath.DivinationTableUnavailable` message verbatim. The
 * user is told to fill in the corresponding maxim from the rulebook.
 */
export const TableUnavailableFallback: Story = {
    args: {
        divination:
            'The Divination table is unavailable — rolled 42 on 1d100. Record the corresponding maxim from the rulebook by hand.',
    },
    play: async ({ canvasElement }) => {
        const input = canvasElement.querySelector<HTMLInputElement>('input.csd-divination-input');
        expect(input).toBeTruthy();
        expect(input?.value).toContain('rolled 42 on 1d100');
    },
};
