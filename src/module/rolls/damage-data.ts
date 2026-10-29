import { t } from '../i18n/t.ts';
import { calculateAmmoSpecials } from '../rules/ammo.ts';
import { getCriticalDamage } from '../rules/critical-damage.ts';
import {
    damageProfileComponents,
    damageProfileTooltipTitle,
    type DamageProfileContext,
    describeDamageProvenance,
    drawDamageTable,
    type ResolvedDamageProfile,
} from '../rules/damage-profile.ts';
import {
    buildCharBonus,
    collectDynamicComponents,
    collectGrantedQualities,
    type DynamicModifierContext,
    type DynamicModifierItemLike,
    type DynamicModifierSituation,
    findInertTriggers,
    type InertTrigger,
    modeDelta,
} from '../rules/dynamic-modifiers.ts';
import { additionalHitLocations, DEFAULT_HIT_LOCATION, getHitLocationForRoll, resolveHitLocationId } from '../rules/hit-locations.ts';
import { type PsychicFormulaValues, resolvePsychicFormulaTerms } from '../rules/psychic-range.ts';
import { scatterDirection } from '../rules/scatter.ts';
import { AIM_STATE, type ActorStateSource, collectActorStates, collectTargetTags, rangeBandOf, type TargetTagSource } from '../rules/situation-tags.ts';
import { righteousFuryChartValue, vehicleHitLocation } from '../rules/vehicle-damage.ts';
import { calculateWeaponModifiersDamageBonuses, calculateWeaponModifiersPenetrationBonuses } from '../rules/weapon-modifiers.ts';
import {
    applyKeepHighestToDie,
    calculateExoticQualityDamageModifiers,
    calculateQualityPenetrationModifiers,
    collectWeaponQualityDieOps,
    type DieTermLike,
    EXOTIC_DAMAGE_MODIFIER_IDS,
    EXOTIC_DAMAGE_MODIFIER_LABEL_KEYS,
    getRighteousFuryThreshold,
    resolveDieOpDamageAdjust,
    resolveMaximalEffect,
} from '../rules/weapon-quality-effects.ts';
import { weaponQualityLabel } from '../rules/weapon-quality-payloads.ts';
import { prepareModifierTooltipData } from '../utils/modifier-tooltip.ts';
import { parseQualityLevel } from '../utils/quality-id.ts';
import { type ModifierSourcesShape, passiveCombatModifiers } from './passive-modifiers.ts';
import type { VehicleCardRow } from './vehicle-card-rows.ts';
import { reversedTableRoll, strikeFor, type VehicleStrike, type VehicleTableRollKind, type VehicleTargetProfile } from './vehicle-strike.ts';

/** The die an extra hit on a vehicle rolls on its hit-location table (DH2 core). */
const FRESH_LOCATION_DIE = '1d100';

/**
 * Minimal interface for the attackData parameter passed to Hit calculation methods.
 * ActionData satisfies this interface at runtime; we can't import ActionData here
 * without creating a circular dependency (action-data imports Hit from this file).
 */
/** Shape of item.system for action items used in damage calculations. */
interface ActionItemSystem {
    effectiveDamageFormula?: string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is a Foundry framework union; penetration can be number|string|Roll formula
    effectivePenetration?: unknown;
    damage?: { formula?: string; type?: string; penetration?: number; penetrationFormula?: string };
    damageType?: string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: penetration field accepts numeric or formula strings from legacy data
    penetration?: unknown;
    /** The weapon's quality identifiers (`tearing`, `proven-3`, …) — base + craftsmanship + ammo + mode. Absent on powers. */
    effectiveSpecial?: Iterable<string>;
    /** Damage resolved at attack time — a range band, a table draw, a borrowed weapon (#608). Absent on powers. */
    resolveContextualDamage?: (context: DamageProfileContext) => ResolvedDamageProfile | null;
    /** The RollTable a table-damage weapon draws from, '' otherwise (#608). */
    damageTableUuid?: string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: catch-all for other system fields accessed via string keys at framework boundaries
    [key: string]: unknown;
}

/** Minimal action item shape needed for damage calculation. */
interface ActionItemLike {
    /** The weapon's (or power's) name, which titles its damage profile's tooltip. */
    name: string;
    system: ActionItemSystem;
    isMelee: boolean;
    isRanged: boolean;
}

export interface AttackDataLike {
    rollData: {
        weapon?: ActionItemLike;
        power?: ActionItemLike;
        /** The psyker's Psy Rating on a psychic attack — the `PR` term in its damage / penetration. */
        pr?: number;
        sourceActor: ActorStateSource & {
            // `effectiveBonus` carries the base bonus PLUS the bonus-only modifier
            // channel and fatigue halving (#415); outcome consumers read it, falling
            // back to `bonus` for any actor path that hasn't populated it.
            getCharacteristicFuzzy: (key: string) => { bonus: number; effectiveBonus?: number };
            hasTalent: (name: string) => boolean;
            hasTalentFuzzyWords: (words: string | string[], extra?: string) => boolean;
            /** Owned items, walked for data-driven dynamic modifier hooks (Direction #7). */
            items?: Iterable<DynamicModifierItemLike>;
            /**
             * Active game line, used to resolve the line's critical-injury pack (#439);
             * and the passive-modifier provenance whose `combat.damage` / `.penetration`
             * entries (Path A) every hit adds.
             */
            system?: { gameSystem?: string; modifierSources?: ModifierSourcesShape | undefined };
        };
        /**
         * The declared target. Typed as the tag-derivation surface only (#518) —
         * the live Foundry Actor satisfies it structurally, and narrowing it here
         * avoids the circular import a full actor type would need.
         */
        targetActor?: TargetTagSource | null | undefined;
        roll: { total: number } | null;
        isCalledShot?: boolean;
        calledShotLocation?: string;
        coverAP?: number;
        action: string;
        rangeName: string;
        /** Measured distance to the target in metres; picks a range-band weapon's band (#608). */
        distance?: number | undefined;
        /**
         * The computed range bracket (`pointBlank` / `short` / … / `melee`), set by
         * `rules/range.ts`. Slugged into the situation's `rangeBand` so `rangeBand` /
         * `atRangeBand` hooks can fire; absent when the roll never computed one.
         */
        rangeBracket?: string | undefined;
        /** Roll-time modifier map, read for the derived `aiming` state. */
        modifiers?: Readonly<Partial<Record<string, number>>> | undefined;
        attackSpecials: { name: string; level?: number }[];
        /** The target bears a `helplessTarget` condition: damage is rolled twice and added. */
        targetHelpless?: boolean | undefined;
        dos: number;
        eyeOfVengeance: boolean;
        hasAttackSpecial: (name: string) => boolean;
        getAttackSpecial: (name: string) => { level: number };
        /** Bridge quality ids onto {@link attackSpecials} (a resolved damage profile's, #608). */
        addAttackQualities?: (qualityIds: readonly string[]) => void;
    };
    // eslint-disable-next-line no-restricted-syntax -- boundary: targetActor is an opaque Foundry Actor; kept unknown to avoid circular imports
    damageData?: { targetActor?: unknown };
}

