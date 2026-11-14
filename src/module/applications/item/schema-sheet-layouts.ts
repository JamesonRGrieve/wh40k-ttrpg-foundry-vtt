/**
 * The schema-sheet layouts of the item types that had no sheet of their own (#731).
 *
 * Each lists the type's stored fields by section; `defineSchemaItemSheet` turns a
 * layout into a registered sheet. Sections several types share (a power's
 * activation, target, duration and uses) are defined once with their own label
 * prefix. Field labels live in the langpack under `<prefix>.FIELDS.<path>.label`.
 */
import type { SchemaSheetLayout, SchemaSheetSection } from './schema-sheet-layout.ts';

const POWER = 'WH40K.ItemFields.Power';

/** A power's target: psychic powers carry it on their own sheet's layout, navigator powers and rituals with the rest of the power sections. */
const POWER_TARGET: SchemaSheetSection = {
    key: 'target',
    icon: 'fa-crosshairs',
    labelPrefix: POWER,
    paths: ['target.type', 'target.value', 'target.units', 'target.width', 'target.length'],
    choiceLabels: { 'target.type': 'WH40K.Target' },
};

/** Activation, target, duration and uses: the shape navigator powers and rituals share. */
const POWER_SECTIONS: readonly SchemaSheetSection[] = [
    {
        key: 'activation',
        icon: 'fa-bolt',
        labelPrefix: POWER,
        paths: ['activation.type', 'activation.cost', 'activation.condition'],
        choiceLabels: { 'activation.type': 'WH40K.ActionType' },
    },
    POWER_TARGET,
    {
        key: 'duration',
        icon: 'fa-hourglass-half',
        labelPrefix: POWER,
        paths: ['duration.value', 'duration.units', 'duration.sustained'],
        choiceLabels: { 'duration.units': 'WH40K.Duration' },
    },
    { key: 'uses', icon: 'fa-redo', labelPrefix: POWER, paths: ['uses.value', 'uses.max', 'uses.per', 'uses.recovery'] },
];

const VEHICLE_MODIFIERS: SchemaSheetSection = {
    key: 'modifiers',
    icon: 'fa-chart-line',
    labelPrefix: 'WH40K.ItemFields.VehicleModifiers',
    paths: ['modifiers.speed', 'modifiers.manoeuvrability', 'modifiers.armour', 'modifiers.integrity'],
};

/**
 * A physical item's per-place availability and the words a book prints in place
 * of a rarity ("Inquisition only"): every physical item stores both (#732).
 */
const PHYSICAL_AVAILABILITY: SchemaSheetSection = {
    key: 'availability',
    icon: 'fa-map-marked-alt',
    labelPrefix: 'WH40K.ItemFields.Physical',
    paths: ['availabilityRestriction', 'availabilityByPlace[].place', 'availabilityByPlace[].availability'],
    choiceLabels: { 'availabilityByPlace.availability': 'WH40K.Availability' },
};

const COST_PATHS = [
    'cost.dh1.throneGelt',
    'cost.dh2.influence',
    'cost.dh2.homebrew.requisition',
    'cost.dh2.homebrew.throneGelt',
    'cost.rt.profitFactor',
    'cost.rt.homebrew.throneGelt',
    'cost.dw.requisition',
    'cost.dw.homebrew.throneGelt',
    'cost.bc.infamy',
    'cost.bc.homebrew.throneGelt',
    'cost.ow.logistics',
    'cost.ow.homebrew.throneGelt',
];

const STATE_PATHS = [
    'state.equipped',
    'state.inBackpack',
    'state.inShipStorage',
    'state.container',
    'state.activated',
    'state.overloaded',
    'state.identified',
    'state.coating.name',
    'state.coating.charges',
    'state.broken',
    'state.destroyed',
    'state.locked',
    'state.armed.active',
    'state.armed.trigger',
    'state.armed.setterDegrees',
];

