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
 *
 * A macrobattery may be combined with the ship's other macrobatteries into one
 * salvo (p.221): each battery makes its own test and scores its own hits, the
 * shields discard hits from the battery the attacker names first, the remaining
 * hits' damage is added into one total, Armour is subtracted once, and the
 * salvo inflicts at most one Critical Hit.
 */

import type { ShipTestComponent, ShipTestResult, SituationalModifier } from '../../rules/ship-assault.ts';
import { isCrippled } from '../../rules/ship-crew-morale.ts';
import {
    allocateSalvoShields,
    applyVoidShields,
    composeGunneryTest,
    defaultShieldedBattery,
    isSalvoCriticalHit,
    isShipCriticalHit,
    rangeBandReach,
    resolveGunneryTest,
    resolveHullDamage,
    salvoHitComponents,
    scoreHits,
    SHIP_RANGE_BANDS,
    toRangeBand,
    voidShieldComponents,
    type HitDamageRoll,
    type SalvoBatteryShot,
    type ScoredHits,
    type ShieldedSalvoBattery,
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
    type AssaultField,
    type AssaultFieldGroup,
    type AssaultFormValues,
    type AssaultShipActor,
    type ShipAssaultContext,
    type ShipAssaultEntry,
} from './ship-assault-flow.ts';

const TEMPLATE = 'systems/wh40k-rpg/templates/chat/ship-weapon-chat.hbs';
const FIRE_CITATION_KEY = 'WH40K.Voidcraft.Fire.Citation';
const DEFENCES_CITATION_KEY = 'WH40K.Voidcraft.Fire.DefencesCitation';

/** The shields-first select's value for the weapon whose row was clicked. */
const PRIMARY_BATTERY = 'primary';

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

/** Another macrobattery of the firing ship that may join the clicked one in a salvo. */
export interface ShipWeaponFireCompanion {
    /** The Weapon Component's item id; names its dialog fields. */
    readonly id: string;
    readonly weapon: ShipWeaponFireWeapon;
    /** Ship-action modifiers on this battery's own test (Lock on Target names one weapon). */
    readonly shipModifiers: readonly ShipTestComponent[];
}

/** What the sheet hands the flow: the weapon and the firing ship's gunnery. */
export interface ShipWeaponFireInput {
    readonly weapon: ShipWeaponFireWeapon;
    /** The firing ship's Ballistic Skill, the dialog's default for the gunner. */
    readonly ballisticSkill: number;
    /** Ship-action modifiers on this weapon's test, from the central collector. */
    readonly shipModifiers: readonly ShipTestComponent[];
    /** The ship's other macrobatteries, offered as a salvo when the clicked weapon is one too. Empty otherwise. */
    readonly companions: readonly ShipWeaponFireCompanion[];
}

/** One ship's vitals, read before and after the shot lands. */
interface ShipVitals {
    hull: number;
    hullMax: number;
    shields: number;
    population: number;
    morale: number;
}

/** The salvo part of a rolled shot: every battery's own test and hits, and the hits the shields took from each. */
interface SalvoRolled {
    batteries: ShieldedSalvoBattery[];
}

/** A rolled shot (one weapon, or a salvo led by the clicked one), before it is applied. */
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
    salvo: SalvoRolled | null;
}

/** A row of the target's before / after vitals table. */
interface VitalsRow {
    label: string;
    before: string;
    after: string;
}

/** One battery of a salvo on the card: its test and the hits it scored. */
interface SalvoBatteryView {
    test: AssaultTestView;
    hits: AssaultDamageView | null;
}

