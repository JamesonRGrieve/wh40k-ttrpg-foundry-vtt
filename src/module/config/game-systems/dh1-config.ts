/**
 * @file Dark Heresy 1st Edition system configuration.
 * Career-based advancement with 3 skill ranks.
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { FATIGUE_MODES } from '../../rules/fatigue.ts';
import { CareerBasedSystemConfig } from './career-based-system-config.ts';
import type { FatigueModelDef, OriginStepConfig, SidebarHeaderField } from './types.ts';

export class DH1eSystemConfig extends CareerBasedSystemConfig {
    readonly id = 'dh1' as const;
    readonly label = 'WH40K.System.DarkHeresy1e';
    readonly cssClass = 'dark-heresy-1e';
    readonly theme = {
        primary: 'gold-raw',
        accent: 'gold-raw-l5',
        border: 'gold-raw-d15',
    } as const;

    /** DH1 uses the halving fatigue model (errata: TB+WPB threshold, 2× death) — #114. */
    override getFatigueModel(): FatigueModelDef {
        return FATIGUE_MODES.halving;
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
        // step. Inquisitor's Handbook home worlds extend the same Home World step.
        // Ascension careers (a post-campaign tier) are intentionally excluded.
        return {
            coreSteps: [
                { key: 'homeWorld', step: 'homeWorld', icon: 'fa-globe', descKey: 'HomeWorldDesc', stepIndex: 1 },
                { key: 'career', step: 'career', icon: 'fa-user-tie', descKey: 'CareerDesc', stepIndex: 2 },
            ],
            optionalStep: null,
            packs: ['dh1-core-origins-homeworlds', 'dh1-inquisitor-origins-homeworlds', 'dh1-core-origins-careers'],
        };
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: matches abstract CareerBasedSystemConfig.getCareerRegistry() return type
    getCareerRegistry(): Record<string, unknown> {
        // DH1e career tables TBD
        return {};
    }

    resolveCareerKey(actor: WH40KBaseActor): string | null {
        const career = actor.system.originPath?.career;
        return typeof career === 'string' ? career : null;
    }

    getHeaderFields(actor: WH40KBaseActor): SidebarHeaderField[] {
        // Divination renders as the italic quote beneath the portrait
        // (sidebar-header), so it is not repeated as a static row here (#226).
        return [
            this.makeOriginField(actor, 'WH40K.OriginPath.HomeWorld', 'homeWorld'),
            this.makeOriginField(actor, 'WH40K.OriginPath.CareerPath', 'career'),
            this.makeOriginField(actor, 'WH40K.Character.Rank', 'role'),
        ];
    }
}
