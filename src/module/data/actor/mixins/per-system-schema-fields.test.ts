import { afterAll, describe, expect, it } from 'vitest';

/**
 * Characterization of every per-system DataModel mixin's `*SchemaFields()`
 * contract — the exact set of schema fields each Black Crusade / Deathwatch /
 * Only War template spreads into its Character DataModel. #308 (collapse the
 * per-system subclasses + table-drive registration) and #282 (table-drive the
 * per-system overview panels) must preserve these field sets; a refactor that
 * drops or renames a field fails here.
 *
 * The mixins destructure `foundry.data.fields` at module-load, so a recording
 * stub of the five field constructors is installed BEFORE the (dynamic) imports.
 * We assert the field-key set (and, for a sample, the field type) rather than
 * the deep Foundry field internals, which is the contract that matters.
 */

// Concrete ctor for the recording classes (so `toBeInstanceOf` accepts them).
type FieldCtor = new () => { readonly _kind: string };
// Broad ABSTRACT ctor for the stub slot — the real foundry.data.fields exposes
// `DataField` as an abstract constructor, so the slot must admit abstract ctors
// for the `globalThis as GlobalShim` cast to stay valid.
type AnyCtor = abstract new (...args: never[]) => object;

/**
 * Build a distinct recording field class per Foundry field type. Each call yields
 * a unique class so `toBeInstanceOf` can tell e.g. ArrayField from NumberField;
 * the mixins construct them with real field args at runtime (ignored here).
 */
function makeField(kind: string): FieldCtor {
    return class {
        readonly _kind = kind;
    };
}
const fields = {
    ArrayField: makeField('ArrayField'),
    BooleanField: makeField('BooleanField'),
    NumberField: makeField('NumberField'),
    SchemaField: makeField('SchemaField'),
    StringField: makeField('StringField'),
};
interface FoundryStub {
    data: { fields: Record<string, AnyCtor> };
}
interface GlobalShim {
    foundry?: FoundryStub | undefined;
}
const G = globalThis as GlobalShim;
const ORIGINAL_FOUNDRY = G.foundry;
G.foundry = { data: { fields } };

afterAll(() => {
    G.foundry = ORIGINAL_FOUNDRY;
});

// Imported after the stub is in place (mixins destructure foundry.data.fields at load).
const { bcDaemonPrinceSchemaFields } = await import('./bc-daemon-prince-template.ts');
const { bcGiftsSchemaFields } = await import('./bc-gifts-template.ts');
const { bcPsychicSchemaFields } = await import('./bc-psychic-template.ts');
const { bcRitualSchemaFields } = await import('./bc-ritual-template.ts');
const { bcSupplementsSchemaFields } = await import('./bc-supplements-template.ts');
const { dwAmmoSchemaFields } = await import('./dw-ammo-template.ts');
const { dwAstartesSchemaFields } = await import('./dw-astartes-template.ts');
const { dwCohesionSchemaFields } = await import('./dw-cohesion-template.ts');
const { dwDistinctionSchemaFields } = await import('./dw-distinction-template.ts');
const { dwMissionSchemaFields } = await import('./dw-mission-template.ts');
const { dwModeSchemaFields } = await import('./dw-mode-template.ts');
const { dwOathSchemaFields } = await import('./dw-oath-template.ts');
const { dwRenownSchemaFields } = await import('./dw-renown-template.ts');
const { dwRequisitionSchemaFields } = await import('./dw-requisition-template.ts');
const { dwVehicleSchemaFields } = await import('./dw-vehicle-template.ts');
const { owBattlefieldSchemaFields } = await import('./ow-battlefield-template.ts');
const { owComradeHealingSchemaFields } = await import('./ow-comrade-healing-template.ts');
const { owComradeSchemaFields } = await import('./ow-comrade-template.ts');
const { owCraftsmanshipSchemaFields } = await import('./ow-craftsmanship-template.ts');
const { owDrawbackSchemaFields } = await import('./ow-drawback-template.ts');
const { owLogisticsSchemaFields } = await import('./ow-logistics-template.ts');
const { owMissionGearSchemaFields } = await import('./ow-mission-gear-template.ts');
const { owMountSchemaFields } = await import('./ow-mount-template.ts');
const { owOrdersSchemaFields } = await import('./ow-orders-template.ts');
const { owRegimentSchemaFields } = await import('./ow-regiment-template.ts');
const { owVehicleMovementSchemaFields } = await import('./ow-vehicle-movement-template.ts');

