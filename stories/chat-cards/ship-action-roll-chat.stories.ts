/**
 * Storybook stories for the RT ship action roll card (#186, #189 — RT Core
 * pp.212–218).
 *
 * Each story drives the real ship-action flow on queued dice and renders the
 * card it posts:
 *
 *   1. Hold Fast! succeeds — the Willpower test, then the effect's magnitude
 *      (success + degrees) and the Morale restored.
 *   2. Lock on Target succeeds — Scrutiny + the ship's Detection, then the BS
 *      bonus locked onto the chosen Weapon Component.
 *   3. Hold Fast! fails — no magnitude section, failure outcome.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { rollShipAction, type ShipActionOrder } from '../../src/module/applications/ship-action/ship-action-flow.ts';
import { readAssaultForm } from '../../src/module/applications/ship-assault/ship-assault-fields.ts';
import shipActionRollChatSrc from '../../src/templates/chat/ship-action-roll-chat.hbs?raw';
import { queueStoryRolls, storyActionShip, storyLocalize, STORY_HOLD_FAST, STORY_LOCK_ON_TARGET } from '../mocks/ship-assault';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

initializeStoryHandlebars();

/** Roll the action on the given d100 and render its card. */
async function card(order: ShipActionOrder, roll: number, fields: string, hull?: number): Promise<HTMLElement> {
    queueStoryRolls(roll);
    const form = document.createElement('form');
    form.innerHTML = fields;
    const ship = storyActionShip(3, hull);
    const rolled = await rollShipAction({ ship, order, localize: storyLocalize, degreesMethod: 'gen1' }, readAssaultForm(form));
    const wrapper = document.createElement('div');
    wrapper.className = 'wh40k-rpg tw-p-4';
    wrapper.setAttribute('data-wh40k-system', 'rt');
    wrapper.append(renderSheet(shipActionRollChatSrc, rolled.card.data));
    return wrapper;
}

const meta: Meta = {
    title: 'Chat/Ship Action Roll (#186)',
};
export default meta;

type Story = StoryObj;

export const HoldFastSucceeds: Story = {
    loaders: [async () => ({ el: await card(STORY_HOLD_FAST, 15, '<input name="skill" value="40" />') })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Hold Fast!')).toBeTruthy();
        await expect(view.getByText("Acting character's Willpower")).toBeTruthy();
        // 40 − 15 = 25 → 2 RT degrees → 1 + 2 = 3, capped by the 3 Morale lost last turn.
        await expect(view.getByText(/2 extra degree/)).toBeTruthy();
        await expect(canvasElement.querySelector('[data-outcome="success"]')?.textContent).toContain('3 Morale restored');
    },
};

export const LockOnTargetSucceeds: Story = {
    loaders: [
        async () => ({
            el: await card(
                STORY_LOCK_ON_TARGET,
                40,
                '<input name="skill" value="40" /><select name="weapon"><option value="lance" selected>Lance</option></select>',
            ),
        }),
    ],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText(/Detection \(The Errant Vector\)/)).toBeTruthy();
        await expect(canvasElement.querySelector('[data-outcome="success"]')?.textContent).toContain(
            '+10 to Ballistic Skill Tests to fire Titanforge Lance, this turn.',
        );
    },
};

export const LockOnTargetCrippled: Story = {
    name: 'Lock on Target from a Crippled ship — the −10 Detection is its own row (#187)',
    loaders: [
        async () => ({
            el: await card(
                STORY_LOCK_ON_TARGET,
                40,
                '<input name="skill" value="40" /><select name="weapon"><option value="lance" selected>Lance</option></select>',
                0,
            ),
        }),
    ],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        const rows = [...canvasElement.querySelectorAll<HTMLElement>('[data-wh40k-tooltip="modifier"]')].map((row) =>
            row.textContent.replace(/\s+/gu, ' ').trim(),
        );
        // The ship's live Detection (25) already carries the penalty: 35 on the hull, −10 for being Crippled.
        await expect(rows).toContain('Crippled ship (−10 Detection) -10');
        await expect(rows).toContain('Detection (The Errant Vector) +35');
    },
};

export const HoldFastFails: Story = {
    loaders: [async () => ({ el: await card(STORY_HOLD_FAST, 88, '<input name="skill" value="40" />') })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-outcome="failure"]')).toBeTruthy();
        await expect(within(canvasElement).queryByText(/extra degree/)).toBeNull();
    },
};
