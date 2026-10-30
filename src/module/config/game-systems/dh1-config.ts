/**
 * @file Dark Heresy 1st Edition system configuration.
 * Career-based advancement with 3 skill ranks.
 */

import type { AcquisitionLadder } from '../../rules/acquisition-ladder.ts';
import { PRINTED_ARMOUR_CRAFTSMANSHIP } from '../../rules/armour-craftsmanship.ts';
import type { BurstActionRules, BurstCapRules } from '../../rules/auto-fire.ts';
import { DISPOSITION_MODELS } from '../../rules/disposition.ts';
import type { EvasionRules } from '../../rules/evasion.ts';
import { FATIGUE_MODES } from '../../rules/fatigue.ts';
import type { GrappleRules } from '../../rules/grapple.ts';
import type { VehicleDrivingRules } from '../../rules/vehicle-trait-tests.ts';
import type { WeaponModificationRules } from '../../rules/weapon-modification.ts';
import { TRADE_ARMOURER_FITTING_RULES } from './base-system-config.ts';
import { CareerBasedSystemConfig } from './career-based-system-config.ts';
import type { DispositionModelDef, FatigueModelDef, OriginStepConfig, SidebarHeaderField, SystemConfigActor } from './types.ts';

/**
 * Drive and Pilot as DH1 prints them: Drive's skill groups are Ground Vehicle,
 * Hover Vehicle and Walker ("autos, trucks, landspeeders and other land-based or
 * hover vehicles", core); Pilot's are Civilian Craft, Military Craft and
 * Spacecraft (core). Which Pilot group an aircraft takes depends on the
 * craft, not its locomotion, so a flyer has no single printed test here; neither
 * skill covers boats.
 */
const DH1_VEHICLE_DRIVING: VehicleDrivingRules = {
    immobile: null,
    wheeled: { skill: 'drive', specialisation: 'Ground Vehicle' },
    tracked: { skill: 'drive', specialisation: 'Ground Vehicle' },
    walker: { skill: 'drive', specialisation: 'Walker' },
    hover: { skill: 'drive', specialisation: 'Hover Vehicle' },
    skimmer: { skill: 'drive', specialisation: 'Hover Vehicle' },
    flyer: null,
    vtol: null,
    hull: null,
    submersible: null,
    hydrofoil: null,
    voidship: { skill: 'pilot', specialisation: 'Spacecraft' },
};

export class DH1eSystemConfig extends CareerBasedSystemConfig {
    readonly id = 'dh1' as const;
    readonly usesMalignancyTest = true;
    // A DH1 supplement prints its own Malefic powers; its cost rule is unverified.
    readonly maleficCorruptionOnManifest = false;

    /**
     * Influence requisition — a DH1 supplement's Availability Modifiers table.
     * The test "may be modified by the duration of the requisition, the
     * Availability of the Item, or the number of individuals": no
     * craftsmanship modifier.
     */
    readonly inquestRules = null;
    readonly itemRepair = null;
    /** DH1 weapon upgrades: a successful Trade (Armourer) test (#136). */
    readonly weaponModification: WeaponModificationRules = TRADE_ARMOURER_FITTING_RULES;
    readonly vehicleDriving: VehicleDrivingRules = DH1_VEHICLE_DRIVING;
    /**
     * DH1: both bursts cap their extra hits at the rate of fire, and Suppressing
     * Fire caps its total hits. Storm turns each hit up to the rate of fire into
     * two, so its ceiling is twice the rate of fire — #607.
     */
    readonly burstRules: BurstCapRules = { burstCap: 'extra', suppressingCap: 'total', stormCap: 'double-rof' };
    /**
     * DH1: Semi-Auto and Full Auto Bursts are Full Actions at +10 and +20 to the
     * Ballistic Skill test — #607.
     */
    readonly burstActions: BurstActionRules = {
        semi: { attackModifier: 10, actionCost: 'full' },
        full: { attackModifier: 20, actionCost: 'full' },
    };
    /** DH1: each degree of success on a Dodge against Semi-Auto or Full Auto fire negates one more hit — #414. */
    /**
     * DH1 grapple (Full Action): the grappler's one option is an Opposed Strength
     * test to injure; the grappled may break free or take control with an Opposed
     * Strength test, or escape with Contortionist against the grappler's Strength.
     * DH1 has no Throw Down, Push, Ready, Stand or Use Item. A won injure deals
     * unarmed damage (1d5−3 + SB, Armour doubled) and one level of Fatigue; with no
     * location given, the hit lands where the test roll puts it.
     */
    // DH1 armour craftsmanship: Poor −10 Agility; Good +1 AP against the round's first attack; Best half weight and +1 AP.
    override readonly armourCraftsmanship = PRINTED_ARMOUR_CRAFTSMANSHIP;

