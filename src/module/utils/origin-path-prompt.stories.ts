/**
 * The "Origin Path Incomplete" prompt (#541) as a character sheet decides it on
 * first open: an unbuilt character gets the prompt body; an authored-build pregen
 * (flagged `sheetSource: "authored-build"` by the world export) gets none, however
 * empty its origin path. Each story runs the sheet's own gate, so what renders is
 * what the sheet would show.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { AUTHORED_BUILD_SHEET_SOURCE, type OriginPromptFacts, originPathPromptContent, shouldPromptOriginPath } from './origin-path-prompt.ts';

const MESSAGE = 'This character has no origin path yet. Build it now with the Origin Path Builder?';
const DONT_SHOW = "Don't show this again";

/** Marker for "the sheet opened with no prompt over it". */
const NO_PROMPT_HOOK = 'origin-prompt-absent';

function facts(overrides: Partial<OriginPromptFacts>): OriginPromptFacts {
    return {
        isOwner: true,
        promptEnabled: true,
        actorType: 'dh2-character',
        originPath: { homeWorld: '', background: '', role: '' },
        dismissed: false,
        sheetSource: undefined,
        ...overrides,
    };
}

/** What opening the sheet shows: the prompt body, or an explicit "no prompt" marker. */
function renderOpen(args: OriginPromptFacts): HTMLElement {
    const host = document.createElement('div');
    host.className = 'wh40k-rpg';
    if (shouldPromptOriginPath(args)) host.innerHTML = originPathPromptContent(MESSAGE, DONT_SHOW);
    else host.innerHTML = `<p data-wh40k-hook="${NO_PROMPT_HOOK}"></p>`;
    return host;
}

const meta: Meta<OriginPromptFacts> = {
    title: 'Actor/Character/Origin Path Prompt',
    render: (args) => renderOpen(args),
};
export default meta;
type Story = StoryObj<OriginPromptFacts>;

/** A genuinely unbuilt character: the prompt still shows, with its "don't show again" box. */
export const UnbuiltCharacterPrompted: Story = {
    args: facts({}),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.textContent).toContain(MESSAGE);
        const box = canvasElement.querySelector<HTMLInputElement>('input[name="dontShowAgain"]');
        await expect(box?.type).toBe('checkbox');
        box?.click();
        await expect(box?.checked).toBe(true);
    },
};

/** An authored-build pregen: no prompt, though no origin step is set. */
export const PregenNotPrompted: Story = {
    args: facts({ sheetSource: AUTHORED_BUILD_SHEET_SOURCE }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector(`[data-wh40k-hook="${NO_PROMPT_HOOK}"]`)).not.toBeNull();
        await expect(canvasElement.textContent).not.toContain(MESSAGE);
    },
};

/** Any other sheet source is not the pregen marker: still prompted. */
export const OtherSheetSourcePrompted: Story = {
    args: facts({ sheetSource: 'compendium' }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.textContent).toContain(MESSAGE);
    },
};
