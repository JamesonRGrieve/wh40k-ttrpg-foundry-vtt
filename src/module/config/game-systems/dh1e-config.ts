/**
 * @file Dark Heresy 1st Edition system configuration.
 * Career-based advancement with 3 skill ranks.
 */

import { CareerBasedSystemConfig } from './career-based-system-config.ts';
import type { OriginStepConfig } from './types.ts';

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

    resolveCareerKey(actor: any): string | null {
        return actor.system?.originPath?.career ?? null;
    }
}
