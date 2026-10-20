/**
 * @file Abstract base class for game system configurations.
 * Each WH40K RPG game line provides a concrete subclass.
 */

import type { AcquisitionLadder } from '../../rules/acquisition-ladder.ts';
import { type ArmourCraftsmanshipTable, NO_ARMOUR_CRAFTSMANSHIP } from '../../rules/armour-craftsmanship.ts';
import type { BurstActionRules, BurstCapRules } from '../../rules/auto-fire.ts';
import { DISPOSITION_MODELS } from '../../rules/disposition.ts';
import type { EvasionRules } from '../../rules/evasion.ts';
import { FATIGUE_MODES } from '../../rules/fatigue.ts';
import type { GrappleDamageRule, GrappleOptionRule, GrapplePushRule, GrappleRules } from '../../rules/grapple.ts';
import type { InquestRules } from '../../rules/inquest.ts';
import type { ItemRepairRules } from '../../rules/item-repair.ts';
import type { ComradeRules } from '../../rules/ow-comrade.ts';
import type { ComradeOrderDef } from '../../rules/ow-orders.ts';
import { grantsPsychicPowers, type PsykerUnlock } from '../../rules/psyker-unlock.ts';
import type { VehicleCombatRules, VehicleHitLocationBand } from '../../rules/vehicle-damage.ts';
import type { VehicleDrivingRules, VehicleTestSkill } from '../../rules/vehicle-trait-tests.ts';
import type { WeaponModificationRules } from '../../rules/weapon-modification.ts';
import type {
    GameSystemId,
    SkillRankDef,
    CharacteristicTierDef,
    DispositionModelDef,
    FatePointUseDef,
    FatigueModelDef,
    OriginStepConfig,
    AdvanceCostResult,
    AdvanceOption,
    SidebarHeaderField,
    SystemConfigActor,
    SystemTheme,
} from './types.ts';

/**
 * The Grapple action's option lists as DH2, RT, BC, DW and OW print them, word for
 * word but for the Slip Free skill (#120; DH2 core pp. 221–222, RT core / BC core /
 * DW core / OW core "Grapple"). The controller has Damage Opponent, Throw Down
 * Opponent, Push Opponent, Stand (each an Opposed Strength test), Ready and Use Item
 * (no test). The grappled target has Break Free and Take Control (Opposed Strength)
 * and Slip Free ("a Challenging (+0) <skill> test").
 * @param slipFreeSkill  The skill the line's Slip Free tests.
 */
function printedGrappleOptions(slipFreeSkill: string): GrappleOptionRule[] {
    const opposed = { kind: 'opposed-strength' } as const;
    return [
        { id: 'damage-opponent', role: 'controller', test: opposed },
        { id: 'throw-down-opponent', role: 'controller', test: opposed },
        { id: 'push-opponent', role: 'controller', test: opposed },
        { id: 'ready', role: 'controller', test: { kind: 'declare' } },
        { id: 'stand', role: 'controller', test: opposed },
        { id: 'use-item', role: 'controller', test: { kind: 'declare' } },
        { id: 'break-free', role: 'target', test: opposed },
        { id: 'slip-free', role: 'target', test: { kind: 'skill', skill: slipFreeSkill, modifier: 0 } },
        { id: 'take-control', role: 'target', test: opposed },
    ];
}

/**
 * Damage Opponent as DH2 (core p. 221), RT, BC, DW and OW print it: the unarmed
 * hit lands on the opponent's "Body location", with "one level of Fatigue".
 */
const PRINTED_GRAPPLE_DAMAGE: GrappleDamageRule = { location: 'body', fatigue: 1 };

/**
 * Push Opponent as DH2 (core p. 221), RT, BC, DW and OW print it: "one metre …
 * plus one additional metre for each degree of success", capped at "the active
 * character's Half Move distance".
 */
const PRINTED_GRAPPLE_PUSH: GrapplePushRule = { baseMetres: 1, metresPerDegree: 1, capAtHalfMove: true };

/** The grapple rules a line printing the full option lists has, with its Slip Free skill and thrown-down bonus. */
export function printedGrappleRules(slipFreeSkill: string, thrownDownBonus: number): GrappleRules {
    return { options: printedGrappleOptions(slipFreeSkill), thrownDownBonus, damage: PRINTED_GRAPPLE_DAMAGE, push: PRINTED_GRAPPLE_PUSH };
}

