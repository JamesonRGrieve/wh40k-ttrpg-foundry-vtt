/**
 * WH40K RPG System Configuration
 * Central configuration object for the WH40K RPG RPG system.
 */

import { getDegreeForMode, isD100Success, resolveDegreesMethod } from './rolls/roll-helpers.ts';
import { getWeaponQualityHasLevel, getWeaponQualityMechanics, weaponQualityDescKey, weaponQualityLabelKey } from './rules/weapon-quality-payloads.ts';
import { capitalize } from './utils/format.ts';

/* -------------------------------------------- */
/*  Config Type Definitions                     */
/* -------------------------------------------- */

export interface LabelConfig {
    label: string;
}
export interface LabelAbbreviationConfig {
    label: string;
    abbreviation: string;
}
export interface LabelModifierConfig {
    label: string;
    modifier: number;
}
interface LabelDescriptionConfig {
    label: string;
    description: string;
}
interface LabelIconConfig {
    label: string;
    icon: string;
}

interface MovementTypeConfig {
    label: string;
    icon: string;
    order: number;
}
interface BodyLocationConfig {
    label: string;
    roll: string;
    icon: string;
}
interface HullTypeConfig {
    label: string;
    space: number;
    speed: number;
}
interface OriginPathStepConfig {
    label: string;
    index: number;
}
interface VehicleTypeConfig {
    label: string;
    icon: string;
}
interface VehicleSizeConfig {
    label: string;
    modifier: number;
    descriptor: string;
}

/**
 * A weapon quality's display definition (#303). No longer a hand-authored table:
 * `getQualityDefinition` derives `label`/`description` langpack keys from the
 * identifier and reads `hasLevel`/`mechanicalEffect`/`category` from the
 * weaponQuality compendium via the boot index (Direction #7).
 */
interface WeaponQualityDefinition {
    label: string;
    description: string;
    hasLevel: boolean;
    category?: string;
    mechanicalEffect?: boolean;
}

interface CombatActionConfig {
    key: string;
    label: string;
    type: string;
    description: string;
    icon: string;
    subtypes: string[];
    /** Talent key the actor needs to take this action — used at render time to disable
        and tooltip-explain entries the actor doesn't yet qualify for. */
    requiresTalent?: string;
    /** True if the action is only available to psykers (any actor with psy rating > 0
        or any psychic power item). */
    requiresPsyker?: boolean;
}

interface CraftsmanshipRuleEffect {
    toHit?: number;
    damage?: number;
    qualities?: string[];
    removeQualities?: string[];
    agility?: number;
    firstAttackBonus?: number;
    armourBonus?: number;
    weight?: number;
    overloadRange?: [number, number];
}

interface CraftsmanshipRules {
    weapon: {
        melee: Record<string, CraftsmanshipRuleEffect>;
        ranged: Record<string, CraftsmanshipRuleEffect>;
    };
    armour: Record<string, CraftsmanshipRuleEffect>;
    gear: Record<string, CraftsmanshipRuleEffect>;
    forceField: Record<string, CraftsmanshipRuleEffect>;
}

interface DegreesResult {
    success: boolean;
    roll: number;
    target: number;
    degrees: number;
    label: string;
}

interface CareerConfig {
    label: string;
    description?: string;
}

/** A per-line acquisition currency, surfaced to economy plugins (Item Piles). */
export interface CurrencyConfig {
    /** i18n label key. */
    label: string;
    /** Short symbol, e.g. 'tg', 'Inf'. */
    abbreviation: string;
    /** Owning game line id. */
    line: string;
    /** Item-cost path this currency reads, e.g. 'system.cost.dh2.influence'. */
    costPath: string;
    /** Actor field holding a character's amount of this currency (the wallet). */
    walletPath: string;
    /** The throne-gelt baseline currency, mirrored to system.price. */
    primary?: boolean;
}

export interface WH40KSystemConfig {
    characteristics: Record<string, LabelAbbreviationConfig>;
    /** Combat bonus categories a talent/effect can grant (attack/damage/penetration/defense/initiative/speed). */
    combatBonuses: Record<string, LabelConfig>;
    /** Derived resource pools a talent/effect can modify (wounds/fate/insanity/corruption). */
    resources: Record<string, LabelConfig>;
    availabilities: Record<string, LabelModifierConfig>;
    currencies: Record<string, CurrencyConfig>;
    movementTypes: Record<string, MovementTypeConfig>;
    tokenRulerColors: Record<string, number>;
    craftsmanships: Record<string, LabelModifierConfig>;
    craftsmanshipRules: CraftsmanshipRules;
    gearCategories: Record<string, LabelIconConfig>;
    damageTypes: Record<string, LabelAbbreviationConfig>;
    weaponClasses: Record<string, LabelConfig>;
    weaponTypes: Record<string, LabelConfig>;
    armourTypes: Record<string, LabelConfig>;
    armourProperties: Record<string, LabelDescriptionConfig>;
    bodyLocations: Record<string, BodyLocationConfig>;
    sizes: Record<number, LabelModifierConfig>;
    psychicDisciplines: Record<string, LabelConfig>;
    hullTypes: Record<string, HullTypeConfig>;
    shipComponentTypes: Record<string, LabelConfig>;
    originPathSteps: Record<string, OriginPathStepConfig>;
    careers: Record<string, CareerConfig>;
    talentCategories: Record<string, LabelConfig>;
    traitCategories: Record<string, LabelConfig>;
    actionTypes: Record<string, LabelConfig>;
    npcTypes: Record<string, LabelConfig>;
    vehicleTypes: Record<string, VehicleTypeConfig>;
    vehicleClasses: Record<string, LabelConfig>;
    vehicleSizes: Record<number, VehicleSizeConfig>;
    vehicleUpgradeTypes: Record<string, LabelConfig>;
    vehicleStats: Record<string, LabelAbbreviationConfig>;
    difficulties: Record<string, LabelModifierConfig>;
    calculateDegrees: (roll: number, target: number) => DegreesResult;
    defaultIcons: Record<string, string>;
    skillIcons: Record<string, string>;
    getSkillIcon: (skillKey: string) => string;
    getDefaultIcon: (type: string) => string;
    getQualityDefinition: (identifier: string) => WeaponQualityDefinition | null;
    getQualityLabel: (identifier: string, level?: number | null) => string;
    getQualityDescription: (identifier: string) => string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: getJamThreshold accepts any weapon doc shape; caller knows the concrete type but this interface is shared across all systems
    getJamThreshold: (weapon: unknown) => number | null;
    combatActions: Record<string, CombatActionConfig[]>;
    advancementTiers: Record<string, OriginPathStepConfig>;
    tierOrder: string[];
}

export const WH40K = {} as WH40KSystemConfig;

/* -------------------------------------------- */
/*  Characteristics                             */
/* -------------------------------------------- */

/**
 * The set of characteristics used in the system.
 * @type {Object<string, {label: string, abbreviation: string}>}
 */
WH40K.characteristics = {
    weaponSkill: { label: 'WH40K.Characteristic.WeaponSkill', abbreviation: 'WS' },
    ballisticSkill: { label: 'WH40K.Characteristic.BallisticSkill', abbreviation: 'BS' },
    strength: { label: 'WH40K.Characteristic.Strength', abbreviation: 'S' },
    toughness: { label: 'WH40K.Characteristic.Toughness', abbreviation: 'T' },
    agility: { label: 'WH40K.Characteristic.Agility', abbreviation: 'Ag' },
    intelligence: { label: 'WH40K.Characteristic.Intelligence', abbreviation: 'Int' },
    perception: { label: 'WH40K.Characteristic.Perception', abbreviation: 'Per' },
    willpower: { label: 'WH40K.Characteristic.Willpower', abbreviation: 'WP' },
    fellowship: { label: 'WH40K.Characteristic.Fellowship', abbreviation: 'Fel' },
    influence: { label: 'WH40K.Characteristic.Influence', abbreviation: 'Inf' },
};