export const BACKPACK_LAYOUT: SchemaSheetLayout = {
    type: 'backpack',
    labelPrefix: 'WH40K.ItemFields.Backpack',
    sections: [
        { key: 'carrying', icon: 'fa-suitcase', paths: ['capacity', 'isCombatVest', 'weight', 'quantity', 'bound'] },
        {
            key: 'acquisition',
            icon: 'fa-coins',
            paths: ['availability', 'craftsmanship', 'renown'],
            choiceLabels: { availability: 'WH40K.Availability', craftsmanship: 'WH40K.Craftsmanship' },
        },
        PHYSICAL_AVAILABILITY,
        { key: 'cost', icon: 'fa-money-bill', paths: COST_PATHS },
        { key: 'state', icon: 'fa-toggle-on', paths: STATE_PATHS },
    ],
};

export const NAVIGATOR_POWER_LAYOUT: SchemaSheetLayout = {
    type: 'navigatorPower',
    labelPrefix: 'WH40K.ItemFields.NavigatorPower',
    sections: [
        {
            key: 'power',
            icon: 'fa-eye',
            paths: ['mastery', 'test.characteristic', 'test.modifier', 'test.opposed', 'test.opposedCharacteristic'],
            choiceLabels: { 'mastery': 'WH40K.Chat.Item', 'test.characteristic': 'WH40K.Characteristic' },
        },
        ...POWER_SECTIONS,
        {
            key: 'levels',
            icon: 'fa-layer-group',
            paths: [
                'levels.novice.prerequisite',
                'levels.novice.effect',
                'levels.adept.prerequisite',
                'levels.adept.effect',
                'levels.master.prerequisite',
                'levels.master.effect',
            ],
        },
        { key: 'notes', icon: 'fa-sticky-note', paths: ['sustain', 'sideEffects', 'notes'] },
    ],
};

export const OATH_LAYOUT: SchemaSheetLayout = {
    type: 'oath',
    labelPrefix: 'WH40K.ItemFields.Oath',
    sections: [{ key: 'oath', icon: 'fa-handshake', paths: ['requirement', 'effect', 'notes'] }],
};

export const ORDER_LAYOUT: SchemaSheetLayout = {
    type: 'order',
    labelPrefix: 'WH40K.ItemFields.Order',
    sections: [
        { key: 'order', icon: 'fa-bullhorn', paths: ['category', 'actionType', 'typeAndAction', 'duration'] },
        { key: 'test', icon: 'fa-dice-d20', paths: ['test.skill', 'test.characteristic', 'test.modifier', 'test.shipStat'] },
        {
            key: 'shipEffect',
            icon: 'fa-rocket',
            paths: [
                'shipActionEffect',
                'shipEffect.kind',
                'shipEffect.targets[]',
                'shipEffect.base',
                'shipEffect.step',
                'shipEffect.per',
                'shipEffect.rounds',
                'shipEffect.expiry',
            ],
        },
        { key: 'ramming', icon: 'fa-car-crash', paths: ['ramming.damage[].hullType', 'ramming.damage[].formula', 'ramming.reboundDamage'] },
        { key: 'text', icon: 'fa-scroll', paths: ['requirements', 'effect', 'failure', 'notes'] },
    ],
};

export const RITUAL_LAYOUT: SchemaSheetLayout = {
    type: 'ritual',
    labelPrefix: 'WH40K.ItemFields.Ritual',
    sections: [
        {
            key: 'ritual',
            icon: 'fa-pentagram',
            paths: ['type', 'test.characteristic', 'test.skill', 'test.modifier', 'test.threshold'],
            choiceLabels: { type: 'WH40K.RitualType' },
        },
        ...POWER_SECTIONS,
        { key: 'text', icon: 'fa-scroll', paths: ['requirements', 'costs', 'effect', 'failure', 'notes'] },
    ],
};

