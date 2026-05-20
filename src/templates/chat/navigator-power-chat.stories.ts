/**
 * Navigator Power chat card — visual coverage (#194).
 *
 * Exercises the (level × opposed × effect-tiers × sustain × failure)
 * surfaces of the rebuilt template against the Rogue Trader theme. The
 * `withSystem` wrapper of each story sets `data-wh40k-system` on the
 * rendered root so the `rt:tw-*` variants resolve.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { renderSheet } from '../../../stories/test-helpers';
import {
    NAVIGATOR_LEVEL_BONUS,
    type NavigatorPowerLevel,
    emitNavigatorPowerEffects,
    resolveNavigatorPower,
    resolveOpposedNavigatorPower,
} from '../../module/rules/navigator-powers';
import navigatorPowerChatSrc from './navigator-power-chat.hbs?raw';

const meta: Meta = {
    title: 'Rules / Navigator Powers (#194)',
};
export default meta;

type Story = StoryObj;

const LEVEL_LABEL_KEY: Record<NavigatorPowerLevel, string> = {
    novice: 'WH40K.NavigatorPower.Level.Novice',
    adept: 'WH40K.NavigatorPower.Level.Adept',
    master: 'WH40K.NavigatorPower.Level.Master',
};

function formatLevelBonus(level: NavigatorPowerLevel): string {
    const b = NAVIGATOR_LEVEL_BONUS[level];
    return `${b >= 0 ? '+' : ''}${b}`;
}

/**
 * Build the chat-card context the way `documents/item.ts` will once it
 * wires `resolveNavigatorPower` / `resolveOpposedNavigatorPower` into
 * `rollNavigatorPower`. Stories use this so a refactor to the live
 * payload shape surfaces visually here first.
 */
function navigatorContext(opts: {
    powerName: string;
    level: NavigatorPowerLevel;
    characteristic: number;
    roll: number;
    difficultyModifier?: number;
    sustain?: string;
    sideEffects?: string;
    levels: {
        novice?: { effect?: string };
        adept?: { effect?: string };
        master?: { effect?: string };
    };
    opposed?: { opponentChar: number; opponentRoll: number };
    gameSystem: string;
}): Record<string, unknown> {
    const result = resolveNavigatorPower({
        characteristic: opts.characteristic,
        level: opts.level,
        difficultyModifier: opts.difficultyModifier,
        roll: opts.roll,
    });
    const effectTiers = emitNavigatorPowerEffects(opts.levels, opts.level).map((t) => ({
        level: t.level,
        levelLabelKey: LEVEL_LABEL_KEY[t.level],
        effect: t.effect,
    }));
    const base: Record<string, unknown> = {
        item: {
            name: opts.powerName,
            system: {
                description: { value: '' },
                sideEffects: opts.sideEffects ?? '',
            },
        },
        actor: 'Astrianna, Navigator of House Suminaire',
        gameSystem: opts.gameSystem,
        roll: { total: result.roll },
        targetValue: result.target,
        success: result.success,
        degrees: result.dos,
        degreesOfFailure: result.dof,
        levelLabelKey: LEVEL_LABEL_KEY[opts.level],
        levelBonusLabel: formatLevelBonus(opts.level),
        effectTiers,
        sustainText: opts.sustain ?? '',
    };
    if (opts.opposed) {
        const opposed = resolveOpposedNavigatorPower({
            navigator: {
                characteristic: opts.characteristic,
                level: opts.level,
                difficultyModifier: opts.difficultyModifier,
                roll: opts.roll,
            },
            opponent: {
                characteristic: opts.opposed.opponentChar,
                roll: opts.opposed.opponentRoll,
            },
        });
        base['success'] = opposed.success;
        base['opposed'] = {
            navigatorRoll: opposed.navigator.roll,
            navigatorTarget: opposed.navigator.target,
            navigatorDos: opposed.navigator.dos,
            opponentRoll: opposed.opponent.roll,
            opponentTarget: opposed.opponent.target,
            opponentDos: opposed.opponent.dos,
            netDos: opposed.netDos,
            success: opposed.success,
        };
    }
    return base;
}

const LIDLESS_STARE_LEVELS = {
    novice: {
        effect: 'Full Action. Opposed Willpower vs. each viewer. On more DoS, victim suffers 1d10 + WPB Energy damage (ignores armour / TB) and is Stunned for 1 round. Inflicts 1 Fatigue on the Navigator; +1 more on a failure.',
    },
    adept: {
        effect: 'As above, but damage becomes 2d10 + WPB and Stun is 1d5 rounds; victims also suffer 1d5 Insanity.',
    },
    master: {
        effect: 'As above; any Intelligence-20+ creature taking damage tests Toughness (-10) or is slain. Pass → 1d10 Insanity instead of 1d5.',
    },
};

const COURSE_UNTRAVELLED_LEVELS = {
    novice: {
        effect: 'Difficult (-10) Willpower Test. Move up to Perception Characteristic in metres. Fail → Stunned 1 round; fail by 3+ → Stunned 1d10 rounds + 1 Insanity. 1 Fatigue regardless.',
    },
    adept: { effect: 'As above, except the test is Challenging (+0) and range doubles to 2× Perception in metres.' },
    master: { effect: 'As above; the move can be performed as a Free Action or as a Reaction.' },
};