/**
 * Combat bonus categories a talent or effect can grant. Single source for the
 * labels that talent sheets / editors previously hard-coded inline (#286).
 */
WH40K.combatBonuses = {
    attack: { label: 'WH40K.Combat.AttackBonus' },
    damage: { label: 'WH40K.Combat.DamageBonus' },
    penetration: { label: 'WH40K.Combat.Penetration' },
    defense: { label: 'WH40K.Combat.DefenseBonus' },
    initiative: { label: 'WH40K.Combat.Initiative' },
    speed: { label: 'WH40K.Combat.MovementSpeed' },
};

/**
 * Derived resource pools a talent or effect can modify. Single source for the
 * labels that talent sheets / editors previously hard-coded inline (#286).
 */
WH40K.resources = {
    wounds: { label: 'WH40K.Resource.Wounds' },
    fate: { label: 'WH40K.Resource.FatePoints' },
    insanity: { label: 'WH40K.Resource.InsanityThreshold' },
    corruption: { label: 'WH40K.Resource.CorruptionThreshold' },
};

/* -------------------------------------------- */
/*  Availability                                */
/* -------------------------------------------- */

/**
 * Item availability ratings.
 * @type {Object<string, {label: string, modifier: number}>}
 */
WH40K.availabilities = {
    'ubiquitous': { label: 'WH40K.Availability.Ubiquitous', modifier: 70 },
    'abundant': { label: 'WH40K.Availability.Abundant', modifier: 50 },
    'plentiful': { label: 'WH40K.Availability.Plentiful', modifier: 30 },
    'common': { label: 'WH40K.Availability.Common', modifier: 20 },
    'average': { label: 'WH40K.Availability.Average', modifier: 10 },
    'scarce': { label: 'WH40K.Availability.Scarce', modifier: 0 },
    'rare': { label: 'WH40K.Availability.Rare', modifier: -10 },
    'very-rare': { label: 'WH40K.Availability.VeryRare', modifier: -20 },
    'extremely-rare': { label: 'WH40K.Availability.ExtremelyRare', modifier: -30 },
    'near-unique': { label: 'WH40K.Availability.NearUnique', modifier: -50 },
    'unique': { label: 'WH40K.Availability.Unique', modifier: -70 },
};

/* -------------------------------------------- */
/*  Currencies (per-line acquisition + Item Piles integration)  */
/* -------------------------------------------- */

/**
 * Per-line acquisition currencies. `throne` is the universal baseline
 * (DH1's native price and every other line's homebrew gelt) mirrored to the
 * derived `system.price`; the rest are each line's RAW acquisition stat.
 * Consumed by the Item Piles integration and documented in docs/VALUATION.md.
 */
WH40K.currencies = {
    throne: {
        label: 'WH40K.Currency.ThroneGelt',
        abbreviation: 'tg',
        line: 'dh1',
        costPath: 'system.cost.dh1.throneGelt',
        walletPath: 'system.throneGelt',
        primary: true,
    },
    influence: { label: 'WH40K.Currency.Influence', abbreviation: 'Inf', line: 'dh2', costPath: 'system.cost.dh2.influence', walletPath: 'system.influence' },
    profitFactor: {
        label: 'WH40K.Currency.ProfitFactor',
        abbreviation: 'PF',
        line: 'rt',
        costPath: 'system.cost.rt.profitFactor',
        walletPath: 'system.rogueTrader.profitFactor.current',
    },
    requisition: {
        label: 'WH40K.Currency.Requisition',
        abbreviation: 'Req',
        line: 'dw',
        costPath: 'system.cost.dw.requisition',
        walletPath: 'system.requisition',
    },
    infamy: { label: 'WH40K.Currency.Infamy', abbreviation: 'Ifm', line: 'bc', costPath: 'system.cost.bc.infamy', walletPath: 'system.infamy' },
    logistics: {
        label: 'WH40K.Currency.Logistics',
        abbreviation: 'Log',
        line: 'ow',
        costPath: 'system.cost.ow.logistics',
        walletPath: 'system.logisticsRating',
    },
};

/* -------------------------------------------- */
/*  Movement Types                              */
/* -------------------------------------------- */

/**
 * Movement types for token movement actions.
 * Maps to the movement values calculated in creature.mjs _prepareMovement().
 * @type {Object<string, {label: string, icon: string, order: number}>}
 */
WH40K.movementTypes = {
    half: {
        label: 'WH40K.MOVEMENT.Type.Half',
        icon: 'fa-solid fa-person-walking',
        order: 1,
    },
    full: {
        label: 'WH40K.MOVEMENT.Type.Full',
        icon: 'fa-solid fa-person-walking-arrow-right',
        order: 2,
    },
    charge: {
        label: 'WH40K.MOVEMENT.Type.Charge',
        icon: 'fa-solid fa-person-running',
        order: 3,
    },
    run: {
        label: 'WH40K.MOVEMENT.Type.Run',
        icon: 'fa-solid fa-person-running-fast',
        order: 4,
    },
};

/**
 * Colors used to denote movement speed on ruler segments & grid highlighting.
 * @enum {number}
 */
WH40K.tokenRulerColors = {
    normal: 0x33bc4e,
    double: 0xf1d836,
    triple: 0xe72124,
};

/* -------------------------------------------- */
/*  Craftsmanship                               */
/* -------------------------------------------- */

/**
 * Item craftsmanship levels.
 * @type {Object<string, {label: string, modifier: number}>}
 */
WH40K.craftsmanships = {
    poor: { label: 'WH40K.Craftsmanship.Poor', modifier: -10 },
    common: { label: 'WH40K.Craftsmanship.Common', modifier: 0 },
    good: { label: 'WH40K.Craftsmanship.Good', modifier: 5 },
    best: { label: 'WH40K.Craftsmanship.Best', modifier: 10 },
    exceptional: { label: 'WH40K.Craftsmanship.Exceptional', modifier: 0 }, // Astartes-grade
    master: { label: 'WH40K.Craftsmanship.Master', modifier: 0 }, // Master-crafted Astartes
};

/**
 * Centralized craftsmanship rules for all item types.
 * Defines mechanical effects per craftsmanship tier per item type.
 * @type {Object}
 */