/**
 * The fitting rule DH1, RT and OW print word for word: "A character with the
 * Trade (Armourer) skill may upgrade weapons by making a successful test" (DH1
 * core Weapon Upgrades; RT core p. 133; OW core Weapon Upgrades). No modifier,
 * no failure consequence, no removal test (#136).
 */
export const TRADE_ARMOURER_FITTING_RULES: WeaponModificationRules = {
    fitSkill: { skill: 'trade', specialisation: 'Armourer' },
    availabilityModifier: false,
    partsLostOnFailure: false,
    damagesWeaponAtDegreesOfFailure: null,
    removalSkill: null,
    xenos: null,
    // DH1 / RT / OW print no requisition bonus for taking a modification as parts.
    partsRequisitionBonus: null,
};

/** One specialist skill a line's driver tests, as its skill chapter names it. */
function driving(skill: string, specialisation: string): VehicleTestSkill {
    return { skill, specialisation };
}

/**
 * Operate as DH2 (core p. 111), OW (core p. 128) and BC (core pp. 105–106) print
 * it, word for word: Operate (Surface) covers "any vehicle that primarily
 * operates on the surface of a planet. Groundcars, walkers, treaded vehicles,
 * boats, and skimmers"; Operate (Aeronautica) "any vehicle that operates in three
 * dimensions", atmospheric fliers and small voidcraft; Operate (Voidship) "large
 * void-faring vessels" (DH2 core p. 112). An emplacement is never driven, and the
 * books print nothing for a submersible.
 */
export const OPERATE_VEHICLE_DRIVING: VehicleDrivingRules = {
    immobile: null,
    wheeled: driving('operate', 'Surface'),
    tracked: driving('operate', 'Surface'),
    walker: driving('operate', 'Surface'),
    hover: driving('operate', 'Surface'),
    skimmer: driving('operate', 'Surface'),
    flyer: driving('operate', 'Aeronautica'),
    vtol: driving('operate', 'Aeronautica'),
    hull: driving('operate', 'Surface'),
    submersible: null,
    hydrofoil: driving('operate', 'Surface'),
    voidship: driving('operate', 'Voidship'),
};

/**
 * Drive and Pilot as RT (core pp. 81, 84) and DW (core pp. 98, 103) print them:
 * Drive's skill groups are Ground Vehicle, Skimmer/Hover and Walker ("land-based,
 * hover, or skimmer-type vehicles"); Pilot's are Personal, Flyers and Space Craft.
 * Neither skill covers boats, so a watercraft has no printed driving test.
 */
export const DRIVE_PILOT_VEHICLE_DRIVING: VehicleDrivingRules = {
    immobile: null,
    wheeled: driving('drive', 'Ground Vehicle'),
    tracked: driving('drive', 'Ground Vehicle'),
    walker: driving('drive', 'Walker'),
    hover: driving('drive', 'Skimmer/Hover'),
    skimmer: driving('drive', 'Skimmer/Hover'),
    flyer: driving('pilot', 'Flyers'),
    vtol: driving('pilot', 'Flyers'),
    hull: null,
    submersible: null,
    hydrofoil: null,
    voidship: driving('pilot', 'Space Craft'),
};

/**
 * The Vehicle Hit Locations table DH2 (core p. 254, Table 7-29) and OW (core
 * p. 276, Table 8-24) print with the same bands, read on the reversed attack roll.
 */
const PRINTED_VEHICLE_HIT_LOCATIONS: readonly VehicleHitLocationBand[] = [
    { max: 20, location: 'motive' },
    { max: 60, location: 'hull' },
    { max: 80, location: 'weapon' },
    { max: 100, location: 'turret' },
];

/**
 * Attacking vehicles on a line printing a hit-location table and one chart per
 * location (DH2, OW). OW also prints that Righteous Fury needs the hit to damage
 * the vehicle (core p. 276); DH2 does not.
 */
export function locatedVehicleCombat(righteousFuryNeedsDamage: boolean): VehicleCombatRules {
    return { hitLocations: PRINTED_VEHICLE_HIT_LOCATIONS, righteousFuryDie: '1d5', righteousFuryNeedsDamage };
}

