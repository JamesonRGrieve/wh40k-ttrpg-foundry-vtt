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
  weaponSkill: { label: "RT.Characteristic.WeaponSkill", abbreviation: "WS" },
  ballisticSkill: { label: "RT.Characteristic.BallisticSkill", abbreviation: "BS" },
  strength: { label: "RT.Characteristic.Strength", abbreviation: "S" },
  toughness: { label: "RT.Characteristic.Toughness", abbreviation: "T" },
  agility: { label: "RT.Characteristic.Agility", abbreviation: "Ag" },
  intelligence: { label: "RT.Characteristic.Intelligence", abbreviation: "Int" },
  perception: { label: "RT.Characteristic.Perception", abbreviation: "Per" },
  willpower: { label: "RT.Characteristic.Willpower", abbreviation: "WP" },
  fellowship: { label: "RT.Characteristic.Fellowship", abbreviation: "Fel" },
  influence: { label: "RT.Characteristic.Influence", abbreviation: "Inf" }
};

/* -------------------------------------------- */
/*  Availability                                */
/* -------------------------------------------- */

/**
 * Item availability ratings.
 * @type {Object<string, {label: string, modifier: number}>}
 */
ROGUE_TRADER.availabilities = {
  ubiquitous: { label: "RT.Availability.Ubiquitous", modifier: 70 },
  abundant: { label: "RT.Availability.Abundant", modifier: 50 },
  plentiful: { label: "RT.Availability.Plentiful", modifier: 30 },
  common: { label: "RT.Availability.Common", modifier: 20 },
  average: { label: "RT.Availability.Average", modifier: 10 },
  scarce: { label: "RT.Availability.Scarce", modifier: 0 },
  rare: { label: "RT.Availability.Rare", modifier: -10 },
  "very-rare": { label: "RT.Availability.VeryRare", modifier: -20 },
  "extremely-rare": { label: "RT.Availability.ExtremelyRare", modifier: -30 },
  "near-unique": { label: "RT.Availability.NearUnique", modifier: -50 },
  unique: { label: "RT.Availability.Unique", modifier: -70 }
};

/* -------------------------------------------- */
/*  Craftsmanship                               */
/* -------------------------------------------- */

/**
 * Item craftsmanship levels.
 * @type {Object<string, {label: string, modifier: number}>}
 */
ROGUE_TRADER.craftsmanships = {
  poor: { label: "RT.Craftsmanship.Poor", modifier: -10 },
  common: { label: "RT.Craftsmanship.Common", modifier: 0 },
  good: { label: "RT.Craftsmanship.Good", modifier: 5 },
  best: { label: "RT.Craftsmanship.Best", modifier: 10 }
};

/* -------------------------------------------- */
/*  Damage Types                                */
/* -------------------------------------------- */

/**
 * Damage types.
 * @type {Object<string, {label: string, abbreviation: string}>}
 */
ROGUE_TRADER.damageTypes = {
  impact: { label: "RT.DamageType.Impact", abbreviation: "I" },
  rending: { label: "RT.DamageType.Rending", abbreviation: "R" },
  explosive: { label: "RT.DamageType.Explosive", abbreviation: "X" },
  energy: { label: "RT.DamageType.Energy", abbreviation: "E" },
  fire: { label: "RT.DamageType.Fire", abbreviation: "F" },
  shock: { label: "RT.DamageType.Shock", abbreviation: "S" },
  cold: { label: "RT.DamageType.Cold", abbreviation: "C" },
  toxic: { label: "RT.DamageType.Toxic", abbreviation: "T" }
};

/* -------------------------------------------- */
/*  Weapon Classes                              */
/* -------------------------------------------- */

/**
 * Weapon classes.
 * @type {Object<string, {label: string}>}
 */
ROGUE_TRADER.weaponClasses = {
  melee: { label: "RT.WeaponClass.Melee" },
  pistol: { label: "RT.WeaponClass.Pistol" },
  basic: { label: "RT.WeaponClass.Basic" },
  heavy: { label: "RT.WeaponClass.Heavy" },
  thrown: { label: "RT.WeaponClass.Thrown" },
  exotic: { label: "RT.WeaponClass.Exotic" }
};

