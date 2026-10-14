/**
 * Storybook stories for the Rogue Trader Ramming chat card (#188 — RT Core
 * p.215).
 *
 * Each story drives the real ramming flow (queued dice, an inline Ramming
 * Speed profile standing in for the compendium content) and renders the card:
 *
 *   1. Ram lands — the Hard (−20) Pilot + Manoeuvrability test, then the
 *      rammed ship's hull-size die + prow armour (+ a power ram bonus) and the
 *      rammer's rebound of defender Armour + 1d5, every term a provenance row.
 *   2. Ram misses — no collision, no damage sections.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { createRammingFlow } from '../../src/module/applications/ship-assault/ramming-flow.ts';
import { readAssaultForm } from '../../src/module/applications/ship-assault/ship-assault-fields.ts';
import shipRammingChatSrc from '../../src/templates/chat/ship-ramming-chat.hbs?raw';
import { ATTACKER_SHIP, DEFENDER_SHIP, queueStoryRolls, storyLocalize, storyShipActor } from '../mocks/ship-assault';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

initializeStoryHandlebars();

const FLOW = createRammingFlow(async () => Promise.resolve({ damage: [{ hullType: 'frigate', formula: '1d10' }], reboundDamage: '1d5' }));

/** Run the flow on the given dice (and optional bonus die) and render its final card. */
async function card(rolls: number[], bonus: boolean, attacker = ATTACKER_SHIP): Promise<HTMLElement> {
    const session = FLOW.start({
        attacker: storyShipActor(attacker),
        defender: storyShipActor(DEFENDER_SHIP),
        localize: storyLocalize,
        degreesMethod: 'gen1',
    });
    queueStoryRolls(...rolls);
    const form = document.createElement('form');
    if (bonus) form.innerHTML = '<input name="bonusFormula" value="1d10" /><input name="bonusLabel" value="Power Ram" />';
    await session.roll(readAssaultForm(form));
    const applied = await session.apply(readAssaultForm(form));
    return renderSheet(shipRammingChatSrc, applied?.card.data ?? {});
}

const meta: Meta = {
    title: 'Chat/Ship Ramming (#188)',
};
export default meta;

type Story = StoryObj;

export const RamLands: Story = {
    loaders: [async () => ({ el: await card([20, 7, 3, 6], true) })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Hard (−20)')).toBeTruthy();
        await expect(view.getByText(/1d10 \(frigate hull\)/)).toBeTruthy();
        await expect(view.getByText(/Power Ram/)).toBeTruthy();
        const damage = canvasElement.querySelectorAll('[data-wh40k-hook="ship-assault-damage"]');
        await expect(damage.length).toBe(2);
        // Rammed ship: 7 + 18 prow armour + 6 bonus; rammer: 16 Armour + 3.
        await expect(within(damage[0] as HTMLElement).getByText('31')).toBeTruthy();
        await expect(within(damage[1] as HTMLElement).getByText('19')).toBeTruthy();
    },
};

export const RamFromCrippledShip: Story = {
    name: 'Ram from a Crippled ship — the −10 Manoeuvrability is its own row (#187)',
    // A Crippled rammer's live Manoeuvrability (5) carries the −10: the card shows 15 and −10.
    loaders: [async () => ({ el: await card([20, 7, 3], false, { ...ATTACKER_SHIP, manoeuvrability: 5, crippledManoeuvrability: -10 }) })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        const rows = [...canvasElement.querySelectorAll<HTMLElement>('[data-wh40k-hook="ship-assault-test"] [data-wh40k-tooltip="modifier"]')].map((row) =>
            row.textContent.replace(/\s+/gu, ' ').trim(),
        );
        await expect(rows).toEqual([`Manoeuvrability (${ATTACKER_SHIP.name}) +15`, 'Crippled ship (−10 Manoeuvrability) -10', 'Hard (−20) -20']);
    },
};

export const RamMisses: Story = {
    loaders: [async () => ({ el: await card([95], false) })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        await expect(within(canvasElement).getByText(/misses the ram/)).toBeTruthy();
        await expect(canvasElement.querySelector('[data-wh40k-hook="ship-assault-damage"]')).toBeNull();
    },
};
