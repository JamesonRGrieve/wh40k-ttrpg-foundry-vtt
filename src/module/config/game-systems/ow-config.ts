/**
 * @file Only War system configuration.
 * Aptitude-based advancement with 4 skill ranks.
 * Uses the same cost tables and aptitude system as DH2e.
 */

import type { AcquisitionLadder } from '../../rules/acquisition-ladder.ts';
import { PRINTED_ARMOUR_CRAFTSMANSHIP } from '../../rules/armour-craftsmanship.ts';
import type { BurstActionRules, BurstCapRules } from '../../rules/auto-fire.ts';
import { DISPOSITION_MODELS } from '../../rules/disposition.ts';
import type { EvasionRules } from '../../rules/evasion.ts';
import type { GrappleRules } from '../../rules/grapple.ts';
import type { ComradeRules } from '../../rules/ow-comrade.ts';
import type { ComradeActionCost, ComradeOrderCohesion, ComradeOrderDef } from '../../rules/ow-orders.ts';
import type { VehicleCombatRules } from '../../rules/vehicle-damage.ts';
import type { VehicleDrivingRules } from '../../rules/vehicle-trait-tests.ts';
import type { WeaponModificationRules } from '../../rules/weapon-modification.ts';
import { AptitudeBasedSystemConfig } from './aptitude-based-system-config.ts';
import { locatedVehicleCombat, printedGrappleRules, TRADE_ARMOURER_FITTING_RULES, OPERATE_VEHICLE_DRIVING } from './base-system-config.ts';
import type { DispositionModelDef, OriginStepConfig, SidebarHeaderField, SystemConfigActor } from './types.ts';

/**
 * Logistics test — the core Availability by Front Conditions table, its
 * "Company or Less" column, and the Craftsmanship and Logistics table.
 * The line's flat ladder (the one every cross-line
 * consumer reads) is the smallest deployment; the larger-deployment columns
 * of the same table are `OW_LOGISTICS_FRONT_CONDITIONS.availabilityByTroops`.
 */
export const OW_ACQUISITION_LADDER = {
    availability: {
        ubiquitous: 30,
        abundant: 20,
        plentiful: 10,
        common: 0,
        average: -10,
        scarce: -20,
        rare: -30,
        veryRare: -40,
        extremelyRare: -50,
        nearUnique: -60,
        unique: 'discretion',
    },
    craftsmanship: { poor: 20, common: 0, good: -30, best: -50 },
    // OW core: "failure means the Guardsmen could not locate or obtain the item" — no Logistics Rating is lost.
    failureLoss: null,
} as const satisfies AcquisitionLadder;

/** The langpack key segment of each Comrade move Order. */
const COMRADE_MOVE_KEYS = {
    'follow': 'Follow',
    'disengage': 'Disengage',
    'move-half': 'MoveHalf',
    'move-full': 'MoveFull',
    'run': 'Run',
    'stand-mount': 'StandMount',
    'tactical-advance': 'TacticalAdvance',
} as const;

/** A Comrade move Order (OW core): it moves the Comrade and grants the PC nothing. */
function comradeMoveOrder(id: keyof typeof COMRADE_MOVE_KEYS, actionCost: ComradeActionCost, cohesion: ComradeOrderCohesion = 'none'): ComradeOrderDef {
    const segment = COMRADE_MOVE_KEYS[id];
    return {
        id,
        labelKey: `WH40K.OW.Orders.Move.${segment}`,
        effectKey: `WH40K.OW.Orders.Effect.${segment}`,
        actionCost,
        cohesion,
        notWhenWounded: false,
        benefit: null,
    };
}

/** One availability column of the Availability by Front Conditions table (a printed cell per rating). */
type AvailabilityColumn = AcquisitionLadder['availability'];

/**
 * The core Availability by Front Conditions table in full — the four
 * cumulative parts of a Logistics Test's difficulty, plus the standard-kit
 * bonus printed above it. Every value was read off the page image.
 *
 * - `availabilityByTroops`: "Difficulty by Number of Troops", the item's
 *   Availability cross-referenced with the deployment size. `company` is the
 *   line ladder's own column (one copy).
 * - `timeInFront` / `frontActive`: the two five-row time tables (identical
 *   values, printed twice).
 * - `warCondition`: the six War Conditions rows, in printed order.
 */
