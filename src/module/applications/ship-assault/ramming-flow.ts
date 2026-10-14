/**
 * Ramming flow (#188 — RT Core p.215).
 *
 * A Manoeuvre-phase action: the helmsman's Hard (−20) Pilot (Space Craft) +
 * Manoeuvrability Test. On a success the rammed ship takes the hull-size die
 * plus the rammer's prow armour, and the rammer takes the defender's Armour
 * plus the rebound die — both ignoring void shields.
 *
 * The hull-size die table and the rebound die are compendium content on the
 * Ramming Speed order (`system.ramming`), loaded through an injected loader so
 * the flow is testable without Foundry. The GM may override the die and add a
 * bonus (a power ram's +1d10, Good an' Ard, …). The rules live in
 * `rules/ship-ramming.ts`; this module only rolls, applies and renders.
 */

import { resolveShipTest, type ShipTestResult } from '../../rules/ship-assault.ts';
import { composeRammingTest, computeRammingDamage, ramDamageFormula, type RammingDamageResolution, type RammingProfile } from '../../rules/ship-ramming.ts';
import { findItemUuidByIdentifier } from '../../utils/compendium-query.ts';
import { buildDamageView, buildTestView } from './ship-assault-card.ts';
import { helmsmanGroup, readSituational } from './ship-assault-fields.ts';
import {
    defineShipAssault,
    rollFormula,
    rollTotal,
    ShipAssaultInputError,
    type AssaultCard,
    type ShipAssaultContext,
    type ShipAssaultEntry,
} from './ship-assault-flow.ts';

const TEMPLATE = 'systems/wh40k-rpg/templates/chat/ship-ramming-chat.hbs';
const CITATION_KEY = 'WH40K.Voidcraft.Ramming.Citation';

/** `system.identifier` of the compendium order that carries the ramming content. */
export const RAMMING_ORDER_IDENTIFIER = 'ramming-speed';

/** Loads the ramming content, or null when the Ramming Speed order is unavailable. */
export type RammingProfileLoader = () => Promise<RammingProfile | null>;

