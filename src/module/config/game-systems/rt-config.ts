/**
 * @file Rogue Trader system configuration.
 * Career-based advancement with 3 skill ranks.
 */

// The RT career registry is read from the compendium-backed boot cache.
import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { AcquisitionLadder } from '../../rules/acquisition-ladder.ts';
import type { BurstCapRules } from '../../rules/auto-fire.ts';
import type { EvasionRules } from '../../rules/evasion.ts';
import { FATIGUE_MODES } from '../../rules/fatigue.ts';
import type { WeaponModificationRules } from '../../rules/weapon-modification.ts';
import { type CareerTable, getCareerAdvancementRegistry } from '../advancements/career-advancement-cache.ts';
import { getCareerKeyFromName } from '../advancements/index.ts';
import { TRADE_ARMOURER_FITTING_RULES } from './base-system-config.ts';
import { CareerBasedSystemConfig } from './career-based-system-config.ts';
import type { FatigueModelDef, OriginStepConfig, SidebarHeaderField } from './types.ts';

/**
 * Profit Factor Acquisition Test — core Table 9-35: Acquisition Modifiers
 * (p. 272). Every cell is a number, which the RT resolver relies on.
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
    // p. 271: on a failure "the Explorer must wait until later to try again" — no Profit Factor is lost.
    failureLoss: null,
} as const satisfies AcquisitionLadder;

export class RTSystemConfig extends CareerBasedSystemConfig {
    readonly id = 'rt' as const;
    readonly usesMalignancyTest = true;
    readonly maleficCorruptionOnManifest = false;
    readonly acquisitionLadder: AcquisitionLadder = RT_ACQUISITION_LADDER;
    readonly inquestRules = null;
    readonly itemRepair = null;
    /** RT core p. 133 Weapon Upgrades: a successful Trade (Armourer) test (#136). */
    readonly weaponModification: WeaponModificationRules = TRADE_ARMOURER_FITTING_RULES;
    /**
     * RT core with the 1.4 errata (pp. 239/242): "The total number of hits scored
     * by a weapon cannot exceed the weapon's … Rate of Fire"; Suppressing Fire:
     * "The number of hits scored may not exceed …"; Storm: the errata FAQ answers
     * "Double the Rate of Fire" — #607.
     */
    readonly burstRules: BurstCapRules = { burstCap: 'total', suppressingCap: 'total', stormCap: 'double-rof' };
    /** RT core: "When Dodging Fully-Automatic or Semi-Automatic Bursts, each degree of success on the Dodge Test negates one additional hit." — #414. */
    readonly evasionRules: EvasionRules = {
        multiHitActions: ['Semi-Auto Burst', 'Full Auto Burst'],
        twinLinked: false,
        anyMultiHit: false,
        stormTwoPerDegree: false,
    };
    readonly label = 'WH40K.SETTINGS.PrimaryGameSystem.Choices.rt';
    readonly cssClass = 'rogue-trader';
    readonly theme = {
        primary: 'accent-dynasty',
        accent: 'gold',
        border: 'gold-dark',
    } as const;

    /** RT uses the flat fatigue model; full recovery takes 8 hours of rest — #114. */
    override getFatigueModel(): FatigueModelDef {
        return { ...FATIGUE_MODES.flat, fullRecoveryHours: 8 };
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
            packs: [
                'rt-core-origins-homeworlds',
                'rt-core-origins-birthrights',
                'rt-core-origins-lure-of-the-void',
                'rt-core-origins-trials-and-travails',
                'rt-core-origins-motivations',
                'rt-core-origins-careers',
                'rt-storm-origins-homeworlds',
                'rt-storm-origins-birthrights',
                'rt-storm-origins-lure-of-the-void',
                'rt-storm-origins-trials-and-travails',
                'rt-storm-origins-motivations',
                'rt-storm-origins-lineages',
            ],
        };
    }

    getCareerRegistry(): Record<string, CareerTable> {
        return getCareerAdvancementRegistry();
    }

    resolveCareerKey(actor: WH40KBaseActor): string | null {
        const careerName = actor.system.originPath?.career;
        return typeof careerName === 'string' && careerName !== '' ? getCareerKeyFromName(careerName) : null;
    }

    getHeaderFields(actor: WH40KBaseActor): SidebarHeaderField[] {
        const rank = actor.system.rank;
        return [
            this.makeOriginField(actor, 'WH40K.OriginPath.HomeWorld', 'homeWorld'),
            this.makeOriginField(actor, 'WH40K.OriginPath.Career', 'career'),
            this.makeField(game.i18n.localize('WH40K.Character.Rank'), 'system.rank', rank, 'Rank', 'number'),
        ];
    }
}