/**
 * Add a sourced contribution to a hit's damage / penetration map under its
 * lower-cased label, summing with any entry already there so two sources sharing a
 * label never overwrite each other.
 */
function addLabelledModifier(map: Partial<Record<string, number>>, label: string, value: number): void {
    const key = label.toLowerCase();
    map[key] = (map[key] ?? 0) + value;
}

/** The acting actor's states for `condition: whileState` — its conditions plus a declared Aim. */
/** The caster values a psychic attack's damage / penetration terms name; null for a non-psychic attack. */
function psychicFormulaValues(attackData: AttackDataLike): PsychicFormulaValues | null {
    const pr = attackData.rollData.pr;
    if (pr === undefined) return null;
    const bonusOf = (key: string): number => {
        const c = attackData.rollData.sourceActor.getCharacteristicFuzzy(key);
        return c.effectiveBonus ?? c.bonus;
    };
    return { psyRating: pr, willpowerBonus: bonusOf('willpower'), toughnessBonus: bonusOf('toughness') };
}

function attackStates(rollData: AttackDataLike['rollData']): string[] {
    const states = collectActorStates(rollData.sourceActor);
    if ((rollData.modifiers?.['aim'] ?? 0) > 0 && !states.includes(AIM_STATE)) states.push(AIM_STATE);
    return states;
}

/**
 * Assemble the dynamic-modifier situation for one attack (#518) — the single
 * builder BOTH the numeric-hook pass ({@link Hit.applyDynamicModifiers}) and the
 * conditional-grant pass ({@link Hit._calculateSpecials}) use, so the two cannot
 * drift on which trigger inputs they supply.
 *
 * Every input the engine's predicates read is supplied here. Omitting one is
 * exactly how `vsType` / `vsFaction` / `vsAlignment` came to be inert: the
 * condition tested an array that nothing ever wrote, so it was permanently false
 * with no error to show for it.
 */
function buildAttackSituation(attackData: AttackDataLike, opts: { isCrit: boolean }): DynamicModifierSituation {
    const rollData = attackData.rollData;
    const actionItem = rollData.weapon ?? rollData.power;
    // A burst's extra hits are allocated by target NAME (#513), so every hit reads
    // the DECLARED target's tags. Per-hit tags would need the allocator to carry
    // the target actor, not just its id/name.
    const targetTags = collectTargetTags(rollData.targetActor);
    return {
        isMelee: actionItem?.isMelee === true,
        isRanged: actionItem?.isRanged === true,
        isCrit: opts.isCrit,
        action: rollData.action,
        rangeBand: rangeBandOf(rollData.rangeBracket),
        states: attackStates(rollData),
        targetTags: targetTags.all,
        targetTagAxes: targetTags.byAxis,
        // Per-attack activated effects (Eye of Vengeance, …) for `condition: activated` hooks.
        activated: rollData.eyeOfVengeance ? ['eyeOfVengeance'] : [],
    };
}

/**
 * Inert triggers already reported on this client, so a full-auto burst raises one
 * warning per dead hook rather than one per hit. Mirrors the same memo
 * `data/item/weapon.ts` keeps for unresolved per-line variants.
 */
const reportedInertTriggers = new Set<string>();

/** Identity of one inert trigger for the report memo. */
function inertKey(entry: InertTrigger): string {
    return `${entry.source}|${entry.condition}|${entry.value}`;
}

/** Clear the inert-trigger report memo. Test seam — in play the memo lives for the session. */
export function resetInertTriggerReports(): void {
    reportedInertTriggers.clear();
}

/**
 * Tell the GM about authored hooks the situation can never satisfy (#518).
 *
 * Silence is what made the inert target conditions invisible for so long: a hook
 * that quietly contributes nothing reads exactly like one that works. This turns
 * "can never match" into a visible warning. Diagnostic only — it never alters a
 * roll, and a hook that merely does not match the current enemy is not reported.
 */
function warnInertTriggers(items: Iterable<DynamicModifierItemLike>, situation: DynamicModifierSituation): void {
    const inert = findInertTriggers(items, situation);
    if (inert.length === 0) return;
    if (typeof game === 'undefined' || typeof ui === 'undefined') return;
    // `game.user` and `ui.notifications` only exist on a booted client — the same
    // code runs under vitest and headless pack tooling. Read through locals whose
    // declared type says so, rather than suppressing an "unnecessary" check.
    const session: { user?: { isGM?: boolean } } = game;
    const notifier: { notifications?: { warn: (message: string) => void } } = ui;
    if (session.user?.isGM !== true) return;
    const fresh = inert.filter((entry) => !reportedInertTriggers.has(inertKey(entry)));
    if (fresh.length === 0) return;
    for (const entry of fresh) reportedInertTriggers.add(inertKey(entry));
    const hooks = fresh.map((entry) => `${entry.source} (${entry.condition}: ${entry.value})`).join(', ');
    notifier.notifications?.warn(t('WH40K.Warning.InertModifierHook', { hooks }));
}

/** A single resolvable damage-die result from a Foundry Roll term. */
export interface DamageDieResult {
    result: number;
    active?: boolean;
    discarded?: boolean;
}

/**
 * DH2 core: the attacker may replace ONE damage
 * die with the attack roll's Degrees of Success. Mutates the chosen
 * active die in place — the lowest by default, or the attacker-selected
 * index into the active-die list — and reports the swapped-out value plus
 * the delta so callers can adjust the running damage total without
 * re-evaluating the Roll. Returns null when no eligible die exists or the
 * supplied index is out of range.
 */
