/**
 * Boarding Action flows (#188 — RT Core p.215).
 *
 * `board` rolls the Hard (−20) Pilot (Space Craft) + Manoeuvrability Test that
 * locks the two ships together. `boarding-round` is run once per Strategic
 * Turn while they stay locked: the opposed Command Test, the winner's choice of
 * how to spend each degree (1 Hull Integrity, or 1d5 Crew Population + 1d5
 * Morale), and the loser's Morale check. The rules live in
 * `rules/ship-boarding.ts`; this module only rolls, applies and renders.
 */

import { composePilotManoeuvrabilityTest, resolveShipTest, type ShipTestComponent, type ShipTestResult } from '../../rules/ship-assault.ts';
import {
    allocateBoardingDegrees,
    BOARDING_KEYS,
    BOARDING_LOCK_DIFFICULTY,
    composeBoardingCommand,
    computeBoardingDamage,
    resolveBoardingMorale,
    resolveBoardingRound,
    type BoardingRoundResolution,
} from '../../rules/ship-boarding.ts';
import { buildDamageView, buildTestView, type AssaultDamageView } from './ship-assault-card.ts';
import { dieResults, helmsmanGroup, readSituational, situationalFields } from './ship-assault-fields.ts';
import {
    defineShipAssault,
    rollFormula,
    rollTotal,
    type AssaultCard,
    type AssaultFieldGroup,
    type AssaultFormValues,
    type AssaultShipActor,
    type ShipAssaultContext,
} from './ship-assault-flow.ts';

const TEMPLATE = 'systems/wh40k-rpg/templates/chat/ship-boarding-chat.hbs';
const CITATION_KEY = 'WH40K.Voidcraft.Boarding.Citation';

/** Base card context shared by both boarding phases. */
// eslint-disable-next-line no-restricted-syntax -- boundary: renderTemplate takes an open Handlebars context bag
function cardBase(ctx: ShipAssaultContext): Record<string, unknown> {
    return {
        gameSystem: ctx.attacker.system.gameSystem,
        attackerName: ctx.attacker.name,
        defenderName: ctx.defender.name,
    };
}

/* -------------------------------------------- */
/*  Lock on                                     */
/* -------------------------------------------- */

function lockCard(ctx: ShipAssaultContext, test: ShipTestResult): AssaultCard {
    const title = ctx.localize('WH40K.Voidcraft.Boarding.LockTestTitle');
    return { template: TEMPLATE, data: { ...cardBase(ctx), lock: { test: buildTestView(title, test, ctx.localize(CITATION_KEY), ctx.localize) } } };
}

export const BOARD_FLOW = defineShipAssault<ShipTestResult>({
    id: 'board',
    tab: 'manoeuvre',
    labelKey: 'WH40K.Voidcraft.Boarding.Board',
    hintKey: 'WH40K.Voidcraft.Boarding.BoardHint',
    icon: 'fa-link',
    inputGroups: (ctx) => [helmsmanGroup(ctx)],
    roll: async (ctx, form) => {
        const derivation = composePilotManoeuvrabilityTest({
            pilotSkill: form.number('pilotSkill', ctx.attacker.system.crew.crewRating),
            ship: ctx.attacker.assaultProfile,
            difficulty: BOARDING_LOCK_DIFFICULTY,
            difficultyKey: BOARDING_KEYS.lockDifficulty,
            situational: readSituational(form, 'situational'),
        });
        const roll = await rollFormula('1d100');
        return { resolution: resolveShipTest(derivation, rollTotal(roll), ctx.degreesMethod), rolls: [roll] };
    },
    previewCard: lockCard,
    choiceGroups: () => [],
    apply: async (ctx, test) => Promise.resolve({ card: lockCard(ctx, test), rolls: [] }),
});

/* -------------------------------------------- */
/*  Boarding round                              */
/* -------------------------------------------- */

/** A rolled boarding round: both sides' Command tests and the opposed outcome. */
interface BoardingRound {
    attacker: ShipTestResult;
    defender: ShipTestResult;
    round: BoardingRoundResolution;
}