/**
 * Attacking vehicles on a line printing one Vehicle Critical Hit Chart and no
 * hit-location table (RT Into the Storm p. 178; DW Rites of Battle p. 169, which
 * adds that Righteous Fury needs the hit to damage the vehicle).
 */
export function singleChartVehicleCombat(righteousFuryNeedsDamage: boolean): VehicleCombatRules {
    return { hitLocations: null, righteousFuryDie: '1d5', righteousFuryNeedsDamage };
}

export abstract class BaseSystemConfig {
    /** Canonical system identifier */
    abstract readonly id: GameSystemId;

    /** Human-readable system name (localization key) */
    abstract readonly label: string;

    /** CSS class applied to system-specific sheets */
    abstract readonly cssClass: string;

    /**
     * Per-system color tokens (Tailwind palette names). Read by the
     * `themeClassFor(role)` helper in `./index.ts` to emit per-system
     * utility classes on shared templates.
     */
    abstract readonly theme: SystemTheme;

    /** Whether this system uses aptitude-based cost calculations */
    abstract readonly usesAptitudes: boolean;

    /** Whether this system uses career-based advance tables */
    abstract readonly usesCareerTables: boolean;

    /**
     * Whether gaining every 10 Corruption Points forces a Malignancy Test
     * against the Corruption Track (DH1 / DH2 / OW / RT core rules).
     */
    abstract readonly usesMalignancyTest: boolean;

    /**
     * Whether a successful Malefic Daemonology manifestation costs the psyker
     * Corruption equal to the Psy Rating used (DH2 Enemies Beyond p. 56). Only
     * lines whose rule has been verified opt in.
     */
    abstract readonly maleficCorruptionOnManifest: boolean;

    /**
     * The line's printed availability / craftsmanship modifier ladder for its
     * acquisition test (Requisition, Logistics, Infamy, Profit Factor), or
     * `null` when the line has no availability-modified test (#192).
     */
    abstract readonly acquisitionLadder: AcquisitionLadder | null;

    /**
     * The line's printed Inquest tables (DH2 Enemies Within pp. 62–69, #90), or
     * `null` for a line that prints no Inquest rules. A non-null value is what
     * turns on the Party Overview Inquest panel and tracker.
     */
    abstract readonly inquestRules: InquestRules | null;

    /**
     * The line's printed item-repair rule (DH2 core p. 142: Table 5–2 repair
     * modifier + destruction on a bad failure, #444; plus the Enemies Without
     * xenos step, #136), or `null` for a line whose book leaves the Tech-Use
     * repair difficulty to the GM.
     */
    abstract readonly itemRepair: ItemRepairRules | null;

    /**
     * The line's printed rule for fitting a weapon modification personally
     * (DH2 core p. 162 / Enemies Without p. 42; DH1 / RT / OW "a successful
     * Trade (Armourer) test", #136), or `null` for a line that prints no
     * fitting test (DW folds the labour into the Requisition cost; BC prints
     * none).
     */
    abstract readonly weaponModification: WeaponModificationRules | null;

    /**
     * The skill a driver tests for each means of locomotion, as the line's skill
     * chapter prints it (content#28): an Operate, Drive or Pilot specialisation.
     * `null` for a line whose driving skills are not modelled.
     */
    abstract readonly vehicleDriving: VehicleDrivingRules | null;

    /**
     * The line's printed burst ceiling (#607): whether a Semi-Auto / Full Auto
     * Burst caps the TOTAL or only the EXTRA hits at the rate of fire, what
     * Suppressing Fire caps, and whether Storm doubles the ceiling. `null` for a
     * line that prints no rate-of-fire bursts.
     */
    abstract readonly burstRules: BurstCapRules | null;

    /**
     * The line's printed Semi-Auto / Full Auto Burst rules (#607): each burst's
     * to-hit modifier and action cost, or `null` for a line that prints no
     * rate-of-fire bursts.
     */
    abstract readonly burstActions: BurstActionRules | null;

