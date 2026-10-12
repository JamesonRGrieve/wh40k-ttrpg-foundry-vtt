/**
 * @file Dark Heresy 2nd Edition system configuration.
 * Aptitude-based advancement with 4 skill ranks.
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { AcquisitionLadder } from '../../rules/acquisition-ladder.ts';
import { FATIGUE_MODES } from '../../rules/fatigue.ts';
import type { InquestRules } from '../../rules/inquest.ts';
import { AptitudeBasedSystemConfig } from './aptitude-based-system-config.ts';
import type { FatigueModelDef, OriginStepConfig, SidebarHeaderField } from './types.ts';

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
    craftsmanship: { poor: 10, common: 0, good: -20, best: -30 },
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
    override isPsyker(actor: WH40KBaseActor): boolean {
        return this.ownsOriginPathItem(actor, 'elite', 'psyker');
    }

    getHeaderFields(_actor: WH40KBaseActor): SidebarHeaderField[] {
        // Home World / Background / Role are shown as origin-path bubbles, and
        // Divination already renders as the italic quote beneath the portrait
        // (sidebar-header). Listing any of them again as static text rows here is
        // redundant (#226), so the sidebar fields panel is empty for DH2.
        return [];
    }

    // Characteristic + skill aptitude tables are inherited from AptitudeBasedSystemConfig (#298).
}