export const SHIP_ROLE_LAYOUT: SchemaSheetLayout = {
    type: 'shipRole',
    labelPrefix: 'WH40K.ItemFields.ShipRole',
    sections: [
        { key: 'role', icon: 'fa-user-tie', paths: ['rank', 'state.officer', 'purpose', 'careerPreferences[]', 'careerNote', 'subordinates[]'] },
        { key: 'skills', icon: 'fa-list', paths: ['importantSkills[].name', 'importantSkills[].specialization'] },
        {
            key: 'abilities',
            icon: 'fa-star',
            paths: ['abilities[].name', 'abilities[].action', 'abilities[].actionType', 'abilities[].skill', 'abilities[].bonus', 'abilities[].description'],
        },
        {
            key: 'shipBonuses',
            icon: 'fa-rocket',
            paths: ['shipBonuses.manoeuvrability', 'shipBonuses.detection', 'shipBonuses.ballisticSkill', 'shipBonuses.crewRating', 'effect', 'notes'],
        },
    ],
};

export const VEHICLE_TRAIT_LAYOUT: SchemaSheetLayout = {
    type: 'vehicleTrait',
    labelPrefix: 'WH40K.ItemFields.VehicleTrait',
    sections: [
        { key: 'trait', icon: 'fa-truck-monster', paths: ['descriptionText', 'hasLevel', 'level', 'notes'] },
        VEHICLE_MODIFIERS,
        { key: 'tests', icon: 'fa-dice-d20', paths: ['effects.testModifiers[].test', 'effects.testModifiers[].value'] },
        {
            key: 'movement',
            icon: 'fa-road',
            paths: [
                'effects.ignoresDifficultTerrain',
                'effects.amphibious',
                'effects.enhancedMovement',
                'effects.freeTurn',
                'effects.hoverer',
                'effects.flyer',
                'effects.spacecraft',
                'effects.immobile',
                'effects.ponderous',
                'effects.cannotRam',
                'effects.crashesOnFailedRam',
                'effects.ramSelfDamageMultiplier',
            ],
        },
        {
            key: 'deployment',
            icon: 'fa-parachute-box',
            paths: ['effects.orbitalDeployment', 'effects.deploymentIncomingToHitModifier', 'effects.postLandingDelayRounds'],
        },
        {
            key: 'combat',
            icon: 'fa-shield-alt',
            paths: [
                'effects.incomingRangedToHitModifier',
                'effects.incomingRangedCondition',
                'effects.incomingMeleeToHitModifier',
                'effects.canParryWithMelee',
                'effects.riderTargetableInMelee',
                'effects.hitAndRun',
                'effects.antiAir',
                'effects.sentry',
            ],
        },
        {
            key: 'crew',
            icon: 'fa-users',
            paths: [
                'effects.crewExposure',
                'effects.selfCrewed',
                'effects.ignoresCrewCritDamage',
                'effects.environmentallySealed',
                'effects.living',
                'effects.ignoresBestialFlee',
                'effects.commandUnitsByFellowship',
                'effects.rerollFailedCommand',
            ],
        },
        {
            key: 'damage',
            icon: 'fa-car-burst',
            paths: [
                'effects.critDamageMultiplier',
                'effects.critExcludesRighteousFury',
                'effects.rerollRighteousFuryCrit',
                'effects.righteousFuryCritDie',
                'effects.mitigatesMotiveCrit',
                'effects.alwaysLightlyDamaged',
                'effects.explosionChanceMultiplier',
                'effects.explosionIgnitionTestModifier',
                'effects.extinguishAsFreeAction',
                'effects.repairTimeMultiplier',
                'effects.motiveRepairTimeMultiplier',
                'effects.structuralRegeneration',
            ],
        },
        {
            key: 'forceField',
            icon: 'fa-shield-virus',
            choiceLabels: { 'effects.forceFieldCraftsmanship': 'WH40K.Craftsmanship' },
            paths: [
                'effects.forceFieldRating',
                'effects.forceFieldCraftsmanship',
                'effects.forceFieldNeverOverloads',
                'effects.forceFieldOverload.poor',
                'effects.forceFieldOverload.common',
                'effects.forceFieldOverload.good',
                'effects.forceFieldOverload.best',
                'effects.forceFieldBypassQualities[]',
            ],
        },
    ],
};