export const OW_LOGISTICS_FRONT_CONDITIONS = {
    availabilityByTroops: {
        /** "Company or Less". */
        company: OW_ACQUISITION_LADDER.availability,
        /** "Single Regiment". */
        regiment: {
            ubiquitous: 'automatic',
            abundant: 30,
            plentiful: 20,
            common: 10,
            average: 0,
            scarce: -10,
            rare: -20,
            veryRare: -30,
            extremelyRare: -40,
            nearUnique: -50,
            unique: -60,
        },
        /** "Multiple Regiments". */
        regiments: {
            ubiquitous: 'automatic',
            abundant: 'automatic',
            plentiful: 30,
            common: 20,
            average: 10,
            scarce: 0,
            rare: -10,
            veryRare: -20,
            extremelyRare: -30,
            nearUnique: -40,
            unique: -50,
        },
    },
    /** "Time Spent in Front". */
    timeInFront: { under3Months: -10, months3to6: 0, months6to12: 10, years1to5: 20, years5plus: 30 },
    /** "Front Active". */
    frontActive: { under3Months: -10, months3to6: 0, months6to12: 10, years1to5: 20, years5plus: 30 },
    /** "War Conditions". */
    warCondition: { losingBadly: -30, faltering: -20, violentImpasse: -10, ceasefire: 30, nearVictorious: 10, dominant: 20 },
    /** Gear that is standard kit for any regiment in the warzone is easier to get. */
    standardKit: 20,
} as const satisfies {
    availabilityByTroops: Readonly<Record<string, AvailabilityColumn>>;
    timeInFront: Readonly<Record<string, number>>;
    frontActive: Readonly<Record<string, number>>;
    warCondition: Readonly<Record<string, number>>;
    standardKit: number;
};

export class OWSystemConfig extends AptitudeBasedSystemConfig {
    readonly id = 'ow' as const;
    readonly usesMalignancyTest = true;
    readonly maleficCorruptionOnManifest = false;
    readonly acquisitionLadder: AcquisitionLadder = OW_ACQUISITION_LADDER;
    readonly inquestRules = null;
    readonly itemRepair = null;
    /**
     * OW core Weapon Upgrades: an acquired upgrade is integrated by a successful
     * Trade (Armourer) test (#136). The separate Weapon Customisations (Routine
     * (+20)) have no pack items yet, so they are not distinguished here.
     */
    readonly weaponModification: WeaponModificationRules = TRADE_ARMOURER_FITTING_RULES;
    readonly vehicleDriving: VehicleDrivingRules = OPERATE_VEHICLE_DRIVING;
    /**
     * OW core: "The number of extra hits scored in this manner cannot exceed the
     * weapon's … rate of fire" (both bursts); Suppressing Fire: "The number of
     * hits scored may not exceed …"; Storm: "up to the weapon's firing rate, as
     * normal" — #607.
     */
    readonly burstRules: BurstCapRules = { burstCap: 'extra', suppressingCap: 'total', stormCap: 'rof' };
    /**
     * OW core: Semi-Auto Burst (Type: Half Action) is "a Challenging (+0)
     * Ballistic Skill Test"; Full Auto Burst (Type: Half Action) is made
     * "with a −10 penalty" — #607.
     */
    readonly burstActions: BurstActionRules = {
        semi: { attackModifier: 0, actionCost: 'half' },
        full: { attackModifier: -10, actionCost: 'half' },
    };
    /**
     * OW evasion: against bursts, Swift and Lightning Attacks and Twin-Linked
     * weapons each degree of success negates one more hit; against Storm, two — #414.
     */
    /**
     * OW grapple: Slip Free is a Challenging (+0) Acrobatics test, and a controller
     * who throws its opponent down gets +10 on later opposed tests in the grapple.
     */
    readonly grappleRules: GrappleRules = printedGrappleRules('acrobatics', 10);

    /**
     * OW core: the vehicle hit-location table, a Vehicle Critical Hit chart per location,
     * and Righteous Fury only when "this attack must actually Damage the vehicle".
     */
    override readonly vehicleCombat: VehicleCombatRules = locatedVehicleCombat(true);

    /** OW core, Armour Craftsmanship: Poor −10 Agility; Good +1 AP against the first attack in any Round; Best half weight and +1 AP. */
    override readonly armourCraftsmanship = PRINTED_ARMOUR_CRAFTSMANSHIP;

    /**
     * OW core, Comrades in Combat: Cohesion is "within 5 metres of his
     * controlling Player Character"; a Comrade "is limited to two Half Actions or one
     * Full Action per Turn"; it dies when it "would suffer 10 Insanity or 10
     * Corruption in a single Round".
     */
    override readonly comradeRules: ComradeRules = { cohesionRangeM: 5, actionBudget: 2, mentalDeathThreshold: 10 };

