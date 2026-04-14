/**
 * @file Only War system configuration.
 * Aptitude-based advancement with 4 skill ranks.
 * Uses the same cost tables and aptitude system as DH2e.
 */

import { AptitudeBasedSystemConfig } from './aptitude-based-system-config.ts';
import type { OriginStepConfig } from './types.ts';

export class OWSystemConfig extends AptitudeBasedSystemConfig {
    readonly id = 'ow' as const;
    readonly label = 'WH40K.System.OnlyWar';
    readonly cssClass = 'only-war';

    getOriginStepConfig(): OriginStepConfig {
        return {
            coreSteps: [
                { key: 'regiment', step: 'regiment', icon: 'fa-shield', descKey: 'RegimentDesc', stepIndex: 1 },
                { key: 'speciality', step: 'speciality', icon: 'fa-crosshairs', descKey: 'SpecialityDesc', stepIndex: 2 },
            ],
            optionalStep: null,
            packs: [
                'ow-core-homeworlds',
                'ow-core-regiment-types',
                'ow-core-specialities',
                'ow-core-commanding-officers',
                'ow-core-training-doctrines',
                'ow-core-special-equipment-doctrines',
                'ow-hammer-homeworlds',
                'ow-hammer-regiment-types',
                'ow-hammer-training-doctrines',
                'ow-hammer-special-equipment-doctrines',
                'ow-shield-homeworlds',
                'ow-shield-regiment-types',
                'ow-shield-training-doctrines',
                'ow-shield-special-equipment-doctrines',
            ],
        };
    }

    /** OW characteristic aptitude pairs — same as DH2e */
    getCharacteristicAptitudes(charKey: string): [string, string] {
        const map: Record<string, [string, string]> = {
            weaponSkill:    ['Weapon Skill', 'Offence'],
            ballisticSkill: ['Ballistic Skill', 'Finesse'],
            strength:       ['Strength', 'Offence'],
            toughness:      ['Toughness', 'Defence'],
            agility:        ['Agility', 'Finesse'],
            intelligence:   ['Intelligence', 'Knowledge'],
            perception:     ['Perception', 'Fieldcraft'],
            willpower:      ['Willpower', 'Psyker'],
            fellowship:     ['Fellowship', 'Social'],
        };
        return map[charKey] ?? ['General', 'General'];
    }

    /** OW skill aptitude pairs — same as DH2e */
    getSkillAptitudeTable(): Record<string, [string, string]> {
        return {
            acrobatics:     ['Agility', 'General'],
            athletics:      ['Strength', 'General'],
            awareness:      ['Perception', 'Fieldcraft'],
            charm:          ['Fellowship', 'Social'],
            command:        ['Fellowship', 'Leadership'],
            commerce:       ['Intelligence', 'Knowledge'],
            commonLore:     ['Intelligence', 'General'],
            deceive:        ['Fellowship', 'Social'],
            dodge:          ['Agility', 'Defence'],
            forbiddenLore:  ['Intelligence', 'Knowledge'],
            inquiry:        ['Fellowship', 'Social'],
            interrogation:  ['Willpower', 'Social'],
            intimidate:     ['Strength', 'General'],
            linguistics:    ['Intelligence', 'General'],
            logic:          ['Intelligence', 'Knowledge'],
            medicae:        ['Intelligence', 'Fieldcraft'],
            navigate:       ['Intelligence', 'Fieldcraft'],
            operate:        ['Agility', 'Fieldcraft'],
            parry:          ['Weapon Skill', 'Defence'],
            psyniscience:   ['Perception', 'Psyker'],
            scholasticLore: ['Intelligence', 'Knowledge'],
            scrutiny:       ['Perception', 'General'],
            security:       ['Intelligence', 'Tech'],
            sleightOfHand:  ['Agility', 'Knowledge'],
            stealth:        ['Agility', 'Fieldcraft'],
            survival:       ['Perception', 'Fieldcraft'],
            techUse:        ['Intelligence', 'Tech'],
            trade:          ['Intelligence', 'General'],
        };
    }
}
