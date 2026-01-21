/**
 * Rogue Trader System Configuration
 * Central configuration object for the Rogue Trader RPG system.
 */

export const ROGUE_TRADER = {};

/* -------------------------------------------- */
/*  Characteristics                             */
/* -------------------------------------------- */

/**
 * The set of characteristics used in the system.
 * @type {Object<string, {label: string, abbreviation: string}>}
 */
ROGUE_TRADER.characteristics = {
    weaponSkill: { label: 'RT.Characteristic.WeaponSkill', abbreviation: 'WS' },
    ballisticSkill: { label: 'RT.Characteristic.BallisticSkill', abbreviation: 'BS' },
    strength: { label: 'RT.Characteristic.Strength', abbreviation: 'S' },
    toughness: { label: 'RT.Characteristic.Toughness', abbreviation: 'T' },
    agility: { label: 'RT.Characteristic.Agility', abbreviation: 'Ag' },
    intelligence: { label: 'RT.Characteristic.Intelligence', abbreviation: 'Int' },
    perception: { label: 'RT.Characteristic.Perception', abbreviation: 'Per' },
    willpower: { label: 'RT.Characteristic.Willpower', abbreviation: 'WP' },
    fellowship: { label: 'RT.Characteristic.Fellowship', abbreviation: 'Fel' },
    influence: { label: 'RT.Characteristic.Influence', abbreviation: 'Inf' },
};

/* -------------------------------------------- */
/*  Availability                                */
/* -------------------------------------------- */

/**
 * Item availability ratings.
 * @type {Object<string, {label: string, modifier: number}>}
 */
ROGUE_TRADER.availabilities = {
    'ubiquitous': { label: 'RT.Availability.Ubiquitous', modifier: 70 },
    'abundant': { label: 'RT.Availability.Abundant', modifier: 50 },
    'plentiful': { label: 'RT.Availability.Plentiful', modifier: 30 },
    'common': { label: 'RT.Availability.Common', modifier: 20 },
    'average': { label: 'RT.Availability.Average', modifier: 10 },
    'scarce': { label: 'RT.Availability.Scarce', modifier: 0 },
    'rare': { label: 'RT.Availability.Rare', modifier: -10 },
    'very-rare': { label: 'RT.Availability.VeryRare', modifier: -20 },
    'extremely-rare': { label: 'RT.Availability.ExtremelyRare', modifier: -30 },
    'near-unique': { label: 'RT.Availability.NearUnique', modifier: -50 },
    'unique': { label: 'RT.Availability.Unique', modifier: -70 },
};

/* -------------------------------------------- */
/*  Craftsmanship                               */
/* -------------------------------------------- */

/**
 * Item craftsmanship levels.
 * @type {Object<string, {label: string, modifier: number}>}
 */
ROGUE_TRADER.craftsmanships = {
    poor: { label: 'RT.Craftsmanship.Poor', modifier: -10 },
    common: { label: 'RT.Craftsmanship.Common', modifier: 0 },
    good: { label: 'RT.Craftsmanship.Good', modifier: 5 },
    best: { label: 'RT.Craftsmanship.Best', modifier: 10 },
};

/* -------------------------------------------- */
/*  Gear Categories                             */
/* -------------------------------------------- */

/**
 * Gear item categories with icons and labels.
 * @type {Object<string, {label: string, icon: string}>}
 */
ROGUE_TRADER.gearCategories = {
    general: { label: 'RT.GearCategory.General', icon: 'fa-box' },
    tools: { label: 'RT.GearCategory.Tools', icon: 'fa-wrench' },
    drugs: { label: 'RT.GearCategory.Drugs', icon: 'fa-flask' },
    consumable: { label: 'RT.GearCategory.Consumable', icon: 'fa-fire' },
    clothing: { label: 'RT.GearCategory.Clothing', icon: 'fa-shirt' },
    survival: { label: 'RT.GearCategory.Survival', icon: 'fa-tent' },
    communications: { label: 'RT.GearCategory.Communications', icon: 'fa-satellite-dish' },
    detection: { label: 'RT.GearCategory.Detection', icon: 'fa-radar' },
    medical: { label: 'RT.GearCategory.Medical', icon: 'fa-briefcase-medical' },
    tech: { label: 'RT.GearCategory.Tech', icon: 'fa-microchip' },
    religious: { label: 'RT.GearCategory.Religious', icon: 'fa-cross' },
    luxury: { label: 'RT.GearCategory.Luxury', icon: 'fa-gem' },
    contraband: { label: 'RT.GearCategory.Contraband', icon: 'fa-skull-crossbones' },
};

/* -------------------------------------------- */
/*  Damage Types                                */
/* -------------------------------------------- */

/**
 * Damage types.
 * @type {Object<string, {label: string, abbreviation: string}>}
 */
ROGUE_TRADER.damageTypes = {
    impact: { label: 'RT.DamageType.Impact', abbreviation: 'I' },
    rending: { label: 'RT.DamageType.Rending', abbreviation: 'R' },
    explosive: { label: 'RT.DamageType.Explosive', abbreviation: 'X' },
    energy: { label: 'RT.DamageType.Energy', abbreviation: 'E' },
    fire: { label: 'RT.DamageType.Fire', abbreviation: 'F' },
    shock: { label: 'RT.DamageType.Shock', abbreviation: 'S' },
    cold: { label: 'RT.DamageType.Cold', abbreviation: 'C' },
    toxic: { label: 'RT.DamageType.Toxic', abbreviation: 'T' },
};

/* -------------------------------------------- */
/*  Weapon Classes                              */
/* -------------------------------------------- */

/**
 * Weapon classes (usage patterns only).
 * Technology types (chain, power, shock, force) are in weaponTypes.
 * @type {Object<string, {label: string}>}
 */
