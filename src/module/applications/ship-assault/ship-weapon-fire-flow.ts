/**
 * Ship weapon fire flow (#184 — RT Core 1.4 errata, Chapter VIII).
 *
 * Fired from a Weapon Component's row on the voidcraft sheet, through the
 * shared ship dialog: pick the target ship, enter the gunner's Ballistic Skill,
 * the range band and any situational modifier, and Roll. The dialog previews
 * the hits, the void shields they meet and the damage past Armour; Apply
 * writes the damage, the overloaded shields and any Critical Hit onto the
 * **target** and posts the card. The rules live in `rules/ship-weapon-fire.ts`;
 * this module only rolls, applies and renders.
 */

import type { ShipTestComponent, ShipTestResult } from '../../rules/ship-assault.ts';
import {
    applyVoidShields,
    composeGunneryTest,
    isShipCriticalHit,
    rangeBandReach,
    resolveGunneryTest,
    resolveHullDamage,
    scoreHits,
    SHIP_RANGE_BANDS,
    toRangeBand,
    voidShieldComponents,
    type HitDamageRoll,
    type ScoredHits,
    type ShieldedHits,
    type ShipHullDamage,
    type ShipRangeBand,
    type ShipWeaponClass,
} from '../../rules/ship-weapon-fire.ts';
import { buildDamageView, buildTestView, type AssaultDamageView, type AssaultTestView } from './ship-assault-card.ts';
import { readSituational, situationalFields } from './ship-assault-fields.ts';
import {
    defineShipAssault,
    rollFormula,
    rollTotal,
    type AssaultCard,
    type AssaultShipActor,
    type ShipAssaultContext,
    type ShipAssaultEntry,
} from './ship-assault-flow.ts';

const TEMPLATE = 'systems/wh40k-rpg/templates/chat/ship-weapon-chat.hbs';
const FIRE_CITATION_KEY = 'WH40K.Voidcraft.Fire.Citation';
const DEFENCES_CITATION_KEY = 'WH40K.Voidcraft.Fire.DefencesCitation';

/** Langpack key of each range band's dialog option. */
const RANGE_BAND_OPTION_KEY: Record<ShipRangeBand, string> = {
    close: 'WH40K.Voidcraft.Fire.Range.Close',
    standard: 'WH40K.Voidcraft.Fire.Range.Standard',
    long: 'WH40K.Voidcraft.Fire.Range.Long',
};

/** The Weapon Component being fired, as the card shows it. */
export interface ShipWeaponFireWeapon {
    readonly name: string;
    readonly img: string;
    readonly weaponClass: ShipWeaponClass;
    /** Localized weapon type ("Macrobattery", "Lance Weapon"). */
    readonly typeLabel: string;
    /** Localized mounting ("Prow", "Dorsal", …). */
    readonly locationLabel: string;
    readonly strength: number;
    readonly damage: string;
    readonly crit: number;
    readonly range: number;
}

/** What the sheet hands the flow: the weapon and the firing ship's gunnery. */
export interface ShipWeaponFireInput {
    readonly weapon: ShipWeaponFireWeapon;
    /** The firing ship's Ballistic Skill, the dialog's default for the gunner. */
    readonly ballisticSkill: number;
    /** Ship-action modifiers on this weapon's test, from the central collector. */
    readonly shipModifiers: readonly ShipTestComponent[];
}

/** One ship's vitals, read before and after the shot lands. */
interface ShipVitals {
    hull: number;
    hullMax: number;
    shields: number;
    population: number;
    morale: number;
}

/** A rolled shot, before it is applied. */
interface FireRolled {
    test: ShipTestResult;
    scored: ScoredHits;
    shieldsUp: number;
    shielded: ShieldedHits;
    damage: HitDamageRoll[];
    hull: ShipHullDamage;
    /** The 1d5 Critical Hit roll; null when the shot caused none. */
    critRoll: number | null;
    before: ShipVitals;
}

