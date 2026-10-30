/**
 * Storybook stories for the Rogue Trader Hit and Run chat card (#188).
 *
 * Each story drives the real Hit and Run flow (with queued dice) and renders
 * the card it produces, so the stories exercise the same rules, view builders
 * and template as play:
 *
 *   1. Shot down — the approach fails by 4+ degrees under the target's turrets.
 *   2. Repelled — the craft lands but the defenders win the Command Test.
 *   3. Raid succeeds — both Critical Hit rolls shown, the chosen one applied,
 *      Hull damage per degree with its provenance row.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { HIT_AND_RUN_FLOW } from '../../src/module/applications/ship-assault/hit-and-run-flow.ts';
import { readAssaultForm } from '../../src/module/applications/ship-assault/ship-assault-fields.ts';
import shipHarChatSrc from '../../src/templates/chat/ship-hit-and-run-chat.hbs?raw';
import { ATTACKER_SHIP, DEFENDER_SHIP, queueStoryRolls, storyLocalize, storyShipActor } from '../mocks/ship-assault';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

initializeStoryHandlebars();

/** Run the flow on the given dice and render its final card. */
async function card(rolls: number[]): Promise<HTMLElement> {
    const session = HIT_AND_RUN_FLOW.start({
        attacker: storyShipActor(ATTACKER_SHIP, 50),
        defender: storyShipActor({ ...DEFENDER_SHIP, turretRating: 2 }, 40),
        localize: storyLocalize,
        lang: 'en',
        degreesMethod: 'gen1',
    });
    queueStoryRolls(...rolls);
    const empty = readAssaultForm(document.createElement('form'));
    await session.roll(empty);
    const applied = await session.apply(empty);
    return renderSheet(shipHarChatSrc, applied?.card.data ?? {});
}

const meta: Meta = {
    title: 'Chat/Ship Hit and Run (#188)',
};
export default meta;

type Story = StoryObj;

export const ShotDown: Story = {
    loaders: [async () => ({ el: await card([85]) })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText(/Turret Rating 2/)).toBeTruthy();
        await expect(view.getByText(/shot down/)).toBeTruthy();
        await expect(canvasElement.querySelectorAll('[data-wh40k-hook="ship-assault-test"]').length).toBe(1);
    },
};

export const TurnedBackByThreeDegrees: Story = {
    name: 'Approach fails by three RT degrees — the craft turns back, not shot down (#188)',
    // Approach target 30, roll 65: a 35-point margin is three RT degrees of failure.
    // The +1 count called it four and shot the craft down.
    loaders: [async () => ({ el: await card([65]) })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Failure — 3 DoF')).toBeTruthy();
        await expect(view.getByText('3 DoF = ⌊35 ÷ 10⌋ (roll 65 vs target 30)')).toBeTruthy();
        await expect(view.getByText(/forced to return to its ship/)).toBeTruthy();
        await expect(view.queryByText(/shot down/)).toBeNull();
    },
};

export const Repelled: Story = {
    loaders: [async () => ({ el: await card([10, 90, 20]) })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        await expect(within(canvasElement).getByText(/forced back to their boarding craft/)).toBeTruthy();
        await expect(canvasElement.querySelector('[data-wh40k-hook="ship-assault-damage"]')).toBeNull();
    },
};

export const RaidSucceeds: Story = {
    loaders: [async () => ({ el: await card([10, 15, 45, 2, 5]) })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(canvasElement.querySelectorAll('[data-wh40k-hook="ship-assault-test"]').length).toBe(3);
        await expect(view.getAllByText('Ordinary (+10)').length).toBe(2);
        await expect(view.getByText(/Critical Hit rolls: 2 and 5/)).toBeTruthy();
        await expect(canvasElement.querySelector('[data-wh40k-hook="ship-assault-damage"]')).not.toBeNull();
    },
};
