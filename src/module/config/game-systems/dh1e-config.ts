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

    getOriginStepConfig(): OriginStepConfig {
        // DH1e origin path not yet defined — placeholder
        return { coreSteps: [], optionalStep: null, packs: [] };
    }

    getCareerRegistry(): Record<string, unknown> {
        // DH1e career tables TBD
        return {};
    }

    resolveCareerKey(actor: WH40KBaseActor): string | null {
        return (actor.system?.originPath?.career as string | undefined) ?? null;
    }

    getHeaderFields(actor: WH40KBaseActor): SidebarHeaderField[] {
        const originPath = (actor.system?.originPath ?? {}) as Record<string, string | number>;
        return [
            this.makePlayerField(actor),
            this.makeField('Home World', 'system.originPath.homeWorld', originPath.homeWorld ?? ''),
            this.makeField('Career Path', 'system.originPath.career', originPath.career ?? '', 'Career Path'),
            this.makeField('Rank', 'system.originPath.role', originPath.role ?? ''),
            this.makeField('Divination', 'system.originPath.divination', originPath.divination ?? ''),
        ];
    }
}