/** A row of the target's before / after vitals table. */
interface VitalsRow {
    label: string;
    before: string;
    after: string;
}

/** The fire card's context. A `type` alias so it carries the implicit index signature `renderTemplate` needs. */
type FireCardData = {
    gameSystem: string;
    attackerName: string;
    defenderName: string;
    weapon: ShipWeaponFireWeapon;
    test: AssaultTestView;
    hits: AssaultDamageView | null;
    damage: AssaultDamageView | null;
    missed: boolean;
    allShielded: boolean;
    critical: string;
    vitalsTitle: string;
    vitals: VitalsRow[];
    applied: boolean;
    unapplied: boolean;
};

function readVitals(ship: AssaultShipActor): ShipVitals {
    return {
        hull: ship.hullIntegrity.value,
        hullMax: ship.hullIntegrity.max,
        shields: ship.activeVoidShields,
        population: ship.assaultProfile.crewPopulation,
        morale: ship.assaultProfile.morale,
    };
}

function vitalsRows(ctx: ShipAssaultContext, before: ShipVitals, after: ShipVitals | null): VitalsRow[] {
    const row = (key: string, pick: (vitals: ShipVitals) => string): VitalsRow => ({
        label: ctx.localize(key),
        before: pick(before),
        after: after === null ? '' : pick(after),
    });
    return [
        row('WH40K.Voidcraft.Fire.Vitals.Hull', (v) => `${v.hull} / ${v.hullMax}`),
        row('WH40K.Voidcraft.Fire.Vitals.Shields', (v) => String(v.shields)),
        row('WH40K.Voidcraft.Fire.Vitals.Population', (v) => String(v.population)),
        row('WH40K.Voidcraft.Fire.Vitals.Morale', (v) => String(v.morale)),
    ];
}

function fireCardData(input: ShipWeaponFireInput, ctx: ShipAssaultContext, rolled: FireRolled, after: ShipVitals | null, unapplied: boolean): FireCardData {
    const fireSource = ctx.localize(FIRE_CITATION_KEY);
    const defencesSource = ctx.localize(DEFENCES_CITATION_KEY);
    const target = ctx.defender.name;
    const shieldRows = voidShieldComponents(rolled.shielded, { name: target, shieldsUp: rolled.shieldsUp });
    return {
        gameSystem: ctx.attacker.system.gameSystem,
        attackerName: ctx.attacker.name,
        defenderName: target,
        weapon: input.weapon,
        test: buildTestView(ctx.localize('WH40K.Voidcraft.Fire.TestTitle'), rolled.test, fireSource, ctx.localize),
        hits: rolled.test.success
            ? buildDamageView(
                  ctx.localize('WH40K.Voidcraft.Fire.HitsTitle', { ship: target }),
                  [...rolled.scored.components, ...shieldRows],
                  fireSource,
                  ctx.localize,
              )
            : null,
        damage:
            rolled.hull.components.length === 0
                ? null
                : buildDamageView(ctx.localize('WH40K.Voidcraft.Fire.DamageTitle', { ship: target }), rolled.hull.components, defencesSource, ctx.localize),
        missed: !rolled.test.success,
        allShielded: rolled.test.success && rolled.shielded.remaining === 0,
        critical: rolled.critRoll === null ? '' : ctx.localize('WH40K.Voidcraft.Fire.Critical', { rolled: rolled.critRoll, ship: target }),
        vitalsTitle: ctx.localize('WH40K.Voidcraft.Fire.VitalsTitle', { ship: target }),
        vitals: vitalsRows(ctx, rolled.before, after),
        applied: after !== null,
        unapplied,
    };
}

function rangeOptions(ctx: ShipAssaultContext, range: number): { value: string; label: string }[] {
    return SHIP_RANGE_BANDS.map((band) => ({ value: band, label: ctx.localize(RANGE_BAND_OPTION_KEY[band], { reach: rangeBandReach(band, range) }) }));
}