/** The fire card's context. A `type` alias so it carries the implicit index signature `renderTemplate` needs. */
type FireCardData = {
    gameSystem: string;
    attackerName: string;
    defenderName: string;
    weapon: ShipWeaponFireWeapon;
    fired: boolean;
    test: AssaultTestView;
    salvo: { title: string; batteries: SalvoBatteryView[] } | null;
    hits: AssaultDamageView | null;
    damage: AssaultDamageView | null;
    missed: boolean;
    allShielded: boolean;
    critical: string;
    salvoCriticalLimit: boolean;
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

/** The salvo's per-battery views and the pooled hits derivation. */
function salvoViews(ctx: ShipAssaultContext, salvo: SalvoRolled, source: string): { salvo: FireCardData['salvo']; hits: AssaultDamageView | null } {
    const target = ctx.defender.name;
    const batteries = salvo.batteries.map((battery) => ({
        test: buildTestView(ctx.localize('WH40K.Voidcraft.Fire.Salvo.BatteryTestTitle', { weapon: battery.name }), battery.test, source, ctx.localize),
        hits:
            battery.scored.components.length === 0
                ? null
                : buildDamageView(
                      ctx.localize('WH40K.Voidcraft.Fire.Salvo.BatteryHitsTitle', { weapon: battery.name }),
                      battery.scored.components,
                      source,
                      ctx.localize,
                  ),
    }));
    const anyHit = salvo.batteries.some((battery) => battery.scored.hits > 0);
    return {
        salvo: { title: ctx.localize('WH40K.Voidcraft.Fire.Salvo.Title', { count: salvo.batteries.length }), batteries },
        hits: anyHit
            ? buildDamageView(
                  ctx.localize('WH40K.Voidcraft.Fire.Salvo.PooledTitle', { ship: target }),
                  salvoHitComponents(salvo.batteries, { name: target }),
                  source,
                  ctx.localize,
              )
            : null,
    };
}

function fireCardData(input: ShipWeaponFireInput, ctx: ShipAssaultContext, rolled: FireRolled, after: ShipVitals | null, unapplied: boolean): FireCardData {
    const fireSource = ctx.localize(FIRE_CITATION_KEY);
    const defencesSource = ctx.localize(DEFENCES_CITATION_KEY);
    const target = ctx.defender.name;
    const shieldRows = voidShieldComponents(rolled.shielded, { name: target, shieldsUp: rolled.shieldsUp });
    const anyHit = rolled.salvo === null ? rolled.test.success : rolled.salvo.batteries.some((battery) => battery.scored.hits > 0);
    const salvo = rolled.salvo === null ? null : salvoViews(ctx, rolled.salvo, fireSource);
    return {
        gameSystem: ctx.attacker.system.gameSystem,
        attackerName: ctx.attacker.name,
        defenderName: target,
        weapon: input.weapon,
        fired: true,
        test: buildTestView(ctx.localize('WH40K.Voidcraft.Fire.TestTitle'), rolled.test, fireSource, ctx.localize),
        salvo: salvo === null ? null : salvo.salvo,
        hits:
            salvo !== null
                ? salvo.hits
                : rolled.test.success
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
        missed: !anyHit,
        allShielded: anyHit && rolled.shielded.remaining === 0,
        critical: rolled.critRoll === null ? '' : ctx.localize('WH40K.Voidcraft.Fire.Critical', { rolled: rolled.critRoll, ship: target }),
        salvoCriticalLimit: rolled.salvo !== null && rolled.critRoll !== null,
        vitalsTitle: ctx.localize('WH40K.Voidcraft.Fire.VitalsTitle', { ship: target }),
        vitals: vitalsRows(ctx, rolled.before, after),
        applied: after !== null,
        unapplied,
    };
}

function rangeOptions(ctx: ShipAssaultContext, range: number): { value: string; label: string }[] {
    return SHIP_RANGE_BANDS.map((band) => ({ value: band, label: ctx.localize(RANGE_BAND_OPTION_KEY[band], { reach: rangeBandReach(band, range) }) }));
}

/** Dialog field names of one companion battery. */
function companionFields(id: string): { include: string; range: string } {
    return { include: `salvo-${id}`, range: `salvoRange-${id}` };
}

/** The salvo group: one include checkbox and range band per companion, and the shields-first choice. */
function salvoGroup(ctx: ShipAssaultContext, primary: ShipWeaponFireWeapon, companions: readonly ShipWeaponFireCompanion[]): AssaultFieldGroup {
    const batteries = [{ value: PRIMARY_BATTERY, weapon: primary }, ...companions.map((companion) => ({ value: companion.id, weapon: companion.weapon }))];
    const companionInputs: AssaultField[] = companions.flatMap((companion) => {
        const names = companionFields(companion.id);
        return [
            {
                name: names.include,
                kind: 'checkbox',
                label: ctx.localize('WH40K.Voidcraft.Fire.Salvo.Include', { weapon: companion.weapon.name }),
                value: false,
            },
            {
                name: names.range,
                kind: 'select',
                label: ctx.localize('WH40K.Voidcraft.Fire.Salvo.Range', { weapon: companion.weapon.name }),
                value: 'standard',
                options: rangeOptions(ctx, companion.weapon.range),
            },
        ];
    });
    const shieldsFirst = batteries[defaultShieldedBattery(batteries.map((battery) => battery.weapon))]?.value ?? PRIMARY_BATTERY;
    return {
        legend: ctx.localize('WH40K.Voidcraft.Fire.Salvo.Legend'),
        fields: [
            ...companionInputs,
            {
                name: 'shieldsFirst',
                kind: 'select',
                label: ctx.localize('WH40K.Voidcraft.Fire.Salvo.ShieldsFirst'),
                value: shieldsFirst,
                options: batteries.map((battery) => ({ value: battery.value, label: battery.weapon.name })),
            },
        ],
    };
}

/** One battery to roll: its weapon, its own ship-action modifiers and range band, and its shields-first value. */
interface BatteryToFire {
    value: string;
    weapon: ShipWeaponFireWeapon;
    shipModifiers: readonly ShipTestComponent[];
    band: ShipRangeBand;
}

/** The clicked battery, and the companions the GM ticked into a salvo (none: a single shot). */
function chosenBatteries(
    input: ShipWeaponFireInput,
    salvoCompanions: readonly ShipWeaponFireCompanion[],
    form: AssaultFormValues,
): { primary: BatteryToFire; companions: BatteryToFire[] } {
    const primary: BatteryToFire = {
        value: PRIMARY_BATTERY,
        weapon: input.weapon,
        shipModifiers: input.shipModifiers,
        band: toRangeBand(form.text('rangeBand', 'standard')),
    };
    const companions = salvoCompanions
        .filter((companion) => form.checked(companionFields(companion.id).include))
        .map((companion) => ({
            value: companion.id,
            weapon: companion.weapon,
            shipModifiers: companion.shipModifiers,
            band: toRangeBand(form.text(companionFields(companion.id).range, 'standard')),
        }));
    return { primary, companions };
}

/** The gunnery inputs every battery of a shot shares. */
interface Gunnery {
    ballisticSkill: number;
    situational: SituationalModifier;
    /** The firing ship is Crippled: its weapons fire at half Strength. */
    crippled: boolean;
}

/** A battery's own Ballistic Skill Test, rolled, and the hits it scores. */
async function fireBattery(battery: BatteryToFire, gunnery: Gunnery): Promise<{ shot: SalvoBatteryShot; roll: Roll }> {
    const roll = await rollFormula('1d100');
    const test = resolveGunneryTest(
        composeGunneryTest({
            ballisticSkill: gunnery.ballisticSkill,
            shipModifiers: battery.shipModifiers,
            band: battery.band,
            range: battery.weapon.range,
            situational: gunnery.situational,
        }),
        rollTotal(roll),
    );
    const scored = scoreHits(battery.weapon.weaponClass, battery.weapon.strength, test, gunnery.crippled);
    return { shot: { name: battery.weapon.name, damage: battery.weapon.damage, crit: battery.weapon.crit, test, scored }, roll };
}

/** A rolled step: the resolution the card and Apply read, and every die rolled for it. */
interface FireStep {
    resolution: FireRolled;
    rolls: Roll[];
}

/** The target's state and defences a shot is resolved against. */
interface FireTarget {
    before: ShipVitals;
    defences: { name: string; armour: number };
}

/** The 1d5 Critical Hit roll, when the shot caused one. */
async function rollCritical(critical: boolean): Promise<Roll | null> {
    return critical ? rollFormula('1d5') : null;
}

/** One weapon fired on its own: its shields, damage, Armour (macrobattery) and Critical Hit. */
async function resolveSingleShot(weapon: ShipWeaponFireWeapon, lead: { shot: SalvoBatteryShot; roll: Roll }, target: FireTarget): Promise<FireStep> {
    const shielded = applyVoidShields(lead.shot.scored.hits, target.before.shields);
    const rolled = await rollHitDamage(shielded.remaining, weapon.damage, undefined);
    const critical = isShipCriticalHit(lead.shot.test, weapon.crit);
    const hull = resolveHullDamage(weapon.weaponClass, rolled.damage, target.defences, critical);
    const critDie = await rollCritical(critical);
    return {
        resolution: {
            test: lead.shot.test,
            scored: lead.shot.scored,
            shieldsUp: target.before.shields,
            shielded,
            damage: rolled.damage,
            hull,
            critRoll: critDie === null ? null : rollTotal(critDie),
            before: target.before,
            salvo: null,
        },
        rolls: [lead.roll, ...rolled.rolls, ...(critDie === null ? [] : [critDie])],
    };
}

/**
 * A combined salvo (p.221): the shields discard hits from the attacker's chosen
 * battery first, every remaining hit's damage goes into one total, Armour is
 * subtracted once, and the salvo causes at most one Critical Hit.
 */
async function resolveSalvo(
    lead: { shot: SalvoBatteryShot; roll: Roll },
    others: readonly { shot: SalvoBatteryShot; roll: Roll }[],
    shieldsFirst: number,
    target: FireTarget,
): Promise<FireStep> {
    const fired = [lead, ...others];
    const batteries = allocateSalvoShields(
        fired.map(({ shot }) => ({ ...shot, hits: shot.scored.hits })),
        target.before.shields,
        shieldsFirst,
    );
    const damage: HitDamageRoll[] = [];
    const damageRolls: Roll[] = [];
    for (const battery of batteries) {
        // eslint-disable-next-line no-await-in-loop -- each battery's hits are rolled in firing order so the card lists them battery by battery
        const rolled = await rollHitDamage(battery.hits - battery.cancelled, battery.damage, battery.name);
        damage.push(...rolled.damage);
        damageRolls.push(...rolled.rolls);
    }
    const totalHits = batteries.reduce((sum, battery) => sum + battery.hits, 0);
    const totalCancelled = batteries.reduce((sum, battery) => sum + battery.cancelled, 0);
    const critical = isSalvoCriticalHit(batteries);
    const hull = resolveHullDamage('macrobattery', damage, target.defences, critical);
    const critDie = await rollCritical(critical);
    return {
        resolution: {
            test: lead.shot.test,
            scored: lead.shot.scored,
            shieldsUp: target.before.shields,
            shielded: { cancelled: totalCancelled, remaining: totalHits - totalCancelled },
            damage,
            hull,
            critRoll: critDie === null ? null : rollTotal(critDie),
            before: target.before,
            salvo: { batteries },
        },
        rolls: [...fired.map(({ roll }) => roll), ...damageRolls, ...(critDie === null ? [] : [critDie])],
    };
}

/** Roll each hit's damage in order, one Roll per hit, so every hit is its own card row. */
async function rollHitDamage(hits: number, formula: string, weapon: string | undefined): Promise<{ damage: HitDamageRoll[]; rolls: Roll[] }> {
    const rolls: Roll[] = [];
    for (let hit = 0; hit < hits; hit += 1) {
        // eslint-disable-next-line no-await-in-loop -- each hit's damage is rolled in order, one Roll per hit, so every hit is its own card row
        rolls.push(await rollFormula(formula));
    }
    return { damage: rolls.map((roll) => ({ total: rollTotal(roll), formula, ...(weapon === undefined ? {} : { weapon }) })), rolls };
}

/** Build the fire action for one Weapon Component, opened through the ship dialog. */
export function createShipWeaponFireFlow(input: ShipWeaponFireInput): ShipAssaultEntry {
    const { weapon } = input;
    // Only macrobatteries combine; a lance's damage "is never combined".
    const salvoCompanions =
        weapon.weaponClass === 'macrobattery' ? input.companions.filter((companion) => companion.weapon.weaponClass === 'macrobattery') : [];
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
            ...(salvoCompanions.length > 0 ? [salvoGroup(ctx, weapon, salvoCompanions)] : []),
        ],
        roll: async (ctx, form) => {
            const gunnery: Gunnery = {
                ballisticSkill: form.number('gunnerSkill', input.ballisticSkill),
                situational: readSituational(form, 'situational'),
                crippled: isCrippled(ctx.attacker.hullIntegrity),
            };
            const target: FireTarget = {
                before: readVitals(ctx.defender),
                defences: { name: ctx.defender.name, armour: ctx.defender.assaultProfile.armour },
            };
            const { primary, companions } = chosenBatteries(input, salvoCompanions, form);
            const lead = await fireBattery(primary, gunnery);
            if (companions.length === 0) return resolveSingleShot(weapon, lead, target);

            // Each battery in the salvo makes its own test, in the order fired.
            const others: { shot: SalvoBatteryShot; roll: Roll }[] = [];
            for (const companion of companions) {
                // eslint-disable-next-line no-await-in-loop -- each battery rolls its own test in order, so the dice land on the card in the order fired
                others.push(await fireBattery(companion, gunnery));
            }
            const chosen = form.text('shieldsFirst', PRIMARY_BATTERY);
            const shieldsFirst = Math.max(
                0,
                [primary, ...companions].findIndex((battery) => battery.value === chosen),
            );
            return resolveSalvo(lead, others, shieldsFirst, target);
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
