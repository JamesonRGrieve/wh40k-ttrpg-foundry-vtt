/**
 * @file Dark Heresy 2nd Edition system configuration.
 * Aptitude-based advancement with 4 skill ranks.
 */

import type { AcquisitionLadder, CraftsmanshipKey } from '../../rules/acquisition-ladder.ts';
import type { BurstActionRules, BurstCapRules } from '../../rules/auto-fire.ts';
import type { EvasionRules } from '../../rules/evasion.ts';
import { FATIGUE_MODES } from '../../rules/fatigue.ts';
import type { InquestRules } from '../../rules/inquest.ts';
import type { ItemRepairRules } from '../../rules/item-repair.ts';
import type { WeaponModificationRules } from '../../rules/weapon-modification.ts';
import type { XenosRepairRules } from '../../rules/xenos-equipment.ts';
import { AptitudeBasedSystemConfig } from './aptitude-based-system-config.ts';
import type { FatigueModelDef, OriginStepConfig, SidebarHeaderField, SystemConfigActor } from './types.ts';

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
    // p. 269, "Excessive or Reckless Use": "When an Acolyte fails an Influence test by more degrees of
    // failure than his Fellowship bonus, his Influence decreases by the difference between the two."
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
     * DH2 core ch. VII, Evasion: "When Evading Swift Attacks, Lightning Attacks,
     * Full Auto Bursts, Semi-Auto Bursts, attacks from weapons with the Twin-Linked
     * quality, or any other attacks that would inflict multiple hits, each degree of
     * success … negates one additional hit. When Evading attacks from weapons with
     * the Storm quality, each degree of success on the test negates two hits." — #414.
     */
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
        border: 'gold-raw-d10',
    } as const;

    /** DH2 uses the halving fatigue model (TB+WPB threshold, 2× death) — #114. */
    override getFatigueModel(): FatigueModelDef {
        return FATIGUE_MODES.halving;
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
            equipmentStep: { key: 'equipment', step: 'equipment', icon: 'fa-box', descKey: 'EquipmentDesc', stepIndex: 6 },
            packs: [
                'dh2-core-origins-homeworlds',
                'dh2-core-origins-backgrounds',
                'dh2-core-origins-roles',
                'dh2-core-origins-elite-advances',
                'dh2-beyond-origins-homeworlds',
                'dh2-beyond-origins-backgrounds',
                'dh2-beyond-origins-roles',
                'dh2-within-origins-homeworlds',
                'dh2-within-origins-backgrounds',
                'dh2-within-origins-roles',
                'dh2-without-origins-homeworlds',
                'dh2-without-origins-backgrounds',
                'dh2-without-origins-roles',
            ],
            equipmentPacks: [
                'dh2-core-items-weapons',
                'dh2-core-items-armour',
                'dh2-core-items-ammo',
                'dh2-core-items-wearables',
                'dh2-core-items-tools',
                'dh2-core-items-consumables',
                'dh2-core-items-cybernetics',
                'dh2-core-items-weapon-mods',
                'dh2-beyond-items-weapons',
                'dh2-beyond-items-armour',
                'dh2-beyond-items-armor-mods',
                'dh2-beyond-items-ammo',
                'dh2-beyond-items-tools',
                'dh2-beyond-items-weapon-mods',
                'dh2-within-items-weapons',
                'dh2-within-items-armour',
                'dh2-within-items-armor-mods',
                'dh2-within-items-ammo',
                'dh2-within-items-relics',
                'dh2-within-items-services',
                'dh2-within-items-weapon-mods',
                'dh2-without-items-weapons',
                'dh2-without-items-armour',
                'dh2-without-items-armor-mods',
                'dh2-without-items-ammo',
                'dh2-without-items-consumables',
                'dh2-without-items-relics',
                'dh2-without-items-services',
                'dh2-without-items-tools',
                'dh2-without-items-weapon-mods',
            ],
        };
    }

    /**
     * DH2e: psyker unlock is the "Psyker" elite advance (step='elite').
     * Compendium item: dh2-core-origins-elite-advances/psyker.
     */
    override isPsyker(actor: SystemConfigActor): boolean {
        return this.ownsOriginPathItem(actor, 'elite', 'psyker');
    }

    getHeaderFields(_actor: SystemConfigActor): SidebarHeaderField[] {
        // Home World / Background / Role are shown as origin-path bubbles, and
        // Divination already renders as the italic quote beneath the portrait
        // (sidebar-header). Listing any of them again as static text rows here is
        // redundant (#226), so the sidebar fields panel is empty for DH2.
        return [];
    }

    // Characteristic + skill aptitude tables are inherited from AptitudeBasedSystemConfig (#298).
}