WH40K.craftsmanshipRules = {
    weapon: {
        melee: {
            poor: { toHit: -10 },
            common: {},
            good: { toHit: 5 },
            best: { toHit: 10, damage: 1 },
            exceptional: { toHit: 5, damage: 1 }, // Astartes
            master: { toHit: 10, damage: 2 }, // Master Astartes
        },
        ranged: {
            poor: { qualities: ['unreliable'] },
            common: {},
            good: { qualities: ['reliable'], removeQualities: ['unreliable'] },
            best: { qualities: ['reliable'], removeQualities: ['unreliable', 'overheats'] },
            exceptional: { qualities: ['reliable'], removeQualities: ['unreliable'] }, // Astartes
            master: { qualities: ['reliable'], removeQualities: ['unreliable', 'overheats'] }, // Master Astartes
        },
    },
    armour: {
        poor: { agility: -10 },
        common: {},
        good: { firstAttackBonus: 1 }, // +1 AP on first attack per round
        best: { armourBonus: 1, weight: 0.5 }, // +1 AP permanent, half weight
        exceptional: {}, // No special Astartes armour rules
        master: {}, // No special Astartes armour rules
    },
    gear: {
        poor: { weight: 1.1 }, // +10% weight
        common: {},
        good: { weight: 0.9 }, // -10% weight
        best: { weight: 0.8 }, // -20% weight
        exceptional: { weight: 0.9 }, // Same as good
        master: { weight: 0.8 }, // Same as best
    },
    forceField: {
        // Overload ranges by craftsmanship
        poor: { overloadRange: [1, 20] }, // 01-20
        common: { overloadRange: [1, 10] }, // 01-10
        good: { overloadRange: [1, 5] }, // 01-05
        best: { overloadRange: [1, 1] }, // 01 only (1% chance)
        exceptional: { overloadRange: [1, 5] }, // Same as good
        master: { overloadRange: [1, 1] }, // Same as best
    },
};

/* -------------------------------------------- */
/*  Gear Categories                             */
/* -------------------------------------------- */

/**
 * Gear item categories with icons and labels.
 * @type {Object<string, {label: string, icon: string}>}
 */
WH40K.gearCategories = {
    general: { label: 'WH40K.GearCategory.General', icon: 'fa-box' },
    tools: { label: 'WH40K.GearCategory.Tools', icon: 'fa-wrench' },
    drugs: { label: 'WH40K.GearCategory.Drugs', icon: 'fa-flask' },
    consumable: { label: 'WH40K.GearCategory.Consumable', icon: 'fa-fire' },
    clothing: { label: 'WH40K.GearCategory.Clothing', icon: 'fa-shirt' },
    survival: { label: 'WH40K.GearCategory.Survival', icon: 'fa-tent' },
    communications: { label: 'WH40K.GearCategory.Communications', icon: 'fa-satellite-dish' },
    detection: { label: 'WH40K.GearCategory.Detection', icon: 'fa-radar' },
    medical: { label: 'WH40K.GearCategory.Medical', icon: 'fa-briefcase-medical' },
    tech: { label: 'WH40K.GearCategory.Tech', icon: 'fa-microchip' },
    religious: { label: 'WH40K.GearCategory.Religious', icon: 'fa-cross' },
    luxury: { label: 'WH40K.GearCategory.Luxury', icon: 'fa-gem' },
    contraband: { label: 'WH40K.GearCategory.Contraband', icon: 'fa-skull-crossbones' },
};

/* -------------------------------------------- */
/*  Damage Types                                */
/* -------------------------------------------- */

/**
 * Damage types.
 * @type {Object<string, {label: string, abbreviation: string}>}
 */
WH40K.damageTypes = {
    impact: { label: 'WH40K.DamageType.Impact', abbreviation: 'I' },
    rending: { label: 'WH40K.DamageType.Rending', abbreviation: 'R' },
    explosive: { label: 'WH40K.DamageType.Explosive', abbreviation: 'X' },
    energy: { label: 'WH40K.DamageType.Energy', abbreviation: 'E' },
    fire: { label: 'WH40K.DamageType.Fire', abbreviation: 'F' },
    shock: { label: 'WH40K.DamageType.Shock', abbreviation: 'S' },
    cold: { label: 'WH40K.DamageType.Cold', abbreviation: 'C' },
    toxic: { label: 'WH40K.DamageType.Toxic', abbreviation: 'T' },
};

/* -------------------------------------------- */
/*  Weapon Classes                              */
/* -------------------------------------------- */

/**
 * Weapon classes (usage patterns only).
 * Technology types (chain, power, shock, force) are in weaponTypes.
 * @type {Object<string, {label: string}>}
 */
WH40K.weaponClasses = {
    melee: { label: 'WH40K.WeaponClass.Melee' },
    pistol: { label: 'WH40K.WeaponClass.Pistol' },
    basic: { label: 'WH40K.WeaponClass.Basic' },
    heavy: { label: 'WH40K.WeaponClass.Heavy' },
    thrown: { label: 'WH40K.WeaponClass.Thrown' },
    exotic: { label: 'WH40K.WeaponClass.Exotic' },
};

/**
 * Weapon types.
 * @type {Object<string, {label: string}>}
 */
WH40K.weaponTypes = {
    'primitive': { label: 'WH40K.WeaponType.Primitive' },
    'las': { label: 'WH40K.WeaponType.Las' },
    'solid-projectile': { label: 'WH40K.WeaponType.SolidProjectile' },
    'bolt': { label: 'WH40K.WeaponType.Bolt' },
    'melta': { label: 'WH40K.WeaponType.Melta' },
    'plasma': { label: 'WH40K.WeaponType.Plasma' },
    'flame': { label: 'WH40K.WeaponType.Flame' },
    'launcher': { label: 'WH40K.WeaponType.Launcher' },
    'explosive': { label: 'WH40K.WeaponType.Explosive' },
    'power': { label: 'WH40K.WeaponType.Power' },
    'chain': { label: 'WH40K.WeaponType.Chain' },
    'shock': { label: 'WH40K.WeaponType.Shock' },
    'force': { label: 'WH40K.WeaponType.Force' },
    'exotic': { label: 'WH40K.WeaponType.Exotic' },
    'xenos': { label: 'WH40K.WeaponType.Xenos' },
};

/* -------------------------------------------- */
/*  Armour Types                                */
/* -------------------------------------------- */

/**
 * Armour types.
 * @type {Object<string, {label: string}>}
 */
WH40K.armourTypes = {
    'flak': { label: 'WH40K.ArmourType.Flak' },
    'mesh': { label: 'WH40K.ArmourType.Mesh' },
    'carapace': { label: 'WH40K.ArmourType.Carapace' },
    'power': { label: 'WH40K.ArmourType.Power' },
    'light-power': { label: 'WH40K.ArmourType.LightPower' },
    'storm-trooper': { label: 'WH40K.ArmourType.StormTrooper' },
    'feudal-world': { label: 'WH40K.ArmourType.FeudalWorld' },
    'primitive': { label: 'WH40K.ArmourType.Primitive' },
    'xenos': { label: 'WH40K.ArmourType.Xenos' },
    'void': { label: 'WH40K.ArmourType.Void' },
    'enforcer': { label: 'WH40K.ArmourType.Enforcer' },
    'hostile-environment': { label: 'WH40K.ArmourType.HostileEnvironment' },
};

/**
 * Armour special properties.
 * @type {Object<string, {label: string, description: string}>}
 */
WH40K.armourProperties = {
    'sealed': {
        label: 'WH40K.ArmourProperty.Sealed',
        description: 'WH40K.ArmourProperty.SealedDesc',
    },
    'auto-stabilized': {
        label: 'WH40K.ArmourProperty.AutoStabilized',
        description: 'WH40K.ArmourProperty.AutoStabilizedDesc',
    },
    'hexagrammic': {
        label: 'WH40K.ArmourProperty.Hexagrammic',
        description: 'WH40K.ArmourProperty.HexagrammicDesc',
    },
    'blessed': {
        label: 'WH40K.ArmourProperty.Blessed',
        description: 'WH40K.ArmourProperty.BlessedDesc',
    },
    'camouflage': {
        label: 'WH40K.ArmourProperty.Camouflage',
        description: 'WH40K.ArmourProperty.CamouflageDesc',
    },
    'lightweight': {
        label: 'WH40K.ArmourProperty.Lightweight',
        description: 'WH40K.ArmourProperty.LightweightDesc',
    },
    'reinforced': {
        label: 'WH40K.ArmourProperty.Reinforced',
        description: 'WH40K.ArmourProperty.ReinforcedDesc',
    },
    'agility-bonus': {
        label: 'WH40K.ArmourProperty.AgilityBonus',
        description: 'WH40K.ArmourProperty.AgilityBonusDesc',
    },
    'strength-bonus': {
        label: 'WH40K.ArmourProperty.StrengthBonus',
        description: 'WH40K.ArmourProperty.StrengthBonusDesc',
    },
};

