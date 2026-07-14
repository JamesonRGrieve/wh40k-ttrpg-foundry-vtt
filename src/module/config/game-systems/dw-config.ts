/**
 * @file Deathwatch system configuration.
 * Career/specialty-based advancement with 3 skill ranks.
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { FATIGUE_MODES } from '../../rules/fatigue.ts';
import { CareerBasedSystemConfig } from './career-based-system-config.ts';
import type { FatigueModelDef, OriginStepConfig, SidebarHeaderField } from './types.ts';

export class DWSystemConfig extends CareerBasedSystemConfig {
    readonly id = 'dw' as const;
    readonly label = 'WH40K.System.Deathwatch';
    readonly cssClass = 'deathwatch';
    readonly theme = {
        primary: 'bronze',
        accent: 'accent-combat',
        border: 'accent-combat-d10',
    } as const;

    /**
     * DW uses the flat fatigue model, but recovers far faster (a full hour of
     * rest removes all; RAW 1 level per 10 min) and wakes regaining only one
     * level rather than reverting to TB — #114.
     */
    override getFatigueModel(): FatigueModelDef {
        return { ...FATIGUE_MODES.flat, wakeBehavior: 'drop-one-level', fullRecoveryHours: 1 };
    }

    getOriginStepConfig(): OriginStepConfig {
        return {
            coreSteps: [
                { key: 'chapter', step: 'chapter', icon: 'fa-shield-alt', descKey: 'ChapterDesc', stepIndex: 1 },
                { key: 'speciality', step: 'speciality', icon: 'fa-crosshairs', descKey: 'SpecialityDesc', stepIndex: 2 },
            ],
            optionalStep: null,
            packs: [
                'dw-core-origins-chapters',
                'dw-core-origins-specialities',
                'dw-founding-origins-chapters',
                'dw-rites-origins-chapters',
                'dw-honour-origins-chapters',
            ],
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
        return [
            this.makeOriginField(actor, 'WH40K.OriginPath.Chapter', 'homeWorld'),
            this.makeOriginField(actor, 'WH40K.OriginPath.Speciality', 'role'),
            this.makeOriginField(actor, 'WH40K.Character.Rank', 'career'),
            this.makeOriginField(actor, 'WH40K.OriginPath.Demeanour', 'motivation'),
        ];
    }
}