export const VEHICLE_UPGRADE_LAYOUT: SchemaSheetLayout = {
    type: 'vehicleUpgrade',
    labelPrefix: 'WH40K.ItemFields.VehicleUpgrade',
    sections: [
        {
            key: 'upgrade',
            icon: 'fa-wrench',
            paths: ['upgradeType', 'allowedVehicles', 'difficulty', 'availability', 'installCost', 'descriptionText', 'source', 'notes'],
        },
        VEHICLE_MODIFIERS,
    ],
};

/** Every schema-sheet layout, one per item type. */
export const SCHEMA_SHEET_LAYOUTS: readonly SchemaSheetLayout[] = [
    BACKPACK_LAYOUT,
    NAVIGATOR_POWER_LAYOUT,
    OATH_LAYOUT,
    ORDER_LAYOUT,
    RITUAL_LAYOUT,
    SHIP_ROLE_LAYOUT,
    VEHICLE_TRAIT_LAYOUT,
    VEHICLE_UPGRADE_LAYOUT,
];

/* -------------------------------------------- */
/*  Fields the hand-built sheets lack (#732)    */
/* -------------------------------------------- */

export const WEAPON_EXTRA_LAYOUT: SchemaSheetLayout = {
    type: 'weapon',
    labelPrefix: 'WH40K.ItemFields.Weapon',
    sections: [
        {
            key: 'attack',
            icon: 'fa-crosshairs',
            paths: [
                'attack.type',
                'attack.characteristic',
                'attack.modifier',
                'attack.range.units',
                'secondaryClass',
                'clip.type',
                'requiredTraining',
                'unarmed',
                'innate',
            ],
            choiceLabels: { 'attack.characteristic': 'WH40K.Characteristic', 'secondaryClass': 'WH40K.WeaponClass' },
        },
        { key: 'mounting', icon: 'fa-truck-moving', paths: ['mounting', 'facing', 'mountCategory'] },
        PHYSICAL_AVAILABILITY,
    ],
};

export const AMMUNITION_EXTRA_LAYOUT: SchemaSheetLayout = {
    type: 'ammunition',
    labelPrefix: 'WH40K.ItemFields.Ammunition',
    sections: [
        { key: 'ammunition', icon: 'fa-shapes', paths: ['addedQualities', 'removedQualities', 'fireRateOverride', 'costMultiplier', 'hitEffect'] },
        PHYSICAL_AVAILABILITY,
    ],
};

export const ARMOUR_EXTRA_LAYOUT: SchemaSheetLayout = {
    type: 'armour',
    labelPrefix: 'WH40K.ItemFields.Armour',
    sections: [{ key: 'armour', icon: 'fa-shield-alt', paths: ['primitive', 'forceField.protectionDice', 'forceField.overloadRange'] }, PHYSICAL_AVAILABILITY],
};

export const FORCE_FIELD_EXTRA_LAYOUT: SchemaSheetLayout = {
    type: 'forceField',
    labelPrefix: 'WH40K.ItemFields.ForceField',
    sections: [{ key: 'overload', icon: 'fa-bolt', paths: ['overloadMin', 'overloadMax'] }, PHYSICAL_AVAILABILITY],
};

/** Gear, consumables, drugs, tools and miscellanea share the gear sheet; a field a type lacks is skipped. */
export const GEAR_EXTRA_LAYOUT: SchemaSheetLayout = {
    type: 'gear',
    labelPrefix: 'WH40K.ItemFields.Gear',
    sections: [{ key: 'gear', icon: 'fa-flask', paths: ['addictive'] }, PHYSICAL_AVAILABILITY],
};

export const WEAPON_MODIFICATION_EXTRA_LAYOUT: SchemaSheetLayout = {
    type: 'weaponModification',
    labelPrefix: 'WH40K.ItemFields.WeaponModification',
    sections: [
        { key: 'restrictions', icon: 'fa-ban', paths: ['restrictions.weaponClasses', 'restrictions.weaponTypes', 'addedQualities', 'removedQualities'] },
        PHYSICAL_AVAILABILITY,
    ],
};

/** Physical items whose sheets lack only the availability pair. */
export const PHYSICAL_ONLY_LAYOUT: SchemaSheetLayout = {
    type: 'cybernetic',
    labelPrefix: 'WH40K.ItemFields.Physical',
    sections: [PHYSICAL_AVAILABILITY],
};

