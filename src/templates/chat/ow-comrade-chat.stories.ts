/**
 * Storybook stories for the OW Comrade chat card (#152 — core.md
 * p.12137).
 *
 * Each story builds its payload through the canonical rules functions
 * in `src/module/rules/ow-comrade.ts` so any change to the doubles /
 * Blast-Spray / state-track behaviour surfaces visually here first.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { randomId, seedRandom, type SystemId } from '../../../stories/mocks/extended';
import { localizeKey } from '../../../stories/mocks/lang-localize';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { renderSheet } from '../../../stories/test-helpers';
import { applyComradeHit, type ComradeState, healComrade, replaceComrade, transfersToComrade } from '../../module/rules/ow-comrade';
import chatSrc from './ow-comrade-chat.hbs?raw';

initializeStoryHandlebars();

const rng = seedRandom(0xc03ade5);

const meta: Meta = {
    title: 'Rules / OW Comrade Chat (#152)',
};
export default meta;

type Story = StoryObj;

const STATE_KEY: Record<ComradeState, string> = {
    unharmed: 'WH40K.OW.Comrade.State.Unharmed',
    wounded: 'WH40K.OW.Comrade.State.Wounded',
    dead: 'WH40K.OW.Comrade.State.Dead',
};

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

interface ComradeHitTransferEvent {
    kind: 'hit-transfer';
    reason: string;
    transitioned: boolean;
    replaced: boolean;
    previousState: ComradeState;
    newState: ComradeState;
    previousStateKey: string;
    newStateKey: string;
}

interface ComradeStateChangeEvent {
    kind: 'state-change';
    reason: string;
    previousState: ComradeState;
    newState: ComradeState;
    previousStateKey: string;
    newStateKey: string;
    transitioned: boolean;
    replaced: boolean;
}

interface ComradeChatContext extends BaseCtx {
    event: ComradeHitTransferEvent | ComradeStateChangeEvent;
}

function hitTransferContext(opts: { reason: 'doubles' | 'blast-spray' }): ComradeChatContext {
    const result =
        opts.reason === 'doubles'
            ? transfersToComrade({ pcRollDoubles: true, comradeInCohesion: true, weaponBlastOrSpray: false, comradeInBlastSprayRange: false })
            : transfersToComrade({ pcRollDoubles: false, comradeInCohesion: false, weaponBlastOrSpray: true, comradeInBlastSprayRange: true });
    return {
        ...BASE,
        event: {
            kind: 'hit-transfer',
            reason: result.reason,
            transitioned: false,
            replaced: false,
            previousState: 'unharmed',
            newState: 'unharmed',
            previousStateKey: STATE_KEY.unharmed,
            newStateKey: STATE_KEY.unharmed,
        },
    };
}

function stateChangeContext(previousState: ComradeState, transition: 'hit' | 'heal' | 'replace'): ComradeChatContext {
    let result: { newState: ComradeState; transitioned: boolean; replaced?: boolean };
    if (transition === 'hit') {
        result = applyComradeHit(previousState);
    } else if (transition === 'heal') {
        result = healComrade(previousState);
    } else {
        const r = replaceComrade(previousState, true);
        result = { newState: r.newState, transitioned: r.transitioned, replaced: r.replaced };
    }
    return {
        ...BASE,
        event: {
            kind: 'state-change',
            reason: 'none',
            previousState,
            newState: result.newState,
            previousStateKey: STATE_KEY[previousState],
            newStateKey: STATE_KEY[result.newState],
            transitioned: result.transitioned,
            replaced: result.replaced ?? false,
        },
    };
}

export const HitTransferDoubles: Story = {
    name: 'Hit transfer — doubles roll while in Cohesion',
    render: () => renderSheet(chatSrc, { ...hitTransferContext({ reason: 'doubles' }) }),
};

export const HitTransferBlastSpray: Story = {
    name: 'Hit transfer — Blast/Spray catches the Comrade',
    render: () => renderSheet(chatSrc, { ...hitTransferContext({ reason: 'blast-spray' }) }),
};

export const StateHitUnharmedToWounded: Story = {
    name: 'State change — unharmed → wounded',
    render: () => renderSheet(chatSrc, { ...stateChangeContext('unharmed', 'hit') }),
};

export const StateHealWoundedToUnharmed: Story = {
    name: 'State change — wounded → unharmed (heal)',
    render: () => renderSheet(chatSrc, { ...stateChangeContext('wounded', 'heal') }),
};

export const StateReplaceDeadToUnharmed: Story = {
    name: 'State change — dead → unharmed (replacement enters play)',
    render: () => renderSheet(chatSrc, { ...stateChangeContext('dead', 'replace') }),
};

/** A hit on doubles struck the Comrade instead (#152, p. 271): the card states the reason and the step it took. */
export const HitTransferWounds: Story = {
    name: 'Hit transfer — doubles wound the Comrade',
    render: () => {
        const change = stateChangeContext('unharmed', 'hit').event;
        return renderSheet(chatSrc, { ...BASE, event: { ...change, kind: 'hit-transfer', reason: 'doubles' } });
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-reason="doubles"]')?.textContent).toContain(localizeKey('WH40K.OW.Comrade.Hit.Transferred.Doubles'));
        await expect(canvasElement.querySelector('[data-new-state]')?.getAttribute('data-new-state')).toBe('wounded');
    },
};