/* -------------------------------------------- */
/*  Body Locations                              */
/* -------------------------------------------- */

/**
 * Body hit locations.
 * @type {Object<string, {label: string, roll: string, icon: string}>}
 */
WH40K.bodyLocations = {
    head: { label: 'WH40K.BodyLocation.Head', roll: '1-10', icon: 'fa-head-side' },
    rightArm: { label: 'WH40K.BodyLocation.RightArm', roll: '11-20', icon: 'fa-hand' },
    leftArm: { label: 'WH40K.BodyLocation.LeftArm', roll: '21-30', icon: 'fa-hand' },
    body: { label: 'WH40K.BodyLocation.Body', roll: '31-70', icon: 'fa-person' },
    rightLeg: { label: 'WH40K.BodyLocation.RightLeg', roll: '71-85', icon: 'fa-socks' },
    leftLeg: { label: 'WH40K.BodyLocation.LeftLeg', roll: '86-100', icon: 'fa-socks' },
};

/* -------------------------------------------- */
/*  Size Categories                             */
/* -------------------------------------------- */

/**
 * Creature size categories.
 * @type {Object<number, {label: string, modifier: number}>}
 */
WH40K.sizes = {
    1: { label: 'WH40K.Size.Miniscule', modifier: -30 },
    2: { label: 'WH40K.Size.Puny', modifier: -20 },
    3: { label: 'WH40K.Size.Scrawny', modifier: -10 },
    4: { label: 'WH40K.Size.Average', modifier: 0 },
    5: { label: 'WH40K.Size.Hulking', modifier: 10 },
    6: { label: 'WH40K.Size.Enormous', modifier: 20 },
    7: { label: 'WH40K.Size.Massive', modifier: 30 },
    8: { label: 'WH40K.Size.Immense', modifier: 40 },
    9: { label: 'WH40K.Size.Monumental', modifier: 50 },
    10: { label: 'WH40K.Size.Titanic', modifier: 60 },
};

/* -------------------------------------------- */
/*  Psychic Disciplines                         */
/* -------------------------------------------- */

/**
 * Psychic power disciplines.
 * @type {Object<string, {label: string}>}
 */
WH40K.psychicDisciplines = {
    telepathy: { label: 'WH40K.PsychicDiscipline.Telepathy' },
    telekinesis: { label: 'WH40K.PsychicDiscipline.Telekinesis' },
    divination: { label: 'WH40K.PsychicDiscipline.Divination' },
    pyromancy: { label: 'WH40K.PsychicDiscipline.Pyromancy' },
    biomancy: { label: 'WH40K.PsychicDiscipline.Biomancy' },
    daemonology: { label: 'WH40K.PsychicDiscipline.Daemonology' },
};

/* -------------------------------------------- */
/*  Ship Hull Types                             */
/* -------------------------------------------- */

/**
 * Starship hull types.
 * @type {Object<string, {label: string, space: number, speed: number}>}
 */
WH40K.hullTypes = {
    'transport': { label: 'WH40K.HullType.Transport', space: 40, speed: 3 },
    'raider': { label: 'WH40K.HullType.Raider', space: 35, speed: 9 },
    'frigate': { label: 'WH40K.HullType.Frigate', space: 40, speed: 7 },
    'light-cruiser': { label: 'WH40K.HullType.LightCruiser', space: 60, speed: 6 },
    'cruiser': { label: 'WH40K.HullType.Cruiser', space: 75, speed: 5 },
    'battlecruiser': { label: 'WH40K.HullType.Battlecruiser', space: 80, speed: 5 },
    'grand-cruiser': { label: 'WH40K.HullType.GrandCruiser', space: 90, speed: 4 },
};

/* -------------------------------------------- */
/*  Ship Component Types                        */
/* -------------------------------------------- */

/**
 * Ship component categories.
 * @type {Object<string, {label: string}>}
 */
WH40K.shipComponentTypes = {
    essential: { label: 'WH40K.ShipComponent.Essential' },
    supplemental: { label: 'WH40K.ShipComponent.Supplemental' },
    weapons: { label: 'WH40K.ShipComponent.Weapons' },
    auger: { label: 'WH40K.ShipComponent.Auger' },
    gellarField: { label: 'WH40K.ShipComponent.GellarField' },
    voidShields: { label: 'WH40K.ShipComponent.VoidShields' },
    warpDrive: { label: 'WH40K.ShipComponent.WarpDrive' },
    plasmaDrive: { label: 'WH40K.ShipComponent.PlasmaDrive' },
    lifeSupport: { label: 'WH40K.ShipComponent.LifeSupport' },
    quarters: { label: 'WH40K.ShipComponent.Quarters' },
    bridge: { label: 'WH40K.ShipComponent.Bridge' },
    generatorum: { label: 'WH40K.ShipComponent.Generatorum' },
    augment: { label: 'WH40K.ShipComponent.Augment' },
    archeotech: { label: 'WH40K.ShipComponent.Archeotech' },
    xenotech: { label: 'WH40K.ShipComponent.Xenotech' },
};

/* -------------------------------------------- */
/*  Origin Path Steps                           */
/* -------------------------------------------- */

/**
 * Origin path steps.
 * @type {Object<string, {label: string, index: number}>}
 */
WH40K.originPathSteps = {
    homeWorld: { label: 'WH40K.OriginPath.HomeWorld', index: 0 },
    birthright: { label: 'WH40K.OriginPath.Birthright', index: 1 },
    lureOfTheVoid: { label: 'WH40K.OriginPath.LureOfTheVoid', index: 2 },
    trialsAndTravails: { label: 'WH40K.OriginPath.TrialsAndTravails', index: 3 },
    motivation: { label: 'WH40K.OriginPath.Motivation', index: 4 },
    career: { label: 'WH40K.OriginPath.Career', index: 5 },
};

/* -------------------------------------------- */
/*  Talent Categories                           */
/* -------------------------------------------- */

/**
 * Talent categories.
 * @type {Object<string, {label: string}>}
 */
WH40K.talentCategories = {
    general: { label: 'WH40K.TalentCategory.General' },
    combat: { label: 'WH40K.TalentCategory.Combat' },
    social: { label: 'WH40K.TalentCategory.Social' },
    investigation: { label: 'WH40K.TalentCategory.Investigation' },
    psychic: { label: 'WH40K.TalentCategory.Psychic' },
    navigator: { label: 'WH40K.TalentCategory.Navigator' },
    tech: { label: 'WH40K.TalentCategory.Tech' },
    leadership: { label: 'WH40K.TalentCategory.Leadership' },
    unique: { label: 'WH40K.TalentCategory.Unique' },
    career: { label: 'WH40K.TalentCategory.Career' },
};

/**
 * Trait categories.
 * @type {Object<string, {label: string}>}
 */
