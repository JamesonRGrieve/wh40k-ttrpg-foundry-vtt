/**
 * Hit and Run flow (#188 — RT Core p.218).
 *
 * An Extended Action: the raid leader's Challenging (+0) Pilot (Space Craft)
 * approach (−10 per target Turret Rating point), then on arrival an opposed
 * Ordinary (+10) Command Test against the enemy troop commander. A win rolls
 * 1d5 twice on the Critical Hit chart — the raider picks one — and deals 1
 * Hull Integrity per degree won by. The rules live in
 * `rules/ship-hit-and-run.ts`; this module only rolls, applies and renders.
 */

import { pluralKey } from '../../i18n/plural.ts';
import { resolveShipTest, type ShipTestResult } from '../../rules/ship-assault.ts';
import {
    composeApproachTest,
    composeRaidCommand,
    hitAndRunHullDamage,
    isShotDown,
    pickWorseCritRoll,
    resolveHitAndRunCommand,
    type HitAndRunCommandResolution,
} from '../../rules/ship-hit-and-run.ts';
import { buildDamageView, buildTestView } from './ship-assault-card.ts';
import { helmsmanGroup, readSituational, situationalFields } from './ship-assault-fields.ts';
import { defineShipAssault, rollFormula, rollTotal, type AssaultCard, type AssaultFieldGroup, type ShipAssaultContext } from './ship-assault-flow.ts';

const TEMPLATE = 'systems/wh40k-rpg/templates/chat/ship-hit-and-run-chat.hbs';
const CITATION_KEY = 'WH40K.Voidcraft.HitAndRun.Citation';

/** The raid's opposed Command phase, reached only on a successful approach. */
interface RaidCommand {
    attacker: ShipTestResult;
    defender: ShipTestResult;
    outcome: HitAndRunCommandResolution;
    /** The two 1d5 Critical Hit rolls, rolled only when the raid succeeds. */
    critPicks: [number, number] | null;
}

