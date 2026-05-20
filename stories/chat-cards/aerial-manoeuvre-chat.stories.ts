import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import { resolveAerialManoeuvre } from '../../src/module/rules/vehicle-actions.ts';
import aerialChatSrc from '../../src/templates/chat/aerial-manoeuvre-chat.hbs?raw';
import { renderTemplate } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';

/**
 * Chat-card story for the Aerial Manoeuvre result card (#133 —
 * without.md p. 54). Covers the four canonical outcomes the pure
 * `resolveAerialManoeuvre()` resolver produces:
 *
 *   1. Lock On win (pilot +20, enemies +10, no free attack).
 *   2. Lock On crush (3+ DoS → Free Action attack unlocked).
 *   3. Tight Turn success (90° turns + climb one altitude tier).
 *   4. Tight Turn failure (forced one-tier descent).
 *
 * The card carries `data-wh40k-system` so per-system Tailwind variants
 * fire even though chat lives outside the sheet root.
 */
initializeStoryHandlebars();

const aerialChatTemplate = Handlebars.compile(aerialChatSrc);

const ALTITUDE_KEYS: Record<string, string> = {
    ground: 'WH40K.AerialManoeuvre.Altitude.Ground',
    low: 'WH40K.AerialManoeuvre.Altitude.Low',
    high: 'WH40K.AerialManoeuvre.Altitude.High',
    orbital: 'WH40K.AerialManoeuvre.Altitude.Orbital',
};

function cardContext(result: ReturnType<typeof resolveAerialManoeuvre>): Record<string, unknown> {
    return {
        gameSystem: 'dh2e',
        manoeuvreNameKey: `WH40K.AerialManoeuvre.${result.key}.Name`,
        success: result.success,
        pilotBsBonus: result.pilotBsBonus,
        enemyBsBonus: result.enemyBsBonus,
        freeAttack: result.freeAttack,
        resultingAltitudeKey: ALTITUDE_KEYS[result.resultingAltitude],
        outcomeKey: result.outcomeKey,
    };
}

const meta: Meta = {
    title: 'Chat/Aerial Manoeuvre (#133)',
};
export default meta;

type Story = StoryObj;

export const LockOnWin: Story = {
    name: 'Lock On — opposed win (+20 pilot / +10 enemies)',
    render: () => renderTemplate(aerialChatTemplate, cardContext(resolveAerialManoeuvre('lock-on', true, { dosMargin: 1 }))),
};

export const LockOnCrush: Story = {
    name: 'Lock On — 3+ DoS, Free Action unlocked',
    render: () => renderTemplate(aerialChatTemplate, cardContext(resolveAerialManoeuvre('lock-on', true, { dosMargin: 3 }))),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByText(/WH40K\.AerialManoeuvre\.FreeAttack/)).toBeTruthy();
    },
};

export const TightTurnSuccess: Story = {
    name: 'Tight Turn — success, climb one tier',
    render: () => renderTemplate(aerialChatTemplate, cardContext(resolveAerialManoeuvre('tight-turn', true, { currentAltitude: 'low', altitudeDelta: 1 }))),
    play: async ({ canvasElement }) => {
        expect(canvasElement.querySelector('.wh40k-aerial-card')).toBeTruthy();
        expect(canvasElement.querySelector('[data-wh40k-system="dh2e"]')).toBeTruthy();
    },
};

export const TightTurnFailure: Story = {
    name: 'Tight Turn — failure, forced descent',
    render: () => renderTemplate(aerialChatTemplate, cardContext(resolveAerialManoeuvre('tight-turn', false, { currentAltitude: 'high' }))),
};