    /**
     * The line's printed evasion rule for multi-hit attacks (#414): which attacks
     * a degree of success on a Dodge / Parry thins out, and whether Storm makes
     * it two hits a degree. `null` for a line whose evasion is modelled only as
     * the single negated hit.
     */
    abstract readonly evasionRules: EvasionRules | null;

    /**
     * The line's printed Grapple action (#120): each side's options and how each
     * is tested, and the bonus a thrown-down opponent gives the controller. `null`
     * for a line whose grapple this panel does not model.
     */
    abstract readonly grappleRules: GrappleRules | null;

    /**
     * The line's printed Comrades in Combat rules (#152): Cohesion radius, the
     * Comrade's action budget, and the mental damage that kills it. `null` for a
     * line without Comrades (only Only War prints them).
     */
    readonly comradeRules: ComradeRules | null = null;

    /** The Orders any PC can give its Comrade (#152); empty for a line without Comrades. */
    readonly comradeOrders: readonly ComradeOrderDef[] = [];

    /**
     * The line's printed rules for attacking vehicles (content#28): its hit-location
     * table, if any, and its Righteous Fury rule. A line printing no vehicle combat
     * of its own still takes facing armour and Structural Integrity loss; every hit
     * strikes the Hull and no chart is read unless its packs carry one.
     */
    readonly vehicleCombat: VehicleCombatRules = singleChartVehicleCombat(false);

    /**
     * What each armour craftsmanship tier does in this line (#679): Good's AP
     * against the first attack each round, Best's AP at every covered location,
     * half weight and Poor's Agility penalty. The armour soak, the armour item and
     * Only War's craftsmanship panel all read this one table. A line printing no
     * armour craftsmanship gets none.
     */
    readonly armourCraftsmanship: ArmourCraftsmanshipTable = NO_ARMOUR_CRAFTSMANSHIP;

    // ── Starting Resources ────────────────────────────────────────

    /** Starting XP for a new character in this system */
    get startingXP(): number {
        return 0;
    }

    // ── Skill Ranks ──────────────────────────────────────────────

    /** Ordered skill rank definitions for this system; `label`/`tooltip` are langpack keys. */
    abstract getSkillRanks(): SkillRankDef[];

    /**
     * {@link getSkillRanks} with `label`/`tooltip` localized — the form every UI
     * consumer reads. Call at render time (the langpack is not loaded when sheet
     * classes are defined).
     */
    getLocalizedSkillRanks(): SkillRankDef[] {
        return this.getSkillRanks().map((rank) => ({ ...rank, label: game.i18n.localize(rank.label), tooltip: game.i18n.localize(rank.tooltip) }));
    }

    /** Maximum skill rank (3 for RT/DH1e/DW, 4 for DH2e/BC/OW) */
    get skillRankCount(): number {
        return this.getSkillRanks().length;
    }

    // ── Characteristic Tiers ─────────────────────────────────────

    /** Ordered characteristic advancement tier definitions */
    abstract getCharacteristicTiers(): CharacteristicTierDef[];

    /** Tier key array (convenience) */
    get characteristicTierOrder(): string[] {
        return this.getCharacteristicTiers().map((t) => t.key);
    }

    // ── Origin Path ──────────────────────────────────────────────

    /** Origin path step configuration for this system */
    abstract getOriginStepConfig(): OriginStepConfig;

    // ── Advancement Costs ────────────────────────────────────────

    /**
     * Compute the XP cost for the next characteristic advance.
     * @param actor       The character actor
     * @param charKey     Characteristic key (e.g. 'fellowship')
     * @param currentTier Number of advances already purchased (0-based)
     * @returns Cost result, or null if maxed
     */
    abstract getCharacteristicAdvanceCost(actor: SystemConfigActor, charKey: string, currentTier: number): AdvanceCostResult | null;