/** A rolled Hit and Run. */
interface HitAndRunRolled {
    approach: ShipTestResult;
    command: RaidCommand | null;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: renderTemplate takes an open Handlebars context bag
function cardData(ctx: ShipAssaultContext, rolled: HitAndRunRolled): Record<string, unknown> {
    const source = ctx.localize(CITATION_KEY);
    const command = rolled.command;
    return {
        gameSystem: ctx.attacker.system.gameSystem,
        attackerName: ctx.attacker.name,
        defenderName: ctx.defender.name,
        approach: {
            test: buildTestView(ctx.localize('WH40K.Voidcraft.HitAndRun.ApproachTitle'), rolled.approach, source, ctx.localize),
            shotDown: isShotDown(rolled.approach),
        },
        command:
            command === null
                ? null
                : {
                      attackerTest: buildTestView(
                          ctx.localize('WH40K.Voidcraft.HitAndRun.CommandTitle', { ship: ctx.attacker.name }),
                          command.attacker,
                          source,
                          ctx.localize,
                      ),
                      defenderTest: buildTestView(
                          ctx.localize('WH40K.Voidcraft.HitAndRun.CommandTitle', { ship: ctx.defender.name }),
                          command.defender,
                          source,
                          ctx.localize,
                      ),
                      success: command.outcome.success,
                      netDoS: command.outcome.netDoS,
                  },
        critPicks: command?.critPicks ?? null,
    };
}

function critChoice(ctx: ShipAssaultContext, picks: [number, number]): AssaultFieldGroup {
    const options = picks.map((pick, index) => ({ value: String(index), label: ctx.localize('WH40K.Voidcraft.HitAndRun.CritOption', { roll: pick }) }));
    const worse = pickWorseCritRoll(picks[0], picks[1]) === picks[0] ? '0' : '1';
    return {
        legend: ctx.localize('WH40K.Voidcraft.HitAndRun.CritLegend'),
        fields: [{ name: 'critPick', kind: 'radio', label: ctx.localize('WH40K.Voidcraft.HitAndRun.CritField'), value: worse, options }],
    };
}

export const HIT_AND_RUN_FLOW = defineShipAssault<HitAndRunRolled>({
    id: 'hit-and-run',
    tab: 'extended',
    labelKey: 'WH40K.Voidcraft.HitAndRun.Action',
    hintKey: 'WH40K.Voidcraft.HitAndRun.ActionHint',
    icon: 'fa-user-ninja',
    inputGroups: (ctx) => [
        helmsmanGroup(ctx),
        {
            legend: ctx.localize('WH40K.Voidcraft.HitAndRun.RaidLegend', { ship: ctx.attacker.name }),
            fields: [
                {
                    name: 'attackerCommand',
                    kind: 'number',
                    label: ctx.localize('WH40K.Voidcraft.HitAndRun.Field.Command'),
                    value: ctx.attacker.system.crew.crewRating,
                },
                ...situationalFields(ctx, 'attackerSituational'),
            ],
        },
        {
            legend: ctx.localize('WH40K.Voidcraft.HitAndRun.DefenceLegend', { ship: ctx.defender.name }),
            fields: [
                {
                    name: 'defenderCommand',
                    kind: 'number',
                    label: ctx.localize('WH40K.Voidcraft.HitAndRun.Field.Command'),
                    value: ctx.defender.system.crew.crewRating,
                },
                ...situationalFields(ctx, 'defenderSituational'),
            ],
        },
    ],
    roll: async (ctx, form) => {
        const approachRoll = await rollFormula('1d100');
        const approach = resolveShipTest(
            composeApproachTest({
                pilotSkill: form.number('pilotSkill', ctx.attacker.system.crew.crewRating),
                target: ctx.defender.assaultProfile,
                situational: readSituational(form, 'situational'),
            }),
            rollTotal(approachRoll),
            ctx.degreesMethod,
        );
        if (!approach.success) return { resolution: { approach, command: null }, rolls: [approachRoll] };

        const attackerRoll = await rollFormula('1d100');
        const defenderRoll = await rollFormula('1d100');
        const attacker = resolveShipTest(
            composeRaidCommand(form.number('attackerCommand', ctx.attacker.system.crew.crewRating), readSituational(form, 'attackerSituational')),
            rollTotal(attackerRoll),
            ctx.degreesMethod,
        );
        const defender = resolveShipTest(
            composeRaidCommand(form.number('defenderCommand', ctx.defender.system.crew.crewRating), readSituational(form, 'defenderSituational')),
            rollTotal(defenderRoll),
            ctx.degreesMethod,
        );
        const outcome = resolveHitAndRunCommand(attacker, defender);
        const rolls = [approachRoll, attackerRoll, defenderRoll];
        if (!outcome.success) return { resolution: { approach, command: { attacker, defender, outcome, critPicks: null } }, rolls };

        const critA = await rollFormula('1d5');
        const critB = await rollFormula('1d5');
        return {
            resolution: { approach, command: { attacker, defender, outcome, critPicks: [rollTotal(critA), rollTotal(critB)] } },
            rolls: [...rolls, critA, critB],
        };
    },
    previewCard: (ctx, rolled): AssaultCard => ({ template: TEMPLATE, data: cardData(ctx, rolled) }),
    choiceGroups: (ctx, rolled) => {
        const picks = rolled.command?.critPicks ?? null;
        return picks === null ? [] : [critChoice(ctx, picks)];
    },
    apply: async (ctx, rolled, form) => {
        const data = cardData(ctx, rolled);
        const command = rolled.command;
        const picks = command?.critPicks ?? null;
        if (command === null || picks === null) return { card: { template: TEMPLATE, data }, rolls: [] };

        const chosen = form.text('critPick', '0') === '1' ? picks[1] : picks[0];
        const hull = hitAndRunHullDamage(command.outcome);
        const canApply = ctx.defender.isOwner;
        if (canApply) {
            if (hull > 0) await ctx.defender.applyHullDamage(hull);
            await ctx.defender.rollShipCriticalHit(chosen);
        }
        const hullView = buildDamageView(
            ctx.localize('WH40K.Voidcraft.HitAndRun.HullDamage'),
            [
                {
                    labelKey: pluralKey('WH40K.Voidcraft.HitAndRun.Component.NetDegrees', command.outcome.netDoS, ctx.lang),
                    value: hull,
                    data: { degrees: command.outcome.netDoS },
                },
            ],
            ctx.localize(CITATION_KEY),
            ctx.localize,
        );
        return { card: { template: TEMPLATE, data: { ...data, chosenCrit: chosen, hull: hullView, unapplied: !canApply } }, rolls: [] };
    },
});