export function replaceDamageDieWithDoS(
    dice: DamageDieResult[],
    dos: number,
    dieIndex?: number,
): { replacedIndex: number; previous: number; delta: number } | null {
    if (dos < 0) return null;
    const active = dice.filter((d) => d.discarded !== true && d.active !== false);
    if (active.length === 0) return null;

    let target: DamageDieResult | undefined;
    let replacedIndex = 0;
    if (dieIndex === undefined) {
        // `.at()` is `T | undefined` under BOTH tsconfigs (unlike active[i], which the
        // test config narrows to T), so the guards below need no `!` and are never
        // flagged as unnecessary. active is non-empty here, so `first` is always set.
        const first = active.at(0);
        if (first === undefined) return null;
        target = first;
        for (let i = 1; i < active.length; i += 1) {
            const candidate = active.at(i);
            if (candidate !== undefined && candidate.result < target.result) {
                target = candidate;
                replacedIndex = i;
            }
        }
    } else {
        target = active.at(dieIndex);
        replacedIndex = dieIndex;
    }

    if (target === undefined) return null;
    const previous = target.result;
    target.result = dos;
    return { replacedIndex, previous, delta: dos - previous };
}

class DamageData {
    template = '';
    // eslint-disable-next-line no-restricted-syntax -- boundary: actor types are opaque Foundry documents; kept unknown to avoid circular imports
    sourceActor: unknown = undefined;
    // eslint-disable-next-line no-restricted-syntax -- boundary: actor types are opaque Foundry documents; kept unknown to avoid circular imports
    targetActor: unknown = undefined;

    additionalHits = 0;
    hits: Hit[] = [];

    reset(): void {
        this.hits = [];
        this.additionalHits = 0;
    }
}

export class Hit {
    /** Stable hit-location id (`body`, `rightArm`, …); legacy messages may carry the English name. */
    location: string = DEFAULT_HIT_LOCATION;

    /**
     * Which target this hit landed on (#513). A burst's extra hits may be spread
     * across nearby enemies, so the target is a property of the HIT, not of the
     * attack. Empty when the attack had no declared target.
     */
    targetName = '';
    /** The actor this hit lands on when it differs from the card's target (an area hit, #599); '' otherwise. */
    targetUuid = '';

    /**
     * Cover armour bonus the target benefits from at this hit location.
     * Populated from active Cover situational modifiers in the roll dialog
     * (see `attack-options.ts`); consumed by `AssignDamageData.update()`.
     */
    coverAP = 0;

    totalFatigue = 0;
    /** What the hit's Fatigue comes from (a grapple's Damage Opponent, #665), for the card's row; '' when none is stated. */
    fatigueSource = '';

    damage = 0;
    damageRoll: Roll | undefined = undefined;
    damageType = 'Impact';
    modifiers: Record<string, number> = {};
    totalDamage = 0;

    /**
     * The damage profile this hit resolved at attack time (#608): the range band,
     * the table result or the borrowed weapon. Null for a weapon's own fixed profile.
     */
    profile: ResolvedDamageProfile | null = null;
    /** The card's statement of which band / table result / borrowed weapon applied; '' for a fixed profile. */
    profileLabel = '';
    /** Rich-tooltip data for the card's profile row. */
    profileTooltip = '';

    dos = 0;

    penetration = 0;
    hasPenetrationRoll = false;
    penetrationRoll: Roll | undefined = undefined;
    penetrationModifiers: Record<string, number> = {};
    totalPenetration = 0;

    // eslint-disable-next-line no-restricted-syntax -- boundary: specials are heterogeneous attack-special objects from legacy JS; no schema available
    specials: unknown[] = [];
    effects: { name: string; effect: string }[] = [];
    righteousFury: { roll: Roll; effect: string }[] = [];

    /**
     * Source weapon carries the Explosive (X) quality. Surfaced on Hit so
     * the damage chat card can pass it through `data-is-explosive` to the
     * assign-damage dialog; AssignDamageData consumes it on the DW horde
     * branch ({@link magnitudeLossForHit}: +1 Magnitude per Explosive hit).
     * Populated by the renderer that posts the damage chat card.
     */
    isExplosive = false;

    /**
     * The source weapon ignores the struck location's armour and cover — Warp
     * Weapon against armour no warded piece covers (#414). Decided by the damage
     * chat-card renderer, which knows both the weapon and the target, and passed
     * through `data-armour-ignored` to the assign-damage flow.
     */
    armourIgnored = false;

    /**
     * Effective-damage preview vs the current target (#247), filled by the damage
     * chat-card renderer when an attack resolves with a target selected — total
     * damage after the target's location armour (− penetration) and Toughness Bonus.
     * `hasEffective` gates the card block; `effectiveAbsorbed` flags a fully-absorbed
     * hit (RAW 1-point minimum). These are display-only and do not apply damage.
     */
    hasEffective = false;
    effectiveDamage = 0;
    effectiveArmour = 0;
    effectiveTb = 0;
    effectiveAbsorbed = false;
    /** The Effective line's provenance: damage, each armour part, cover, Penetration and TB (#248). '' with no preview. */
    effectiveTooltip = '';
    /** The same provenance as printed rows under the Effective line: each soak part with its signed value. */
    effectiveRows: { label: string; value: string }[] = [];

    /** Where this hit struck a vehicle (content#28): facing, location, armour facing, force field, Righteous Fury rows. Null off a vehicle. */
    vehicleStrike: VehicleStrike | null = null;
    /** The strike serialised for the card's `data-vehicle-strike` (fields, not getters, survive the chat render). */
    vehicleStrikeData = '';
    /** The vehicle rows the damage card prints (facing, location, armour, force field, Righteous Fury), with provenance. */
    vehicleRows: VehicleCardRow[] = [];

    /** Number of Righteous Fury triggers from this hit's damage roll. */
    get righteousFuryCount(): number {
        return this.righteousFury.length;
    }
    // eslint-disable-next-line no-restricted-syntax -- boundary: scatter data is an unstructured legacy object; no schema available
    scatter: Record<string, unknown> = {};

