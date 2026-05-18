/**
 * @file Rogue Trader system configuration.
 * Career-based advancement with 3 skill ranks.
 */

// Import the consolidated RT career registry
import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { CAREER_TABLES } from '../advancements/career-tables.ts';
import { getCareerKeyFromName } from '../advancements/index.ts';
import { CareerBasedSystemConfig } from './career-based-system-config.ts';
import type { OriginStepConfig, SidebarHeaderField } from './types.ts';

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
                'rt-core-homeworlds',
                'rt-core-birthrights',
                'rt-core-lure-of-the-void',
                'rt-core-trials-and-travails',
                'rt-core-motivations',
                'rt-core-careers',
                'rt-storm-homeworlds',
                'rt-storm-birthrights',
                'rt-storm-lure-of-the-void',
                'rt-storm-trials-and-travails',
                'rt-storm-motivations',
                'rt-storm-lineages',
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
        const get = (key: string): string | number => this.readOriginPathField(actor, key);
        const rank = actor.system.rank;
        return [
            this.makeField(game.i18n.localize('WH40K.OriginPath.HomeWorld'), 'system.originPath.homeWorld', get('homeWorld'), 'Home World'),
            this.makeField(game.i18n.localize('WH40K.OriginPath.Career'), 'system.originPath.career', get('career'), 'Career'),
            this.makeField(game.i18n.localize('WH40K.Character.Rank'), 'system.rank', rank, 'Rank', 'number'),
        ];
    }
}