WH40K.traitCategories = {
    general: { label: 'WH40K.TraitCategory.General' },
    creature: { label: 'WH40K.TraitCategory.Creature' },
    character: { label: 'WH40K.TraitCategory.Character' },
    elite: { label: 'WH40K.TraitCategory.Elite' },
    unique: { label: 'WH40K.TraitCategory.Unique' },
    origin: { label: 'WH40K.TraitCategory.Origin' },
};

/* -------------------------------------------- */
/*  Action Types                                */
/* -------------------------------------------- */

/**
 * Action types.
 * @type {Object<string, {label: string}>}
 */
WH40K.actionTypes = {
    'action': { label: 'WH40K.ActionType.Action' },
    'half-action': { label: 'WH40K.ActionType.HalfAction' },
    'full-action': { label: 'WH40K.ActionType.FullAction' },
    'extended-action': { label: 'WH40K.ActionType.ExtendedAction' },
    'reaction': { label: 'WH40K.ActionType.Reaction' },
    'free-action': { label: 'WH40K.ActionType.FreeAction' },
    'passive': { label: 'WH40K.ActionType.Passive' },
};

/* -------------------------------------------- */
/*  NPC Types                                   */
/* -------------------------------------------- */

/**
 * NPC threat types.
 * @type {Object<string, {label: string}>}
 */
// NPC tiers — reconciled to the NPCData `tier` schema (troop/elite/master/horde);
// the old `legendary` entry never matched the schema and is dropped (#257).
WH40K.npcTypes = {
    troop: { label: 'WH40K.NPCType.Troop' },
    elite: { label: 'WH40K.NPCType.Elite' },
    master: { label: 'WH40K.NPCType.Master' },
    horde: { label: 'WH40K.NPCType.Horde' },
};

/* -------------------------------------------- */
/*  Vehicle Types                               */
/* -------------------------------------------- */

/**
 * Vehicle type classifications.
 * @type {Object<string, {label: string, icon: string}>}
 */
WH40K.vehicleTypes = {
    vehicle: { label: 'WH40K.VehicleType.Vehicle', icon: 'fa-car' },
    walker: { label: 'WH40K.VehicleType.Walker', icon: 'fa-robot' },
    flyer: { label: 'WH40K.VehicleType.Flyer', icon: 'fa-plane' },
    skimmer: { label: 'WH40K.VehicleType.Skimmer', icon: 'fa-helicopter' },
    bike: { label: 'WH40K.VehicleType.Bike', icon: 'fa-motorcycle' },
    tank: { label: 'WH40K.VehicleType.Tank', icon: 'fa-shield' },
};

/**
 * Vehicle class categories.
 * @type {Object<string, {label: string}>}
 */
WH40K.vehicleClasses = {
    ground: { label: 'WH40K.VehicleClass.Ground' },
    air: { label: 'WH40K.VehicleClass.Air' },
    water: { label: 'WH40K.VehicleClass.Water' },
    space: { label: 'WH40K.VehicleClass.Space' },
    walker: { label: 'WH40K.VehicleClass.Walker' },
};

/**
 * Vehicle size categories (aligned with creature sizes).
 * @type {Object<number, {label: string, modifier: number, descriptor: string}>}
 */
WH40K.vehicleSizes = {
    1: { label: 'WH40K.Size.Miniscule', modifier: -30, descriptor: '~1m' },
    2: { label: 'WH40K.Size.Puny', modifier: -20, descriptor: '~2m' },
    3: { label: 'WH40K.Size.Scrawny', modifier: -10, descriptor: '~3-5m' },
    4: { label: 'WH40K.Size.Average', modifier: 0, descriptor: '~6-10m' },
    5: { label: 'WH40K.Size.Hulking', modifier: 10, descriptor: '~11-15m' },
    6: { label: 'WH40K.Size.Enormous', modifier: 20, descriptor: '~16-20m' },
    7: { label: 'WH40K.Size.Massive', modifier: 30, descriptor: '~21-30m' },
    8: { label: 'WH40K.Size.Immense', modifier: 40, descriptor: '~31-50m' },
    9: { label: 'WH40K.Size.Monumental', modifier: 50, descriptor: '~51-100m' },
    10: { label: 'WH40K.Size.Titanic', modifier: 60, descriptor: '100m+' },
};

/* -------------------------------------------- */
/*  Vehicle Upgrade Types                       */
/* -------------------------------------------- */

/**
 * Vehicle upgrade type classifications.
 * @type {Object<string, {label: string}>}
 */
WH40K.vehicleUpgradeTypes = {
    standard: { label: 'WH40K.VehicleUpgradeType.Standard' },
    integral: { label: 'WH40K.VehicleUpgradeType.Integral' },
    custom: { label: 'WH40K.VehicleUpgradeType.Custom' },
};

/* -------------------------------------------- */
/*  Vehicle Stats                               */
/* -------------------------------------------- */

/**
 * Vehicle stat labels.
 * @type {Object<string, {label: string, abbreviation: string}>}
 */
WH40K.vehicleStats = {
    speed: { label: 'WH40K.VehicleStat.Speed', abbreviation: 'Spd' },
    manoeuvrability: { label: 'WH40K.VehicleStat.Manoeuvrability', abbreviation: 'Man' },
    armour: { label: 'WH40K.VehicleStat.Armour', abbreviation: 'AP' },
    integrity: { label: 'WH40K.VehicleStat.Integrity', abbreviation: 'Int' },
};

/* -------------------------------------------- */
/*  Difficulty Modifiers                        */
/* -------------------------------------------- */

/**
 * Test difficulty modifiers.
 * @type {Object<string, {label: string, modifier: number}>}
 */
WH40K.difficulties = {
    trivial: { label: 'WH40K.Difficulty.Trivial', modifier: 60 },
    elementary: { label: 'WH40K.Difficulty.Elementary', modifier: 50 },
    simple: { label: 'WH40K.Difficulty.Simple', modifier: 40 },
    easy: { label: 'WH40K.Difficulty.Easy', modifier: 30 },
    routine: { label: 'WH40K.Difficulty.Routine', modifier: 20 },
    ordinary: { label: 'WH40K.Difficulty.Ordinary', modifier: 10 },
    challenging: { label: 'WH40K.Difficulty.Challenging', modifier: 0 },
    difficult: { label: 'WH40K.Difficulty.Difficult', modifier: -10 },
    hard: { label: 'WH40K.Difficulty.Hard', modifier: -20 },
    veryHard: { label: 'WH40K.Difficulty.VeryHard', modifier: -30 },
    arduous: { label: 'WH40K.Difficulty.Arduous', modifier: -40 },
    punishing: { label: 'WH40K.Difficulty.Punishing', modifier: -50 },
    hellish: { label: 'WH40K.Difficulty.Hellish', modifier: -60 },
};

/* -------------------------------------------- */
/*  Degrees of Success/Failure                  */
/* -------------------------------------------- */

/**
 * Calculate degrees of success or failure.
 * @param {number} roll    The roll result.
 * @param {number} target  The target number.
 * @returns {object}       The result with degrees.
 */
WH40K.calculateDegrees = (roll, target) => {
    const success = isD100Success(roll, target);
    // No actor context here; resolve the method from the homebrew degreesMode
    // setting (defaults to the per-system rule, which is gen2 when unscoped).
    const method = resolveDegreesMethod(undefined);
    const degrees = 1 + (success ? getDegreeForMode(method, target, roll) : getDegreeForMode(method, roll, target));

    return {
        success,
        roll,
        target,
        degrees: success ? degrees : -degrees,
        label: success
            ? game.i18n.format('WH40K.Degrees.Success', { degrees: String(degrees) })
            : game.i18n.format('WH40K.Degrees.Failure', { degrees: String(degrees) }),
    };
};