    readonly grappleRules: GrappleRules = {
        damage: { location: null, fatigue: 1 },
        push: null,
        options: [
            { id: 'damage-opponent', role: 'controller', test: { kind: 'opposed-strength' } },
            { id: 'break-free', role: 'target', test: { kind: 'opposed-strength' } },
            { id: 'slip-free', role: 'target', test: { kind: 'opposed-skill', skill: 'contortionist' } },
            { id: 'take-control', role: 'target', test: { kind: 'opposed-strength' } },
        ],
        thrownDownBonus: 0,
    };

    readonly evasionRules: EvasionRules = {
        multiHitActions: ['Semi-Auto Burst', 'Full Auto Burst'],
        twinLinked: false,
        anyMultiHit: false,
        stormTwoPerDegree: false,
    };
    readonly acquisitionLadder: AcquisitionLadder = {
        availability: {
            ubiquitous: 70,
            abundant: 50,
            plentiful: 30,
            common: 20,
            average: 10,
            scarce: 0,
            rare: -10,
            veryRare: -20,
            extremelyRare: -30,
            nearUnique: -50,
            unique: -70,
        },
        craftsmanship: null,
        // The same supplement: "if the Test fails by four or more degrees, the group loses 1 Influence" —
        // a DH1 degree is each full 10 points of margin (core: "for each full 10 points by which you fail").
        failureLoss: { kind: 'flat', minDegrees: 4, loss: 1, counting: 'fullTens' },
    };
    readonly label = 'WH40K.SETTINGS.PrimaryGameSystem.Choices.dh1';
    readonly cssClass = 'dark-heresy-1e';
    readonly theme = {
        primary: 'gold-raw',
        accent: 'gold-raw-l5',
        chatAccent: 'gold-raw-d25',
        border: 'gold-raw-d15',
    } as const;

    /** DH1 uses the halving fatigue model (errata: TB+WPB threshold, 2× death) — #114. */
    override getFatigueModel(): FatigueModelDef {
        return FATIGUE_MODES.halving;
    }

    /** DH1 Dispositions are the seven-step ladder; a success gains one step plus one per degree (DH1 rules) — #73. */
    override getDispositionModel(): DispositionModelDef {
        return DISPOSITION_MODELS.ladderStepPlusDegrees;
    }

    /**
     * Dark Heresy characters receive 1000 XP at character generation in addition to the
     * starting package. The base config defaults to 0, which left DH1 characters at zero
     * XP after origin path commit while DH2 characters got the canonical 1000. See #14.
     */
    override get startingXP(): number {
        return 1000;
    }

    getOriginStepConfig(): OriginStepConfig {
        // DH1e core character creation is Home World → Career Path. Divination is
        // rolled on the Tarot RollTable (handled separately, not a card step) and
        // "Rank"/role is derived within the chosen career — neither is a builder
        // step. Supplement home worlds extend the same Home World step.
        // Ascended careers (a post-campaign tier) are intentionally excluded.
        return {
            coreSteps: [
                { key: 'homeWorld', step: 'homeWorld', icon: 'fa-globe', descKey: 'HomeWorldDesc', stepIndex: 1 },
                { key: 'career', step: 'career', icon: 'fa-user-tie', descKey: 'CareerDesc', stepIndex: 2 },
            ],
            optionalStep: null,
            // Backgrounds, divinations, elite advances and career paths the line's packs carry.
            additionalSteps: ['background', 'divination', 'elite', 'careerPath'],
            grantFields: ['fateThreshold'],
        };
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: matches abstract CareerBasedSystemConfig.getCareerRegistry() return type
    getCareerRegistry(): Record<string, unknown> {
        // DH1e career tables TBD
        return {};
    }

    resolveCareerKey(actor: SystemConfigActor): string | null {
        const career = actor.system.originPath?.['career'];
        return typeof career === 'string' ? career : null;
    }

    getHeaderFields(actor: SystemConfigActor): SidebarHeaderField[] {
        // Divination renders as the italic quote beneath the portrait
        // (sidebar-header), so it is not repeated as a static row here (#226).
        return [
            this.makeOriginField(actor, 'WH40K.OriginPath.HomeWorld', 'homeWorld'),
            this.makeOriginField(actor, 'WH40K.OriginPath.CareerPath', 'career'),
            this.makeOriginField(actor, 'WH40K.Character.Rank', 'role'),
        ];
    }
}