    /**
     * The Orders any OW Player Character can give their Comrade:
     * - Maintain Cohesion: when the Player Character moves with the Comrade in
     *   Cohesion, the Comrade spends a Half Action to keep up.
     * - The move Actions: Disengage (Full), Move (Half or Full), Run (Full; not
     *   while the Comrade is wounded), Stand/Mount (Half), Tactical Advance (Full).
     *   Out of Cohesion these are how the Comrade moves.
     * - Ranged Volley (Half): +5 to the Player Character's Ballistic Skill tests
     *   this Turn.
     * - Close Quarters (Half): the Player Character counts as Ganging Up.
     * - Take Cover! (Full): the Comrade hunkers down in cover for the next Round;
     *   the benefit is the Comrade's own.
     * An Order benefits the Player Character only while the Comrade is in Cohesion,
     * unless the Order says otherwise.
     */
    override readonly comradeOrders: readonly ComradeOrderDef[] = [
        comradeMoveOrder('follow', 'half', 'to-act'),
        comradeMoveOrder('disengage', 'full'),
        comradeMoveOrder('move-half', 'half'),
        comradeMoveOrder('move-full', 'full'),
        { ...comradeMoveOrder('run', 'full'), notWhenWounded: true },
        comradeMoveOrder('stand-mount', 'half'),
        comradeMoveOrder('tactical-advance', 'full'),
        {
            id: 'ranged-volley',
            labelKey: 'WH40K.OW.Orders.Generic.RangedVolley',
            effectKey: 'WH40K.OW.Orders.Effect.RangedVolley',
            actionCost: 'half',
            cohesion: 'for-benefit',
            notWhenWounded: false,
            benefit: { kind: 'characteristic', characteristic: 'ballisticSkill', modifier: 5 },
        },
        {
            id: 'close-quarters',
            labelKey: 'WH40K.OW.Orders.Generic.CloseQuarters',
            effectKey: 'WH40K.OW.Orders.Effect.CloseQuarters',
            actionCost: 'half',
            cohesion: 'for-benefit',
            notWhenWounded: false,
            benefit: { kind: 'effect' },
        },
        {
            id: 'take-cover',
            labelKey: 'WH40K.OW.Orders.Generic.TakeCover',
            effectKey: 'WH40K.OW.Orders.Effect.TakeCover',
            actionCost: 'full',
            cohesion: 'none',
            notWhenWounded: false,
            benefit: null,
        },
    ];

    readonly evasionRules: EvasionRules = {
        multiHitActions: ['Semi-Auto Burst', 'Full Auto Burst', 'Swift Attack', 'Lightning Attack'],
        twinLinked: true,
        anyMultiHit: false,
        stormTwoPerDegree: true,
    };
    readonly label = 'WH40K.SETTINGS.PrimaryGameSystem.Choices.ow';
    readonly cssClass = 'only-war';
    readonly theme = {
        primary: 'brass',
        accent: 'brass-l20',
        chatAccent: 'brass-d30',
        border: 'brass-d15',
    } as const;

    getOriginStepConfig(): OriginStepConfig {
        return {
            coreSteps: [
                { key: 'regiment', step: 'regiment', icon: 'fa-shield', descKey: 'RegimentDesc', stepIndex: 1 },
                { key: 'speciality', step: 'speciality', icon: 'fa-crosshairs', descKey: 'SpecialityDesc', stepIndex: 2 },
            ],
            optionalStep: null,
            // Home worlds, and the regiment-creation steps.
            additionalSteps: ['homeWorld', 'regimentType', 'commandingOfficer', 'trainingDoctrine', 'specialEquipmentDoctrine', 'regimentalDrawback'],
            grantFields: ['fateThreshold'],
        };
    }

    getHeaderFields(actor: SystemConfigActor): SidebarHeaderField[] {
        return [
            this.makeOriginField(actor, 'WH40K.OriginPath.HomeWorld', 'homeWorld'),
            this.makeOriginField(actor, 'WH40K.OriginPath.Regiment', 'background'),
            this.makeOriginField(actor, 'WH40K.OriginPath.Speciality', 'role'),
            this.makeOriginField(actor, 'WH40K.OriginPath.Demeanour', 'motivation'),
        ];
    }

    /** OW psykers are a speciality; the compendium document flagged `grantsPsychicPowers` names which (#681). */
    override readonly psykerUnlock = { step: 'speciality' };

    /** OW Dispositions are the seven-step ladder; a success gains one step per degree (OW core) — #73. */
    override getDispositionModel(): DispositionModelDef {
        return DISPOSITION_MODELS.ladderDegrees;
    }

    // Characteristic + skill aptitude tables are inherited from AptitudeBasedSystemConfig (#298) — OW shares the DH2e values.
}