ROGUE_TRADER.weaponClasses = {
    melee: { label: 'RT.WeaponClass.Melee' },
    pistol: { label: 'RT.WeaponClass.Pistol' },
    basic: { label: 'RT.WeaponClass.Basic' },
    heavy: { label: 'RT.WeaponClass.Heavy' },
    thrown: { label: 'RT.WeaponClass.Thrown' },
    exotic: { label: 'RT.WeaponClass.Exotic' },
};

/**
 * Weapon types.
 * @type {Object<string, {label: string}>}
 */
ROGUE_TRADER.weaponTypes = {
    'primitive': { label: 'RT.WeaponType.Primitive' },
    'las': { label: 'RT.WeaponType.Las' },
    'solid-projectile': { label: 'RT.WeaponType.SolidProjectile' },
    'bolt': { label: 'RT.WeaponType.Bolt' },
    'melta': { label: 'RT.WeaponType.Melta' },
    'plasma': { label: 'RT.WeaponType.Plasma' },
    'flame': { label: 'RT.WeaponType.Flame' },
    'launcher': { label: 'RT.WeaponType.Launcher' },
    'explosive': { label: 'RT.WeaponType.Explosive' },
    'power': { label: 'RT.WeaponType.Power' },
    'chain': { label: 'RT.WeaponType.Chain' },
    'shock': { label: 'RT.WeaponType.Shock' },
    'force': { label: 'RT.WeaponType.Force' },
    'exotic': { label: 'RT.WeaponType.Exotic' },
    'xenos': { label: 'RT.WeaponType.Xenos' },
};

/* -------------------------------------------- */
/*  Armour Types                                */
/* -------------------------------------------- */

/**
 * Armour types.
 * @type {Object<string, {label: string}>}
 */
ROGUE_TRADER.armourTypes = {
    'flak': { label: 'RT.ArmourType.Flak' },
    'mesh': { label: 'RT.ArmourType.Mesh' },
    'carapace': { label: 'RT.ArmourType.Carapace' },
    'power': { label: 'RT.ArmourType.Power' },
    'light-power': { label: 'RT.ArmourType.LightPower' },
    'storm-trooper': { label: 'RT.ArmourType.StormTrooper' },
    'feudal-world': { label: 'RT.ArmourType.FeudalWorld' },
    'primitive': { label: 'RT.ArmourType.Primitive' },
    'xenos': { label: 'RT.ArmourType.Xenos' },
    'void': { label: 'RT.ArmourType.Void' },
    'enforcer': { label: 'RT.ArmourType.Enforcer' },
    'hostile-environment': { label: 'RT.ArmourType.HostileEnvironment' },
};

/**
 * Armour special properties.
 * @type {Object<string, {label: string, description: string}>}
 */
ROGUE_TRADER.armourProperties = {
    'sealed': {
        label: 'RT.ArmourProperty.Sealed',
        description: 'RT.ArmourProperty.SealedDesc',
    },
    'auto-stabilized': {
        label: 'RT.ArmourProperty.AutoStabilized',
        description: 'RT.ArmourProperty.AutoStabilizedDesc',
    },
    'hexagrammic': {
        label: 'RT.ArmourProperty.Hexagrammic',
        description: 'RT.ArmourProperty.HexagrammicDesc',
    },
    'blessed': {
        label: 'RT.ArmourProperty.Blessed',
        description: 'RT.ArmourProperty.BlessedDesc',
    },
    'camouflage': {
        label: 'RT.ArmourProperty.Camouflage',
        description: 'RT.ArmourProperty.CamouflageDesc',
    },
    'lightweight': {
        label: 'RT.ArmourProperty.Lightweight',
        description: 'RT.ArmourProperty.LightweightDesc',
    },
    'reinforced': {
        label: 'RT.ArmourProperty.Reinforced',
        description: 'RT.ArmourProperty.ReinforcedDesc',
    },
    'agility-bonus': {
        label: 'RT.ArmourProperty.AgilityBonus',
        description: 'RT.ArmourProperty.AgilityBonusDesc',
    },
    'strength-bonus': {
        label: 'RT.ArmourProperty.StrengthBonus',
        description: 'RT.ArmourProperty.StrengthBonusDesc',
    },
};

/* -------------------------------------------- */
/*  Body Locations                              */
/* -------------------------------------------- */

/**
 * Body hit locations.
 * @type {Object<string, {label: string, roll: string, icon: string}>}
 */
ROGUE_TRADER.bodyLocations = {
    head: { label: 'RT.BodyLocation.Head', roll: '1-10', icon: 'fa-head-side' },
    rightArm: { label: 'RT.BodyLocation.RightArm', roll: '11-20', icon: 'fa-hand' },
    leftArm: { label: 'RT.BodyLocation.LeftArm', roll: '21-30', icon: 'fa-hand' },
    body: { label: 'RT.BodyLocation.Body', roll: '31-70', icon: 'fa-person' },
    rightLeg: { label: 'RT.BodyLocation.RightLeg', roll: '71-85', icon: 'fa-socks' },
    leftLeg: { label: 'RT.BodyLocation.LeftLeg', roll: '86-100', icon: 'fa-socks' },
};

/* -------------------------------------------- */
/*  Size Categories                             */
/* -------------------------------------------- */

/**
 * Creature size categories.
 * @type {Object<number, {label: string, modifier: number}>}
 */
ROGUE_TRADER.sizes = {
    1: { label: 'RT.Size.Miniscule', modifier: -30 },
    2: { label: 'RT.Size.Puny', modifier: -20 },
    3: { label: 'RT.Size.Scrawny', modifier: -10 },
    4: { label: 'RT.Size.Average', modifier: 0 },
    5: { label: 'RT.Size.Hulking', modifier: 10 },
    6: { label: 'RT.Size.Enormous', modifier: 20 },
    7: { label: 'RT.Size.Massive', modifier: 30 },
    8: { label: 'RT.Size.Immense', modifier: 40 },
};

