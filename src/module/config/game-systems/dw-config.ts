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
    readonly theme = {
        primary: 'bronze',
        accent: 'accent-combat',
        border: 'accent-combat-d10',
    } as const;

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

    // eslint-disable-next-line no-restricted-syntax -- boundary: matches abstract CareerBasedSystemConfig.getCareerRegistry() return type
    getCareerRegistry(): Record<string, unknown> {
        // DW specialty advance tables TBD
        return {};
    }

    resolveCareerKey(actor: WH40KBaseActor): string | null {
        const speciality = actor.system.originPath?.speciality;
        return typeof speciality === 'string' ? speciality : null;
    }

    getHeaderFields(actor: WH40KBaseActor): SidebarHeaderField[] {
        const get = (key: string): string | number => this.readOriginPathField(actor, key);
        return [
            this.makeField('Chapter', 'system.originPath.homeWorld', get('homeWorld'), 'Chapter'),
            this.makeField('Speciality', 'system.originPath.role', get('role'), 'Speciality'),
            this.makeField('Rank', 'system.originPath.career', get('career')),
            this.makeField('Demeanour', 'system.originPath.motivation', get('motivation'), 'Demeanour'),
        ];
    }
}