    /**
     * @param attackData
     * @param hitNumber
     * @returns {Promise<Hit>}
     */
    static async createHit(
        attackData: AttackDataLike,
        hitNumber: number,
        forcedLocation: string | null = null,
        vehicle: VehicleTargetProfile | null = null,
    ): Promise<Hit> {
        const hit = new Hit();
        await hit.resolveProfile(attackData);
        // A resolved profile with no dice (beyond every band, a table result that only
        // does something else, nothing to borrow from) deals nothing at all: no roll,
        // and no bonus from the attacker's talents or the weapon's qualities (#608).
        if (hit.profile?.formula !== '') {
            await hit._calculateDamage(attackData);
            // Penetration is resolved BEFORE the modifier passes: a penetration hook
            // that scales off the weapon's penetration (scale source `penetration`) or
            // multiplies it (`mode: multiply`) reads `this.penetration`, which was
            // still 0 when the dynamic pass ran ahead of `_calculatePenetration`.
            await hit._calculatePenetration(attackData);
            await hit.applyDynamicModifiers(attackData);
            hit.applyPassiveCombatModifiers(attackData);
            hit._totalDamage();
            hit._totalPenetration();
            hit._calculateSpecials(attackData);
        }

        hit.coverAP = attackData.rollData.coverAP ?? 0;

        if (vehicle !== null) {
            await hit.strikeVehicle(attackData.rollData.roll?.total ?? null, hitNumber, vehicle);
            return hit;
        }

        if (forcedLocation !== null) {
            // An area quality that fixes where its hits land (Spray: the Body, #599).
            hit.location = resolveHitLocationId(forcedLocation) ?? DEFAULT_HIT_LOCATION;
        } else if (attackData.rollData.isCalledShot === true) {
            hit.location = resolveHitLocationId(attackData.rollData.calledShotLocation) ?? DEFAULT_HIT_LOCATION;
        } else {
            const roll = attackData.rollData.roll;
            const initialHit = getHitLocationForRoll(roll?.total ?? 0) ?? DEFAULT_HIT_LOCATION;
            // `hitNumber` is this hit's index WITHIN ITS OWN TARGET (#513), so a hit
            // spread onto a second enemy starts that enemy's multiple-hits location table walk over
            // rather than inheriting the original target's position in it.
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (flag off) vs tsconfig.json (flag on)
            hit.location = additionalHitLocations()[initialHit][hitNumber <= 5 ? hitNumber : 5] ?? DEFAULT_HIT_LOCATION;
        }

        // Determine Righteous Fury Effects
        for (const righteousFury of hit.righteousFury) {
            const rfTotal = righteousFury.roll.total ?? 0;
            // eslint-disable-next-line no-await-in-loop -- sequential by design (see above)
            righteousFury.effect = (await getCriticalDamage(hit.damageType, hit.location, rfTotal, attackData.rollData.sourceActor.system?.gameSystem)) ?? '';
        }

        return hit;
    }

    _totalDamage(): void {
        this.totalDamage = this.damage + Object.values(this.modifiers).reduce((a, b) => a + b, 0);
    }

    /**
     * Resolve damage that depends on the attack (#608) — the range band the measured
     * distance falls in, a fresh draw on the weapon's damage table, or the profile of
     * the weapon it borrows from — and record its provenance for the card. The
     * profile's qualities join the attack's (idempotently: the attack stage already
     * bridged a band's or a mount's), and a table result's text becomes an effect.
     * A no-op for a weapon whose damage is its own fixed profile.
     */
    async resolveProfile(attackData: AttackDataLike): Promise<void> {
        const rollData = attackData.rollData;
        const system = rollData.weapon?.system;
        if (system?.resolveContextualDamage === undefined) return;
        const tableUuid = system.damageTableUuid ?? '';
        const context: DamageProfileContext = { distance: rollData.distance ?? 0, tableDraw: null };
        let profile: ResolvedDamageProfile | null;
        if (tableUuid === '') {
            profile = system.resolveContextualDamage(context);
        } else {
            const tableDraw = await drawDamageTable(tableUuid);
            profile =
                tableDraw === null
                    ? {
                          formula: '',
                          type: system.damage?.type ?? 'impact',
                          penetration: 0,
                          qualities: [],
                          addsStrengthBonus: false,
                          provenance: { kind: 'table-missing' },
                      }
                    : system.resolveContextualDamage({ ...context, tableDraw });
        }
        if (profile === null) return;

        this.profile = profile;
        this.damageType = profile.type;
        this.profileLabel = describeDamageProvenance(profile.provenance);
        // The weapon and the rule that chose its damage, then every component that rule sets (#693).
        this.profileTooltip = prepareModifierTooltipData(
            damageProfileTooltipTitle(rollData.weapon?.name ?? '', profile.provenance),
            damageProfileComponents(profile, (id) => weaponQualityLabel(id, parseQualityLevel(id).level)),
        );
        rollData.addAttackQualities?.(profile.qualities);
        if (profile.provenance.kind === 'table' && profile.provenance.text !== '') this.addEffect(profile.provenance.tableName, profile.provenance.text);
    }

    /**
     * Additive pass for data-driven dynamic modifier hooks (Direction #7): collect
     * the attacker's damage / penetration hooks that fire for this hit and merge
     * them into the modifier maps, so a talent's or quality's contribution comes
     * from its declared `dynamicModifiers` data rather than a name match hardcoded
     * here. A no-op when no owned item declares a hook (legacy content). Only
     * `add`-mode components are merged; `multiply` / `set` need a base-value context
     * handled by the dedicated quality collectors. Runs before {@link _totalDamage}
     * / {@link _totalPenetration}, so the merged values are summed into the totals.
     */
    async applyDynamicModifiers(attackData: AttackDataLike): Promise<void> {
        const sourceActor = attackData.rollData.sourceActor;
        const items = sourceActor.items;
        if (items === undefined) return;
        const charBonus = buildCharBonus(sourceActor);
        const ctx: DynamicModifierContext = {
            charBonus,
            charTotal: {},
            dos: attackData.rollData.dos,
            pr: 0,
            cb: 0,
            level: 0,
            penetration: this.penetration,
            armourPoints: 0,
        };
        const situation = buildAttackSituation(attackData, { isCrit: this.righteousFury.length > 0 });
        warnInertTriggers(items, situation);
        for (const component of collectDynamicComponents(items, ctx, situation)) {
            if (component.side !== 'attacker') continue;
            if (component.target !== 'damage' && component.target !== 'penetration') continue;
            let value = component.value;
            if (component.valueFormula !== '') {
                const roll = new Roll(component.valueFormula, {});
                // eslint-disable-next-line no-await-in-loop -- sequential: each dice-valued hook rolls its own magnitude
                await roll.evaluate();
                value = roll.total ?? 0;
            }
            const isPen = component.target === 'penetration';
            // multiply/set are expressed as an additive delta against the base
            // (this.damage / this.penetration); min/max are stat clamps and don't map here.
            const delta = modeDelta(component.mode, isPen ? this.penetration : this.damage, value);
            if (delta === null) continue;
            addLabelledModifier(isPen ? this.penetrationModifiers : this.modifiers, component.label, delta);
        }
    }