/** A recovery Order (p. 271) clears Fear and Pinning. */
export const Recovered: Story = {
    name: 'Recovery Order — no longer fleeing or pinned',
    render: () => renderSheet(chatSrc, { ...BASE, event: { kind: 'recover', wasFleeing: true, wasPinned: false } }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-comrade-recovered]')?.textContent).toContain(localizeKey('WH40K.OW.Comrade.Chat.Recovered'));
    },
};

/** Insanity or Corruption (p. 271): the Round's total against the threshold, and death at it. */
function mentalContext(amount: number, total: number): object {
    return {
        ...BASE,
        event: { kind: 'mental', mentalKind: 'corruption', mentalKey: 'WH40K.OW.Comrade.Mental.Corruption', amount, total, threshold: 10, dies: total >= 10 },
    };
}

export const MentalSurvives: Story = {
    name: 'Corruption — 6 of 10 this Round, survives',
    render: () => renderSheet(chatSrc, mentalContext(6, 6)),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-comrade-mental-total]')?.getAttribute('data-comrade-mental-total')).toBe('6');
        await expect(canvasElement.querySelector('[data-comrade-mental-death]')).toBeNull();
    },
};

export const MentalDeath: Story = {
    name: 'Corruption — 10 in one Round kills the Comrade',
    render: () => renderSheet(chatSrc, mentalContext(4, 10)),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-comrade-mental-death]')?.textContent).toContain(localizeKey('WH40K.OW.Comrade.Mental.Corruption'));
    },
};

// ── Per-system homologation ──────────────────────────────────────────────────
//
// The Comrade rules are Only War content, but the card renders through the
// shared `modern-card-shell` whose frame carries a per-system border / title
// variant chain gated on `data-wh40k-system="{{gameSystem}}"`. Render the same
// unharmed → wounded transition under each of the seven system ids so the shared
// chat-card chrome is proven to cascade for every line, not just `ow`. Seeded
// ids keep the screenshot diff deterministic.

const ALL_SYSTEM_IDS: readonly SystemId[] = ['dh2', 'dh1', 'rt', 'bc', 'ow', 'dw', 'im'];

function perSystemComradeContext(gameSystem: SystemId): ComradeChatContext {
    return {
        ...stateChangeContext('unharmed', 'hit'),
        gameSystem,
        comradeName: `Comrade ${randomId('jaeger', rng)}`,
    };
}

export const PerSystemFrames: Story = {
    name: 'Per-system — Comrade card frame across all 7 lines',
    render: () => {
        const container = document.createElement('div');
        container.className = 'tw-flex tw-flex-col tw-gap-3';
        for (const systemId of ALL_SYSTEM_IDS) {
            container.appendChild(renderSheet(chatSrc, { ...perSystemComradeContext(systemId) }));
        }
        return container;
    },
};