/* -------------------------------------------- */
/*  Psychic Disciplines                         */
/* -------------------------------------------- */

/**
 * Psychic power disciplines.
 * @type {Object<string, {label: string}>}
 */
ROGUE_TRADER.psychicDisciplines = {
    telepathy: { label: 'RT.PsychicDiscipline.Telepathy' },
    telekinesis: { label: 'RT.PsychicDiscipline.Telekinesis' },
    divination: { label: 'RT.PsychicDiscipline.Divination' },
    pyromancy: { label: 'RT.PsychicDiscipline.Pyromancy' },
    biomancy: { label: 'RT.PsychicDiscipline.Biomancy' },
    daemonology: { label: 'RT.PsychicDiscipline.Daemonology' },
};

/* -------------------------------------------- */
/*  Ship Hull Types                             */
/* -------------------------------------------- */

/**
 * Starship hull types.
 * @type {Object<string, {label: string, space: number, speed: number}>}
 */
ROGUE_TRADER.hullTypes = {
    'transport': { label: 'RT.HullType.Transport', space: 40, speed: 3 },
    'raider': { label: 'RT.HullType.Raider', space: 35, speed: 9 },
    'frigate': { label: 'RT.HullType.Frigate', space: 40, speed: 7 },
    'light-cruiser': { label: 'RT.HullType.LightCruiser', space: 60, speed: 6 },
    'cruiser': { label: 'RT.HullType.Cruiser', space: 75, speed: 5 },
    'battlecruiser': { label: 'RT.HullType.Battlecruiser', space: 80, speed: 5 },
    'grand-cruiser': { label: 'RT.HullType.GrandCruiser', space: 90, speed: 4 },
};

/* -------------------------------------------- */
/*  Ship Component Types                        */
/* -------------------------------------------- */

/**
 * Ship component categories.
 * @type {Object<string, {label: string}>}
 */
ROGUE_TRADER.shipComponentTypes = {
    essential: { label: 'RT.ShipComponent.Essential' },
    supplemental: { label: 'RT.ShipComponent.Supplemental' },
    weapons: { label: 'RT.ShipComponent.Weapons' },
    auger: { label: 'RT.ShipComponent.Auger' },
    gellarField: { label: 'RT.ShipComponent.GellarField' },
    voidShields: { label: 'RT.ShipComponent.VoidShields' },
    warpDrive: { label: 'RT.ShipComponent.WarpDrive' },
    plasmaDrive: { label: 'RT.ShipComponent.PlasmaDrive' },
    lifeSupport: { label: 'RT.ShipComponent.LifeSupport' },
    quarters: { label: 'RT.ShipComponent.Quarters' },
    bridge: { label: 'RT.ShipComponent.Bridge' },
    generatorum: { label: 'RT.ShipComponent.Generatorum' },
    augment: { label: 'RT.ShipComponent.Augment' },
    archeotech: { label: 'RT.ShipComponent.Archeotech' },
    xenotech: { label: 'RT.ShipComponent.Xenotech' },
};

/* -------------------------------------------- */
/*  Origin Path Steps                           */
/* -------------------------------------------- */

/**
 * Origin path steps.
 * @type {Object<string, {label: string, index: number}>}
 */
ROGUE_TRADER.originPathSteps = {
    homeWorld: { label: 'RT.OriginPath.HomeWorld', index: 0 },
    birthright: { label: 'RT.OriginPath.Birthright', index: 1 },
    lureOfTheVoid: { label: 'RT.OriginPath.LureOfTheVoid', index: 2 },
    trialsAndTravails: { label: 'RT.OriginPath.TrialsAndTravails', index: 3 },
    motivation: { label: 'RT.OriginPath.Motivation', index: 4 },
    career: { label: 'RT.OriginPath.Career', index: 5 },
};

/* -------------------------------------------- */
/*  Careers                                     */
/* -------------------------------------------- */

/**
 * Character careers/archetypes.
 * @type {Object<string, {label: string}>}
 */
ROGUE_TRADER.careers = {
    rogueTrader: { label: 'RT.Career.RogueTrader' },
    archMilitant: { label: 'RT.Career.ArchMilitant' },
    astropathTranscendent: { label: 'RT.Career.AstropathTranscendent' },
    explorator: { label: 'RT.Career.Explorator' },
    missionary: { label: 'RT.Career.Missionary' },
    navigator: { label: 'RT.Career.Navigator' },
    seneschal: { label: 'RT.Career.Seneschal' },
    voidMaster: { label: 'RT.Career.VoidMaster' },
};

/* -------------------------------------------- */
/*  Talent Categories                           */
/* -------------------------------------------- */

/**
 * Talent categories.
 * @type {Object<string, {label: string}>}
 */
ROGUE_TRADER.talentCategories = {
    general: { label: 'RT.TalentCategory.General' },
    combat: { label: 'RT.TalentCategory.Combat' },
    social: { label: 'RT.TalentCategory.Social' },
    investigation: { label: 'RT.TalentCategory.Investigation' },
    psychic: { label: 'RT.TalentCategory.Psychic' },
    navigator: { label: 'RT.TalentCategory.Navigator' },
    tech: { label: 'RT.TalentCategory.Tech' },
    leadership: { label: 'RT.TalentCategory.Leadership' },
    unique: { label: 'RT.TalentCategory.Unique' },
    career: { label: 'RT.TalentCategory.Career' },
};

/**
 * Trait categories.
 * @type {Object<string, {label: string}>}
 */
ROGUE_TRADER.traitCategories = {
    general: { label: 'RT.TraitCategory.General' },
    creature: { label: 'RT.TraitCategory.Creature' },
    character: { label: 'RT.TraitCategory.Character' },
    elite: { label: 'RT.TraitCategory.Elite' },
    unique: { label: 'RT.TraitCategory.Unique' },
    origin: { label: 'RT.TraitCategory.Origin' },
};