/* -------------------------------------------- */
/*  Default Icons                               */
/* -------------------------------------------- */

/**
 * Default icons for items and actors.
 * Uses the "Game-icons.net - All the icons!" module paths.
 * Falls back to Foundry defaults if module is not active.
 * @type {Object<string, string>}
 */
WH40K.defaultIcons = {
    // Item types
    weapon: 'modules/game-icons-net-font/svg/crossed-swords.svg',
    armour: 'modules/game-icons-net-font/svg/shield.svg',
    ammunition: 'modules/game-icons-net-font/svg/bullets.svg',
    gear: 'modules/game-icons-net-font/svg/backpack.svg',
    talent: 'modules/game-icons-net-font/svg/light-bulb.svg',
    trait: 'modules/game-icons-net-font/svg/person.svg',
    psychicPower: 'modules/game-icons-net-font/svg/psychic-waves.svg',
    skill: 'modules/game-icons-net-font/svg/skills.svg',
    cybernetic: 'modules/game-icons-net-font/svg/cyber-eye.svg',
    forceField: 'modules/game-icons-net-font/svg/shield-reflect.svg',
    attackSpecial: 'modules/game-icons-net-font/svg/spiked-tentacle.svg',
    weaponMod: 'modules/game-icons-net-font/svg/gears.svg',
    criticalInjury: 'modules/game-icons-net-font/svg/broken-bone.svg',
    origin: 'modules/game-icons-net-font/svg/world.svg',

    // Actor types
    character: 'modules/game-icons-net-font/svg/cowled.svg',
    npc: 'modules/game-icons-net-font/svg/person.svg',
    vehicle: 'modules/game-icons-net-font/svg/jeep.svg',
    terracraft: 'modules/game-icons-net-font/svg/jeep.svg',
    aircraft: 'modules/game-icons-net-font/svg/delta-wing.svg',
    watercraft: 'modules/game-icons-net-font/svg/sailboat.svg',
    starship: 'modules/game-icons-net-font/svg/spaceship.svg',
    voidcraft: 'modules/game-icons-net-font/svg/spaceship.svg',
};

const gameIconPath = (name: string): string => `modules/game-icons-net-font/svg/${name}.svg`;

WH40K.skillIcons = {
    acrobatics: gameIconPath('jump-across'),
    athletics: gameIconPath('run'),
    awareness: gameIconPath('binoculars'),
    barter: gameIconPath('conversation'),
    blather: gameIconPath('conversation'),
    carouse: gameIconPath('skills'),
    charm: gameIconPath('conversation'),
    chemUse: gameIconPath('medicine-pills'),
    ciphers: gameIconPath('lockpicks'),
    climb: gameIconPath('mountain-climbing'),
    command: gameIconPath('crossed-pistols'),
    commerce: gameIconPath('conversation'),
    commonLore: gameIconPath('magnifying-glass'),
    concealment: gameIconPath('backstab'),
    contortionist: gameIconPath('juggler'),
    deceive: gameIconPath('backstab'),
    demolition: gameIconPath('grenade'),
    disguise: gameIconPath('android-mask'),
    dodge: gameIconPath('sprint'),
    drive: gameIconPath('jeep'),
    evaluate: gameIconPath('magnifying-glass'),
    forbiddenLore: gameIconPath('brain'),
    gamble: gameIconPath('card-joker'),
    inquiry: gameIconPath('magnifying-glass'),
    interrogation: gameIconPath('conversation'),
    intimidate: gameIconPath('death-skull'),
    invocation: gameIconPath('psychic-waves'),
    linguistics: gameIconPath('conversation'),
    lipReading: gameIconPath('binoculars'),
    literacy: gameIconPath('magnifying-glass'),
    logic: gameIconPath('gears'),
    medicae: gameIconPath('healing'),
    navigate: gameIconPath('compass'),
    navigation: gameIconPath('compass'),
    operate: gameIconPath('rocket'),
    parry: gameIconPath('crossed-swords'),
    performer: gameIconPath('juggler'),
    pilot: gameIconPath('rocket'),
    psyniscience: gameIconPath('psychic-waves'),
    scholasticLore: gameIconPath('magnifying-glass'),
    scrutiny: gameIconPath('magnifying-glass'),
    search: gameIconPath('magnifying-glass'),
    secretTongue: gameIconPath('conversation'),
    security: gameIconPath('lockpicks'),
    shadowing: gameIconPath('backstab'),
    silentMove: gameIconPath('backstab'),
    sleightOfHand: gameIconPath('juggler'),
    speakLanguage: gameIconPath('conversation'),
    stealth: gameIconPath('backstab'),
    survival: gameIconPath('lantern-flame'),
    swim: gameIconPath('sprint'),
    techUse: gameIconPath('gears'),
    tracking: gameIconPath('archery-target'),
    trade: gameIconPath('toolbox'),
    wrangling: gameIconPath('lasso'),
};

WH40K.getSkillIcon = function (skillKey) {
    const key = typeof skillKey === 'string' ? skillKey : '';
    const icon = this.skillIcons[key];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: Record<string,string> index may return undefined at runtime
    if (icon !== undefined && icon !== '') {
        return icon;
    }
    if (key !== '') {
        const parts = key
            .replace(/[_-]+/g, ' ')
            .replace(/[^a-zA-Z0-9 ]/g, ' ')
            .trim()
            .split(/\s+/);
        const normalized = parts
            .map((part, index) => {
                const lower = part.toLowerCase();
                if (index === 0) return lower;
                return capitalize(lower);
            })
            .join('');
        const normalizedIcon = this.skillIcons[normalized];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: Record<string,string> index may return undefined at runtime
        if (normalizedIcon !== undefined && normalizedIcon !== '') return normalizedIcon;
    }
    return this.getDefaultIcon('skill');
};

/**
 * Get default icon for a document type.
 * @param {string} type - Document type (e.g., "weapon", "character")
 * @returns {string} Icon path
 */
WH40K.getDefaultIcon = function (type) {
    const icon = this.defaultIcons[type];
    return icon || 'icons/svg/item-bag.svg';
};

/**
 * Parse a quality identifier into its base id and level. `blast-3` →
 * `{ baseId: 'blast', level: 3 }`; `flamer-x` → `{ baseId: 'flamer', level: null }`
 * (the `(X)` placeholder); a bare `tearing` → `{ baseId: 'tearing', level: null }`.
 * Content-agnostic — pure suffix parsing, no quality table is consulted.
 */
export function parseQualityLevel(identifier: string): { baseId: string; level: number | null } {
    const levelMatch = identifier.match(/^(.+?)-(\d+|x)$/i);
    const base = levelMatch?.[1];
    const lvl = levelMatch?.[2];
    const baseId = base ?? identifier;
    const level: number | null = lvl !== undefined ? (lvl.toLowerCase() === 'x' ? null : parseInt(lvl, 10)) : null;
    return { baseId, level };
}

/**
 * Append the level suffix to a localized quality label: ` (N)` for a known
 * level, ` (X)` when the quality takes a level but none was supplied, nothing
 * otherwise.
 */
export function buildQualityLabel(localizedBase: string, hasLevel: boolean, level: number | null): string {
    if (!hasLevel) return localizedBase;
    return level !== null ? `${localizedBase} (${level})` : `${localizedBase} (X)`;
}

