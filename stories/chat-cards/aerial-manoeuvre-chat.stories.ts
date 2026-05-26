import type { Meta, StoryObj } from '@storybook/html-vite';
import Hbs from 'handlebars';
import { expect, within } from 'storybook/test';
import { resolveAerialManoeuvre } from '../../src/module/rules/vehicle-actions.ts';
import aerialChatSrc from '../../src/templates/chat/aerial-manoeuvre-chat.hbs?raw';
import { renderTemplate as renderTpl } from '../mocks';
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

const aerialChatTemplate = Hbs.compile(aerialChatSrc);

const ALTITUDE_KEYS: Record<string, string> = {
    ground: 'WH40K.AerialManoeuvre.Altitude.Ground',
    low: 'WH40K.AerialManoeuvre.Altitude.Low',
    high: 'WH40K.AerialManoeuvre.Altitude.High',
    orbital: 'WH40K.AerialManoeuvre.Altitude.Orbital',
};

interface AerialChatContext {
    gameSystem: string;
    manoeuvreNameKey: string;
    success: boolean;
    pilotBsBonus: number;
    enemyBsBonus: number;
    freeAttack: boolean;
    resultingAltitudeKey: string | undefined;
    outcomeKey: string;
}

function cardContext(result: ReturnType<typeof resolveAerialManoeuvre>): AerialChatContext {
    return {
        gameSystem: 'dh2',
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
    render: () => renderTpl(aerialChatTemplate, cardContext(resolveAerialManoeuvre('lock-on', true, { dosMargin: 1 }))),
};

export const LockOnCrush: Story = {
    name: 'Lock On — 3+ DoS, Free Action unlocked',
    render: () => renderTpl(aerialChatTemplate, cardContext(resolveAerialManoeuvre('lock-on', true, { dosMargin: 3 }))),
    play: ({ canvasElement }) => {
        const cv = within(canvasElement);
        void expect(cv.getByText(/WH40K\.AerialManoeuvre\.FreeAttack/)).toBeTruthy();
    },
};

export const TightTurnSuccess: Story = {
    name: 'Tight Turn — success, climb one tier',
    render: () => renderTpl(aerialChatTemplate, cardContext(resolveAerialManoeuvre('tight-turn', true, { currentAltitude: 'low', altitudeDelta: 1 }))),
    play: ({ canvasElement }) => {
        void expect(canvasElement.querySelector('.wh40k-aerial-card')).toBeTruthy();
        void expect(canvasElement.querySelector('[data-wh40k-system="dh2"]')).toBeTruthy();
    },
};

export const TightTurnFailure: Story = {
    name: 'Tight Turn — failure, forced descent',
    render: () => renderTpl(aerialChatTemplate, cardContext(resolveAerialManoeuvre('tight-turn', false, { currentAltitude: 'high' }))),
};
