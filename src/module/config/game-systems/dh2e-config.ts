/**
 * @file Dark Heresy 2nd Edition system configuration.
 * Aptitude-based advancement with 4 skill ranks.
 */

import { AptitudeBasedSystemConfig } from './aptitude-based-system-config.ts';
import type { OriginStepConfig } from './types.ts';

export class DH2eSystemConfig extends AptitudeBasedSystemConfig {
    readonly id = 'dh2e' as const;
    readonly label = 'WH40K.System.DarkHeresy2e';
    readonly cssClass = 'dark-heresy';

    getOriginStepConfig(): OriginStepConfig {
        return {
            coreSteps: [
                { key: 'homeWorld', step: 'homeWorld', icon: 'fa-globe', descKey: 'HomeWorldDesc', stepIndex: 1 },
                { key: 'background', step: 'background', icon: 'fa-scroll', descKey: 'BackgroundDesc', stepIndex: 2 },
                { key: 'role', step: 'role', icon: 'fa-user-shield', descKey: 'RoleDesc', stepIndex: 3 },
            ],
            optionalStep: { key: 'elite', step: 'elite', icon: 'fa-star', descKey: 'EliteDesc', stepIndex: 4 },
            packs: [
                'dh2-core-homeworlds',
                'dh2-core-backgrounds',
                'dh2-core-roles',
                'dh2-core-elite-advances',
                'dh2-beyond-homeworlds',
                'dh2-beyond-backgrounds',
                'dh2-beyond-roles',
                'dh2-within-backgrounds',
                'dh2-within-roles',
                'dh2-without-homeworlds',
                'dh2-without-backgrounds',
                'dh2-without-roles',
            ],
        };
    }

    /** DH2e characteristic aptitude pairs (Core Rulebook Table 2-3) */
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

    /** DH2e skill aptitude pairs (Core Rulebook Table 2-5) */
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