/**
 * Get quality definition from identifier.
 * @param {string} identifier    Quality identifier (e.g., "tearing", "blast-3")
 * @returns {object|null}        Quality definition or null
 */
WH40K.getQualityDefinition = (identifier) => {
    // Strip level suffix (blast-3 → blast, flamer-x → flamer).
    const baseId = identifier.replace(/-\d+$/, '').replace(/-x$/i, '');
    const labelKey = weaponQualityLabelKey(baseId);
    // "Known" iff the langpack carries the label; unlabelled qualities return null so
    // callers fall back to a humanized identifier (matching the old registry-miss path).
    if (!game.i18n.has(labelKey)) return null;
    const mechanics = getWeaponQualityMechanics(baseId);
    const isMechanical = mechanics !== null && mechanics.type !== '';
    return {
        label: labelKey,
        description: weaponQualityDescKey(baseId),
        hasLevel: getWeaponQualityHasLevel(baseId),
        category: isMechanical ? mechanics.type : 'other',
        mechanicalEffect: isMechanical,
    };
};

/**
 * Get localized quality label.
 * @param {string} identifier    Quality identifier
 * @param {number} [level]       Optional level for qualities with (X)
 * @returns {string}             Localized label
 */
WH40K.getQualityLabel = function (identifier, level = null) {
    const def = this.getQualityDefinition(identifier);
    if (!def) return identifier;
    return buildQualityLabel(game.i18n.localize(def.label), def.hasLevel, level);
};

/**
 * Get localized quality description.
 * @param {string} identifier    Quality identifier
 * @returns {string}             Localized description
 */
WH40K.getQualityDescription = function (identifier) {
    const def = this.getQualityDefinition(identifier);
    if (!def) return '';

    return game.i18n.localize(def.description);
};

/**
 * Get jam threshold for weapon based on qualities and craftsmanship.
 * @param {object} weapon    Weapon item
 * @returns {number|null}    Jam threshold (90-100) or null if cannot jam
 */
WH40K.getJamThreshold = (weapon) => {
    const w = weapon as { system?: { craftsmanship?: string; effectiveSpecial?: Set<string>; special?: Set<string> } };
    const craftsmanship = w.system?.craftsmanship;
    const qualities = w.system?.effectiveSpecial ?? w.system?.special;

    // Best/Master-crafted never jam
    if (craftsmanship !== undefined && craftsmanship !== '' && ['best', 'master-crafted'].includes(craftsmanship)) {
        return null;
    }

    // Check for reliability qualities
    if (qualities?.has('unreliable-2') === true) return 90;
    if (qualities?.has('unreliable') === true) return 96;
    if (qualities?.has('reliable') === true) return 95;

    return 100; // Normal jamming threshold
};

/* -------------------------------------------- */
/*  Combat Actions                              */
/* -------------------------------------------- */

/**
 * Combat actions organized by category.
 * @type {Object<string, Array<{key: string, label: string, type: string, description: string, icon: string, subtypes: string[]}>>}
 */