    /**
     * Add the attacker's always-on `modifiers.combat.damage` / `.penetration`
     * (Path A — talents, traits, conditions and equipped gear) to this hit, one
     * sourced entry per item so the damage card names where each point came from.
     * Recorded by `creature.ts` in `modifierSources.combat`; until this read, no
     * roll consumed them.
     */
    applyPassiveCombatModifiers(attackData: AttackDataLike): void {
        const sources = attackData.rollData.sourceActor.system?.modifierSources;
        for (const [label, value] of Object.entries(passiveCombatModifiers(sources, 'damage'))) {
            addLabelledModifier(this.modifiers, label, value);
        }
        for (const [label, value] of Object.entries(passiveCombatModifiers(sources, 'penetration'))) {
            addLabelledModifier(this.penetrationModifiers, label, value);
        }
    }

    /**
     * Apply the DH2 "replace a damage die with Degrees of Success" option
     * to this hit's damage roll. Adjusts the
     * dice-sum base by the delta and recomputes the damage total. Returns
     * true when a die was replaced. (#129)
     */
    replaceDamageDieWithDoS(dos: number, dieIndex?: number): boolean {
        if (this.damageRoll === undefined) return false;
        const dice: DamageDieResult[] = [];
        // eslint-disable-next-line no-restricted-syntax -- boundary: Roll.terms is untyped at runtime; narrowing term shape manually
        for (const term of this.damageRoll.terms as unknown[]) {
            const termResults = (term as { results?: DamageDieResult[] }).results;
            if (Array.isArray(termResults)) dice.push(...termResults);
        }
        const outcome = replaceDamageDieWithDoS(dice, dos, dieIndex);
        if (outcome === null) return false;
        this.damage += outcome.delta;
        this._totalDamage();
        return true;
    }

    _totalPenetration(): void {
        this.totalPenetration = this.penetration + Object.values(this.penetrationModifiers).reduce((a, b) => a + b, 0);
    }

    /**
     * Land this hit on a vehicle (content#28). The first hit reads the line's
     * Vehicle Hit Locations table on the reversed attack roll; each extra hit on the
     * same vehicle, and every hit spread onto a second one, rolls a fresh d100
     * (DH2 core). A line with one chart
     * strikes the Hull. Righteous Fury rolls the vehicle's die (1d5, or a trait's,
     * e.g. Ramshackle's 1d10) on the struck location's chart instead of a creature's
     * Critical Effects table, and is not Critical damage.
     * @param attackRoll  The attack's d100 total, or null with no attack roll.
     * @param hitNumber   This hit's index on its target.
     * @param vehicle     The vehicle as the attack path saw it.
     */
    async strikeVehicle(attackRoll: number | null, hitNumber: number, vehicle: VehicleTargetProfile): Promise<void> {
        const bands = vehicle.rules.hitLocations;
        // The attack card names the same location (#682), off the same reading.
        const reversed = reversedTableRoll(vehicle, hitNumber, attackRoll);
        let tableRoll = 0;
        let kind: VehicleTableRollKind = 'none';
        if (reversed !== null) {
            tableRoll = reversed;
            kind = 'reversed';
        } else if (bands !== null) {
            const fresh = new Roll(FRESH_LOCATION_DIE, {});
            await fresh.evaluate();
            tableRoll = fresh.total ?? 0;
            kind = 'fresh';
        }
        const strike = strikeFor(vehicle, vehicleHitLocation(tableRoll, bands, vehicle.mounts, vehicle.facing), kind);
        this.location = strike.location;
        const unaffectedBy = vehicle.critMultiplier !== null && vehicle.critExcludesRighteousFury ? vehicle.critMultiplierSources.join(', ') : '';
        for (const fury of this.righteousFury) {
            if (vehicle.righteousFuryDie !== vehicle.rules.righteousFuryDie) {
                const traitDie = new Roll(vehicle.righteousFuryDie, {});
                // eslint-disable-next-line no-await-in-loop -- sequential by design: each trigger rolls its own die on the chart
                await traitDie.evaluate();
                fury.roll = traitDie;
            }
            const rolled = fury.roll.total ?? 0;
            // A vehicle's Righteous Fury is a chart row, stated in the card's vehicle rows.
            fury.effect = '';
            strike.righteousFury.push({
                die: vehicle.righteousFuryDie,
                dieSource: vehicle.righteousFuryDieSource,
                rolled,
                value: righteousFuryChartValue(rolled, vehicle.critMultiplier, vehicle.critExcludesRighteousFury),
                unaffectedBy,
            });
        }
        this.vehicleStrike = strike;
    }

    /**
     * @param attackData {AttackData}
     * @returns {Promise<void>}
     */
    // eslint-disable-next-line complexity -- legacy damage calculation method; extracted path requires full refactor tracked separately
    async _calculateDamage(attackData: AttackDataLike): Promise<void> {
        const actionItem = attackData.rollData.weapon ?? attackData.rollData.power;
        if (!actionItem) return;
        const sourceActor = attackData.rollData.sourceActor;

        // Get RF threshold from weapon qualities (Gauss=9, Vengeful=8, standard=10)
        // eslint-disable-next-line no-restricted-syntax -- boundary: getRighteousFuryThreshold takes a typed weapon; actionItem is a minimal interface bridge
        let righteousFuryThreshold = getRighteousFuryThreshold(actionItem as unknown as Parameters<typeof getRighteousFuryThreshold>[0]);

        // Legacy support: check for Vengeful in attackSpecials (attack-specials.mjs)
        if (attackData.rollData.hasAttackSpecial('Vengeful')) {
            const vengefulLevel = attackData.rollData.getAttackSpecial('Vengeful').level;
            if (vengefulLevel && vengefulLevel < righteousFuryThreshold) {
                righteousFuryThreshold = vengefulLevel;
            }
            game.wh40k.log('_calculateDamage has vengeful: ', righteousFuryThreshold);
        }

        // A profile resolved at attack time (#608) replaces the weapon's own.
        // eslint-disable-next-line no-restricted-syntax -- boundary: system.damage may be a string formula in legacy data (pre-schema migration)
        let rollFormula = this.profile?.formula ?? actionItem.system.effectiveDamageFormula ?? actionItem.system.damage?.formula ?? actionItem.system.damage;
        if (rollFormula === undefined || typeof rollFormula !== 'string' || rollFormula === '') {
            rollFormula = '0';
        }
        const casterValues = psychicFormulaValues(attackData);
        if (casterValues !== null) rollFormula = resolvePsychicFormulaTerms(rollFormula, casterValues);
        // eslint-disable-next-line no-restricted-syntax -- boundary: Roll constructor type differs between Foundry v13/v14 runtime and shipped types
        const damageRoll = new Roll(rollFormula, attackData.rollData) as unknown as Roll;
        this.damageRoll = damageRoll;

        // Descriptor-driven weapon-quality die operations (#303). Each quality declares
        // its own `dieOps` on its compendium doc (Direction #7) — the engine no longer
        // name-matches Tearing / Proven / Primitive here. The attack specials already
        // carry the weapon's own quality set (bridged by `updateAttackSpecials`), so a
        // quality a weapon mod, las mode or un-chosen firing option removed stays removed.
        const dieOps = collectWeaponQualityDieOps(attackData.rollData.attackSpecials, sourceActor.system?.gameSystem);

        // Pre-evaluation pass: the dice pool can only be changed while the Roll is
        // still unevaluated, so `keepHighest` (Tearing) is term surgery, not a modifier.
        const keepHighestOps = dieOps.filter((dieOp) => dieOp.phase === 'preEvaluate' && dieOp.op === 'keepHighest');
        if (keepHighestOps.length > 0) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Roll.terms is typed as RollTerm[] but runtime may include untyped dice; cast needed for instanceof check
            const dieTerms = (damageRoll.terms as unknown[]).filter((term): term is foundry.dice.terms.Die => term instanceof foundry.dice.terms.Die);
            for (const dieOp of keepHighestOps) {
                for (const die of dieTerms) {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: foundry.dice.terms.Die's public type does not expose the mutable `number` / `modifiers` pair DieTermLike narrows to
                    if (applyKeepHighestToDie(die as unknown as DieTermLike, dieOp.extraDice)) {
                        game.wh40k.log(`Modifying dice due to ${dieOp.quality}`);
                    }
                }
            }
        }