/** Build the fire action for one Weapon Component, opened through the ship dialog. */
export function createShipWeaponFireFlow(input: ShipWeaponFireInput): ShipAssaultEntry {
    const { weapon } = input;
    return defineShipAssault<FireRolled>({
        id: 'fire',
        tab: 'weapons',
        labelKey: 'WH40K.Voidcraft.Fire.Action',
        hintKey: 'WH40K.Voidcraft.Fire.ActionHint',
        windowTitleKey: 'WH40K.Voidcraft.Fire.DialogTitle',
        icon: 'fa-crosshairs',
        inputGroups: (ctx) => [
            {
                legend: ctx.localize('WH40K.Voidcraft.Fire.GunneryLegend', { weapon: weapon.name, type: weapon.typeLabel }),
                fields: [
                    { name: 'gunnerSkill', kind: 'number', label: ctx.localize('WH40K.Voidcraft.Fire.Field.GunnerSkill'), value: input.ballisticSkill, min: 0 },
                    {
                        name: 'rangeBand',
                        kind: 'select',
                        label: ctx.localize('WH40K.Voidcraft.Fire.Field.RangeBand'),
                        value: 'standard',
                        options: rangeOptions(ctx, weapon.range),
                    },
                    ...situationalFields(ctx, 'situational'),
                ],
            },
        ],
        roll: async (ctx, form) => {
            const bsRoll = await rollFormula('1d100');
            const test = resolveGunneryTest(
                composeGunneryTest({
                    ballisticSkill: form.number('gunnerSkill', input.ballisticSkill),
                    shipModifiers: input.shipModifiers,
                    band: toRangeBand(form.text('rangeBand', 'standard')),
                    range: weapon.range,
                    situational: readSituational(form, 'situational'),
                }),
                rollTotal(bsRoll),
            );
            const before = readVitals(ctx.defender);
            const scored = scoreHits(weapon.weaponClass, weapon.strength, test);
            const shielded = applyVoidShields(scored.hits, before.shields);
            const damageRolls: Roll[] = [];
            for (let hit = 0; hit < shielded.remaining; hit += 1) {
                // eslint-disable-next-line no-await-in-loop -- each hit's damage is rolled in order, one Roll per hit, so every hit is its own card row
                damageRolls.push(await rollFormula(weapon.damage));
            }
            const damage = damageRolls.map((roll) => ({ total: rollTotal(roll), formula: weapon.damage }));
            const critical = isShipCriticalHit(test, weapon.crit);
            const hull = resolveHullDamage(weapon.weaponClass, damage, { name: ctx.defender.name, armour: ctx.defender.assaultProfile.armour }, critical);
            const critDie = critical ? await rollFormula('1d5') : null;
            return {
                resolution: { test, scored, shieldsUp: before.shields, shielded, damage, hull, critRoll: critDie === null ? null : rollTotal(critDie), before },
                rolls: [bsRoll, ...damageRolls, ...(critDie === null ? [] : [critDie])],
            };
        },
        previewCard: (ctx, rolled): AssaultCard => ({ template: TEMPLATE, data: fireCardData(input, ctx, rolled, null, false) }),
        choiceGroups: () => [],
        apply: async (ctx, rolled) => {
            const target = ctx.defender;
            if (!target.isOwner) return { card: { template: TEMPLATE, data: fireCardData(input, ctx, rolled, null, true) }, rolls: [] };
            if (rolled.shielded.cancelled > 0) await target.overloadVoidShields(rolled.shielded.cancelled);
            if (rolled.hull.hullLoss > 0) await target.applyHullDamage(rolled.hull.hullLoss);
            if (rolled.critRoll !== null) await target.rollShipCriticalHit(rolled.critRoll);
            return { card: { template: TEMPLATE, data: fireCardData(input, ctx, rolled, readVitals(target), false) }, rolls: [] };
        },
    });
}