/**
 * Weapon types.
 * @type {Object<string, {label: string}>}
 */
ROGUE_TRADER.weaponTypes = {
  primitive: { label: "RT.WeaponType.Primitive" },
  las: { label: "RT.WeaponType.Las" },
  "solid-projectile": { label: "RT.WeaponType.SolidProjectile" },
  bolt: { label: "RT.WeaponType.Bolt" },
  melta: { label: "RT.WeaponType.Melta" },
  plasma: { label: "RT.WeaponType.Plasma" },
  flame: { label: "RT.WeaponType.Flame" },
  launcher: { label: "RT.WeaponType.Launcher" },
  explosive: { label: "RT.WeaponType.Explosive" },
  power: { label: "RT.WeaponType.Power" },
  chain: { label: "RT.WeaponType.Chain" },
  shock: { label: "RT.WeaponType.Shock" },
  force: { label: "RT.WeaponType.Force" },
  exotic: { label: "RT.WeaponType.Exotic" },
  xenos: { label: "RT.WeaponType.Xenos" }
};

/* -------------------------------------------- */
/*  Armour Types                                */
/* -------------------------------------------- */

/**
 * Armour types.
 * @type {Object<string, {label: string}>}
 */
ROGUE_TRADER.armourTypes = {
  flak: { label: "RT.ArmourType.Flak" },
  mesh: { label: "RT.ArmourType.Mesh" },
  carapace: { label: "RT.ArmourType.Carapace" },
  power: { label: "RT.ArmourType.Power" },
  "light-power": { label: "RT.ArmourType.LightPower" },
  primitive: { label: "RT.ArmourType.Primitive" },
  xenos: { label: "RT.ArmourType.Xenos" },
  void: { label: "RT.ArmourType.Void" }
};

/* -------------------------------------------- */
/*  Body Locations                              */
/* -------------------------------------------- */

/**
 * Body hit locations.
 * @type {Object<string, {label: string, roll: string}>}
 */
ROGUE_TRADER.bodyLocations = {
  head: { label: "RT.BodyLocation.Head", roll: "1-10" },
  rightArm: { label: "RT.BodyLocation.RightArm", roll: "11-20" },
  leftArm: { label: "RT.BodyLocation.LeftArm", roll: "21-30" },
  body: { label: "RT.BodyLocation.Body", roll: "31-70" },
  rightLeg: { label: "RT.BodyLocation.RightLeg", roll: "71-85" },
  leftLeg: { label: "RT.BodyLocation.LeftLeg", roll: "86-100" }
};

/* -------------------------------------------- */
/*  Size Categories                             */
/* -------------------------------------------- */

/**
 * Creature size categories.
 * @type {Object<number, {label: string, modifier: number}>}
 */
ROGUE_TRADER.sizes = {
  1: { label: "RT.Size.Miniscule", modifier: -30 },
  2: { label: "RT.Size.Puny", modifier: -20 },
  3: { label: "RT.Size.Scrawny", modifier: -10 },
  4: { label: "RT.Size.Average", modifier: 0 },
  5: { label: "RT.Size.Hulking", modifier: 10 },
  6: { label: "RT.Size.Enormous", modifier: 20 },
  7: { label: "RT.Size.Massive", modifier: 30 },
  8: { label: "RT.Size.Immense", modifier: 40 }
};

/* -------------------------------------------- */
/*  Psychic Disciplines                         */
/* -------------------------------------------- */

/**
 * Psychic power disciplines.
 * @type {Object<string, {label: string}>}
 */
ROGUE_TRADER.psychicDisciplines = {
  telepathy: { label: "RT.PsychicDiscipline.Telepathy" },
  telekinesis: { label: "RT.PsychicDiscipline.Telekinesis" },
  divination: { label: "RT.PsychicDiscipline.Divination" },
  pyromancy: { label: "RT.PsychicDiscipline.Pyromancy" },
  biomancy: { label: "RT.PsychicDiscipline.Biomancy" },
  daemonology: { label: "RT.PsychicDiscipline.Daemonology" }
};

