/**
 * @file Rogue Trader system configuration.
 * Career-based advancement with 3 skill ranks.
 */

// The RT career registry is read from the compendium-backed boot cache.
import type { AcquisitionLadder } from '../../rules/acquisition-ladder.ts';
import { PRINTED_ARMOUR_CRAFTSMANSHIP } from '../../rules/armour-craftsmanship.ts';
import type { BurstActionRules, BurstCapRules } from '../../rules/auto-fire.ts';
import { DISPOSITION_MODELS } from '../../rules/disposition.ts';
import type { EvasionRules } from '../../rules/evasion.ts';
import { FATIGUE_MODES } from '../../rules/fatigue.ts';
import type { GrappleRules } from '../../rules/grapple.ts';
import type { VehicleCombatRules } from '../../rules/vehicle-damage.ts';
import type { VehicleDrivingRules } from '../../rules/vehicle-trait-tests.ts';
import type { WeaponModificationRules } from '../../rules/weapon-modification.ts';
import { type CareerTable, getCareerAdvancementRegistry } from '../advancements/career-advancement-cache.ts';
import { getCareerKeyFromName } from '../advancements/index.ts';
import { printedGrappleRules, singleChartVehicleCombat, TRADE_ARMOURER_FITTING_RULES, DRIVE_PILOT_VEHICLE_DRIVING } from './base-system-config.ts';
import { CareerBasedSystemConfig } from './career-based-system-config.ts';
import type { DispositionModelDef, FatigueModelDef, OriginStepConfig, SidebarHeaderField, SystemConfigActor } from './types.ts';

/**
 * Profit Factor Acquisition Test — the core Acquisition Modifiers table.
 * Every cell is a number, which the RT resolver relies on.
 */
export const RT_ACQUISITION_LADDER = {
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
    craftsmanship: { poor: 10, common: 0, good: -10, best: -30 },
    // RT core: on a failure "the Explorer must wait until later to try again" — no Profit Factor is lost.
    failureLoss: null,
} as const satisfies AcquisitionLadder;

export class RTSystemConfig extends CareerBasedSystemConfig {
    readonly id = 'rt' as const;
    readonly usesMalignancyTest = true;
    readonly maleficCorruptionOnManifest = false;
    readonly acquisitionLadder: AcquisitionLadder = RT_ACQUISITION_LADDER;
    readonly inquestRules = null;
    readonly itemRepair = null;
    /** RT core Weapon Upgrades: a successful Trade (Armourer) test (#136). */
    readonly weaponModification: WeaponModificationRules = TRADE_ARMOURER_FITTING_RULES;
    readonly vehicleDriving: VehicleDrivingRules = DRIVE_PILOT_VEHICLE_DRIVING;
    /**
     * RT core with the 1.4 errata: "The total number of hits scored
     * by a weapon cannot exceed the weapon's … Rate of Fire"; Suppressing Fire:
     * "The number of hits scored may not exceed …"; Storm: the errata FAQ answers
     * "Double the Rate of Fire" — #607.
     */
    readonly burstRules: BurstCapRules = { burstCap: 'total', suppressingCap: 'total', stormCap: 'double-rof' };
    /**
     * RT core (1.4 errata): Semi-Auto Burst (Type: Full Action) "a Ballistic
     * Skill Test with a +10 bonus"; Full Auto Burst (Type: Full Action) "with a +20
     * bonus" — #607.
     */
    readonly burstActions: BurstActionRules = {
        semi: { attackModifier: 10, actionCost: 'full' },
        full: { attackModifier: 20, actionCost: 'full' },
    };
    /** RT core: "When Dodging Fully-Automatic or Semi-Automatic Bursts, each degree of success on the Dodge Test negates one additional hit." — #414. */
    /**
     * RT core, Grapple: Slip Free is "a Challenging (+0) Contortionist Skill Test".
     * Throw Down only makes the opponent Prone: RT prints no further bonus.
     */
    readonly grappleRules: GrappleRules = printedGrappleRules('contortionist', 0);

    /** An RT supplement: one Vehicle Critical Hit Chart and no hit-location table. */
    override readonly vehicleCombat: VehicleCombatRules = singleChartVehicleCombat(false);

    /** RT core: Poor −10 Agility; Good +1 AP "against the first attack in any round"; Best half weight and +1 AP. */
    override readonly armourCraftsmanship = PRINTED_ARMOUR_CRAFTSMANSHIP;

    readonly evasionRules: EvasionRules = {
        multiHitActions: ['Semi-Auto Burst', 'Full Auto Burst'],
        twinLinked: false,
        anyMultiHit: false,
        stormTwoPerDegree: false,
    };
    readonly label = 'WH40K.SETTINGS.PrimaryGameSystem.Choices.rt';
    readonly cssClass = 'rogue-trader';
    readonly theme = {
        // Void-blue frames with gold lettering, set apart from the Dark Heresy bronze/gold lines.
        primary: 'void-l20',
        accent: 'gold',
        chatAccent: 'void-d20',
        border: 'void-l20',
    } as const;

    /** RT uses the flat fatigue model; full recovery takes 8 hours of rest — #114. */
    override getFatigueModel(): FatigueModelDef {
        return { ...FATIGUE_MODES.flat, fullRecoveryHours: 8 };
    }

    /** RT Dispositions are the seven-step ladder; a success gains one step plus one per degree (RT core) — #73. */
    override getDispositionModel(): DispositionModelDef {
        return DISPOSITION_MODELS.ladderStepPlusDegrees;
    }

    getOriginStepConfig(): OriginStepConfig {
        return {
            coreSteps: [
                { key: 'homeWorld', step: 'homeWorld', icon: 'fa-globe', descKey: 'HomeWorldDesc', stepIndex: 1 },
                { key: 'birthright', step: 'birthright', icon: 'fa-baby', descKey: 'BirthrightDesc', stepIndex: 2 },
                { key: 'lureOfTheVoid', step: 'lureOfTheVoid', icon: 'fa-meteor', descKey: 'LureDesc', stepIndex: 3 },
                { key: 'trialsAndTravails', step: 'trialsAndTravails', icon: 'fa-skull', descKey: 'TrialsDesc', stepIndex: 4 },
                { key: 'motivation', step: 'motivation', icon: 'fa-fire', descKey: 'MotivationDesc', stepIndex: 5 },
                { key: 'career', step: 'career', icon: 'fa-user-tie', descKey: 'CareerDesc', stepIndex: 6 },
            ],
            optionalStep: { key: 'lineage', step: 'lineage', icon: 'fa-crown', descKey: 'LineageDesc', stepIndex: 7 },
            additionalSteps: ['eliteAdvance'],
            grantFields: ['fateThreshold'],
        };
    }

    getCareerRegistry(): Record<string, CareerTable> {
        return getCareerAdvancementRegistry();
    }

    resolveCareerKey(actor: SystemConfigActor): string | null {
        const careerName = actor.system.originPath?.['career'];
        return typeof careerName === 'string' && careerName !== '' ? getCareerKeyFromName(careerName) : null;
    }

    getHeaderFields(actor: SystemConfigActor): SidebarHeaderField[] {
        const rank = typeof actor.system.rank === 'number' ? actor.system.rank : '';
        return [
            this.makeOriginField(actor, 'WH40K.OriginPath.HomeWorld', 'homeWorld'),
            this.makeOriginField(actor, 'WH40K.OriginPath.Career', 'career'),
            this.makeField(game.i18n.localize('WH40K.Character.Rank'), 'system.rank', rank, 'Rank', 'number'),
        ];
    }
}