/* -------------------------------------------- */
/*  Structured mechanics the sheets lacked (#733) */
/* -------------------------------------------- */

/** The reroll a talent or trait grants: one section both sheets carry. */
const REROLL: SchemaSheetSection = {
    key: 'reroll',
    icon: 'fa-redo-alt',
    labelPrefix: 'WH40K.ItemFields.Reroll',
    paths: [
        'reroll.enabled',
        'reroll.label',
        'reroll.condition',
        'reroll.modifier',
        'reroll.frequency',
        'reroll.uses',
        'reroll.appliesTo.mode',
        'reroll.appliesTo.combatMode',
        'reroll.appliesTo.types[]',
        'reroll.appliesTo.keys[]',
    ],
};

export const PSYCHIC_POWER_EXTRA_LAYOUT: SchemaSheetLayout = {
    type: 'psychicPower',
    labelPrefix: 'WH40K.ItemFields.PsychicPower',
    sections: [
        POWER_TARGET,
        {
            key: 'focusPower',
            icon: 'fa-brain',
            paths: [
                'focusPower.characteristic',
                'focusPower.skill',
                'focusPower.modifier',
                'focusPower.threshold',
                'focusPower.opposed',
                'focusPower.opposedCharacteristic',
            ],
        },
        { key: 'effects', icon: 'fa-bolt', paths: ['rangePerPR', 'phenomenaModifier', 'narrativeEffect', 'overbleed'] },
    ],
};

export const TALENT_EXTRA_LAYOUT: SchemaSheetLayout = {
    type: 'talent',
    labelPrefix: 'WH40K.ItemFields.Reroll',
    sections: [REROLL],
};

export const TRAIT_EXTRA_LAYOUT: SchemaSheetLayout = {
    type: 'trait',
    labelPrefix: 'WH40K.ItemFields.Trait',
    sections: [REROLL, { key: 'critical', icon: 'fa-skull-crossbones', paths: ['criticalChart'] }],
};

export const SKILL_EXTRA_LAYOUT: SchemaSheetLayout = {
    type: 'skill',
    labelPrefix: 'WH40K.ItemFields.Skill',
    sections: [
        { key: 'skill', icon: 'fa-graduation-cap', paths: ['isBasic', 'specialist', 'descriptor', 'altCharacteristics[]'] },
        {
            key: 'difficulties',
            icon: 'fa-list-ol',
            paths: [
                'exampleDifficulties[].difficulty',
                'exampleDifficulties[].modifier',
                'exampleDifficulties[].example',
                'exampleDifficulties[].specialization',
            ],
        },
    ],
};

export const DARK_PACT_EXTRA_LAYOUT: SchemaSheetLayout = {
    type: 'darkPact',
    labelPrefix: 'WH40K.ItemFields.DarkPact',
    sections: [
        {
            key: 'terms',
            icon: 'fa-file-signature',
            paths: ['corruptionFormula', 'negotiation.dispositionBase', 'negotiation.addsCorruption', 'negotiation.testModifier'],
        },
        { key: 'boons', icon: 'fa-gift', paths: ['boons[].identifier', 'boons[].name', 'boons[].description'] },
        { key: 'banes', icon: 'fa-skull', paths: ['banes[].identifier', 'banes[].name', 'banes[].description'] },
    ],
};

/* -------------------------------------------- */
/*  Campaign and authoring fields (#734)          */
/* -------------------------------------------- */

/**
 * The in-campaign acquisition note ("where we got this") every item stores:
 * BaseItemSheet adds this section to every item sheet.
 */
export const ITEM_COMMON_LAYOUT: SchemaSheetLayout = {
    type: 'item',
    labelPrefix: 'WH40K.ItemFields.Item',
    sections: [{ key: 'acquired', icon: 'fa-hand-holding', paths: ['acquired'] }],
};