        // Post-evaluation ops (Proven floor / Primitive cap) are PER-DIE: each die below
        // the floor (or above the cap) contributes its own adjustment, so the deltas
        // ACCUMULATE across a multi-die weapon. The arithmetic lives in the pure,
        // unit-tested resolvers rather than being open-coded here.
        const perDieOps = dieOps.filter((dieOp) => dieOp.phase === 'postEvaluate');

        await damageRoll.evaluate();
        game.wh40k.log('Damage Roll', damageRoll);

        this.damage = damageRoll.total ?? 0;

        // A helpless target (a condition with `helplessTarget`) takes damage rolled
        // twice and ADDED together — every line prints it that way (DH2 p229, RT/DW
        // p248, OW p253, BC p245, DH1 p199). The second roll re-uses the first's
        // formula AFTER the dice-pool surgery above, so Tearing etc. apply to both;
        // it is a named, sourced modifier so the card shows where it came from.
        if (attackData.rollData.targetHelpless === true) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Roll constructor type differs between Foundry v13/v14 runtime and shipped types
            const secondRoll = new Roll(damageRoll.formula, attackData.rollData) as unknown as Roll;
            await secondRoll.evaluate();
            const secondDamage = Math.max(0, secondRoll.total ?? 0);
            if (secondDamage > 0) addLabelledModifier(this.modifiers, t('WH40K.Condition.HelplessTarget.DamageLabel'), secondDamage);
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: Roll.terms is untyped at runtime; iterating as unknown[] to narrow manually
        for (const term of damageRoll.terms as unknown[]) {
            const termAny = term as { results?: { discarded?: boolean; active?: boolean; result?: number }[] };
            if (!termAny.results) continue;
            for (const result of termAny.results) {
                game.wh40k.log('_calculateDamage result:', result);
                if (result.discarded === true || result.active !== true) continue;
                if ((result.result ?? 0) >= righteousFuryThreshold) {
                    // Righteous fury hit
                    const righteousFuryRoll = new Roll('1d5', {});
                    // eslint-disable-next-line no-await-in-loop -- sequential by design: each RF roll is tied to a specific die result
                    await righteousFuryRoll.evaluate();
                    this.righteousFury.push({ roll: righteousFuryRoll, effect: '' });

                    // Deathdealer (crit-gated +full Perception Bonus) → data-driven via the
                    // talent's dynamicModifiers hook (when: onCrit, specializationMode),
                    // applied by applyDynamicModifiers once RF/crit is detected. Direction #7.
                }

                for (const dieOp of perDieOps) {
                    const adjust = resolveDieOpDamageAdjust(result.result ?? 0, dieOp);
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: modifiers[key] may be undefined despite Record<string, number> type
                    if (adjust !== 0) this.modifiers[dieOp.modifierKey] = (this.modifiers[dieOp.modifierKey] ?? 0) + adjust;
                }
            }
        }

