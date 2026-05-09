/**
 * @file Imperium Maledictum system configuration.
 * Reuses the aptitude-driven four-rank character framework for now.
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { AptitudeBasedSystemConfig } from './aptitude-based-system-config.ts';
import type { OriginStepConfig, SidebarHeaderField } from './types.ts';

export class IMSystemConfig extends AptitudeBasedSystemConfig {
    readonly id = 'im' as const;
    readonly label = 'WH40K.System.ImperiumMaledictum';
    readonly cssClass = 'imperium-maledictum';
    readonly theme = {
        primary: 'crimson-light',
        accent: 'failure',
        border: 'failure-l10',
    } as const;

    getOriginStepConfig(): OriginStepConfig {
        return {
            coreSteps: [
                { key: 'homeWorld', step: 'homeWorld', icon: 'fa-hand-holding-heart', descKey: 'PatronDesc', stepIndex: 1 },
                { key: 'background', step: 'background', icon: 'fa-flag', descKey: 'FactionDesc', stepIndex: 2 },
                { key: 'role', step: 'role', icon: 'fa-user-shield', descKey: 'RoleDesc', stepIndex: 3 },
            ],
            optionalStep: null,
            packs: [],
        };
    }

    getHeaderFields(actor: WH40KBaseActor): SidebarHeaderField[] {
        const get = (key: string): string | number => this.readOriginPathField(actor, key);
        return [
            this.makePlayerField(actor),
            this.makeField('Patron', 'system.originPath.homeWorld', get('homeWorld'), 'Patron'),
            this.makeField('Faction', 'system.originPath.background', get('background'), 'Faction'),
            this.makeField('Role', 'system.originPath.role', get('role')),
            this.makeField('Endeavour', 'system.originPath.motivation', get('motivation'), 'Endeavour'),
        ];
    }

    getCharacteristicAptitudes(charKey: string): [string, string] {
        const map: Record<string, [string, string]> = {
            weaponSkill: ['Weapon Skill', 'Offence'],
            ballisticSkill: ['Ballistic Skill', 'Finesse'],
            strength: ['Strength', 'Offence'],
            toughness: ['Toughness', 'Defence'],
            agility: ['Agility', 'Finesse'],
            intelligence: ['Intelligence', 'Knowledge'],
            perception: ['Perception', 'Fieldcraft'],
            willpower: ['Willpower', 'Psyker'],
            fellowship: ['Fellowship', 'Social'],
        };
        return map[charKey] ?? ['General', 'General'];
    }

    getSkillAptitudeTable(): Record<string, [string, string]> {
        return {
            acrobatics: ['Agility', 'General'],
            athletics: ['Strength', 'General'],
            awareness: ['Perception', 'Fieldcraft'],
            charm: ['Fellowship', 'Social'],
            command: ['Fellowship', 'Leadership'],
            commerce: ['Intelligence', 'Knowledge'],
            commonLore: ['Intelligence', 'General'],
            deceive: ['Fellowship', 'Social'],
            dodge: ['Agility', 'Defence'],
            forbiddenLore: ['Intelligence', 'Knowledge'],
            inquiry: ['Fellowship', 'Social'],
            interrogation: ['Willpower', 'Social'],
            intimidate: ['Strength', 'General'],
            linguistics: ['Intelligence', 'General'],
            logic: ['Intelligence', 'Knowledge'],
            medicae: ['Intelligence', 'Fieldcraft'],
            navigate: ['Intelligence', 'Fieldcraft'],
            operate: ['Agility', 'Fieldcraft'],
            parry: ['Weapon Skill', 'Defence'],
            psyniscience: ['Perception', 'Psyker'],
            scholasticLore: ['Intelligence', 'Knowledge'],
            scrutiny: ['Perception', 'General'],
            security: ['Intelligence', 'Tech'],
            sleightOfHand: ['Agility', 'Knowledge'],
            stealth: ['Agility', 'Fieldcraft'],
            survival: ['Perception', 'Fieldcraft'],
            techUse: ['Intelligence', 'Tech'],
            trade: ['Intelligence', 'General'],
        };
    }
}
