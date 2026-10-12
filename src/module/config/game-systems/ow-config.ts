/**
 * @file Only War system configuration.
 * Aptitude-based advancement with 4 skill ranks.
 * Uses the same cost tables and aptitude system as DH2e.
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { AcquisitionLadder } from '../../rules/acquisition-ladder.ts';
import { AptitudeBasedSystemConfig } from './aptitude-based-system-config.ts';
import type { OriginStepConfig, SidebarHeaderField } from './types.ts';

/**
 * Logistics test — core Table 6-2: Availability by Front Conditions, its
 * "Company or Less" column (p. 163), and Table 6-6: Craftsmanship and
 * Logistics (p. 167). The table's Single Regiment / Multiple Regiments
 * columns (larger deployments) are not modelled by this ladder.
 */
export const OW_ACQUISITION_LADDER = {
    availability: {
        ubiquitous: 30,
        abundant: 20,
        plentiful: 10,
        common: 0,
        average: -10,
        scarce: -20,
        rare: -30,
        veryRare: -40,
        extremelyRare: -50,
        nearUnique: -60,
        unique: 'discretion',
    },
    craftsmanship: { poor: 20, common: 0, good: -30, best: -50 },
} as const satisfies AcquisitionLadder;

export class OWSystemConfig extends AptitudeBasedSystemConfig {
    readonly id = 'ow' as const;
    readonly usesMalignancyTest = true;
    readonly maleficCorruptionOnManifest = false;
    readonly acquisitionLadder: AcquisitionLadder = OW_ACQUISITION_LADDER;
    readonly label = 'WH40K.SETTINGS.PrimaryGameSystem.Choices.ow';
    readonly cssClass = 'only-war';
    readonly theme = {
        primary: 'brass',
        accent: 'brass-l20',
        border: 'brass-d15',
    } as const;

    getOriginStepConfig(): OriginStepConfig {
        return {
            coreSteps: [
                { key: 'regiment', step: 'regiment', icon: 'fa-shield', descKey: 'RegimentDesc', stepIndex: 1 },
                { key: 'speciality', step: 'speciality', icon: 'fa-crosshairs', descKey: 'SpecialityDesc', stepIndex: 2 },
            ],
            optionalStep: null,
            packs: [
                'ow-core-origins-homeworlds',
                'ow-core-origins-regiment-types',
                'ow-core-origins-specialities',
                'ow-core-origins-commanding-officers',
                'ow-core-origins-training-doctrines',
                'ow-core-origins-special-equipment-doctrines',
                'ow-hammer-origins-homeworlds',
                'ow-hammer-origins-regiment-types',
                'ow-hammer-origins-training-doctrines',
                'ow-hammer-origins-special-equipment-doctrines',
                'ow-shield-origins-homeworlds',
                'ow-shield-origins-regiment-types',
                'ow-shield-origins-training-doctrines',
                'ow-shield-origins-special-equipment-doctrines',
            ],
        };
    }

    getHeaderFields(actor: WH40KBaseActor): SidebarHeaderField[] {
        return [
            this.makeOriginField(actor, 'WH40K.OriginPath.HomeWorld', 'homeWorld'),
            this.makeOriginField(actor, 'WH40K.OriginPath.Regiment', 'background'),
            this.makeOriginField(actor, 'WH40K.OriginPath.Speciality', 'role'),
            this.makeOriginField(actor, 'WH40K.OriginPath.Demeanour', 'motivation'),
        ];
    }

    /**
     * OW: psyker unlock is the "Sanctioned Psyker" speciality (step='speciality').
     * Compendium item: ow-core-specialities/sanctioned-psyker.
     */
    override isPsyker(actor: WH40KBaseActor): boolean {
        return this.ownsOriginPathItem(actor, 'speciality', 'sanctioned psyker');
    }

    // Characteristic + skill aptitude tables are inherited from AptitudeBasedSystemConfig (#298) — OW shares the DH2e values.
}