        // Melee damage adds the wielder's Strength Bonus, and so does a melee weapon's
        // damage borrowed by a ranged one (#608: a Magna-Grapple hits as the fist does).
        if (actionItem.isMelee || this.profile?.addsStrengthBonus === true) {
            // Effective Strength Bonus so a fatigued / buffed character's melee damage
            // reflects it — the canonical #415 case. For an unmodified character
            // effectiveBonus == bonus, so the common case is unchanged.
            const strength = sourceActor.getCharacteristicFuzzy('Strength');
            this.modifiers['strength bonus'] = strength.effectiveBonus ?? strength.bonus;

            // Crushing Blow → data-driven via the talent's dynamicModifiers hook
            // (applied by applyDynamicModifiers). See Direction #7.

            // Deathdealer: the always-on +ceil(PerB/2) here was NOT RAW (the talent grants
            // +full Perception Bonus only on a Critical, handled by the onCrit hook). Removed.
        }
        if (!actionItem.isMelee && actionItem.isRanged) {
            // Scatter
            if (attackData.rollData.hasAttackSpecial('Scatter')) {
                if (attackData.rollData.rangeName === 'Point Blank') {
                    this.modifiers['scatter'] = 3;
                } else if (attackData.rollData.rangeName !== 'Short Range') {
                    this.modifiers['scatter'] = -3;
                }
            }

            // Add Accurate
            if (attackData.rollData.action === 'Standard Attack' || attackData.rollData.action === 'Called Shot') {
                if (attackData.rollData.hasAttackSpecial('Accurate')) {
                    if (attackData.rollData.dos >= 3) {
                        const accurateRoll = new Roll('1d10', {});
                        await accurateRoll.evaluate();
                        this.modifiers['accurate'] = accurateRoll.total ?? 0;
                    }
                    if (attackData.rollData.dos >= 5) {
                        const accurateRoll = new Roll('1d10', {});
                        await accurateRoll.evaluate();
                        this.modifiers['accurate x 2'] = accurateRoll.total ?? 0;
                    }
                }
            }

            // Eye of Vengeance → data-driven via the talent's dynamicModifiers hook
            // (condition: activated), applied by applyDynamicModifiers. Direction #7.

            // Las Modes
            if (attackData.rollData.hasAttackSpecial('Overcharge')) {
                this.modifiers['overcharge'] = 1;
            } else if (attackData.rollData.hasAttackSpecial('Overload')) {
                this.modifiers['overload'] = 2;
            }

            // Maximal: its bonus damage dice are the quality's authored mechanics
            // (`maximalDamageDice`), not a literal here (Direction #7).
            const maximalDice = resolveMaximalEffect(attackData.rollData.sourceActor.system?.gameSystem).bonusDamageDice;
            if (attackData.rollData.hasAttackSpecial('Maximal') && maximalDice !== '') {
                const maximalRoll = new Roll(maximalDice, {});
                await maximalRoll.evaluate();
                this.modifiers['maximal'] = maximalRoll.total ?? 0;
            }

            // Mighty Shot → data-driven via the talent's dynamicModifiers hook
            // (applied by applyDynamicModifiers). See Direction #7.

            // Deathdealer: the always-on +ceil(PerB/2) here was NOT RAW (crit-only +full
            // Perception Bonus via the onCrit hook). Removed.

            // Ammo damage delta / override is applied upstream by the weapon's
            // `effectiveDamageFormula` getter (#ammo-system, Direction #7) — no
            // name-match here, and no double-count with the base damage roll.
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: AttackDataLike is a minimal interface; rule functions expect full ActionData which satisfies it at runtime
        calculateWeaponModifiersDamageBonuses(attackData as unknown as Parameters<typeof calculateWeaponModifiersDamageBonuses>[0], this);

        // Exotic quality damage bonuses (Force, Witch-Edge, Daemonbane)
        const exoticModifiers = calculateExoticQualityDamageModifiers({
            // eslint-disable-next-line no-restricted-syntax -- boundary: actionItem is a minimal interface; exotic function expects full weapon type
            weapon: actionItem as unknown as Parameters<typeof calculateExoticQualityDamageModifiers>[0]['weapon'],
            // eslint-disable-next-line no-restricted-syntax -- boundary: sourceActor is typed as minimal interface; exotic function expects full actor
            actor: sourceActor as unknown as Parameters<typeof calculateExoticQualityDamageModifiers>[0]['actor'],
            target: attackData.damageData?.targetActor as Parameters<typeof calculateExoticQualityDamageModifiers>[0]['target'],
        });

        // Handle exotic modifiers - most are numeric, but Daemonbane is a dice formula.
        // Each is filed on the card under its localized label (the id stays internal).
        for (const id of EXOTIC_DAMAGE_MODIFIER_IDS) {
            const value = exoticModifiers[id];
            const label = t(EXOTIC_DAMAGE_MODIFIER_LABEL_KEYS[id]);
            if (typeof value === 'string' && value.includes('d')) {
                // Daemonbane: "2d10" - roll additional dice
                const exoticRoll = new Roll(value, {});
                // eslint-disable-next-line no-await-in-loop -- sequential by design (see above)
                await exoticRoll.evaluate();
                this.modifiers[label] = exoticRoll.total ?? 0;
            } else if (typeof value === 'number') {
                // Force, Witch-Edge: numeric bonuses
                this.modifiers[label] = value;
            }
        }
    }

