/**
 * Storybook stories for the OW Comrade Healing chat card
 * (#157 — core.md §"Healing Comrades" p.12269; replacement p.12261).
 *
 * Each story builds its payload through the canonical rules functions
 * in `src/module/rules/ow-comrade-healing.ts` so any change to the
 * 7-day clock / Medicae DoS / replacement gating surfaces visually
 * here first.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { renderSheet } from '../../../stories/test-helpers';
import { applyMedicaeAttempt, OW_COMRADE_AUTO_RECOVERY_DAYS, processReplacement, tickComradeRecovery } from '../../module/rules/ow-comrade-healing';
import chatSrc from './ow-comrade-healing-chat.hbs?raw';

const meta: Meta = {
    title: 'Rules / OW Comrade Healing Chat (#157)',
};
export default meta;

type Story = StoryObj;

interface BaseCtx {
    gameSystem: string;
    actor: { name: string };
    comradeName: string;
}

const BASE: BaseCtx = {
    gameSystem: 'ow',
    actor: { name: 'Trooper Halden, 99th Cadian' },
    comradeName: 'Comrade Jaeger',
};

function tickContext(opts: { startingDays: number; daysElapsed: number }): Record<string, unknown> {
    const result = tickComradeRecovery({ remainingDays: opts.startingDays, daysElapsed: opts.daysElapsed });
    return {
        ...BASE,
        event: {
            kind: 'tick',
            daysElapsed: opts.daysElapsed,
            remainingDays: result.remainingDays,
            recovered: result.recovered,
        },
    };
}

function medicaeContext(opts: { startingDays: number; degreesOfSuccess: number }): Record<string, unknown> {
    const result = applyMedicaeAttempt({ remainingDays: opts.startingDays, degreesOfSuccess: opts.degreesOfSuccess });
    return {
        ...BASE,
        event: {
            kind: 'medicae',
            degreesOfSuccess: opts.degreesOfSuccess,
            reducedBy: result.reducedBy,
            remainingDays: result.remainingDays,
            recovered: result.remainingDays === 0,
        },
    };
}

function replaceContext(opts: { stateAtCamp: 'unharmed' | 'wounded' | 'dead'; refitAvailable: boolean }): Record<string, unknown> {
    const result = processReplacement({ stateAtCamp: opts.stateAtCamp, refitAvailable: opts.refitAvailable });
    return {
        ...BASE,
        event: {
            kind: 'replace',
            replaced: result.replaced,
            reason: result.reason,
        },
    };
}

export const TickOneDay: Story = {
    name: 'Tick — one day of rest elapses on the 7-day clock',
    render: () => renderSheet(chatSrc, tickContext({ startingDays: OW_COMRADE_AUTO_RECOVERY_DAYS, daysElapsed: 1 })),
};

export const TickFinalDay: Story = {
    name: 'Tick — final day, Comrade recovers',
    render: () => renderSheet(chatSrc, tickContext({ startingDays: 1, daysElapsed: 1 })),
};

export const MedicaeThreeDoS: Story = {
    name: 'Medicae(-10) — 3 DoS shave 3 days from a 5-day clock',
    render: () => renderSheet(chatSrc, medicaeContext({ startingDays: 5, degreesOfSuccess: 3 })),
};

export const MedicaeOverkill: Story = {
    name: 'Medicae(-10) — 4 DoS on a 3-day clock clamps to 0',
    render: () => renderSheet(chatSrc, medicaeContext({ startingDays: 3, degreesOfSuccess: 4 })),
};

export const ReplaceSuccess: Story = {
    name: 'Replacement — dead Comrade replaced at camp',
    render: () => renderSheet(chatSrc, replaceContext({ stateAtCamp: 'dead', refitAvailable: true })),
};

export const ReplaceBlockedNoRefit: Story = {
    name: 'Replacement — refused, no refit available',
    render: () => renderSheet(chatSrc, replaceContext({ stateAtCamp: 'dead', refitAvailable: false })),
};

export const ReplaceBlockedNotDead: Story = {
    name: 'Replacement — refused, Comrade is still alive',
    render: () => renderSheet(chatSrc, replaceContext({ stateAtCamp: 'wounded', refitAvailable: true })),
};
