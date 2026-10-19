/**
 * @file Deathwatch system configuration.
 * Career/specialty-based advancement with 3 skill ranks.
 */

import type { BurstActionRules, BurstCapRules } from '../../rules/auto-fire.ts';
import type { EvasionRules } from '../../rules/evasion.ts';
import { FATIGUE_MODES } from '../../rules/fatigue.ts';
import { CareerBasedSystemConfig } from './career-based-system-config.ts';
import type { FatigueModelDef, OriginStepConfig, SidebarHeaderField, SystemConfigActor } from './types.ts';

export class DWSystemConfig extends CareerBasedSystemConfig {
    readonly id = 'dw' as const;
    readonly usesMalignancyTest = false;
    readonly maleficCorruptionOnManifest = false;
    /** DW spends Requisition points: availability sets an item's point cost, not a test modifier. */
    readonly acquisitionLadder = null;
    readonly inquestRules = null;
    readonly itemRepair = null;
    /** DW core p. 156: an Upgrade's Requisition cost covers "any labour required to install" it; there is no fitting test (#136). */
    readonly weaponModification = null;
    /**
     * DW core: "The number of extra hits scored in this manner cannot exceed the
     * weapon's … Rate of Fire" (both bursts); Suppressing Fire: "The number of
     * hits scored may not exceed …"; Storm: "to a maximum of twice the weapon's
     * Full Automatic rate of fire" — #607.
     */
    readonly burstRules: BurstCapRules = { burstCap: 'extra', suppressingCap: 'total', stormCap: 'double-rof' };
    /**
     * DW core p. 242: Semi-Auto Burst (Type: Full Action) "a Ballistic Skill Test
     * with a +10 bonus"; p. 239: Full Auto Burst (Type: Full Action) "with a +20
     * bonus" — #607.
     */
    readonly burstActions: BurstActionRules = {
        semi: { attackModifier: 10, actionCost: 'full' },
        full: { attackModifier: 20, actionCost: 'full' },
    };
    /** DW core: "When Dodging Full Auto or Semi-Auto Bursts, each Degree of Success on the Dodge Test negates one additional hit." — #414. */
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

    getOriginStepConfig(): OriginStepConfig {
        return {
            coreSteps: [
                { key: 'chapter', step: 'chapter', icon: 'fa-shield-alt', descKey: 'ChapterDesc', stepIndex: 1 },
                { key: 'speciality', step: 'speciality', icon: 'fa-crosshairs', descKey: 'SpecialityDesc', stepIndex: 2 },
            ],
            optionalStep: null,
            packs: [
                'dw-core-origins-chapters',
                'dw-core-origins-specialities',
                'dw-founding-origins-chapters',
                'dw-rites-origins-chapters',
                'dw-honour-origins-chapters',
            ],
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