    // eslint-disable-next-line complexity -- legacy penetration calculation method; extracted path requires full refactor tracked separately
    async _calculatePenetration(attackData: AttackDataLike): Promise<void> {
        const actionItem = attackData.rollData.weapon ?? attackData.rollData.power;
        if (!actionItem) return;

        // A penetration printed as a value of the user ("PR") is authored as a formula and wins,
        // unless a profile resolved at attack time (#608) replaced the weapon's own.
        const authoredFormula = this.profile === null ? actionItem.system.damage?.penetrationFormula : '';
        // eslint-disable-next-line no-restricted-syntax -- boundary: penetration may be a number or Roll formula string from legacy data; union cannot be expressed in the minimal interface
        const declaredPenetration =
            this.profile?.penetration ?? actionItem.system.effectivePenetration ?? actionItem.system.damage?.penetration ?? actionItem.system.penetration;
        const rollFormula = typeof authoredFormula === 'string' && authoredFormula !== '' ? authoredFormula : declaredPenetration;
        if (typeof rollFormula === 'number' && Number.isInteger(rollFormula)) {
            this.penetration = rollFormula;
        } else if (rollFormula === '') {
            this.penetration = 0;
        } else {
            this.hasPenetrationRoll = true;
            const casterValues = psychicFormulaValues(attackData);
            const penFormula = casterValues !== null ? resolvePsychicFormulaTerms(String(rollFormula), casterValues) : String(rollFormula);
            try {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Roll constructor type differs between Foundry v13/v14 runtime and shipped types
                const penRoll = new Roll(penFormula, attackData.rollData) as unknown as Roll;
                this.penetrationRoll = penRoll;
                await penRoll.evaluate();
                this.penetration = penRoll.total ?? 0;
            } catch {
                ui.notifications.warn(game.i18n.localize('WH40K.Warning.PenetrationFormulaFailed'));
                this.penetration = 0;
            }
        }

        // Melee: Lance (Pen × DoS) is applied by calculateQualityPenetrationModifiers
        // below as the additive delta basePen × (DoS − 1). The old inline branch
        // added basePen × DoS under 'lance', which then suppressed the collector's
        // entry — so a Lance hit totalled Pen × (DoS + 1).
        // Razor Sharp Penetration is likewise applied by that collector. The old
        // inline branch matched a mis-spelled 'Razer Sharp' quality that never fired
        // (canonical is 'Razor Sharp') — removed (#303).
        // Hammer Blow Penetration → data-driven via the talent's dynamicModifiers
        // hook (applied by applyDynamicModifiers). See Direction #7. The separate
        // Concussive-quality grant it also confers is handled below.
        if (actionItem.isRanged && !actionItem.isMelee) {
            if (attackData.rollData.hasAttackSpecial('Maximal')) {
                this.penetrationModifiers['maximal'] = resolveMaximalEffect(attackData.rollData.sourceActor.system?.gameSystem).bonusPenetration;
            }

            // Las Modes
            if (attackData.rollData.hasAttackSpecial('Overload')) {
                this.penetrationModifiers['overload'] = 2;
            }

            // Ammo penetration delta / override is applied upstream by the weapon's
            // `effectivePenetration` getter (#ammo-system) — no name-match, no double-count.
        }

        // Eye of Vengeance Penetration → data-driven via the talent's dynamicModifiers
        // hook (condition: activated), applied by applyDynamicModifiers. Direction #7.

        // Melta short-range Penetration is applied by calculateQualityPenetrationModifiers
        // below. The old inline branch here double-counted it under a separate 'melta'
        // key alongside the collector's 'Melta' — removed (#303).

        // Quality-based penetration modifiers (Melta + Razor Sharp via weapon qualities)
        const qualityPenModifiers = calculateQualityPenetrationModifiers({
            // eslint-disable-next-line no-restricted-syntax -- boundary: actionItem is a minimal interface; quality function expects full weapon type
            weapon: actionItem as unknown as Parameters<typeof calculateQualityPenetrationModifiers>[0]['weapon'],
            rangeName: attackData.rollData.rangeName,
            basePenetration: this.penetration,
            dos: attackData.rollData.dos,
        });

        // Apply quality modifiers (merge with existing to avoid duplication)
        // eslint-disable-next-line no-restricted-syntax -- boundary: calculateQualityPenetrationModifiers returns a typed object; cast needed because return type is not inferred as Record<string,number>
        for (const [key, value] of Object.entries(qualityPenModifiers as Record<string, number>)) {
            const lowerKey = key.toLowerCase();
            // Only apply if not already applied via attackSpecials
            if (!this.penetrationModifiers[lowerKey]) {
                this.penetrationModifiers[key] = value;
            }
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: AttackDataLike is a minimal interface; rule functions expect full ActionData which satisfies it at runtime
        calculateWeaponModifiersPenetrationBonuses(attackData as unknown as Parameters<typeof calculateWeaponModifiersPenetrationBonuses>[0], this);
    }

    // eslint-disable-next-line complexity -- legacy specials calculation method with per-special switch; extracted path requires full refactor tracked separately
    _calculateSpecials(attackData: AttackDataLike): void {
        const actionItem = attackData.rollData.weapon ?? attackData.rollData.power;
        if (!actionItem) return;
        const sourceActor = attackData.rollData.sourceActor;

        // Prefer the weapon's mode-aware damage type (#430) — a beam-vs-blade weapon
        // deals a different type per firing mode; falls back to the base damage type.
        // A profile resolved at attack time (#608) carries its own type.
        const effectiveType = (actionItem.system as { effectiveDamageType?: string }).effectiveDamageType;
        this.damageType = this.profile?.type ?? effectiveType ?? actionItem.system.damage?.type ?? actionItem.system.damageType ?? 'Impact';

        // Conditional weapon-quality grants (Direction #7, §D8) — e.g. Hammer Blow
        // adding Concussive (2) [DH2/OW/BC] or Shocking [DW/DH1] on an All-Out
        // Attack. Read from each talent's `grantedEffects` data (per line) rather
        // than name-matched here, so the correct quality applies per game line.
        const grantSituation = buildAttackSituation(attackData, { isCrit: this.righteousFury.length > 0 });
        for (const granted of collectGrantedQualities(sourceActor.items ?? [], grantSituation)) {
            if (attackData.rollData.attackSpecials.some((s) => s.name === granted.name)) continue;
            attackData.rollData.attackSpecials.push({ name: granted.name, level: granted.level });
        }

        if (actionItem.isRanged) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: AttackDataLike is a minimal interface; rule functions expect full ActionData which satisfies it at runtime
            calculateAmmoSpecials(attackData as unknown as Parameters<typeof calculateAmmoSpecials>[0], this);
        }

        for (const special of attackData.rollData.attackSpecials) {
            const level = special.level ?? 0;
            // Each quality's chat text lives in the langpack; the level fills its test modifier, radius or damage.
            const testModifier = level * -10;
            const effectBuilders: Record<string, () => string> = {
                blast: () => t('WH40K.Quality.Blast.ChatEffect', { radius: level }),
                concussive: () => t('WH40K.Quality.Concussive.ChatEffect', { modifier: testModifier }),
                corrosive: () => t('WH40K.Quality.Corrosive.ChatEffect'),
                crippling: () => t('WH40K.Quality.Crippling.ChatEffect', { damage: level }),
                felling: () => t('WH40K.Quality.Felling.ChatEffect', { reduction: level }),
                flame: () => t('WH40K.Quality.Flame.Description'),
                graviton: () => t('WH40K.Quality.Graviton.ChatEffect'),
                hallucinogenic: () => t('WH40K.Quality.Hallucinogenic.ChatEffect', { modifier: testModifier }),
                haywire: () => t('WH40K.Quality.Haywire.ChatEffect', { radius: level * 10 }),
                indirect: () => {
                    const bsChar = sourceActor.getCharacteristicFuzzy('ballisticSkill');
                    return t('WH40K.Quality.Indirect.ChatEffect', {
                        ballisticSkillBonus: bsChar.effectiveBonus ?? bsChar.bonus,
                        direction: scatterDirection(),
                    });
                },
                shocking: () => t('WH40K.Quality.Shocking.Description'),
                snare: () => t('WH40K.Quality.Snare.ChatEffect', { modifier: testModifier }),
                toxic: () =>
                    t('WH40K.Quality.Toxic.ChatEffect', {
                        modifier: testModifier,
                        // eslint-disable-next-line no-restricted-syntax -- boundary: system.damageType may be undefined on legacy/minimal items; fallback required
                        damageType: actionItem.system.damageType ?? 'Impact',
                    }),
                warp: () => t('WH40K.Quality.Warp.ChatEffect'),
            };
            const builder = effectBuilders[special.name.toLowerCase()];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.json (strict) types this access as `(() => string) | undefined` and requires the guard; ESLint reads tsconfig.test.json where the flag is off
            if (builder !== undefined) this.addEffect(special.name, builder());
        }
    }

    addEffect(name: string, effect: string): void {
        this.effects.push({
            name: name,
            effect: effect,
        });
    }
}

export class WeaponDamageData extends DamageData {
    constructor() {
        super();
        this.template = 'systems/wh40k-rpg/templates/chat/weapon-roll-chat.hbs';
    }
}

export class PsychicDamageData extends DamageData {
    constructor() {
        super();
        this.template = 'systems/wh40k-rpg/templates/chat/weapon-roll-chat.hbs';
    }
}