/** Novice / non-opposed pass (Course Untravelled at Novice = Difficult −10). */
export const PassNovice: Story = {
    name: 'Pass / Novice — Course Untravelled',
    render: () =>
        renderSheet(
            navigatorPowerChatSrc,
            navigatorContext({
                powerName: 'The Course Untravelled',
                level: 'novice',
                characteristic: 45,
                roll: 22,
                difficultyModifier: -10,
                levels: COURSE_UNTRAVELLED_LEVELS,
                gameSystem: 'rt',
            }),
        ),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByText('The Course Untravelled')).toBeTruthy();
    },
};

/** Adept / non-opposed pass — Adept text is additive to Novice text. */
export const PassAdept: Story = {
    name: 'Pass / Adept — Course Untravelled (additive effects)',
    render: () =>
        renderSheet(
            navigatorPowerChatSrc,
            navigatorContext({
                powerName: 'The Course Untravelled',
                level: 'adept',
                characteristic: 45,
                roll: 30,
                difficultyModifier: 0,
                levels: COURSE_UNTRAVELLED_LEVELS,
                gameSystem: 'rt',
            }),
        ),
};

/** Master / non-opposed pass — Master text retains Novice + Adept. */
export const PassMaster: Story = {
    name: 'Pass / Master — Course Untravelled (full tier ladder)',
    render: () =>
        renderSheet(
            navigatorPowerChatSrc,
            navigatorContext({
                powerName: 'The Course Untravelled',
                level: 'master',
                characteristic: 45,
                roll: 30,
                difficultyModifier: 0,
                levels: COURSE_UNTRAVELLED_LEVELS,
                gameSystem: 'rt',
            }),
        ),
};

/** Failure — surfaces DoF and the Navigator-Mutation button. */
export const Failure: Story = {
    name: 'Failure / Novice — DoF + Mutation prompt',
    render: () =>
        renderSheet(
            navigatorPowerChatSrc,
            navigatorContext({
                powerName: 'The Course Untravelled',
                level: 'novice',
                characteristic: 35,
                roll: 90,
                difficultyModifier: -10,
                levels: COURSE_UNTRAVELLED_LEVELS,
                gameSystem: 'rt',
            }),
        ),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const btn = canvas.getByRole('button');
        expect(btn).toBeTruthy();
        expect(btn.getAttribute('data-action')).toBe('rollNavigatorMutation');
    },
};

/** Opposed test — Lidless Stare at Master, Navigator wins. */
export const OpposedWin: Story = {
    name: 'Opposed / Master — Lidless Stare (Navigator wins)',
    render: () =>
        renderSheet(
            navigatorPowerChatSrc,
            navigatorContext({
                powerName: 'The Lidless Stare',
                level: 'master',
                characteristic: 55,
                roll: 12,
                sustain: 'No (Full Action; resolves this round).',
                levels: LIDLESS_STARE_LEVELS,
                opposed: { opponentChar: 40, opponentRoll: 35 },
                gameSystem: 'rt',
            }),
        ),
};

/** Opposed test — Held in my Gaze tie favours the target. */
export const OpposedTie: Story = {
    name: 'Opposed / Tie — Held in my Gaze (target resists)',
    render: () =>
        renderSheet(
            navigatorPowerChatSrc,
            navigatorContext({
                powerName: 'Held in my Gaze',
                level: 'adept',
                characteristic: 45,
                roll: 35,
                sustain: 'Yes — power persists while the Navigator does not use another Navigator Power and the target remains in range / line of sight.',
                levels: {
                    novice: {
                        effect: 'Opposed Willpower vs. one target (≤5 m × PerB). On success, target is locked while the Navigator sustains; psyker powers / Daemonic Presence require beating the Navigator anew each time.',
                    },
                    adept: { effect: 'Range becomes 20 m × PerB; daemons take 2d10 damage from Warp Instability.' },
                    master: { effect: 'Line of sight no longer required; daemons taking Warp Instability damage are destroyed.' },
                },
                opposed: { opponentChar: 45, opponentRoll: 35 },
                gameSystem: 'rt',
            }),
        ),
};

/** Per-system homologation: DH2 theme (degraded, but still renders). */
export const ThemeDH2: Story = {
    name: 'Theme / DH2 fallback (non-RT call-site)',
    render: () =>
        renderSheet(
            navigatorPowerChatSrc,
            navigatorContext({
                powerName: 'Foreshadowing',
                level: 'novice',
                characteristic: 40,
                roll: 30,
                levels: {
                    novice: { effect: 'Three "secrets" from the near future; spend for +10 each on later tests (risk -10 on 7-10 for 2nd / 3rd).' },
                },
                gameSystem: 'dh2e',
            }),
        ),
};

/** Per-system homologation: IM theme. */
export const ThemeIM: Story = {
    name: 'Theme / Imperium Maledictum',
    render: () =>
        renderSheet(
            navigatorPowerChatSrc,
            navigatorContext({
                powerName: 'Foreshadowing',
                level: 'adept',
                characteristic: 40,
                roll: 30,
                levels: {
                    novice: { effect: 'Three "secrets" from the near future.' },
                    adept: { effect: 'Secrets only backfire on 9–10 instead of 7–10.' },
                },
                gameSystem: 'im',
            }),
        ),
};
