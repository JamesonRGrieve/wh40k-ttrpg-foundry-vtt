/**
 * @file Only War system configuration.
 * Aptitude-based advancement with 4 skill ranks.
 * Uses the same cost tables and aptitude system as DH2e.
 */

import type { AcquisitionLadder } from '../../rules/acquisition-ladder.ts';
import type { BurstActionRules, BurstCapRules } from '../../rules/auto-fire.ts';
import type { EvasionRules } from '../../rules/evasion.ts';
import type { WeaponModificationRules } from '../../rules/weapon-modification.ts';
import { AptitudeBasedSystemConfig } from './aptitude-based-system-config.ts';
import { TRADE_ARMOURER_FITTING_RULES } from './base-system-config.ts';
import type { OriginStepConfig, SidebarHeaderField, SystemConfigActor } from './types.ts';

/**
 * Logistics test — core Table 6-2: Availability by Front Conditions, its
 * "Company or Less" column (p. 163), and Table 6-6: Craftsmanship and
 * Logistics (p. 167). The line's flat ladder (the one every cross-line
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
    // p. 162: "failure means the Guardsmen could not locate or obtain the item" — no Logistics Rating is lost.
    failureLoss: null,
} as const satisfies AcquisitionLadder;

/** One availability column of Table 6-2 (a printed cell per rating). */
type AvailabilityColumn = AcquisitionLadder['availability'];

/**
 * Core Table 6-2: Availability by Front Conditions (p. 163) in full — the four
 * cumulative parts of a Logistics Test's difficulty, plus the standard-kit
 * bonus printed above it (p. 163). Every value was read off the page image.
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
    /** "if a piece of equipment is a part of the standard kit for any regiment engaged within the warzone … +20" (p. 163). */
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
     * Trade (Armourer) test (#136). The separate Weapon Customisations (p. 190,
     * Routine (+20)) have no pack items yet, so they are not distinguished here.
     */
    readonly weaponModification: WeaponModificationRules = TRADE_ARMOURER_FITTING_RULES;
    /**
     * OW core: "The number of extra hits scored in this manner cannot exceed the
     * weapon's … rate of fire" (both bursts); Suppressing Fire: "The number of
     * hits scored may not exceed …"; Storm: "up to the weapon's firing rate, as
     * normal" — #607.
     */
    readonly burstRules: BurstCapRules = { burstCap: 'extra', suppressingCap: 'total', stormCap: 'rof' };
    /**
     * OW core p. 247: Semi-Auto Burst (Type: Half Action) is "a Challenging (+0)
     * Ballistic Skill Test"; p. 245: Full Auto Burst (Type: Half Action) is made
     * "with a −10 penalty" — #607.
     */
    readonly burstActions: BurstActionRules = {
        semi: { attackModifier: 0, actionCost: 'half' },
        full: { attackModifier: -10, actionCost: 'half' },
    };
    /**
     * OW core: "When Evading Swift Attacks, Lightning Attacks, Full Auto Bursts,
     * Semi-Auto Bursts, or any weapon with the Twin-Linked Quality, each Degree of
     * Success … negates one additional hit. When Evading weapons with the Storm
     * Quality, each Degree of Success … negates two hits." — #414.
     */
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
        border: 'brass-d15',
    } as const;

    getOriginStepConfig(): OriginStepConfig {
        return {
            coreSteps: [
                { key: 'regiment', step: 'regiment', icon: 'fa-shield', descKey: 'RegimentDesc', stepIndex: 1 },
                { key: 'speciality', step: 'speciality', icon: 'fa-crosshairs', descKey: 'SpecialityDesc', stepIndex: 2 },
            ],
            optionalStep: null,
            packs: [
                'ow-core-origins-homeworlds',
                'ow-core-origins-regiment-types',
                'ow-core-origins-specialities',
                'ow-core-origins-commanding-officers',
                'ow-core-origins-training-doctrines',
                'ow-core-origins-special-equipment-doctrines',
                'ow-hammer-origins-homeworlds',
                'ow-hammer-origins-regiment-types',
                'ow-hammer-origins-training-doctrines',
                'ow-hammer-origins-special-equipment-doctrines',
                'ow-shield-origins-homeworlds',
                'ow-shield-origins-regiment-types',
                'ow-shield-origins-training-doctrines',
                'ow-shield-origins-special-equipment-doctrines',
            ],
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

    /**
     * OW: psyker unlock is the "Sanctioned Psyker" speciality (step='speciality').
     * Compendium item: ow-core-specialities/sanctioned-psyker.
     */
    override isPsyker(actor: SystemConfigActor): boolean {
        return this.ownsOriginPathItem(actor, 'speciality', 'sanctioned psyker');
    }

    // Characteristic + skill aptitude tables are inherited from AptitudeBasedSystemConfig (#298) — OW shares the DH2e values.
}