/** Field-name prefix per side. */
const SIDES = ['attacker', 'defender'] as const;

function sideGroup(ctx: ShipAssaultContext, side: (typeof SIDES)[number]): AssaultFieldGroup {
    const ship = side === 'attacker' ? ctx.attacker : ctx.defender;
    return {
        legend: ctx.localize('WH40K.Voidcraft.Boarding.SideLegend', { ship: ship.name }),
        fields: [
            {
                name: `${side}Command`,
                kind: 'number',
                label: ctx.localize('WH40K.Voidcraft.Boarding.Field.Command'),
                value: ship.system.crew.crewRating,
                min: 0,
            },
            { name: `${side}FailedBreakFree`, kind: 'checkbox', label: ctx.localize('WH40K.Voidcraft.Boarding.Field.FailedBreakFree'), value: false },
            ...situationalFields(ctx, `${side}Situational`),
        ],
    };
}

function roundTestTitle(ctx: ShipAssaultContext, ship: AssaultShipActor): string {
    return ctx.localize('WH40K.Voidcraft.Boarding.CommandTestTitle', { ship: ship.name });
}

/** The ships in winner / loser order. */
function standings(ctx: ShipAssaultContext, round: BoardingRoundResolution): { winner: AssaultShipActor; loser: AssaultShipActor } {
    return round.winner === 'attacker' ? { winner: ctx.attacker, loser: ctx.defender } : { winner: ctx.defender, loser: ctx.attacker };
}

// eslint-disable-next-line no-restricted-syntax -- boundary: renderTemplate takes an open Handlebars context bag
function roundCardData(ctx: ShipAssaultContext, rolled: BoardingRound): Record<string, unknown> {
    const source = ctx.localize(CITATION_KEY);
    return {
        ...cardBase(ctx),
        round: {
            attackerTest: buildTestView(roundTestTitle(ctx, ctx.attacker), rolled.attacker, source, ctx.localize),
            defenderTest: buildTestView(roundTestTitle(ctx, ctx.defender), rolled.defender, source, ctx.localize),
            winnerName: standings(ctx, rolled.round).winner.name,
            degrees: rolled.round.degrees,
        },
    };
}

/** One component per rolled d5, labelled with the degree it was bought by. */
function dieComponents(dice: readonly number[]): ShipTestComponent[] {
    return dice.map((value, index) => ({ labelKey: 'WH40K.Voidcraft.Boarding.Component.CrewDegree', value, data: { degree: index + 1 } }));
}

/** The loser's damage views, omitting a stat that took nothing. */
function damageViews(
    ctx: ShipAssaultContext,
    hullDegrees: number,
    crewDice: readonly number[],
    moraleDice: readonly number[],
): { hull: AssaultDamageView | null; crew: AssaultDamageView | null; morale: AssaultDamageView | null } {
    const source = ctx.localize(CITATION_KEY);
    const hullComponents: ShipTestComponent[] = [
        { labelKey: 'WH40K.Voidcraft.Boarding.Component.ChargeDegrees', value: hullDegrees, data: { degrees: hullDegrees } },
    ];
    return {
        hull: hullDegrees > 0 ? buildDamageView(ctx.localize('WH40K.Voidcraft.Boarding.HullDamage'), hullComponents, source, ctx.localize) : null,
        crew: crewDice.length > 0 ? buildDamageView(ctx.localize('WH40K.Voidcraft.Boarding.CrewDamage'), dieComponents(crewDice), source, ctx.localize) : null,
        morale:
            moraleDice.length > 0
                ? buildDamageView(ctx.localize('WH40K.Voidcraft.Boarding.MoraleDamage'), dieComponents(moraleDice), source, ctx.localize)
                : null,
    };
}

async function rollD5s(count: number): Promise<{ dice: number[]; rolls: Roll[] }> {
    if (count <= 0) return { dice: [], rolls: [] };
    const roll = await rollFormula(`${count}d5`);
    return { dice: dieResults(roll), rolls: [roll] };
}