/* -------------------------------------------- */
/*  Ship Hull Types                             */
/* -------------------------------------------- */

/**
 * Starship hull types.
 * @type {Object<string, {label: string, space: number, speed: number}>}
 */
ROGUE_TRADER.hullTypes = {
  transport: { label: "RT.HullType.Transport", space: 40, speed: 3 },
  raider: { label: "RT.HullType.Raider", space: 35, speed: 9 },
  frigate: { label: "RT.HullType.Frigate", space: 40, speed: 7 },
  "light-cruiser": { label: "RT.HullType.LightCruiser", space: 60, speed: 6 },
  cruiser: { label: "RT.HullType.Cruiser", space: 75, speed: 5 },
  battlecruiser: { label: "RT.HullType.Battlecruiser", space: 80, speed: 5 },
  "grand-cruiser": { label: "RT.HullType.GrandCruiser", space: 90, speed: 4 }
};

/* -------------------------------------------- */
/*  Ship Component Types                        */
/* -------------------------------------------- */

/**
 * Ship component categories.
 * @type {Object<string, {label: string}>}
 */
ROGUE_TRADER.shipComponentTypes = {
  essential: { label: "RT.ShipComponent.Essential" },
  supplemental: { label: "RT.ShipComponent.Supplemental" },
  weapons: { label: "RT.ShipComponent.Weapons" },
  auger: { label: "RT.ShipComponent.Auger" },
  gellarField: { label: "RT.ShipComponent.GellarField" },
  voidShields: { label: "RT.ShipComponent.VoidShields" },
  warpDrive: { label: "RT.ShipComponent.WarpDrive" },
  plasmaDrive: { label: "RT.ShipComponent.PlasmaDrive" },
  lifeSupport: { label: "RT.ShipComponent.LifeSupport" },
  quarters: { label: "RT.ShipComponent.Quarters" },
  bridge: { label: "RT.ShipComponent.Bridge" },
  generatorum: { label: "RT.ShipComponent.Generatorum" },
  augment: { label: "RT.ShipComponent.Augment" },
  archeotech: { label: "RT.ShipComponent.Archeotech" },
  xenotech: { label: "RT.ShipComponent.Xenotech" }
};

/* -------------------------------------------- */
/*  Origin Path Steps                           */
/* -------------------------------------------- */

/**
 * Origin path steps.
 * @type {Object<string, {label: string, index: number}>}
 */
ROGUE_TRADER.originPathSteps = {
  homeWorld: { label: "RT.OriginPath.HomeWorld", index: 0 },
  birthright: { label: "RT.OriginPath.Birthright", index: 1 },
  lureOfTheVoid: { label: "RT.OriginPath.LureOfTheVoid", index: 2 },
  trialsAndTravails: { label: "RT.OriginPath.TrialsAndTravails", index: 3 },
  motivation: { label: "RT.OriginPath.Motivation", index: 4 },
  career: { label: "RT.OriginPath.Career", index: 5 }
};

/* -------------------------------------------- */
/*  Careers                                     */
/* -------------------------------------------- */

/**
 * Character careers/archetypes.
 * @type {Object<string, {label: string}>}
 */
ROGUE_TRADER.careers = {
  rogueTrader: { label: "RT.Career.RogueTrader" },
  archMilitant: { label: "RT.Career.ArchMilitant" },
  astropathTranscendent: { label: "RT.Career.AstropathTranscendent" },
  explorator: { label: "RT.Career.Explorator" },
  missionary: { label: "RT.Career.Missionary" },
  navigator: { label: "RT.Career.Navigator" },
  seneschal: { label: "RT.Career.Seneschal" },
  voidMaster: { label: "RT.Career.VoidMaster" }
};

/* -------------------------------------------- */
/*  Talent Categories                           */
/* -------------------------------------------- */

/**
 * Talent categories.
 * @type {Object<string, {label: string}>}
 */