    /**
     * Compute the XP cost for advancing a skill to its next rank.
     * @param actor       The character actor
     * @param skillKey    Skill system key
     * @param currentRank Current skill rank (0 = untrained)
     * @param context     Optional system-specific context
     * @returns Cost in XP, or null if not advanceable
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: context is a system-specific extension point; concrete types are defined by each system's implementation
    abstract getSkillAdvanceCost(actor: SystemConfigActor, skillKey: string, currentRank: number, context?: Record<string, unknown>): number | null;

    /**
     * Compute the XP cost for acquiring a talent.
     * @param actor   The character actor
     * @param talent  Talent data (with aptitudes, tier, etc.)
     * @param context Optional system-specific context
     * @returns Cost in XP, or null if not available
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: talent and context are system-specific extension points; concrete types vary per system
    abstract getTalentAdvanceCost(actor: SystemConfigActor, talent: unknown, context?: Record<string, unknown>): number | null;

    /**
     * Get the list of advances available to a character.
     * Career-based systems return a career-filtered list.
     * Aptitude-based systems return empty (all skills/talents available, costs computed dynamically).
     */
    abstract getAvailableAdvances(actor: SystemConfigActor): AdvanceOption[];

    // ── Psyker Gating ────────────────────────────────────────────

    /**
     * The origin-path step at which this line's characters become psykers, or
     * null where the line has none (DH2: an elite advance; BC: an archetype;
     * OW: a speciality). Which origin it is lives on the compendium document as
     * `system.grantsPsychicPowers` (#681); the step only tells the advancement
     * dialog's locked banner where to send the player (#680).
     */
    readonly psykerUnlock: PsykerUnlock | null = null;

    /**
     * Whether this character is a psyker in the current system: it owns an
     * origin-path item flagged `grantsPsychicPowers` (#681). Drives the
     * purchases on the advancement dialog's Psychic Powers tab. A line with no
     * {@link psykerUnlock} has no psykers by origin.
     */
    isPsyker(actor: SystemConfigActor): boolean {
        return this.psykerUnlock !== null && actor.items.some((i) => i.isOriginPath && grantsPsychicPowers(i.system));
    }

    // ── Skill Visibility ─────────────────────────────────────────

    /**
     * Get the set of skill keys visible for this game system.
     * Skills not in this set are hidden on the character sheet.
     * The schema contains all skills from all systems; this filters to the relevant ones.
     */
    abstract getVisibleSkills(): Set<string>;

    // ── Sidebar Header Fields ────────────────────────────────────

    /**
     * Get the field rows that populate the player sheet sidebar identity panel
     * (Player / Home World / Career / Rank for DH2e, Patron / Faction / Role / Endeavour for IM, etc.).
     * Implementations should return strings that match the existing per-system shape so the form parser
     * (which is path-sensitive on `name=`) keeps writing into the same schema slots.
     */
    abstract getHeaderFields(actor: SystemConfigActor): SidebarHeaderField[];

    /**
     * Build a single header-field row. All systems share the same shape; this helper is the only
     * place the row defaults live so per-system configs stay declarative.
     */
    protected makeField(
        label: string,
        name: string,
        value: string | number,
        placeholder: string = label,
        type: SidebarHeaderField['type'] = 'text',
    ): SidebarHeaderField {
        return {
            label,
            name,
            type,
            value,
            placeholder,
            ...(name === 'system.rank' ? { inputClass: 'wh40k-rank-input' } : {}),
        };
    }

    /**
     * The "Player" row that prefixes every system's header field list.
     */
    protected makePlayerField(actor: SystemConfigActor): SidebarHeaderField {
        const playerName = actor.system.bio?.playerName;
        return this.makeField(
            game.i18n.localize('WH40K.Character.Player'),
            'system.bio.playerName',
            typeof playerName === 'string' ? playerName : '',
            'Player Name',
        );
    }

    /**
     * Read a field from the character's originPath as a string or number, coercing
     * missing or non-scalar values to the empty string. Centralized so per-system
     * header builders don't repeat the same null-safety dance against the freeform
     * `originPath` record.
     */
    protected readOriginPathField(actor: SystemConfigActor, key: string): string | number {
        const source = actor.system.originPath;
        if (source == null) return '';
        const value = source[key];
        if (typeof value === 'string' || typeof value === 'number') return value;
        return '';
    }

    /**
     * Build one origin-path header row declaratively (#298): localizes `labelKey`, targets the
     * `system.originPath.{originKey}` schema slot (the form parser is path-sensitive on `name=`),
     * and reads the current value via {@link readOriginPathField}. Lets each per-system
     * `getHeaderFields` be a flat row list with no `readOriginPathField` closure and no repeated
     * `system.originPath.` prefix. Placeholder defaults to the label (via {@link makeField}).
     */
    protected makeOriginField(actor: SystemConfigActor, labelKey: string, originKey: string): SidebarHeaderField {
        return this.makeField(game.i18n.localize(labelKey), `system.originPath.${originKey}`, this.readOriginPathField(actor, originKey));
    }

