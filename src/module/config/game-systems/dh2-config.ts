/**
 * @file Dark Heresy 2nd Edition system configuration.
 * Aptitude-based advancement with 4 skill ranks.
 */

import type { AcquisitionLadder, CraftsmanshipKey } from '../../rules/acquisition-ladder.ts';
import { DH2_ARMOUR_CRAFTSMANSHIP } from '../../rules/armour-craftsmanship.ts';
import type { BurstActionRules, BurstCapRules } from '../../rules/auto-fire.ts';
import { DISPOSITION_MODELS } from '../../rules/disposition.ts';
import type { EvasionRules } from '../../rules/evasion.ts';
import { FATIGUE_MODES } from '../../rules/fatigue.ts';
import type { GrappleRules } from '../../rules/grapple.ts';
import type { InquestRules } from '../../rules/inquest.ts';
import type { ItemRepairRules } from '../../rules/item-repair.ts';
import type { VehicleCombatRules } from '../../rules/vehicle-damage.ts';
import type { VehicleDrivingRules } from '../../rules/vehicle-trait-tests.ts';
import type { WeaponModificationRules } from '../../rules/weapon-modification.ts';
import type { XenosRepairRules } from '../../rules/xenos-equipment.ts';
import { AptitudeBasedSystemConfig } from './aptitude-based-system-config.ts';
import { locatedVehicleCombat, printedGrappleRules, OPERATE_VEHICLE_DRIVING } from './base-system-config.ts';
import type { DispositionModelDef, FatigueModelDef, OriginStepConfig, SidebarHeaderField, SystemConfigActor } from './types.ts';

/**
 * Core Table 5-2: Craftsmanship, Requisition, and Repair (p. 141) — one column
 * serves both the Requisition test and the Tech-Use repair test (p. 142).
 */
const DH2_CRAFTSMANSHIP_MODIFIERS: Readonly<Record<CraftsmanshipKey, number>> = { poor: 10, common: 0, good: -20, best: -30 };

/**
 * Requisition test — core Table 5-1: Availability Modifiers and Table 5-2:
 * Craftsmanship, Requisition, and Repair (p. 141). Ubiquitous is printed
 * "Automatic"; Unique "Hellish (–60)/GM's discretion".
 */
