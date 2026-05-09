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
            this.makePlayerField(actor),
            this.makeField('Home World', 'system.originPath.homeWorld', get('homeWorld')),
            this.makeField('Career Path', 'system.originPath.career', get('career'), 'Career Path'),
            this.makeField('Rank', 'system.originPath.role', get('role')),
            this.makeField('Divination', 'system.originPath.divination', get('divination')),
        ];
    }
}