    // ── UI Labels ─────────────────────────────────────────────────

    /**
     * Short labels for step navigation buttons.
     * Default implementation uses i18n keys: WH40K.OriginPath.Short.{StepKey}
     * Override in subclasses only if the i18n keys are insufficient.
     */
    getStepShortLabels(): Record<string, string> {
        const config = this.getOriginStepConfig();
        const labels: Record<string, string> = {};
        const allSteps = [...config.coreSteps];
        if (config.optionalStep) allSteps.push(config.optionalStep);
        if (config.equipmentStep) allSteps.push(config.equipmentStep);

        for (const step of allSteps) {
            const key = `WH40K.OriginPath.Short.${step.key}`;
            const localized = game.i18n.localize(key);
            labels[step.key] = localized !== key ? localized : step.key;
        }
        return labels;
    }

    // ── Fate Point Uses ──────────────────────────────────────────

    /**
     * Canonical list of ways a Fate Point can be spent in this game system.
     * The default returns the DH2e core uses (which match BC / OW / DW / DH1e
     * within minor wording differences and are a safe baseline for RT and IM
     * until a per-system override lands). Subclasses override to surface
     * system-specific entries (e.g. IM's Patron Boons).
     */
    getFatePointUses(): FatePointUseDef[] {
        return [
            { key: 'reroll', label: 'WH40K.FateUses.RerollTitle', description: 'WH40K.FateUses.RerollDesc', icon: 'fa-dice-d10' },
            { key: 'addBonus', label: 'WH40K.FateUses.AddBonusTitle', description: 'WH40K.FateUses.AddBonusDesc', icon: 'fa-plus' },
            { key: 'countHit', label: 'WH40K.FateUses.CountHitTitle', description: 'WH40K.FateUses.CountHitDesc', icon: 'fa-crosshairs' },
            { key: 'recoverWounds', label: 'WH40K.FateUses.RecoverWoundsTitle', description: 'WH40K.FateUses.RecoverWoundsDesc', icon: 'fa-heart' },
            { key: 'recoverStun', label: 'WH40K.FateUses.RecoverStunTitle', description: 'WH40K.FateUses.RecoverStunDesc', icon: 'fa-bolt' },
            { key: 'survive', label: 'WH40K.FateUses.SurviveTitle', description: 'WH40K.FateUses.SurviveDesc', icon: 'fa-skull', burn: true },
        ];
    }

    // ── Fatigue Model (#114) ─────────────────────────────────────

    /**
     * The line's RAW fatigue rule set. The default is the `flat` model
     * (RT / OW / BC — a single −10 for any fatigue, threshold TB, no death,
     * 6-hour full recovery). DH1/DH2 override to `halving`, IM to `condition`,
     * DW to the flat model with faster recovery + drop-one-level waking. The
     * active model can be overridden at runtime by the world "fatigue mode"
     * setting via `resolveFatigueModel`.
     */
    getFatigueModel(): FatigueModelDef {
        return FATIGUE_MODES.flat;
    }

    /**
     * The line's RAW Disposition rule set (#73). The default is `none` (IM has
     * no Disposition rule); DH2 overrides to the 0–100 characteristic, the other
     * FFG lines to their seven-step ladder.
     */
    getDispositionModel(): DispositionModelDef {
        return DISPOSITION_MODELS.none;
    }

    // ── Skill Level Mapping ──────────────────────────────────────

    /**
     * Map an origin path skill level string to a numeric rank.
     * Handles both RT ('trained','plus10','plus20') and
     * DH2e ('known','trained','experienced','veteran') terminology.
     */
    static skillLevelToRank(level: string): number {
        const map: Record<string, number> = {
            known: 1,
            trained: 1,
            plus10: 2,
            experienced: 3,
            plus20: 3,
            veteran: 4,
            plus30: 4,
        };
        return map[level] ?? 0;
    }
}