export const DH2_ACQUISITION_LADDER: AcquisitionLadder = {
    availability: {
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
    craftsmanship: DH2_CRAFTSMANSHIP_MODIFIERS,
    // Failing an Influence test by more degrees than the Fellowship bonus costs Influence equal to the excess.
    failureLoss: { kind: 'beyondFellowshipBonus' },
};

/**
 * Item repair — core p. 142 "Repairing Items": Tech-Use with the Table 5-2
 * modifier, destroyed on four or more degrees of failure; xenos equipment
 * (Enemies Without p. 42) first needs a Hard (−20) Forbidden Lore test, then
 * repairs at −20 +5 per degree of success on it.
 */
const DH2_XENOS_EQUIPMENT_RULES: XenosRepairRules = { loreModifier: -20, repairModifier: -20, bonusPerLoreDegree: 5 };

export const DH2_ITEM_REPAIR_RULES: ItemRepairRules = {
    craftsmanship: DH2_CRAFTSMANSHIP_MODIFIERS,
    destroyedAtDegreesOfFailure: 4,
    xenos: DH2_XENOS_EQUIPMENT_RULES,
};

/**
 * Personal weapon modification — core p. 162 "Applying Personal
 * Modifications": Trade (Armourer) at the modification's Availability (Table
 * 5-1); a failure loses the parts and 2+ degrees of failure damage the weapon.
 * "Removing and Re-using Modifications": Tech-Use at the same modifier.
 * Xenos weapons (Enemies Without p. 42) take the same lore step as repair.
 */
export const DH2_WEAPON_MODIFICATION_RULES: WeaponModificationRules = {
    fitSkill: { skill: 'trade', specialisation: 'Armourer' },
    availabilityModifier: true,
    partsLostOnFailure: true,
    damagesWeaponAtDegreesOfFailure: 2,
    removalSkill: { skill: 'techUse', specialisation: null },
    xenos: DH2_XENOS_EQUIPMENT_RULES,
    // p. 162 "Applying Personal Modifications": "+30 bonus to the modification's Availability" to requisition the parts.
    partsRequisitionBonus: 30,
};

/**
 * Inquests — DH2 Enemies Within pp. 62–69: scope totals (p. 63), Table 2–7:
 * Clue Values, lead-test and lead-investigator IP (pp. 64–65), the default
 * 300-IP Revelation (p. 66), and Table 2–9: Inquest Rewards with the
 * surplus/shortfall steps (p. 69).
 */
export const DH2_INQUEST_RULES: InquestRules = {
    scopes: {
        minoris: { requiredPoints: 600, influenceReward: 3 },
        majoris: { requiredPoints: 900, influenceReward: 5 },
        extremis: { requiredPoints: 1200, influenceReward: 7 },
    },
    revelationInterval: 300,
    clueValues: { minor: 50, major: 100, vital: 200 },
    pointsPerLeadDegree: 10,
    leadInvestigatorClueBonus: 25,
    rewardPointStep: 300,
    maxSurplusInfluence: 3,
};

export class DH2eSystemConfig extends AptitudeBasedSystemConfig {
    readonly id = 'dh2' as const;
    readonly usesMalignancyTest = true;
    readonly maleficCorruptionOnManifest = true;
    readonly acquisitionLadder: AcquisitionLadder = DH2_ACQUISITION_LADDER;
    readonly inquestRules: InquestRules = DH2_INQUEST_RULES;
    readonly itemRepair: ItemRepairRules = DH2_ITEM_REPAIR_RULES;
    readonly weaponModification: WeaponModificationRules = DH2_WEAPON_MODIFICATION_RULES;
    readonly vehicleDriving: VehicleDrivingRules = OPERATE_VEHICLE_DRIVING;
    /**
     * DH2 core ch. VII: "The number of total hits scored in this manner cannot
     * exceed the weapon's … rate of fire" (both bursts and Suppressing Fire);
     * Storm: "up to the weapon's firing rate, as normal" (p. 149) — #607.
     */
    readonly burstRules: BurstCapRules = { burstCap: 'total', suppressingCap: 'total', stormCap: 'rof' };
    /**
     * DH2 core ch. VII: Semi-Auto Burst (Type: Half Action) is "a Challenging (+0)
     * Ballistic Skill test"; Full Auto Burst (Type: Half Action) is made "with a
     * −10 penalty" — #607.
     */
    readonly burstActions: BurstActionRules = {
        semi: { attackModifier: 0, actionCost: 'half' },
        full: { attackModifier: -10, actionCost: 'half' },
    };
    /**
     * DH2 evasion: against any multi-hit attack (bursts, Swift and Lightning
     * Attacks, Twin-Linked) each degree of success negates one more hit; against
     * Storm, each degree negates two — #414.
     */
    /**
     * DH2 grapple: Slip Free is a Challenging (+0) Acrobatics test, and a
     * controller who throws its opponent down gets +10 on later opposed tests in
     * the grapple until the opponent stands.
     */
    readonly grappleRules: GrappleRules = printedGrappleRules('acrobatics', 10);

    /** DH2 vehicles: a hit-location table and a critical-effects chart per location. */
    override readonly vehicleCombat: VehicleCombatRules = locatedVehicleCombat(false);

    /** DH2 core p. 141: Best armour adds +1 AP to each covered location (Good and Best's Maximum Agility +10 is not an AP effect). */
    override readonly armourCraftsmanship = DH2_ARMOUR_CRAFTSMANSHIP;

    readonly evasionRules: EvasionRules = {
        multiHitActions: ['Semi-Auto Burst', 'Full Auto Burst', 'Swift Attack', 'Lightning Attack'],
        twinLinked: true,
        anyMultiHit: true,
        stormTwoPerDegree: true,
    };
    readonly label = 'WH40K.SETTINGS.PrimaryGameSystem.Choices.dh2';
    readonly cssClass = 'dark-heresy';
    readonly theme = {
        primary: 'bronze',
        accent: 'gold-raw',
        chatAccent: 'gold-raw-d30',
        border: 'gold-raw-d10',
    } as const;

    /** DH2 uses the halving fatigue model (TB+WPB threshold, 2× death) — #114. */
    override getFatigueModel(): FatigueModelDef {
        return FATIGUE_MODES.halving;
    }

    /** DH2 Disposition is an NPC characteristic on the 0–100 scale (core p. 277) — #73. */
    override getDispositionModel(): DispositionModelDef {
        return DISPOSITION_MODELS.characteristic;
    }

    override get startingXP(): number {
        return 1000;
    }

    getOriginStepConfig(): OriginStepConfig {
        return {
            coreSteps: [
                { key: 'homeWorld', step: 'homeWorld', icon: 'fa-globe', descKey: 'HomeWorldDesc', stepIndex: 1 },
                { key: 'background', step: 'background', icon: 'fa-scroll', descKey: 'BackgroundDesc', stepIndex: 2 },
                { key: 'role', step: 'role', icon: 'fa-user-shield', descKey: 'RoleDesc', stepIndex: 3 },
            ],
            optionalStep: { key: 'elite', step: 'elite', icon: 'fa-star', descKey: 'EliteDesc', stepIndex: 4 },
            additionalSteps: ['divination'],
            grantFields: ['fateThreshold', 'blessedByEmperor'],
            equipmentStep: { key: 'equipment', step: 'equipment', icon: 'fa-box', descKey: 'EquipmentDesc', stepIndex: 6 },
        };
    }

    /** DH2 psykers are an elite advance; the compendium document flagged `grantsPsychicPowers` names which (#681). */
    override readonly psykerUnlock = { step: 'elite' };

    getHeaderFields(_actor: SystemConfigActor): SidebarHeaderField[] {
        // Home World / Background / Role are shown as origin-path bubbles, and
        // Divination already renders as the italic quote beneath the portrait
        // (sidebar-header). Listing any of them again as static text rows here is
        // redundant (#226), so the sidebar fields panel is empty for DH2.
        return [];
    }

    // Characteristic + skill aptitude tables are inherited from AptitudeBasedSystemConfig (#298).
}