ROGUE_TRADER.talentCategories = {
  general: { label: "RT.TalentCategory.General" },
  combat: { label: "RT.TalentCategory.Combat" },
  social: { label: "RT.TalentCategory.Social" },
  investigation: { label: "RT.TalentCategory.Investigation" },
  psychic: { label: "RT.TalentCategory.Psychic" },
  navigator: { label: "RT.TalentCategory.Navigator" },
  tech: { label: "RT.TalentCategory.Tech" },
  leadership: { label: "RT.TalentCategory.Leadership" },
  unique: { label: "RT.TalentCategory.Unique" },
  career: { label: "RT.TalentCategory.Career" }
};

/* -------------------------------------------- */
/*  Action Types                                */
/* -------------------------------------------- */

/**
 * Action types.
 * @type {Object<string, {label: string}>}
 */
ROGUE_TRADER.actionTypes = {
  action: { label: "RT.ActionType.Action" },
  "half-action": { label: "RT.ActionType.HalfAction" },
  "full-action": { label: "RT.ActionType.FullAction" },
  "extended-action": { label: "RT.ActionType.ExtendedAction" },
  reaction: { label: "RT.ActionType.Reaction" },
  "free-action": { label: "RT.ActionType.FreeAction" },
  passive: { label: "RT.ActionType.Passive" }
};

/* -------------------------------------------- */
/*  NPC Types                                   */
/* -------------------------------------------- */

/**
 * NPC threat types.
 * @type {Object<string, {label: string}>}
 */
ROGUE_TRADER.npcTypes = {
  troop: { label: "RT.NPCType.Troop" },
  elite: { label: "RT.NPCType.Elite" },
  master: { label: "RT.NPCType.Master" },
  legendary: { label: "RT.NPCType.Legendary" }
};

/* -------------------------------------------- */
/*  Difficulty Modifiers                        */
/* -------------------------------------------- */

/**
 * Test difficulty modifiers.
 * @type {Object<string, {label: string, modifier: number}>}
 */
ROGUE_TRADER.difficulties = {
  trivial: { label: "RT.Difficulty.Trivial", modifier: 60 },
  elementary: { label: "RT.Difficulty.Elementary", modifier: 50 },
  simple: { label: "RT.Difficulty.Simple", modifier: 40 },
  easy: { label: "RT.Difficulty.Easy", modifier: 30 },
  routine: { label: "RT.Difficulty.Routine", modifier: 20 },
  ordinary: { label: "RT.Difficulty.Ordinary", modifier: 10 },
  challenging: { label: "RT.Difficulty.Challenging", modifier: 0 },
  difficult: { label: "RT.Difficulty.Difficult", modifier: -10 },
  hard: { label: "RT.Difficulty.Hard", modifier: -20 },
  veryHard: { label: "RT.Difficulty.VeryHard", modifier: -30 },
  arduous: { label: "RT.Difficulty.Arduous", modifier: -40 },
  punishing: { label: "RT.Difficulty.Punishing", modifier: -50 },
  hellish: { label: "RT.Difficulty.Hellish", modifier: -60 }
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
    label: success 
      ? game.i18n.format("RT.Degrees.Success", { degrees })
      : game.i18n.format("RT.Degrees.Failure", { degrees })
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
  weapon: "modules/game-icons-net/blacktransparent/crossed-swords.svg",
  armour: "modules/game-icons-net/blacktransparent/shield.svg",
  ammunition: "modules/game-icons-net/blacktransparent/bullets.svg",
  gear: "modules/game-icons-net/blacktransparent/backpack.svg",
  talent: "modules/game-icons-net/blacktransparent/light-bulb.svg",
  trait: "modules/game-icons-net/blacktransparent/person.svg",
  psychicPower: "modules/game-icons-net/blacktransparent/psychic-waves.svg",
  skill: "modules/game-icons-net/blacktransparent/skills.svg",
  cybernetic: "modules/game-icons-net/blacktransparent/cyber-eye.svg",
  forceField: "modules/game-icons-net/blacktransparent/shield-reflect.svg",
  attackSpecial: "modules/game-icons-net/blacktransparent/spiked-tentacle.svg",
  weaponMod: "modules/game-icons-net/blacktransparent/gears.svg",
  criticalInjury: "modules/game-icons-net/blacktransparent/broken-bone.svg",
  origin: "modules/game-icons-net/blacktransparent/world.svg",
  
  // Actor types
  character: "modules/game-icons-net/blacktransparent/cowled.svg",
  npc: "modules/game-icons-net/blacktransparent/person.svg",
  vehicle: "modules/game-icons-net/blacktransparent/jeep.svg",
  starship: "modules/game-icons-net/blacktransparent/spaceship.svg"
};

