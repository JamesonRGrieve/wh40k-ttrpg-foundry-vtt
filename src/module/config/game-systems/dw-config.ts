/**
 * @file Deathwatch system configuration.
 * Career/specialty-based advancement with 3 skill ranks.
 */

import { DW_ARMOUR_CRAFTSMANSHIP } from '../../rules/armour-craftsmanship.ts';
import type { BurstActionRules, BurstCapRules } from '../../rules/auto-fire.ts';
import { DISPOSITION_MODELS } from '../../rules/disposition.ts';
import type { EvasionRules } from '../../rules/evasion.ts';
import { FATIGUE_MODES } from '../../rules/fatigue.ts';
import type { GrappleRules } from '../../rules/grapple.ts';
import type { VehicleCombatRules } from '../../rules/vehicle-damage.ts';
import type { VehicleDrivingRules } from '../../rules/vehicle-trait-tests.ts';
import { printedGrappleRules, singleChartVehicleCombat, DRIVE_PILOT_VEHICLE_DRIVING } from './base-system-config.ts';
import { CareerBasedSystemConfig } from './career-based-system-config.ts';
import type { DispositionModelDef, FatigueModelDef, OriginStepConfig, SidebarHeaderField, SystemConfigActor } from './types.ts';

export class DWSystemConfig extends CareerBasedSystemConfig {
    readonly id = 'dw' as const;
    readonly usesMalignancyTest = false;
    readonly maleficCorruptionOnManifest = false;
    /** DW spends Requisition points: availability sets an item's point cost, not a test modifier. */
    readonly acquisitionLadder = null;
    readonly inquestRules = null;
    readonly itemRepair = null;
    /** DW core: an Upgrade's Requisition cost covers "any labour required to install" it; there is no fitting test (#136). */
    readonly weaponModification = null;
    readonly vehicleDriving: VehicleDrivingRules = DRIVE_PILOT_VEHICLE_DRIVING;
    /**
     * DW core: "The number of extra hits scored in this manner cannot exceed the
     * weapon's … Rate of Fire" (both bursts); Suppressing Fire: "The number of
     * hits scored may not exceed …"; Storm: "to a maximum of twice the weapon's
     * Full Automatic rate of fire" — #607.
     */
    readonly burstRules: BurstCapRules = { burstCap: 'extra', suppressingCap: 'total', stormCap: 'double-rof' };
    /**
     * DW core: Semi-Auto Burst (Type: Full Action) "a Ballistic Skill Test
     * with a +10 bonus"; Full Auto Burst (Type: Full Action) "with a +20
     * bonus" — #607.
     */
    readonly burstActions: BurstActionRules = {
        semi: { attackModifier: 10, actionCost: 'full' },
        full: { attackModifier: 20, actionCost: 'full' },
    };
    /** DW: each degree of success on a Dodge against a Semi-Auto or Full Auto Burst negates one more hit — #414. */
    /**
     * DW grapple: Slip Free is a Challenging (+0) Contortionist test.
     * Throw Down only makes the opponent Prone: DW prints no further bonus.
     */
    readonly grappleRules: GrappleRules = printedGrappleRules('contortionist', 0);

    /**
     * A DW supplement: one Vehicle Critical Hit Chart, and Righteous
     * Fury only when "this attack must actually damage the vehicle".
     */
    override readonly vehicleCombat: VehicleCombatRules = singleChartVehicleCombat(true);

    /**
     * DW core, Armour Craftsmanship: Exceptional (read as Good) adds 1 AP against
     * the first attack in any round; Master-Crafted (read as Best) weighs half and
     * adds 1 AP. DW prints no Poor armour.
     */
    override readonly armourCraftsmanship = DW_ARMOUR_CRAFTSMANSHIP;

    readonly evasionRules: EvasionRules = {
        multiHitActions: ['Semi-Auto Burst', 'Full Auto Burst'],
        twinLinked: false,
        anyMultiHit: false,
        stormTwoPerDegree: false,
    };
    readonly label = 'WH40K.SETTINGS.PrimaryGameSystem.Choices.dw';
    readonly cssClass = 'deathwatch';
    readonly theme = {
        primary: 'bronze',
        // Accent is text on the dark sheet: accent-combat measured 2.1:1, below WCAG AA.
        accent: 'accent-combat-l30',
        chatAccent: 'accent-combat-d10',
        border: 'accent-combat-d10',
    } as const;

    /**
     * DW uses the flat fatigue model, but recovers far faster (a full hour of
     * rest removes all; RAW 1 level per 10 min) and wakes regaining only one
     * level rather than reverting to TB — #114.
     */
    override getFatigueModel(): FatigueModelDef {
        return { ...FATIGUE_MODES.flat, wakeBehavior: 'drop-one-level', fullRecoveryHours: 1 };
    }

    /** DW Dispositions are the seven-step ladder; a success gains one step plus one per degree (DW core) — #73. */
    override getDispositionModel(): DispositionModelDef {
        return DISPOSITION_MODELS.ladderStepPlusDegrees;
    }

    getOriginStepConfig(): OriginStepConfig {
        return {
            coreSteps: [
                { key: 'chapter', step: 'chapter', icon: 'fa-shield-alt', descKey: 'ChapterDesc', stepIndex: 1 },
                { key: 'speciality', step: 'speciality', icon: 'fa-crosshairs', descKey: 'SpecialityDesc', stepIndex: 2 },
            ],
            optionalStep: null,
            grantFields: ['fateThreshold'],
        };
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: matches abstract CareerBasedSystemConfig.getCareerRegistry() return type
    getCareerRegistry(): Record<string, unknown> {
        // DW specialty advance tables TBD
        return {};
    }

    resolveCareerKey(actor: SystemConfigActor): string | null {
        const speciality = actor.system.originPath?.['speciality'];
        return typeof speciality === 'string' ? speciality : null;
    }

    getHeaderFields(actor: SystemConfigActor): SidebarHeaderField[] {
        return [
            this.makeOriginField(actor, 'WH40K.OriginPath.Chapter', 'homeWorld'),
            this.makeOriginField(actor, 'WH40K.OriginPath.Speciality', 'role'),
            this.makeOriginField(actor, 'WH40K.Character.Rank', 'career'),
            this.makeOriginField(actor, 'WH40K.OriginPath.Demeanour', 'motivation'),
        ];
    }
}
