/**
 * @file Deathwatch system configuration.
 * Career/specialty-based advancement with 3 skill ranks.
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { CareerBasedSystemConfig } from './career-based-system-config.ts';
import type { OriginStepConfig, SidebarHeaderField } from './types.ts';

export class DWSystemConfig extends CareerBasedSystemConfig {
    readonly id = 'dw' as const;
    readonly label = 'WH40K.System.Deathwatch';
    readonly cssClass = 'deathwatch';

    getOriginStepConfig(): OriginStepConfig {
        return {
            coreSteps: [
                { key: 'chapter', step: 'chapter', icon: 'fa-shield-alt', descKey: 'ChapterDesc', stepIndex: 1 },
                { key: 'speciality', step: 'speciality', icon: 'fa-crosshairs', descKey: 'SpecialityDesc', stepIndex: 2 },
            ],
            optionalStep: null,
            packs: ['dw-core-chapters', 'dw-core-specialities', 'dw-founding-chapters', 'dw-rites-chapters'],
        };
    }

    getCareerRegistry(): Record<string, unknown> {
        // DW specialty advance tables TBD
        return {};
    }

    resolveCareerKey(actor: WH40KBaseActor): string | null {
        return actor.system?.originPath?.speciality ?? null;
    }

    getHeaderFields(actor: WH40KBaseActor): SidebarHeaderField[] {
        const originPath = (actor.system?.originPath ?? {}) as Record<string, string | number>;
        return [
            this.makePlayerField(actor),
            this.makeField('Chapter', 'system.originPath.homeWorld', originPath.homeWorld ?? '', 'Chapter'),
            this.makeField('Speciality', 'system.originPath.role', originPath.role ?? '', 'Speciality'),
            this.makeField('Rank', 'system.originPath.career', originPath.career ?? ''),
            this.makeField('Demeanour', 'system.originPath.motivation', originPath.motivation ?? '', 'Demeanour'),
        ];
    }
}