/* -------------------------------------------- */
/*  Action Types                                */
/* -------------------------------------------- */

/**
 * Action types.
 * @type {Object<string, {label: string}>}
 */
ROGUE_TRADER.actionTypes = {
    'action': { label: 'RT.ActionType.Action' },
    'half-action': { label: 'RT.ActionType.HalfAction' },
    'full-action': { label: 'RT.ActionType.FullAction' },
    'extended-action': { label: 'RT.ActionType.ExtendedAction' },
    'reaction': { label: 'RT.ActionType.Reaction' },
    'free-action': { label: 'RT.ActionType.FreeAction' },
    'passive': { label: 'RT.ActionType.Passive' },
};

/* -------------------------------------------- */
/*  NPC Types                                   */
/* -------------------------------------------- */

/**
 * NPC threat types.
 * @type {Object<string, {label: string}>}
 */
ROGUE_TRADER.npcTypes = {
    troop: { label: 'RT.NPCType.Troop' },
    elite: { label: 'RT.NPCType.Elite' },
    master: { label: 'RT.NPCType.Master' },
    legendary: { label: 'RT.NPCType.Legendary' },
};

/* -------------------------------------------- */
/*  Vehicle Types                               */
/* -------------------------------------------- */

/**
 * Vehicle type classifications.
 * @type {Object<string, {label: string, icon: string}>}
 */
ROGUE_TRADER.vehicleTypes = {
    vehicle: { label: 'RT.VehicleType.Vehicle', icon: 'fa-car' },
    walker: { label: 'RT.VehicleType.Walker', icon: 'fa-robot' },
    flyer: { label: 'RT.VehicleType.Flyer', icon: 'fa-plane' },
    skimmer: { label: 'RT.VehicleType.Skimmer', icon: 'fa-helicopter' },
    bike: { label: 'RT.VehicleType.Bike', icon: 'fa-motorcycle' },
    tank: { label: 'RT.VehicleType.Tank', icon: 'fa-shield' },
};

/**
 * Vehicle class categories.
 * @type {Object<string, {label: string}>}
 */
ROGUE_TRADER.vehicleClasses = {
    ground: { label: 'RT.VehicleClass.Ground' },
    air: { label: 'RT.VehicleClass.Air' },
    water: { label: 'RT.VehicleClass.Water' },
    space: { label: 'RT.VehicleClass.Space' },
    walker: { label: 'RT.VehicleClass.Walker' },
};

/**
 * Vehicle size categories (aligned with creature sizes).
 * @type {Object<number, {label: string, modifier: number, descriptor: string}>}
 */
ROGUE_TRADER.vehicleSizes = {
    1: { label: 'RT.Size.Miniscule', modifier: -30, descriptor: '~1m' },
    2: { label: 'RT.Size.Puny', modifier: -20, descriptor: '~2m' },
    3: { label: 'RT.Size.Scrawny', modifier: -10, descriptor: '~3-5m' },
    4: { label: 'RT.Size.Average', modifier: 0, descriptor: '~6-10m' },
    5: { label: 'RT.Size.Hulking', modifier: 10, descriptor: '~11-15m' },
    6: { label: 'RT.Size.Enormous', modifier: 20, descriptor: '~16-20m' },
    7: { label: 'RT.Size.Massive', modifier: 30, descriptor: '~21-30m' },
    8: { label: 'RT.Size.Immense', modifier: 40, descriptor: '~31-50m' },
    9: { label: 'RT.Size.Monumental', modifier: 50, descriptor: '~51-100m' },
    10: { label: 'RT.Size.Titanic', modifier: 60, descriptor: '100m+' },
};

/* -------------------------------------------- */
/*  Vehicle Upgrade Types                       */
/* -------------------------------------------- */

/**
 * Vehicle upgrade type classifications.
 * @type {Object<string, {label: string}>}
 */
ROGUE_TRADER.vehicleUpgradeTypes = {
    standard: { label: 'RT.VehicleUpgradeType.Standard' },
    integral: { label: 'RT.VehicleUpgradeType.Integral' },
    custom: { label: 'RT.VehicleUpgradeType.Custom' },
};

/* -------------------------------------------- */
/*  Vehicle Stats                               */
/* -------------------------------------------- */

/**
 * Vehicle stat labels.
 * @type {Object<string, {label: string, abbreviation: string}>}
 */
ROGUE_TRADER.vehicleStats = {
    speed: { label: 'RT.VehicleStat.Speed', abbreviation: 'Spd' },
    manoeuvrability: { label: 'RT.VehicleStat.Manoeuvrability', abbreviation: 'Man' },
    armour: { label: 'RT.VehicleStat.Armour', abbreviation: 'AP' },
    integrity: { label: 'RT.VehicleStat.Integrity', abbreviation: 'Int' },
};

/* -------------------------------------------- */
/*  Difficulty Modifiers                        */
/* -------------------------------------------- */

/**
 * Test difficulty modifiers.
 * @type {Object<string, {label: string, modifier: number}>}
 */