async function applyRound(ctx: ShipAssaultContext, rolled: BoardingRound, form: AssaultFormValues): Promise<{ card: AssaultCard; rolls: Roll[] }> {
    const { loser } = standings(ctx, rolled.round);
    const allocation = allocateBoardingDegrees(rolled.round.degrees, form.number('hullDegrees', 0));
    const crew = await rollD5s(allocation.crewDegrees);
    const morale = await rollD5s(allocation.crewDegrees);
    const damage = computeBoardingDamage({ allocation, crewD5s: crew.dice, moraleD5s: morale.dice });

    const canApply = loser.isOwner;
    if (canApply) {
        if (damage.hullDamage > 0) await loser.applyHullDamage(damage.hullDamage);
        if (damage.crewDamage > 0 || damage.moraleDamage > 0) await loser.applyCrewMoraleDamage(damage.crewDamage, damage.moraleDamage);
    }

    // The loser then tests its (now reduced) Morale to keep fighting.
    const moraleRoll = await rollFormula('1d100');
    const moraleValue = loser.crew.morale.value;
    const check = resolveBoardingMorale(rollTotal(moraleRoll), moraleValue);

    const data = {
        ...roundCardData(ctx, rolled),
        damage: rolled.round.degrees > 0 ? damageViews(ctx, allocation.hullDegrees, crew.dice, morale.dice) : null,
        morale: { loserName: loser.name, roll: rollTotal(moraleRoll), value: moraleValue, fightsOn: check.fightsOn },
        unapplied: !canApply && rolled.round.degrees > 0,
    };
    return { card: { template: TEMPLATE, data }, rolls: [...crew.rolls, ...morale.rolls, moraleRoll] };
}

export const BOARDING_ROUND_FLOW = defineShipAssault<BoardingRound>({
    id: 'boarding-round',
    tab: 'manoeuvre',
    labelKey: 'WH40K.Voidcraft.Boarding.Round',
    hintKey: 'WH40K.Voidcraft.Boarding.RoundHint',
    icon: 'fa-skull-crossbones',
    inputGroups: (ctx) => SIDES.map((side) => sideGroup(ctx, side)),
    roll: async (ctx, form) => {
        const attackerShip = ctx.attacker.assaultProfile;
        const defenderShip = ctx.defender.assaultProfile;
        const attackerDerivation = composeBoardingCommand(
            {
                ship: attackerShip,
                commandSkill: form.number('attackerCommand', ctx.attacker.system.crew.crewRating),
                failedBreakFree: form.checked('attackerFailedBreakFree'),
                situational: readSituational(form, 'attackerSituational'),
            },
            defenderShip,
        );
        const defenderDerivation = composeBoardingCommand(
            {
                ship: defenderShip,
                commandSkill: form.number('defenderCommand', ctx.defender.system.crew.crewRating),
                failedBreakFree: form.checked('defenderFailedBreakFree'),
                situational: readSituational(form, 'defenderSituational'),
            },
            attackerShip,
        );
        const attackerRoll = await rollFormula('1d100');
        const defenderRoll = await rollFormula('1d100');
        const attacker = resolveShipTest(attackerDerivation, rollTotal(attackerRoll), ctx.degreesMethod);
        const defender = resolveShipTest(defenderDerivation, rollTotal(defenderRoll), ctx.degreesMethod);
        const round = resolveBoardingRound(attacker, defender);
        return { resolution: { attacker, defender, round }, rolls: [attackerRoll, defenderRoll] };
    },
    previewCard: (ctx, rolled) => ({ template: TEMPLATE, data: roundCardData(ctx, rolled) }),
    choiceGroups: (ctx, rolled) => {
        if (rolled.round.degrees === 0) return [];
        const { winner } = standings(ctx, rolled.round);
        return [
            {
                legend: ctx.localize('WH40K.Voidcraft.Boarding.ChoiceLegend', { winner: winner.name, degrees: rolled.round.degrees }),
                fields: [
                    {
                        name: 'hullDegrees',
                        kind: 'number',
                        label: ctx.localize('WH40K.Voidcraft.Boarding.Field.HullDegrees'),
                        value: 0,
                        min: 0,
                        max: rolled.round.degrees,
                    },
                ],
            },
        ];
    },
    apply: applyRound,
});
