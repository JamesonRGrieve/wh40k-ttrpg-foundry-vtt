/**
 * @file Rogue Trader system configuration.
 * Career-based advancement with 3 skill ranks.
 */

// Import the consolidated RT career registry
import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { FATIGUE_MODES } from '../../rules/fatigue.ts';
import { CAREER_TABLES } from '../advancements/career-tables.ts';
import { getCareerKeyFromName } from '../advancements/index.ts';
import { CareerBasedSystemConfig } from './career-based-system-config.ts';
import type { FatigueModelDef, OriginStepConfig, SidebarHeaderField } from './types.ts';

// eslint-disable-next-line no-restricted-syntax -- boundary: career tables are structurally CareerEntry but typed as unknown at the registry boundary
const RT_CAREER_REGISTRY: Record<string, unknown> = CAREER_TABLES;

export class RTSystemConfig extends CareerBasedSystemConfig {
    readonly id = 'rt' as const;
    readonly label = 'WH40K.System.RogueTrader';
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

    // eslint-disable-next-line no-restricted-syntax -- boundary: returns the opaque career registry; cast to concrete type at usage site
    getCareerRegistry(): Record<string, unknown> {
        return RT_CAREER_REGISTRY;
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
