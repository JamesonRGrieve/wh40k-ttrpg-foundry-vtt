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

/** Activation, target, duration and uses: the shape psychic, navigator and ritual powers share. */
const POWER_SECTIONS: readonly SchemaSheetSection[] = [
    {
        key: 'activation',
        icon: 'fa-bolt',
        labelPrefix: POWER,
        paths: ['activation.type', 'activation.cost', 'activation.condition'],
        choiceLabels: { 'activation.type': 'WH40K.ActionType' },
    },
    {
        key: 'target',
        icon: 'fa-crosshairs',
        labelPrefix: POWER,
        paths: ['target.type', 'target.value', 'target.units', 'target.width', 'target.length'],
        choiceLabels: { 'target.type': 'WH40K.Target' },
    },
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
            paths: ['availability', 'availabilityRestriction', 'availabilityByPlace[].place', 'availabilityByPlace[].availability', 'craftsmanship', 'renown'],
            choiceLabels: {
                'availability': 'WH40K.Availability',
                'availabilityByPlace.availability': 'WH40K.Availability',
                'craftsmanship': 'WH40K.Craftsmanship',
            },
        },
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