export const JOURNAL_ENTRY_EXTRA_LAYOUT: SchemaSheetLayout = {
    type: 'journalEntry',
    labelPrefix: 'WH40K.ItemFields.JournalEntry',
    sections: [
        {
            key: 'lead',
            icon: 'fa-search',
            paths: ['isLead', 'leadStatus', 'leadSource', 'leadGmRedHerring'],
            choiceLabels: { leadStatus: 'WH40K.Lead.State' },
        },
    ],
};

export const PEER_ENEMY_EXTRA_LAYOUT: SchemaSheetLayout = {
    type: 'peer',
    labelPrefix: 'WH40K.ItemFields.PeerEnemy',
    sections: [{ key: 'group', icon: 'fa-users', paths: ['group'] }],
};

export const STORAGE_LOCATION_EXTRA_LAYOUT: SchemaSheetLayout = {
    type: 'storageLocation',
    labelPrefix: 'WH40K.ItemFields.StorageLocation',
    sections: [{ key: 'storage', icon: 'fa-box', paths: ['isContainer'] }],
};

export const LOCATION_EXTRA_LAYOUT: SchemaSheetLayout = {
    type: 'location',
    labelPrefix: 'WH40K.ItemFields.Location',
    sections: [
        { key: 'homeWorld', icon: 'fa-globe', paths: ['homeWorldRules[]'] },
        { key: 'sampleCharacters', icon: 'fa-user-friends', paths: ['sampleCharacters[].name', 'sampleCharacters[].description'] },
    ],
};

/** The authoring fields; selected choices, roll results and the homebrew thrones are builder state. */
export const ORIGIN_PATH_EXTRA_LAYOUT: SchemaSheetLayout = {
    type: 'originPath',
    labelPrefix: 'WH40K.ItemFields.OriginPath',
    sections: [{ key: 'authoring', icon: 'fa-route', paths: ['isAdvancedOrigin', 'positions[]', 'replacesOrigins[]'] }],
};

export const NPC_TEMPLATE_EXTRA_LAYOUT: SchemaSheetLayout = {
    type: 'npcTemplate',
    labelPrefix: 'WH40K.ItemFields.NpcTemplate',
    sections: [
        {
            key: 'template',
            icon: 'fa-users-cog',
            paths: ['baseCharacteristics.influence', 'equipmentPreset', 'allowHorde', 'defaultMagnitude', 'tactics'],
        },
    ],
};

/** The hand-built sheets' supplementary layouts, by the item types each sheet opens. */
export const SUPPLEMENTARY_LAYOUTS: Readonly<Record<string, SchemaSheetLayout>> = {
    weapon: WEAPON_EXTRA_LAYOUT,
    ammunition: AMMUNITION_EXTRA_LAYOUT,
    armour: ARMOUR_EXTRA_LAYOUT,
    forceField: FORCE_FIELD_EXTRA_LAYOUT,
    gear: GEAR_EXTRA_LAYOUT,
    consumable: GEAR_EXTRA_LAYOUT,
    drug: GEAR_EXTRA_LAYOUT,
    tool: GEAR_EXTRA_LAYOUT,
    miscellaneous: GEAR_EXTRA_LAYOUT,
    weaponModification: WEAPON_MODIFICATION_EXTRA_LAYOUT,
    cybernetic: PHYSICAL_ONLY_LAYOUT,
    armourModification: PHYSICAL_ONLY_LAYOUT,
    psychicPower: PSYCHIC_POWER_EXTRA_LAYOUT,
    talent: TALENT_EXTRA_LAYOUT,
    trait: TRAIT_EXTRA_LAYOUT,
    skill: SKILL_EXTRA_LAYOUT,
    darkPact: DARK_PACT_EXTRA_LAYOUT,
    journalEntry: JOURNAL_ENTRY_EXTRA_LAYOUT,
    peer: PEER_ENEMY_EXTRA_LAYOUT,
    enemy: PEER_ENEMY_EXTRA_LAYOUT,
    storageLocation: STORAGE_LOCATION_EXTRA_LAYOUT,
    location: LOCATION_EXTRA_LAYOUT,
    originPath: ORIGIN_PATH_EXTRA_LAYOUT,
    npcTemplate: NPC_TEMPLATE_EXTRA_LAYOUT,
};