/** A rolled ram: the test and, on a hit, both sides' damage. */
interface RammingRolled {
    test: ShipTestResult;
    damage: RammingDamageResolution | null;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: renderTemplate takes an open Handlebars context bag
function cardData(ctx: ShipAssaultContext, rolled: RammingRolled): Record<string, unknown> {
    const source = ctx.localize(CITATION_KEY);
    const damage = rolled.damage;
    return {
        gameSystem: ctx.attacker.system.gameSystem,
        attackerName: ctx.attacker.name,
        defenderName: ctx.defender.name,
        test: buildTestView(ctx.localize('WH40K.Voidcraft.Ramming.TestTitle'), rolled.test, source, ctx.localize),
        defenderDamage:
            damage === null
                ? null
                : buildDamageView(
                      ctx.localize('WH40K.Voidcraft.Ramming.DefenderHull', { ship: ctx.defender.name }),
                      damage.defender.components,
                      source,
                      ctx.localize,
                  ),
        attackerDamage:
            damage === null
                ? null
                : buildDamageView(
                      ctx.localize('WH40K.Voidcraft.Ramming.AttackerHull', { ship: ctx.attacker.name }),
                      damage.attacker.components,
                      source,
                      ctx.localize,
                  ),
    };
}

/** Build the ramming flow around a content loader. */
export function createRammingFlow(loadProfile: RammingProfileLoader): ShipAssaultEntry {
    return defineShipAssault<RammingRolled>({
        id: 'ram',
        tab: 'manoeuvre',
        labelKey: 'WH40K.Voidcraft.Ramming.Action',
        hintKey: 'WH40K.Voidcraft.Ramming.ActionHint',
        icon: 'fa-meteor',
        inputGroups: (ctx) => [
            helmsmanGroup(ctx),
            {
                legend: ctx.localize('WH40K.Voidcraft.Ramming.DamageLegend'),
                fields: [
                    { name: 'damageFormula', kind: 'text', label: ctx.localize('WH40K.Voidcraft.Ramming.Field.DamageFormula'), value: '' },
                    { name: 'bonusFormula', kind: 'text', label: ctx.localize('WH40K.Voidcraft.Ramming.Field.BonusFormula'), value: '' },
                    {
                        name: 'bonusLabel',
                        kind: 'text',
                        label: ctx.localize('WH40K.Voidcraft.Ramming.Field.BonusLabel'),
                        value: ctx.localize('WH40K.Voidcraft.Ramming.Field.BonusDefault'),
                    },
                ],
            },
        ],
        roll: async (ctx, form) => {
            const attacker = ctx.attacker.assaultProfile;
            const testRoll = await rollFormula('1d100');
            const test = resolveShipTest(
                composeRammingTest({
                    pilotSkill: form.number('pilotSkill', ctx.attacker.system.crew.crewRating),
                    ship: attacker,
                    situational: readSituational(form, 'situational'),
                }),
                rollTotal(testRoll),
                ctx.degreesMethod,
            );
            if (!test.success) return { resolution: { test, damage: null }, rolls: [testRoll] };

            const profile = await loadProfile();
            const damageFormula = form.text('damageFormula', '') || (profile === null ? null : ramDamageFormula(profile, attacker.hullType));
            const reboundFormula = profile?.reboundDamage ?? '';
            if (damageFormula === null || damageFormula === '' || reboundFormula === '') {
                throw new ShipAssaultInputError(ctx.localize('WH40K.Voidcraft.Ramming.MissingFormula'));
            }
            const damageRoll = await rollFormula(damageFormula);
            const reboundRoll = await rollFormula(reboundFormula);
            const bonusFormula = form.text('bonusFormula', '');
            const bonusRoll = bonusFormula === '' ? null : await rollFormula(bonusFormula);
            const damage = computeRammingDamage({
                attacker,
                defender: ctx.defender.assaultProfile,
                damage: { formula: damageFormula, total: rollTotal(damageRoll) },
                rebound: { formula: reboundFormula, total: rollTotal(reboundRoll) },
                ...(bonusRoll === null ? {} : { bonus: { formula: bonusFormula, total: rollTotal(bonusRoll), label: form.text('bonusLabel', '') } }),
            });
            return {
                resolution: { test, damage },
                rolls: [testRoll, damageRoll, reboundRoll, ...(bonusRoll === null ? [] : [bonusRoll])],
            };
        },
        previewCard: (ctx, rolled): AssaultCard => ({ template: TEMPLATE, data: cardData(ctx, rolled) }),
        choiceGroups: () => [],
        apply: async (ctx, rolled) => {
            const damage = rolled.damage;
            const data = cardData(ctx, rolled);
            if (damage === null) return { card: { template: TEMPLATE, data }, rolls: [] };
            // Both hits bypass void shields: applyHullDamage writes straight to Hull Integrity.
            const defenderApplied = ctx.defender.isOwner;
            const attackerApplied = ctx.attacker.isOwner;
            if (defenderApplied && damage.defender.total > 0) await ctx.defender.applyHullDamage(damage.defender.total);
            if (attackerApplied && damage.attacker.total > 0) await ctx.attacker.applyHullDamage(damage.attacker.total);
            return { card: { template: TEMPLATE, data: { ...data, unapplied: !defenderApplied || !attackerApplied } }, rolls: [] };
        },
    });
}

/** Load the Ramming Speed order's ramming content from the RT compendium. */
async function loadRammingFromCompendium(): Promise<RammingProfile | null> {
    const uuid = await findItemUuidByIdentifier('order', RAMMING_ORDER_IDENTIFIER, 'rt');
    if (uuid === null) return null;
    const order = await fromUuid(uuid);
    if (order === null || !('system' in order)) return null;
    const ramming = (order.system as { ramming?: RammingProfile }).ramming;
    return ramming === undefined || ramming.damage.length === 0 ? null : ramming;
}

export const RAMMING_FLOW = createRammingFlow(loadRammingFromCompendium);
