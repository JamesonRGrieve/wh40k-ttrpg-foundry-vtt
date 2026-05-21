/**
 * Storybook stories for the OW Comrade chat card (#152 — core.md
 * p.12137).
 *
 * Each story builds its payload through the canonical rules functions
 * in `src/module/rules/ow-comrade.ts` so any change to the doubles /
 * Blast-Spray / state-track behaviour surfaces visually here first.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { renderSheet } from '../../../stories/test-helpers';
import { applyComradeHit, type ComradeState, healComrade, replaceComrade, transfersToComrade } from '../../module/rules/ow-comrade';
import chatSrc from './ow-comrade-chat.hbs?raw';

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