const gameIconPath = (name) =>
  `modules/game-icons-net/whitetransparent/${name}.svg`;

ROGUE_TRADER.skillIcons = {
  acrobatics: gameIconPath("jump-across"),
  athletics: gameIconPath("run"),
  awareness: gameIconPath("binoculars"),
  barter: gameIconPath("conversation"),
  blather: gameIconPath("conversation"),
  carouse: gameIconPath("skills"),
  charm: gameIconPath("conversation"),
  chemUse: gameIconPath("medicine-pills"),
  ciphers: gameIconPath("lockpicks"),
  climb: gameIconPath("climbing"),
  command: gameIconPath("crossed-pistols"),
  commerce: gameIconPath("conversation"),
  commonLore: gameIconPath("magnifying-glass"),
  concealment: gameIconPath("backstab"),
  contortionist: gameIconPath("juggler"),
  deceive: gameIconPath("backstab"),
  demolition: gameIconPath("grenade"),
  disguise: gameIconPath("android-mask"),
  dodge: gameIconPath("sprint"),
  drive: gameIconPath("jeep"),
  evaluate: gameIconPath("magnifying-glass"),
  forbiddenLore: gameIconPath("brain"),
  gamble: gameIconPath("card-joker"),
  inquiry: gameIconPath("magnifying-glass"),
  interrogation: gameIconPath("conversation"),
  intimidate: gameIconPath("death-skull"),
  invocation: gameIconPath("psychic-waves"),
  lipReading: gameIconPath("binoculars"),
  literacy: gameIconPath("magnifying-glass"),
  logic: gameIconPath("gears"),
  medicae: gameIconPath("healing"),
  navigation: gameIconPath("compass"),
  parry: gameIconPath("crossed-swords"),
  performer: gameIconPath("juggler"),
  pilot: gameIconPath("rocket"),
  psyniscience: gameIconPath("psychic-waves"),
  scholasticLore: gameIconPath("magnifying-glass"),
  scrutiny: gameIconPath("magnifying-glass"),
  search: gameIconPath("magnifying-glass"),
  secretTongue: gameIconPath("conversation"),
  security: gameIconPath("lockpicks"),
  shadowing: gameIconPath("backstab"),
  silentMove: gameIconPath("backstab"),
  sleightOfHand: gameIconPath("juggler"),
  speakLanguage: gameIconPath("conversation"),
  stealth: gameIconPath("backstab"),
  survival: gameIconPath("lantern-flame"),
  swim: gameIconPath("sprint"),
  techUse: gameIconPath("gears"),
  tracking: gameIconPath("archery-target"),
  trade: gameIconPath("toolbox"),
  wrangling: gameIconPath("lasso")
};

ROGUE_TRADER.getSkillIcon = function(skillKey) {
  const key = typeof skillKey === "string" ? skillKey : "";
  const icon = this.skillIcons?.[key];
  if (icon) {
    return icon;
  }
  if (key) {
    const parts = key
      .replace(/[_-]+/g, " ")
      .replace(/[^a-zA-Z0-9 ]/g, " ")
      .trim()
      .split(/\s+/);
    const normalized = parts
      .map((part, index) => {
        const lower = part.toLowerCase();
        if (index === 0) return lower;
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join("");
    const normalizedIcon = this.skillIcons?.[normalized];
    if (normalizedIcon) return normalizedIcon;
  }
  return this.getDefaultIcon("skill");
};

/**
 * Get default icon for a document type.
 * @param {string} type - Document type (e.g., "weapon", "character")
 * @returns {string} Icon path
 */
ROGUE_TRADER.getDefaultIcon = function(type) {
  const icon = this.defaultIcons[type];
  return icon || "icons/svg/item-bag.svg";
};

/* -------------------------------------------- */
/*  Export                                      */
/* -------------------------------------------- */

export default ROGUE_TRADER;
