/**
 * @file Dark Heresy 1st Edition system configuration.
 * Career-based advancement with 3 skill ranks.
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { CareerBasedSystemConfig } from './career-based-system-config.ts';
import type { OriginStepConfig, SidebarHeaderField } from './types.ts';

export class DH1eSystemConfig extends CareerBasedSystemConfig {
    readonly id = 'dh1e' as const;
    readonly label = 'WH40K.System.DarkHeresy1e';
    readonly cssClass = 'dark-heresy-1e';
    readonly theme = {
        primary: 'gold-raw',
        accent: 'gold-raw-l5',
        border: 'gold-raw-d15',
    } as const;

    /**
     * Dark Heresy characters receive 1000 XP at character generation in addition to the
     * starting package. The base config defaults to 0, which left DH1 characters at zero
     * XP after origin path commit while DH2 characters got the canonical 1000. See #14.
     */
    override get startingXP(): number {
        return 1000;
    }

    getOriginStepConfig(): OriginStepConfig {
        // DH1e origin path not yet defined — placeholder
        return { coreSteps: [], optionalStep: null, packs: [] };
    }

    getCareerRegistry(): Record<string, unknown> {
        // DH1e career tables TBD
        return {};
    }

    resolveCareerKey(actor: WH40KBaseActor): string | null {
        const career = actor.system.originPath?.career;
        return typeof career === 'string' ? career : null;
    }

    getHeaderFields(actor: WH40KBaseActor): SidebarHeaderField[] {
        const get = (key: string): string | number => this.readOriginPathField(actor, key);
        return [
            this.makeField('Home World', 'system.originPath.homeWorld', get('homeWorld')),
            this.makeField('Career Path', 'system.originPath.career', get('career'), 'Career Path'),
            this.makeField('Rank', 'system.originPath.role', get('role')),
            this.makeField('Divination', 'system.originPath.divination', get('divination')),
        ];
    }
}
