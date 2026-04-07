/**
 * WH40K RPG System Configuration
 * Central configuration object for the WH40K RPG RPG system.
 */

export const WH40K: Record<string, any> = {};

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
/*  Careers                                     */
/* -------------------------------------------- */

/**
 * Character careers/archetypes.
 * @type {Object<string, {label: string}>}
 */
WH40K.careers = {
    rogueTrader: { label: 'WH40K.Career.WH40K' },
    archMilitant: { label: 'WH40K.Career.ArchMilitant' },
    astropathTranscendent: { label: 'WH40K.Career.AstropathTranscendent' },
    explorator: { label: 'WH40K.Career.Explorator' },
    missionary: { label: 'WH40K.Career.Missionary' },
    navigator: { label: 'WH40K.Career.Navigator' },
    seneschal: { label: 'WH40K.Career.Seneschal' },
    voidMaster: { label: 'WH40K.Career.VoidMaster' },
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
WH40K.npcTypes = {
    troop: { label: 'WH40K.NPCType.Troop' },
    elite: { label: 'WH40K.NPCType.Elite' },
    master: { label: 'WH40K.NPCType.Master' },
    legendary: { label: 'WH40K.NPCType.Legendary' },
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
    const difference = target - roll;
    const success = roll <= target;
    const degrees = Math.floor(Math.abs(difference) / 10) + 1;

    return {
        success,
        roll,
        target,
        degrees: success ? degrees : -degrees,
        // @ts-expect-error - type assignment
        label: success ? game.i18n.format('WH40K.Degrees.Success', { degrees }) : game.i18n.format('WH40K.Degrees.Failure', { degrees }),
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
    weapon: 'modules/game-icons-net/blacktransparent/crossed-swords.svg',
    armour: 'modules/game-icons-net/blacktransparent/shield.svg',
    ammunition: 'modules/game-icons-net/blacktransparent/bullets.svg',
    gear: 'modules/game-icons-net/blacktransparent/backpack.svg',
    talent: 'modules/game-icons-net/blacktransparent/light-bulb.svg',
    trait: 'modules/game-icons-net/blacktransparent/person.svg',
    psychicPower: 'modules/game-icons-net/blacktransparent/psychic-waves.svg',
    skill: 'modules/game-icons-net/blacktransparent/skills.svg',
    cybernetic: 'modules/game-icons-net/blacktransparent/cyber-eye.svg',
    forceField: 'modules/game-icons-net/blacktransparent/shield-reflect.svg',
    attackSpecial: 'modules/game-icons-net/blacktransparent/spiked-tentacle.svg',
    weaponMod: 'modules/game-icons-net/blacktransparent/gears.svg',
    criticalInjury: 'modules/game-icons-net/blacktransparent/broken-bone.svg',
    origin: 'modules/game-icons-net/blacktransparent/world.svg',

    // Actor types
    character: 'modules/game-icons-net/blacktransparent/cowled.svg',
    npc: 'modules/game-icons-net/blacktransparent/person.svg',
    vehicle: 'modules/game-icons-net/blacktransparent/jeep.svg',
    starship: 'modules/game-icons-net/blacktransparent/spaceship.svg',
};

const gameIconPath = (name) => `modules/game-icons-net/whitetransparent/${name}.svg`;

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
    climb: gameIconPath('climbing'),
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
    lipReading: gameIconPath('binoculars'),
    literacy: gameIconPath('magnifying-glass'),
    logic: gameIconPath('gears'),
    medicae: gameIconPath('healing'),
    navigation: gameIconPath('compass'),
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
    const icon = this.skillIcons?.[key];
    if (icon) {
        return icon;
    }
    if (key) {
        const parts = key
            .replace(/[_-]+/g, ' ')
            .replace(/[^a-zA-Z0-9 ]/g, ' ')
            .trim()
            .split(/\s+/);
        const normalized = parts
            .map((part, index) => {
                const lower = part.toLowerCase();
                if (index === 0) return lower;
                return lower.charAt(0).toUpperCase() + lower.slice(1);
            })
            .join('');
        const normalizedIcon = this.skillIcons?.[normalized];
        if (normalizedIcon) return normalizedIcon;
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

/* -------------------------------------------- */
/*  Weapon Qualities                            */
/* -------------------------------------------- */

/**
 * Weapon qualities (special properties).
 * @type {Object<string, {label: string, description: string, hasLevel: boolean, category: string, mechanicalEffect: boolean}>}
 */
WH40K.weaponQualities = {
    // Accuracy & Reliability
    'accurate': {
        label: 'WH40K.WeaponQuality.Accurate',
        description: 'WH40K.WeaponQuality.AccurateDesc',
        hasLevel: false,
        category: 'simple-modifier',
        mechanicalEffect: true,
    },
    'inaccurate': {
        label: 'WH40K.WeaponQuality.Inaccurate',
        description: 'WH40K.WeaponQuality.InaccurateDesc',
        hasLevel: false,
    },
    'reliable': {
        label: 'WH40K.WeaponQuality.Reliable',
        description: 'WH40K.WeaponQuality.ReliableDesc',
        hasLevel: false,
    },
    'unreliable': {
        label: 'WH40K.WeaponQuality.Unreliable',
        description: 'WH40K.WeaponQuality.UnreliableDesc',
        hasLevel: false,
    },
    'unreliable-2': {
        label: 'WH40K.WeaponQuality.Unreliable2',
        description: 'WH40K.WeaponQuality.Unreliable2Desc',
        hasLevel: false,
    },

    // Melee Properties
    'balanced': {
        label: 'WH40K.WeaponQuality.Balanced',
        description: 'WH40K.WeaponQuality.BalancedDesc',
        hasLevel: false,
    },
    'defensive': {
        label: 'WH40K.WeaponQuality.Defensive',
        description: 'WH40K.WeaponQuality.DefensiveDesc',
        hasLevel: false,
    },
    'fast': {
        label: 'WH40K.WeaponQuality.Fast',
        description: 'WH40K.WeaponQuality.FastDesc',
        hasLevel: false,
    },
    'flexible': {
        label: 'WH40K.WeaponQuality.Flexible',
        description: 'WH40K.WeaponQuality.FlexibleDesc',
        hasLevel: false,
    },
    'unbalanced': {
        label: 'WH40K.WeaponQuality.Unbalanced',
        description: 'WH40K.WeaponQuality.UnbalancedDesc',
        hasLevel: false,
    },
    'unwieldy': {
        label: 'WH40K.WeaponQuality.Unwieldy',
        description: 'WH40K.WeaponQuality.UnwieldyDesc',
        hasLevel: false,
    },

    // Damage Effects
    'tearing': {
        label: 'WH40K.WeaponQuality.Tearing',
        description: 'WH40K.WeaponQuality.TearingDesc',
        hasLevel: false,
    },
    'razor-sharp': {
        label: 'WH40K.WeaponQuality.RazorSharp',
        description: 'WH40K.WeaponQuality.RazorSharpDesc',
        hasLevel: false,
    },
    'proven': {
        label: 'WH40K.WeaponQuality.Proven',
        description: 'WH40K.WeaponQuality.ProvenDesc',
        hasLevel: true,
    },
    'felling': {
        label: 'WH40K.WeaponQuality.Felling',
        description: 'WH40K.WeaponQuality.FellingDesc',
        hasLevel: true,
    },
    'crippling': {
        label: 'WH40K.WeaponQuality.Crippling',
        description: 'WH40K.WeaponQuality.CripplingDesc',
        hasLevel: true,
    },
    'devastating': {
        label: 'WH40K.WeaponQuality.Devastating',
        description: 'WH40K.WeaponQuality.DevastatingDesc',
        hasLevel: true,
    },

    // Area Effects
    'blast': {
        label: 'WH40K.WeaponQuality.Blast',
        description: 'WH40K.WeaponQuality.BlastDesc',
        hasLevel: true,
    },
    'scatter': {
        label: 'WH40K.WeaponQuality.Scatter',
        description: 'WH40K.WeaponQuality.ScatterDesc',
        hasLevel: false,
    },
    'spray': {
        label: 'WH40K.WeaponQuality.Spray',
        description: 'WH40K.WeaponQuality.SprayDesc',
        hasLevel: false,
    },
    'storm': {
        label: 'WH40K.WeaponQuality.Storm',
        description: 'WH40K.WeaponQuality.StormDesc',
        hasLevel: false,
    },

    // Status Effects
    'concussive': {
        label: 'WH40K.WeaponQuality.Concussive',
        description: 'WH40K.WeaponQuality.ConcussiveDesc',
        hasLevel: true,
    },
    'corrosive': {
        label: 'WH40K.WeaponQuality.Corrosive',
        description: 'WH40K.WeaponQuality.CorrosiveDesc',
        hasLevel: false,
    },
    'toxic': {
        label: 'WH40K.WeaponQuality.Toxic',
        description: 'WH40K.WeaponQuality.ToxicDesc',
        hasLevel: true,
    },
    'hallucinogenic': {
        label: 'WH40K.WeaponQuality.Hallucinogenic',
        description: 'WH40K.WeaponQuality.HallucinogenicDesc',
        hasLevel: true,
    },
    'snare': {
        label: 'WH40K.WeaponQuality.Snare',
        description: 'WH40K.WeaponQuality.SnareDesc',
        hasLevel: true,
    },
    'shocking': {
        label: 'WH40K.WeaponQuality.Shocking',
        description: 'WH40K.WeaponQuality.ShockingDesc',
        hasLevel: false,
    },
    'shock': {
        label: 'WH40K.WeaponQuality.Shock',
        description: 'WH40K.WeaponQuality.ShockDesc',
        hasLevel: false,
    },

    // Weapon Type Markers
    'bolt': {
        label: 'WH40K.WeaponQuality.Bolt',
        description: 'WH40K.WeaponQuality.BoltDesc',
        hasLevel: false,
    },
    'chain': {
        label: 'WH40K.WeaponQuality.Chain',
        description: 'WH40K.WeaponQuality.ChainDesc',
        hasLevel: false,
    },
    'flame': {
        label: 'WH40K.WeaponQuality.Flame',
        description: 'WH40K.WeaponQuality.FlameDesc',
        hasLevel: false,
    },
    'force': {
        label: 'WH40K.WeaponQuality.Force',
        description: 'WH40K.WeaponQuality.ForceDesc',
        hasLevel: false,
    },
    'las': {
        label: 'WH40K.WeaponQuality.Las',
        description: 'WH40K.WeaponQuality.LasDesc',
        hasLevel: false,
    },
    'melta': {
        label: 'WH40K.WeaponQuality.Melta',
        description: 'WH40K.WeaponQuality.MeltaDesc',
        hasLevel: false,
    },
    'plasma': {
        label: 'WH40K.WeaponQuality.Plasma',
        description: 'WH40K.WeaponQuality.PlasmaDesc',
        hasLevel: false,
    },
    'power': {
        label: 'WH40K.WeaponQuality.Power',
        description: 'WH40K.WeaponQuality.PowerDesc',
        hasLevel: false,
    },
    'power-field': {
        label: 'WH40K.WeaponQuality.PowerField',
        description: 'WH40K.WeaponQuality.PowerFieldDesc',
        hasLevel: false,
    },
    'primitive': {
        label: 'WH40K.WeaponQuality.Primitive',
        description: 'WH40K.WeaponQuality.PrimitiveDesc',
        hasLevel: true,
    },

    // Special Weapon Types
    'grenade': {
        label: 'WH40K.WeaponQuality.Grenade',
        description: 'WH40K.WeaponQuality.GrenadeDesc',
        hasLevel: false,
    },
    'launcher': {
        label: 'WH40K.WeaponQuality.Launcher',
        description: 'WH40K.WeaponQuality.LauncherDesc',
        hasLevel: false,
    },
    'indirect': {
        label: 'WH40K.WeaponQuality.Indirect',
        description: 'WH40K.WeaponQuality.IndirectDesc',
        hasLevel: true,
    },

    // Energy Weapon Effects
    'haywire': {
        label: 'WH40K.WeaponQuality.Haywire',
        description: 'WH40K.WeaponQuality.HaywireDesc',
        hasLevel: true,
    },
    'overheats': {
        label: 'WH40K.WeaponQuality.Overheats',
        description: 'WH40K.WeaponQuality.OverheatsDesc',
        hasLevel: false,
    },
    'overcharge': {
        label: 'WH40K.WeaponQuality.Overcharge',
        description: 'WH40K.WeaponQuality.OverchargeDesc',
        hasLevel: true,
    },
    'recharge': {
        label: 'WH40K.WeaponQuality.Recharge',
        description: 'WH40K.WeaponQuality.RechargeDesc',
        hasLevel: false,
    },
    'maximal': {
        label: 'WH40K.WeaponQuality.Maximal',
        description: 'WH40K.WeaponQuality.MaximalDesc',
        hasLevel: false,
    },

    // Special/Rare Properties
    'sanctified': {
        label: 'WH40K.WeaponQuality.Sanctified',
        description: 'WH40K.WeaponQuality.SanctifiedDesc',
        hasLevel: false,
    },
    'tainted': {
        label: 'WH40K.WeaponQuality.Tainted',
        description: 'WH40K.WeaponQuality.TaintedDesc',
        hasLevel: false,
    },
    'daemon-wep': {
        label: 'WH40K.WeaponQuality.DaemonWep',
        description: 'WH40K.WeaponQuality.DaemonWepDesc',
        hasLevel: false,
    },
    'daemonbane': {
        label: 'WH40K.WeaponQuality.Daemonbane',
        description: 'WH40K.WeaponQuality.DaemonbaneDesc',
        hasLevel: false,
    },
    'warp-weapon': {
        label: 'WH40K.WeaponQuality.WarpWeapon',
        description: 'WH40K.WeaponQuality.WarpWeaponDesc',
        hasLevel: false,
    },
    'witch-edge': {
        label: 'WH40K.WeaponQuality.WitchEdge',
        description: 'WH40K.WeaponQuality.WitchEdgeDesc',
        hasLevel: false,
    },
    'rune-wep': {
        label: 'WH40K.WeaponQuality.RuneWep',
        description: 'WH40K.WeaponQuality.RuneWepDesc',
        hasLevel: false,
    },

    // Xenos Weapons
    'gauss': {
        label: 'WH40K.WeaponQuality.Gauss',
        description: 'WH40K.WeaponQuality.GaussDesc',
        hasLevel: false,
    },
    'graviton': {
        label: 'WH40K.WeaponQuality.Graviton',
        description: 'WH40K.WeaponQuality.GravitonDesc',
        hasLevel: false,
    },
    'necron-wep': {
        label: 'WH40K.WeaponQuality.NecronWep',
        description: 'WH40K.WeaponQuality.NecronWepDesc',
        hasLevel: false,
    },

    // Special Ammunition/Effects
    'smoke': {
        label: 'WH40K.WeaponQuality.Smoke',
        description: 'WH40K.WeaponQuality.SmokeDesc',
        hasLevel: true,
    },
    'living-ammunition': {
        label: 'WH40K.WeaponQuality.LivingAmmunition',
        description: 'WH40K.WeaponQuality.LivingAmmunitionDesc',
        hasLevel: false,
    },

    // Combat Modifiers
    'twin-linked': {
        label: 'WH40K.WeaponQuality.TwinLinked',
        description: 'WH40K.WeaponQuality.TwinLinkedDesc',
        hasLevel: false,
    },
    'gyro-stabilised': {
        label: 'WH40K.WeaponQuality.GyroStabilised',
        description: 'WH40K.WeaponQuality.GyroStabilisedDesc',
        hasLevel: false,
    },
    'vengeful': {
        label: 'WH40K.WeaponQuality.Vengeful',
        description: 'WH40K.WeaponQuality.VengefulDesc',
        hasLevel: true,
    },
    'lance': {
        label: 'WH40K.WeaponQuality.Lance',
        description: 'WH40K.WeaponQuality.LanceDesc',
        hasLevel: false,
    },

    // Miscellaneous
    'decay': {
        label: 'WH40K.WeaponQuality.Decay',
        description: 'WH40K.WeaponQuality.DecayDesc',
        hasLevel: true,
    },
    'irradiated': {
        label: 'WH40K.WeaponQuality.Irradiated',
        description: 'WH40K.WeaponQuality.IrradiatedDesc',
        hasLevel: true,
    },
    'reactive': {
        label: 'WH40K.WeaponQuality.Reactive',
        description: 'WH40K.WeaponQuality.ReactiveDesc',
        hasLevel: false,
    },
    'unstable': {
        label: 'WH40K.WeaponQuality.Unstable',
        description: 'WH40K.WeaponQuality.UnstableDesc',
        hasLevel: false,
    },
    'volatile': {
        label: 'WH40K.WeaponQuality.Volatile',
        description: 'WH40K.WeaponQuality.VolatileDesc',
        hasLevel: false,
    },
    'integrated-weapon': {
        label: 'WH40K.WeaponQuality.IntegratedWeapon',
        description: 'WH40K.WeaponQuality.IntegratedWeaponDesc',
        hasLevel: false,
    },
    'ogryn-proof': {
        label: 'WH40K.WeaponQuality.OgrynProof',
        description: 'WH40K.WeaponQuality.OgrynProofDesc',
        hasLevel: false,
    },

    // Faction-Specific
    'sm-wep': {
        label: 'WH40K.WeaponQuality.SMWep',
        description: 'WH40K.WeaponQuality.SMWepDesc',
        hasLevel: false,
    },

    // Special/Placeholder
    'customised': {
        label: 'WH40K.WeaponQuality.Customised',
        description: 'WH40K.WeaponQuality.CustomisedDesc',
        hasLevel: false,
    },
    'sp': {
        label: 'WH40K.WeaponQuality.SP',
        description: 'WH40K.WeaponQuality.SPDesc',
        hasLevel: false,
    },
    'cleansing-fire': {
        label: 'WH40K.WeaponQuality.CleansingFire',
        description: 'WH40K.WeaponQuality.CleansingFireDesc',
        hasLevel: false,
    },

    // Craftsmanship-Only (never in pack data)
    'never-jam': {
        label: 'WH40K.WeaponQuality.NeverJam',
        description: 'WH40K.WeaponQuality.NeverJamDesc',
        hasLevel: false,
    },
};

/**
 * Get quality definition from identifier.
 * @param {string} identifier    Quality identifier (e.g., "tearing", "blast-3")
 * @returns {object|null}        Quality definition or null
 */
WH40K.getQualityDefinition = function (identifier) {
    // Strip level suffix if present
    const baseId = identifier.replace(/-\d+$/, '').replace(/-x$/i, '');
    return this.weaponQualities[baseId] ?? null;
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

    let label = game.i18n.localize(def.label);
    if (def.hasLevel && level !== null) {
        label += ` (${level})`;
    } else if (def.hasLevel) {
        label += ` (X)`;
    }

    return label;
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
WH40K.getJamThreshold = function (weapon) {
    const craftsmanship = weapon.system?.craftsmanship;
    const qualities = weapon.system?.effectiveSpecial || weapon.system?.special;

    // Best/Master-crafted never jam
    if (['best', 'master-crafted'].includes(craftsmanship)) {
        return null;
    }

    // Check for reliability qualities
    if (qualities?.has?.('unreliable-2')) return 90;
    if (qualities?.has?.('unreliable')) return 96;
    if (qualities?.has?.('reliable')) return 95;

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
            label: 'WH40K.Combat.Action.Disengage',
            type: 'full',
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