WH40K.combatActions = {
    attacks: [
        {
            key: 'standardAttack',
            label: 'WH40K.Combat.Action.StandardAttack',
            type: 'half',
            description: 'WH40K.Combat.Action.StandardAttackDesc',
            icon: 'fa-crosshairs',
            subtypes: ['Attack', 'Melee or Ranged'],
        },
        {
            key: 'throw',
            label: 'WH40K.Combat.Action.Throw',
            type: 'half',
            description: 'WH40K.Combat.Action.ThrowDesc',
            icon: 'fa-hand',
            subtypes: ['Attack', 'Ranged', 'Thrown'],
        },
        {
            key: 'calledShot',
            label: 'WH40K.Combat.Action.CalledShot',
            type: 'full',
            description: 'WH40K.Combat.Action.CalledShotDesc',
            icon: 'fa-bullseye',
            subtypes: ['Attack', 'Concentration', 'Melee or Ranged'],
        },
        {
            key: 'allOutAttack',
            label: 'WH40K.Combat.Action.AllOutAttack',
            type: 'full',
            description: 'WH40K.Combat.Action.AllOutAttackDesc',
            icon: 'fa-bolt',
            subtypes: ['Attack', 'Melee'],
        },
        {
            key: 'guardedAttack',
            label: 'WH40K.Combat.Action.GuardedAttack',
            type: 'full',
            description: 'WH40K.Combat.Action.GuardedAttackDesc',
            icon: 'fa-shield-alt',
            subtypes: ['Attack', 'Concentration', 'Melee'],
        },
        {
            key: 'charge',
            label: 'WH40K.Combat.Action.Charge',
            type: 'full',
            description: 'WH40K.Combat.Action.ChargeDesc',
            icon: 'fa-running',
            subtypes: ['Attack', 'Melee', 'Movement'],
        },
        {
            key: 'semiAutoBurst',
            label: 'WH40K.Combat.Action.SemiAutoBurst',
            type: 'full',
            description: 'WH40K.Combat.Action.SemiAutoBurstDesc',
            icon: 'fa-stream',
            subtypes: ['Attack', 'Ranged'],
        },
        {
            key: 'fullAutoBurst',
            label: 'WH40K.Combat.Action.FullAutoBurst',
            type: 'full',
            description: 'WH40K.Combat.Action.FullAutoBurstDesc',
            icon: 'fa-wind',
            subtypes: ['Attack', 'Ranged'],
        },
        {
            key: 'suppressingFire',
            label: 'WH40K.Combat.Action.SuppressingFire',
            type: 'full',
            description: 'WH40K.Combat.Action.SuppressingFireDesc',
            icon: 'fa-times-circle',
            subtypes: ['Attack', 'Ranged'],
        },
        {
            key: 'overwatch',
            label: 'WH40K.Combat.Action.Overwatch',
            type: 'full',
            description: 'WH40K.Combat.Action.OverwatchDesc',
            icon: 'fa-eye',
            subtypes: ['Attack', 'Concentration', 'Ranged'],
        },
        {
            key: 'multipleAttacks',
            label: 'WH40K.Combat.Action.MultipleAttacks',
            type: 'full',
            description: 'WH40K.Combat.Action.MultipleAttacksDesc',
            icon: 'fa-hands',
            subtypes: ['Attack', 'Melee or Ranged'],
        },
        {
            key: 'swiftAttack',
            label: 'WH40K.Combat.Action.SwiftAttack',
            type: 'half',
            description: 'WH40K.Combat.Action.SwiftAttackDesc',
            icon: 'fa-arrows-rotate',
            subtypes: ['Attack', 'Melee'],
            requiresTalent: 'swiftAttack',
        },
        {
            key: 'lightningAttack',
            label: 'WH40K.Combat.Action.LightningAttack',
            type: 'half',
            description: 'WH40K.Combat.Action.LightningAttackDesc',
            icon: 'fa-bolt-lightning',
            subtypes: ['Attack', 'Melee'],
            requiresTalent: 'lightningAttack',
        },
        {
            key: 'focusPower',
            label: 'WH40K.Combat.Action.FocusPower',
            type: 'varies',
            description: 'WH40K.Combat.Action.FocusPowerDesc',
            icon: 'fa-eye-low-vision',
            subtypes: ['Psychic'],
            requiresPsyker: true,
        },
    ],

    movement: [
        {
            key: 'move',
            label: 'WH40K.Combat.Action.Move',
            type: 'half-full',
            description: 'WH40K.Combat.Action.MoveDesc',
            icon: 'fa-walking',
            subtypes: ['Movement'],
        },
        {
            key: 'run',
            label: 'WH40K.Combat.Action.Run',
            type: 'full',
            description: 'WH40K.Combat.Action.RunDesc',
            icon: 'fa-running',
            subtypes: ['Movement'],
        },
        {
            key: 'disengage',
            // DH2 core p.219: Disengage is a HALF Action — a Half Move that
            // provokes no reaction. It is a combat action (spends a half action),
            // not a movement speed/mode (#416).
            label: 'WH40K.Combat.Action.Disengage',
            type: 'half',
            description: 'WH40K.Combat.Action.DisengageDesc',
            icon: 'fa-undo',
            subtypes: ['Movement'],
        },
        {
            key: 'jumpLeap',
            label: 'WH40K.Combat.Action.JumpLeap',
            type: 'full',
            description: 'WH40K.Combat.Action.JumpLeapDesc',
            icon: 'fa-arrow-up',
            subtypes: ['Movement'],
        },
        {
            key: 'tacticalAdvance',
            label: 'WH40K.Combat.Action.TacticalAdvance',
            type: 'full',
            description: 'WH40K.Combat.Action.TacticalAdvanceDesc',
            icon: 'fa-chess-knight',
            subtypes: ['Concentration', 'Movement'],
        },
        {
            key: 'standMount',
            label: 'WH40K.Combat.Action.StandMount',
            type: 'half',
            description: 'WH40K.Combat.Action.StandMountDesc',
            icon: 'fa-arrow-circle-up',
            subtypes: ['Movement'],
        },
    ],

    reactions: [
        {
            key: 'dodge',
            label: 'WH40K.Combat.Action.Dodge',
            type: 'reaction',
            description: 'WH40K.Combat.Action.DodgeDesc',
            icon: 'fa-running',
            subtypes: ['Movement'],
        },
        {
            key: 'parry',
            label: 'WH40K.Combat.Action.Parry',
            type: 'reaction',
            description: 'WH40K.Combat.Action.ParryDesc',
            icon: 'fa-shield-alt',
            subtypes: ['Defence', 'Melee'],
        },
        {
            key: 'evasion',
            label: 'WH40K.Combat.Action.Evasion',
            type: 'reaction',
            description: 'WH40K.Combat.Action.EvasionDesc',
            icon: 'fa-person-running',
            subtypes: ['Defence', 'Movement'],
        },
    ],

    utility: [
        {
            key: 'aim',
            label: 'WH40K.Combat.Action.Aim',
            type: 'half-full',
            description: 'WH40K.Combat.Action.AimDesc',
            icon: 'fa-dot-circle',
            subtypes: ['Concentration'],
        },
        {
            key: 'ready',
            label: 'WH40K.Combat.Action.Ready',
            type: 'half',
            description: 'WH40K.Combat.Action.ReadyDesc',
            icon: 'fa-hand-paper',
            subtypes: ['Miscellaneous'],
        },
        {
            key: 'reload',
            label: 'WH40K.Combat.Action.Reload',
            type: 'varies',
            description: 'WH40K.Combat.Action.ReloadDesc',
            icon: 'fa-sync',
            subtypes: ['Miscellaneous'],
        },
        {
            key: 'delay',
            label: 'WH40K.Combat.Action.Delay',
            type: 'half',
            description: 'WH40K.Combat.Action.DelayDesc',
            icon: 'fa-pause-circle',
            subtypes: ['Miscellaneous'],
        },
        {
            key: 'feint',
            label: 'WH40K.Combat.Action.Feint',
            type: 'half',
            description: 'WH40K.Combat.Action.FeintDesc',
            icon: 'fa-mask',
            subtypes: ['Attack', 'Melee'],
        },
        {
            key: 'grapple',
            label: 'WH40K.Combat.Action.Grapple',
            type: 'half-full',
            description: 'WH40K.Combat.Action.GrappleDesc',
            icon: 'fa-hand-rock',
            subtypes: ['Attack', 'Melee'],
        },
        {
            key: 'defensiveStance',
            label: 'WH40K.Combat.Action.DefensiveStance',
            type: 'full',
            description: 'WH40K.Combat.Action.DefensiveStanceDesc',
            icon: 'fa-user-shield',
            subtypes: ['Concentration', 'Melee'],
        },
        {
            key: 'braceHeavy',
            label: 'WH40K.Combat.Action.BraceHeavy',
            type: 'half',
            description: 'WH40K.Combat.Action.BraceHeavyDesc',
            icon: 'fa-level-down-alt',
            subtypes: ['Miscellaneous'],
        },
        {
            key: 'knockDown',
            label: 'WH40K.Combat.Action.KnockDown',
            type: 'half',
            description: 'WH40K.Combat.Action.KnockDownDesc',
            icon: 'fa-arrow-down',
            subtypes: ['Attack', 'Melee'],
        },
        {
            key: 'stun',
            label: 'WH40K.Combat.Action.Stun',
            type: 'full',
            description: 'WH40K.Combat.Action.StunDesc',
            icon: 'fa-star-half-alt',
            subtypes: ['Attack', 'Melee'],
        },
        {
            key: 'manoeuvre',
            label: 'WH40K.Combat.Action.Manoeuvre',
            type: 'half',
            description: 'WH40K.Combat.Action.ManoeuvreDesc',
            icon: 'fa-arrows-alt',
            subtypes: ['Attack', 'Melee', 'Movement'],
        },
    ],
};

/* -------------------------------------------- */
/*  Careers                                     */
/* -------------------------------------------- */

/**
 * Available character careers.
 * @type {Object<string, {label: string, description: string}>}
 */
WH40K.careers = {
    rogueTrader: { label: 'WH40K.Career.WH40K', description: 'WH40K.Career.WH40KDesc' },
    archMilitant: { label: 'WH40K.Career.ArchMilitant', description: 'WH40K.Career.ArchMilitantDesc' },
    astropath: { label: 'WH40K.Career.Astropath', description: 'WH40K.Career.AstropathDesc' },
    explorator: { label: 'WH40K.Career.Explorator', description: 'WH40K.Career.ExploratorDesc' },
    missionary: { label: 'WH40K.Career.Missionary', description: 'WH40K.Career.MissionaryDesc' },
    navigator: { label: 'WH40K.Career.Navigator', description: 'WH40K.Career.NavigatorDesc' },
    seneschal: { label: 'WH40K.Career.Seneschal', description: 'WH40K.Career.SeneschalDesc' },
    voidMaster: { label: 'WH40K.Career.VoidMaster', description: 'WH40K.Career.VoidMasterDesc' },
};

/* -------------------------------------------- */
/*  Advancement Tiers                           */
/* -------------------------------------------- */

/**
 * Characteristic advancement tier labels.
 * Each tier represents a +5 advance to a characteristic.
 * @type {Object<string, {label: string, index: number}>}
 */
WH40K.advancementTiers = {
    simple: { label: 'WH40K.Advancement.Tier.Simple', index: 0 },
    intermediate: { label: 'WH40K.Advancement.Tier.Intermediate', index: 1 },
    trained: { label: 'WH40K.Advancement.Tier.Trained', index: 2 },
    expert: { label: 'WH40K.Advancement.Tier.Expert', index: 3 },
};

/**
 * Tier order for progression
 * @type {string[]}
 */
WH40K.tierOrder = ['simple', 'intermediate', 'trained', 'expert'];

/* -------------------------------------------- */
/*  Export                                      */
/* -------------------------------------------- */

export default WH40K;