type SchemaFieldsFn = () => Record<string, object>;

const cases: Array<[name: string, fn: SchemaFieldsFn, keys: string[]]> = [
    ['bcDaemonPrinceSchemaFields', bcDaemonPrinceSchemaFields, ['daemonPrinceAscension']],
    ['bcGiftsSchemaFields', bcGiftsSchemaFields, ['gifts']],
    ['bcPsychicSchemaFields', bcPsychicSchemaFields, ['psykerClass', 'psyRating', 'sustainedPowerCount']],
    ['bcRitualSchemaFields', bcRitualSchemaFields, ['ritualMastery']],
    ['bcSupplementsSchemaFields', bcSupplementsSchemaFields, ['daemonEngineRating', 'quickAndTheDeadActive']],
    ['dwAmmoSchemaFields', dwAmmoSchemaFields, ['selectedAmmo']],
    ['dwAstartesSchemaFields', dwAstartesSchemaFields, ['implants']],
    ['dwCohesionSchemaFields', dwCohesionSchemaFields, ['cohesionMax', 'cohesionCurrent', 'cohesionLostThisTurn', 'rallied']],
    ['dwDistinctionSchemaFields', dwDistinctionSchemaFields, ['distinctions', 'marksOfDistinction']],
    ['dwMissionSchemaFields', dwMissionSchemaFields, ['activeMission']],
    ['dwModeSchemaFields', dwModeSchemaFields, ['combatMode', 'sustainedAbilities']],
    ['dwOathSchemaFields', dwOathSchemaFields, ['activeOathId', 'isLeader']],
    ['dwRenownSchemaFields', dwRenownSchemaFields, ['renown']],
    ['dwRequisitionSchemaFields', dwRequisitionSchemaFields, ['requisitionPoints', 'missionRating']],
    ['dwVehicleSchemaFields', dwVehicleSchemaFields, ['vehicleIntegrity', 'overIntegrity']],
    ['owBattlefieldSchemaFields', owBattlefieldSchemaFields, ['supportCooldown', 'regimentalAwards']],
    ['owComradeHealingSchemaFields', owComradeHealingSchemaFields, ['comradeRecoveryDays', 'refitAvailable']],
    ['owComradeSchemaFields', owComradeSchemaFields, ['comrade']],
    ['owCraftsmanshipSchemaFields', owCraftsmanshipSchemaFields, []],
    ['owDrawbackSchemaFields', owDrawbackSchemaFields, ['regimentDrawbacks', 'multiComradeRoster']],
    ['owLogisticsSchemaFields', owLogisticsSchemaFields, ['logisticsRating', 'munitorum', 'situational']],
    ['owMissionGearSchemaFields', owMissionGearSchemaFields, ['lastGearOutcome']],
    ['owMountSchemaFields', owMountSchemaFields, ['mountedOn']],
    ['owOrdersSchemaFields', owOrdersSchemaFields, ['activeOrders']],
    ['owRegimentSchemaFields', owRegimentSchemaFields, ['regimentSelection', 'regimentKit']],
    ['owVehicleMovementSchemaFields', owVehicleMovementSchemaFields, ['chaseState']],
];

describe('per-system mixin *SchemaFields()', () => {
    it.each(cases)('%s contributes exactly its declared schema fields', (_name, fn, keys) => {
        expect(Object.keys(fn()).sort()).toEqual([...keys].sort());
    });

    it('pins field TYPES for a representative template (dw-astartes implants → ArrayField)', () => {
        const schema = dwAstartesSchemaFields();
        expect(schema['implants']).toBeInstanceOf(fields.ArrayField);
    });

    it('pins a numeric field type (dw-renown renown → NumberField)', () => {
        const schema = dwRenownSchemaFields();
        expect(schema['renown']).toBeInstanceOf(fields.NumberField);
    });
});
