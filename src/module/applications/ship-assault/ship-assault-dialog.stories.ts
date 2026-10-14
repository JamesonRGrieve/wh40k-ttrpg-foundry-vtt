/**
 * ShipAssaultDialog (#188) renders `ship-assault-dialog.hbs` for every RT ship
 * assault action. The fields come from the flow, so these stories drive the
 * template through the real boarding flows (with a queued dice stub) rather
 * than hand-authored field lists:
 *
 *   1. Inputs — target select + the opposed Command inputs for both ships.
 *   2. Resolved — the preview card plus the winner's degree allocation.
 *   3. No targets — no other Rogue Trader ship exists to aim at.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ATTACKER_SHIP, DEFENDER_SHIP, queueStoryRolls, storyLocalize, storyShipActor } from '../../../../stories/mocks/ship-assault';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import shipBoardingChatSrc from '../../../templates/chat/ship-boarding-chat.hbs?raw';
import templateSrc from '../../../templates/prompt/ship-assault-dialog.hbs?raw';
import { BOARDING_ROUND_FLOW } from './boarding-flow.ts';
import { readAssaultForm } from './ship-assault-fields.ts';
import type { ShipAssaultSession } from './ship-assault-flow.ts';

initializeStoryHandlebars();

interface DialogArgs {
    resolve: boolean;
    hasTargets: boolean;
}

function startSession(): ShipAssaultSession {
    return BOARDING_ROUND_FLOW.start({
        attacker: storyShipActor(ATTACKER_SHIP),
        defender: storyShipActor(DEFENDER_SHIP),
        localize: storyLocalize,
        degreesMethod: 'gen1',
    });
}

async function renderDialog(args: DialogArgs): Promise<HTMLElement> {
    const session = startSession();
    if (args.resolve) {
        queueStoryRolls(12, 64);
        await session.roll(readAssaultForm(document.createElement('form')));
    }
    const preview = session.previewCard();
    return renderSheet(templateSrc, {
        title: storyLocalize(BOARDING_ROUND_FLOW.labelKey),
        hint: storyLocalize(BOARDING_ROUND_FLOW.hintKey),
        hasTargets: args.hasTargets,
        targets: [{ value: '0', label: DEFENDER_SHIP.name, selected: true }],
        resolved: session.resolved,
        groups: session.resolved ? session.choiceGroups() : session.inputGroups(),
        previewHtml: preview === null ? '' : renderSheet(shipBoardingChatSrc, preview.data).innerHTML,
    });
}

const meta = {
    title: 'Prompts/ShipAssaultDialog (#188)',
    render: (args, { loaded }) => (loaded['element'] as HTMLElement | undefined) ?? renderSheet(templateSrc, {}),
    loaders: [async ({ args }) => ({ element: await renderDialog(args) })],
    args: { resolve: false, hasTargets: true },
} satisfies Meta<DialogArgs>;
export default meta;

type Story = StoryObj<DialogArgs>;

export const Inputs: Story = {
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(canvasElement.querySelector('select[name="defender"]')).toBeTruthy();
        await expect(canvasElement.querySelector<HTMLInputElement>('input[name="attackerCommand"]')?.value).toBe('45');
        const breakFree = canvasElement.querySelector<HTMLInputElement>('input[name="defenderFailedBreakFree"]');
        await expect(breakFree?.checked).toBe(false);
        if (breakFree !== null) await userEvent.click(breakFree);
        await expect(breakFree?.checked).toBe(true);
        await expect(view.getByText(DEFENDER_SHIP.name, { selector: 'legend' })).toBeTruthy();
        await expect(canvasElement.querySelector('[data-action="rollAssault"]')).toBeTruthy();
    },
};

export const Resolved: Story = {
    args: { resolve: true },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="ship-boarding-card"]')).toBeTruthy();
        const hull = canvasElement.querySelector<HTMLInputElement>('input[name="hullDegrees"]');
        await expect(hull?.max).not.toBe('');
        await expect(canvasElement.querySelector('select[name="defender"]')).toBeNull();
        await expect(canvasElement.querySelector('[data-action="applyAssault"]')).toBeTruthy();
        await expect(canvasElement.querySelector('[data-action="backAssault"]')).toBeTruthy();
    },
};

export const NoTargets: Story = {
    args: { hasTargets: false },
    play: async ({ canvasElement }) => {
        await expect(within(canvasElement).getByText(/No other Rogue Trader ship/)).toBeTruthy();
        await expect(canvasElement.querySelector('[data-action="rollAssault"]')).toBeNull();
    },
};