ROGUE_TRADER.difficulties = {
    trivial: { label: 'RT.Difficulty.Trivial', modifier: 60 },
    elementary: { label: 'RT.Difficulty.Elementary', modifier: 50 },
    simple: { label: 'RT.Difficulty.Simple', modifier: 40 },
    easy: { label: 'RT.Difficulty.Easy', modifier: 30 },
    routine: { label: 'RT.Difficulty.Routine', modifier: 20 },
    ordinary: { label: 'RT.Difficulty.Ordinary', modifier: 10 },
    challenging: { label: 'RT.Difficulty.Challenging', modifier: 0 },
    difficult: { label: 'RT.Difficulty.Difficult', modifier: -10 },
    hard: { label: 'RT.Difficulty.Hard', modifier: -20 },
    veryHard: { label: 'RT.Difficulty.VeryHard', modifier: -30 },
    arduous: { label: 'RT.Difficulty.Arduous', modifier: -40 },
    punishing: { label: 'RT.Difficulty.Punishing', modifier: -50 },
    hellish: { label: 'RT.Difficulty.Hellish', modifier: -60 },
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
ROGUE_TRADER.calculateDegrees = (roll, target) => {
    const difference = target - roll;
    const success = roll <= target;
    const degrees = Math.floor(Math.abs(difference) / 10) + 1;

    return {
        success,
        roll,
        target,
        degrees: success ? degrees : -degrees,
        label: success ? game.i18n.format('RT.Degrees.Success', { degrees }) : game.i18n.format('RT.Degrees.Failure', { degrees }),
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
ROGUE_TRADER.defaultIcons = {
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

ROGUE_TRADER.skillIcons = {
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

ROGUE_TRADER.getSkillIcon = function (skillKey) {
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
ROGUE_TRADER.getDefaultIcon = function (type) {
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
ROGUE_TRADER.weaponQualities = {
    // Accuracy & Reliability
    'accurate': {
        label: 'RT.WeaponQuality.Accurate',
        description: 'RT.WeaponQuality.AccurateDesc',
        hasLevel: false,
        category: 'simple-modifier',
        mechanicalEffect: true,
    },
    'inaccurate': {
        label: 'RT.WeaponQuality.Inaccurate',
        description: 'RT.WeaponQuality.InaccurateDesc',
        hasLevel: false,
    },
    'reliable': {
        label: 'RT.WeaponQuality.Reliable',
        description: 'RT.WeaponQuality.ReliableDesc',
        hasLevel: false,
    },
    'unreliable': {
        label: 'RT.WeaponQuality.Unreliable',
        description: 'RT.WeaponQuality.UnreliableDesc',
        hasLevel: false,
    },
    'unreliable-2': {
        label: 'RT.WeaponQuality.Unreliable2',
        description: 'RT.WeaponQuality.Unreliable2Desc',
        hasLevel: false,
    },

    // Melee Properties
    'balanced': {
        label: 'RT.WeaponQuality.Balanced',
        description: 'RT.WeaponQuality.BalancedDesc',
        hasLevel: false,
    },
    'defensive': {
        label: 'RT.WeaponQuality.Defensive',
        description: 'RT.WeaponQuality.DefensiveDesc',
        hasLevel: false,
    },
    'fast': {
        label: 'RT.WeaponQuality.Fast',
        description: 'RT.WeaponQuality.FastDesc',
        hasLevel: false,
    },
    'flexible': {
        label: 'RT.WeaponQuality.Flexible',
        description: 'RT.WeaponQuality.FlexibleDesc',
        hasLevel: false,
    },
    'unbalanced': {
        label: 'RT.WeaponQuality.Unbalanced',
        description: 'RT.WeaponQuality.UnbalancedDesc',
        hasLevel: false,
    },
    'unwieldy': {
        label: 'RT.WeaponQuality.Unwieldy',
        description: 'RT.WeaponQuality.UnwieldyDesc',
        hasLevel: false,
    },

    // Damage Effects
    'tearing': {
        label: 'RT.WeaponQuality.Tearing',
        description: 'RT.WeaponQuality.TearingDesc',
        hasLevel: false,
    },
    'razor-sharp': {
        label: 'RT.WeaponQuality.RazorSharp',
        description: 'RT.WeaponQuality.RazorSharpDesc',
        hasLevel: false,
    },
    'proven': {
        label: 'RT.WeaponQuality.Proven',
        description: 'RT.WeaponQuality.ProvenDesc',
        hasLevel: true,
    },
    'felling': {
        label: 'RT.WeaponQuality.Felling',
        description: 'RT.WeaponQuality.FellingDesc',
        hasLevel: true,
    },
    'crippling': {
        label: 'RT.WeaponQuality.Crippling',
        description: 'RT.WeaponQuality.CripplingDesc',
        hasLevel: true,
    },
    'devastating': {
        label: 'RT.WeaponQuality.Devastating',
        description: 'RT.WeaponQuality.DevastatingDesc',
        hasLevel: true,
    },

    // Area Effects
    'blast': {
        label: 'RT.WeaponQuality.Blast',
        description: 'RT.WeaponQuality.BlastDesc',
        hasLevel: true,
    },
    'scatter': {
        label: 'RT.WeaponQuality.Scatter',
        description: 'RT.WeaponQuality.ScatterDesc',
        hasLevel: false,
    },
    'spray': {
        label: 'RT.WeaponQuality.Spray',
        description: 'RT.WeaponQuality.SprayDesc',
        hasLevel: false,
    },
    'storm': {
        label: 'RT.WeaponQuality.Storm',
        description: 'RT.WeaponQuality.StormDesc',
        hasLevel: false,
    },

    // Status Effects
    'concussive': {
        label: 'RT.WeaponQuality.Concussive',
        description: 'RT.WeaponQuality.ConcussiveDesc',
        hasLevel: true,
    },
    'corrosive': {
        label: 'RT.WeaponQuality.Corrosive',
        description: 'RT.WeaponQuality.CorrosiveDesc',
        hasLevel: false,
    },
    'toxic': {
        label: 'RT.WeaponQuality.Toxic',
        description: 'RT.WeaponQuality.ToxicDesc',
        hasLevel: true,
    },
    'hallucinogenic': {
        label: 'RT.WeaponQuality.Hallucinogenic',
        description: 'RT.WeaponQuality.HallucinogenicDesc',
        hasLevel: true,
    },
    'snare': {
        label: 'RT.WeaponQuality.Snare',
        description: 'RT.WeaponQuality.SnareDesc',
        hasLevel: true,
    },
    'shocking': {
        label: 'RT.WeaponQuality.Shocking',
        description: 'RT.WeaponQuality.ShockingDesc',
        hasLevel: false,
    },
    'shock': {
        label: 'RT.WeaponQuality.Shock',
        description: 'RT.WeaponQuality.ShockDesc',
        hasLevel: false,
    },

    // Weapon Type Markers
    'bolt': {
        label: 'RT.WeaponQuality.Bolt',
        description: 'RT.WeaponQuality.BoltDesc',
        hasLevel: false,
    },
    'chain': {
        label: 'RT.WeaponQuality.Chain',
        description: 'RT.WeaponQuality.ChainDesc',
        hasLevel: false,
    },
    'flame': {
        label: 'RT.WeaponQuality.Flame',
        description: 'RT.WeaponQuality.FlameDesc',
        hasLevel: false,
    },
    'force': {
        label: 'RT.WeaponQuality.Force',
        description: 'RT.WeaponQuality.ForceDesc',
        hasLevel: false,
    },
    'las': {
        label: 'RT.WeaponQuality.Las',
        description: 'RT.WeaponQuality.LasDesc',
        hasLevel: false,
    },
    'melta': {
        label: 'RT.WeaponQuality.Melta',
        description: 'RT.WeaponQuality.MeltaDesc',
        hasLevel: false,
    },
    'plasma': {
        label: 'RT.WeaponQuality.Plasma',
        description: 'RT.WeaponQuality.PlasmaDesc',
        hasLevel: false,
    },
    'power': {
        label: 'RT.WeaponQuality.Power',
        description: 'RT.WeaponQuality.PowerDesc',
        hasLevel: false,
    },
    'power-field': {
        label: 'RT.WeaponQuality.PowerField',
        description: 'RT.WeaponQuality.PowerFieldDesc',
        hasLevel: false,
    },
    'primitive': {
        label: 'RT.WeaponQuality.Primitive',
        description: 'RT.WeaponQuality.PrimitiveDesc',
        hasLevel: true,
    },

    // Special Weapon Types
    'grenade': {
        label: 'RT.WeaponQuality.Grenade',
        description: 'RT.WeaponQuality.GrenadeDesc',
        hasLevel: false,
    },
    'launcher': {
        label: 'RT.WeaponQuality.Launcher',
        description: 'RT.WeaponQuality.LauncherDesc',
        hasLevel: false,
    },
    'indirect': {
        label: 'RT.WeaponQuality.Indirect',
        description: 'RT.WeaponQuality.IndirectDesc',
        hasLevel: true,
    },

    // Energy Weapon Effects
    'haywire': {
        label: 'RT.WeaponQuality.Haywire',
        description: 'RT.WeaponQuality.HaywireDesc',
        hasLevel: true,
    },
    'overheats': {
        label: 'RT.WeaponQuality.Overheats',
        description: 'RT.WeaponQuality.OverheatsDesc',
        hasLevel: false,
    },
    'overcharge': {
        label: 'RT.WeaponQuality.Overcharge',
        description: 'RT.WeaponQuality.OverchargeDesc',
        hasLevel: true,
    },
    'recharge': {
        label: 'RT.WeaponQuality.Recharge',
        description: 'RT.WeaponQuality.RechargeDesc',
        hasLevel: false,
    },
    'maximal': {
        label: 'RT.WeaponQuality.Maximal',
        description: 'RT.WeaponQuality.MaximalDesc',
        hasLevel: false,
    },

    // Special/Rare Properties
    'sanctified': {
        label: 'RT.WeaponQuality.Sanctified',
        description: 'RT.WeaponQuality.SanctifiedDesc',
        hasLevel: false,
    },
    'tainted': {
        label: 'RT.WeaponQuality.Tainted',
        description: 'RT.WeaponQuality.TaintedDesc',
        hasLevel: false,
    },
    'daemon-wep': {
        label: 'RT.WeaponQuality.DaemonWep',
        description: 'RT.WeaponQuality.DaemonWepDesc',
        hasLevel: false,
    },
    'daemonbane': {
        label: 'RT.WeaponQuality.Daemonbane',
        description: 'RT.WeaponQuality.DaemonbaneDesc',
        hasLevel: false,
    },
    'warp-weapon': {
        label: 'RT.WeaponQuality.WarpWeapon',
        description: 'RT.WeaponQuality.WarpWeaponDesc',
        hasLevel: false,
    },
    'witch-edge': {
        label: 'RT.WeaponQuality.WitchEdge',
        description: 'RT.WeaponQuality.WitchEdgeDesc',
        hasLevel: false,
    },
    'rune-wep': {
        label: 'RT.WeaponQuality.RuneWep',
        description: 'RT.WeaponQuality.RuneWepDesc',
        hasLevel: false,
    },

    // Xenos Weapons
    'gauss': {
        label: 'RT.WeaponQuality.Gauss',
        description: 'RT.WeaponQuality.GaussDesc',
        hasLevel: false,
    },
    'graviton': {
        label: 'RT.WeaponQuality.Graviton',
        description: 'RT.WeaponQuality.GravitonDesc',
        hasLevel: false,
    },
    'necron-wep': {
        label: 'RT.WeaponQuality.NecronWep',
        description: 'RT.WeaponQuality.NecronWepDesc',
        hasLevel: false,
    },

    // Special Ammunition/Effects
    'smoke': {
        label: 'RT.WeaponQuality.Smoke',
        description: 'RT.WeaponQuality.SmokeDesc',
        hasLevel: true,
    },
    'living-ammunition': {
        label: 'RT.WeaponQuality.LivingAmmunition',
        description: 'RT.WeaponQuality.LivingAmmunitionDesc',
        hasLevel: false,
    },

    // Combat Modifiers
    'twin-linked': {
        label: 'RT.WeaponQuality.TwinLinked',
        description: 'RT.WeaponQuality.TwinLinkedDesc',
        hasLevel: false,
    },
    'gyro-stabilised': {
        label: 'RT.WeaponQuality.GyroStabilised',
        description: 'RT.WeaponQuality.GyroStabilisedDesc',
        hasLevel: false,
    },
    'vengeful': {
        label: 'RT.WeaponQuality.Vengeful',
        description: 'RT.WeaponQuality.VengefulDesc',
        hasLevel: true,
    },
    'lance': {
        label: 'RT.WeaponQuality.Lance',
        description: 'RT.WeaponQuality.LanceDesc',
        hasLevel: false,
    },

    // Miscellaneous
    'decay': {
        label: 'RT.WeaponQuality.Decay',
        description: 'RT.WeaponQuality.DecayDesc',
        hasLevel: true,
    },
    'irradiated': {
        label: 'RT.WeaponQuality.Irradiated',
        description: 'RT.WeaponQuality.IrradiatedDesc',
        hasLevel: true,
    },
    'reactive': {
        label: 'RT.WeaponQuality.Reactive',
        description: 'RT.WeaponQuality.ReactiveDesc',
        hasLevel: false,
    },
    'unstable': {
        label: 'RT.WeaponQuality.Unstable',
        description: 'RT.WeaponQuality.UnstableDesc',
        hasLevel: false,
    },
    'volatile': {
        label: 'RT.WeaponQuality.Volatile',
        description: 'RT.WeaponQuality.VolatileDesc',
        hasLevel: false,
    },
    'integrated-weapon': {
        label: 'RT.WeaponQuality.IntegratedWeapon',
        description: 'RT.WeaponQuality.IntegratedWeaponDesc',
        hasLevel: false,
    },
    'ogryn-proof': {
        label: 'RT.WeaponQuality.OgrynProof',
        description: 'RT.WeaponQuality.OgrynProofDesc',
        hasLevel: false,
    },

    // Faction-Specific
    'sm-wep': {
        label: 'RT.WeaponQuality.SMWep',
        description: 'RT.WeaponQuality.SMWepDesc',
        hasLevel: false,
    },

    // Special/Placeholder
    'customised': {
        label: 'RT.WeaponQuality.Customised',
        description: 'RT.WeaponQuality.CustomisedDesc',
        hasLevel: false,
    },
    'sp': {
        label: 'RT.WeaponQuality.SP',
        description: 'RT.WeaponQuality.SPDesc',
        hasLevel: false,
    },
    'cleansing-fire': {
        label: 'RT.WeaponQuality.CleansingFire',
        description: 'RT.WeaponQuality.CleansingFireDesc',
        hasLevel: false,
    },

    // Craftsmanship-Only (never in pack data)
    'never-jam': {
        label: 'RT.WeaponQuality.NeverJam',
        description: 'RT.WeaponQuality.NeverJamDesc',
        hasLevel: false,
    },
};

/**
 * Get quality definition from identifier.
 * @param {string} identifier    Quality identifier (e.g., "tearing", "blast-3")
 * @returns {object|null}        Quality definition or null
 */
ROGUE_TRADER.getQualityDefinition = function (identifier) {
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
ROGUE_TRADER.getQualityLabel = function (identifier, level = null) {
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
ROGUE_TRADER.getQualityDescription = function (identifier) {
    const def = this.getQualityDefinition(identifier);
    if (!def) return '';

    return game.i18n.localize(def.description);
};

/**
 * Get jam threshold for weapon based on qualities and craftsmanship.
 * @param {object} weapon    Weapon item
 * @returns {number|null}    Jam threshold (90-100) or null if cannot jam
 */
ROGUE_TRADER.getJamThreshold = function (weapon) {
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
ROGUE_TRADER.combatActions = {
    attacks: [
        {
            key: 'standardAttack',
            label: 'RT.Combat.Action.StandardAttack',
            type: 'half',
            description: 'RT.Combat.Action.StandardAttackDesc',
            icon: 'fa-crosshairs',
            subtypes: ['Attack', 'Melee or Ranged'],
        },
        {
            key: 'calledShot',
            label: 'RT.Combat.Action.CalledShot',
            type: 'full',
            description: 'RT.Combat.Action.CalledShotDesc',
            icon: 'fa-bullseye',
            subtypes: ['Attack', 'Concentration', 'Melee or Ranged'],
        },
        {
            key: 'allOutAttack',
            label: 'RT.Combat.Action.AllOutAttack',
            type: 'full',
            description: 'RT.Combat.Action.AllOutAttackDesc',
            icon: 'fa-bolt',
            subtypes: ['Attack', 'Melee'],
        },
        {
            key: 'guardedAttack',
            label: 'RT.Combat.Action.GuardedAttack',
            type: 'full',
            description: 'RT.Combat.Action.GuardedAttackDesc',
            icon: 'fa-shield-alt',
            subtypes: ['Attack', 'Concentration', 'Melee'],
        },
        {
            key: 'charge',
            label: 'RT.Combat.Action.Charge',
            type: 'full',
            description: 'RT.Combat.Action.ChargeDesc',
            icon: 'fa-running',
            subtypes: ['Attack', 'Melee', 'Movement'],
        },
        {
            key: 'semiAutoBurst',
            label: 'RT.Combat.Action.SemiAutoBurst',
            type: 'full',
            description: 'RT.Combat.Action.SemiAutoBurstDesc',
            icon: 'fa-stream',
            subtypes: ['Attack', 'Ranged'],
        },
        {
            key: 'fullAutoBurst',
            label: 'RT.Combat.Action.FullAutoBurst',
            type: 'full',
            description: 'RT.Combat.Action.FullAutoBurstDesc',
            icon: 'fa-wind',
            subtypes: ['Attack', 'Ranged'],
        },
        {
            key: 'suppressingFire',
            label: 'RT.Combat.Action.SuppressingFire',
            type: 'full',
            description: 'RT.Combat.Action.SuppressingFireDesc',
            icon: 'fa-times-circle',
            subtypes: ['Attack', 'Ranged'],
        },
        {
            key: 'overwatch',
            label: 'RT.Combat.Action.Overwatch',
            type: 'full',
            description: 'RT.Combat.Action.OverwatchDesc',
            icon: 'fa-eye',
            subtypes: ['Attack', 'Concentration', 'Ranged'],
        },
        {
            key: 'multipleAttacks',
            label: 'RT.Combat.Action.MultipleAttacks',
            type: 'full',
            description: 'RT.Combat.Action.MultipleAttacksDesc',
            icon: 'fa-hands',
            subtypes: ['Attack', 'Melee or Ranged'],
        },
    ],

    movement: [
        {
            key: 'move',
            label: 'RT.Combat.Action.Move',
            type: 'half-full',
            description: 'RT.Combat.Action.MoveDesc',
            icon: 'fa-walking',
            subtypes: ['Movement'],
        },
        {
            key: 'run',
            label: 'RT.Combat.Action.Run',
            type: 'full',
            description: 'RT.Combat.Action.RunDesc',
            icon: 'fa-running',
            subtypes: ['Movement'],
        },
        {
            key: 'disengage',
            label: 'RT.Combat.Action.Disengage',
            type: 'full',
            description: 'RT.Combat.Action.DisengageDesc',
            icon: 'fa-undo',
            subtypes: ['Movement'],
        },
        {
            key: 'jumpLeap',
            label: 'RT.Combat.Action.JumpLeap',
            type: 'full',
            description: 'RT.Combat.Action.JumpLeapDesc',
            icon: 'fa-arrow-up',
            subtypes: ['Movement'],
        },
        {
            key: 'tacticalAdvance',
            label: 'RT.Combat.Action.TacticalAdvance',
            type: 'full',
            description: 'RT.Combat.Action.TacticalAdvanceDesc',
            icon: 'fa-chess-knight',
            subtypes: ['Concentration', 'Movement'],
        },
        {
            key: 'standMount',
            label: 'RT.Combat.Action.StandMount',
            type: 'half',
            description: 'RT.Combat.Action.StandMountDesc',
            icon: 'fa-arrow-circle-up',
            subtypes: ['Movement'],
        },
    ],

    reactions: [
        {
            key: 'dodge',
            label: 'RT.Combat.Action.Dodge',
            type: 'reaction',
            description: 'RT.Combat.Action.DodgeDesc',
            icon: 'fa-running',
            subtypes: ['Movement'],
        },
        {
            key: 'parry',
            label: 'RT.Combat.Action.Parry',
            type: 'reaction',
            description: 'RT.Combat.Action.ParryDesc',
            icon: 'fa-shield-alt',
            subtypes: ['Defence', 'Melee'],
        },
    ],

    utility: [
        {
            key: 'aim',
            label: 'RT.Combat.Action.Aim',
            type: 'half-full',
            description: 'RT.Combat.Action.AimDesc',
            icon: 'fa-dot-circle',
            subtypes: ['Concentration'],
        },
        {
            key: 'ready',
            label: 'RT.Combat.Action.Ready',
            type: 'half',
            description: 'RT.Combat.Action.ReadyDesc',
            icon: 'fa-hand-paper',
            subtypes: ['Miscellaneous'],
        },
        {
            key: 'reload',
            label: 'RT.Combat.Action.Reload',
            type: 'varies',
            description: 'RT.Combat.Action.ReloadDesc',
            icon: 'fa-sync',
            subtypes: ['Miscellaneous'],
        },
        {
            key: 'delay',
            label: 'RT.Combat.Action.Delay',
            type: 'half',
            description: 'RT.Combat.Action.DelayDesc',
            icon: 'fa-pause-circle',
            subtypes: ['Miscellaneous'],
        },
        {
            key: 'feint',
            label: 'RT.Combat.Action.Feint',
            type: 'half',
            description: 'RT.Combat.Action.FeintDesc',
            icon: 'fa-mask',
            subtypes: ['Attack', 'Melee'],
        },
        {
            key: 'grapple',
            label: 'RT.Combat.Action.Grapple',
            type: 'half-full',
            description: 'RT.Combat.Action.GrappleDesc',
            icon: 'fa-hand-rock',
            subtypes: ['Attack', 'Melee'],
        },
        {
            key: 'defensiveStance',
            label: 'RT.Combat.Action.DefensiveStance',
            type: 'full',
            description: 'RT.Combat.Action.DefensiveStanceDesc',
            icon: 'fa-user-shield',
            subtypes: ['Concentration', 'Melee'],
        },
        {
            key: 'braceHeavy',
            label: 'RT.Combat.Action.BraceHeavy',
            type: 'half',
            description: 'RT.Combat.Action.BraceHeavyDesc',
            icon: 'fa-level-down-alt',
            subtypes: ['Miscellaneous'],
        },
        {
            key: 'knockDown',
            label: 'RT.Combat.Action.KnockDown',
            type: 'half',
            description: 'RT.Combat.Action.KnockDownDesc',
            icon: 'fa-arrow-down',
            subtypes: ['Attack', 'Melee'],
        },
        {
            key: 'stun',
            label: 'RT.Combat.Action.Stun',
            type: 'full',
            description: 'RT.Combat.Action.StunDesc',
            icon: 'fa-star-half-alt',
            subtypes: ['Attack', 'Melee'],
        },
        {
            key: 'manoeuvre',
            label: 'RT.Combat.Action.Manoeuvre',
            type: 'half',
            description: 'RT.Combat.Action.ManoeuvreDesc',
            icon: 'fa-arrows-alt',
            subtypes: ['Attack', 'Melee', 'Movement'],
        },
    ],
};

/* -------------------------------------------- */
/*  Export                                      */
/* -------------------------------------------- */

export default ROGUE_TRADER;
