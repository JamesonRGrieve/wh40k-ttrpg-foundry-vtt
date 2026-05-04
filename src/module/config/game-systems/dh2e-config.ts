/**
 * @file Dark Heresy 2nd Edition system configuration.
 * Aptitude-based advancement with 4 skill ranks.
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { AptitudeBasedSystemConfig } from './aptitude-based-system-config.ts';
import type { OriginStepConfig, SidebarHeaderField } from './types.ts';

export class DH2eSystemConfig extends AptitudeBasedSystemConfig {
    readonly id = 'dh2e' as const;
    readonly label = 'WH40K.System.DarkHeresy2e';
    readonly cssClass = 'dark-heresy';
    readonly theme = {
        primary: 'bronze',
        accent: 'gold-raw',
        border: 'gold-raw-d10',
    } as const;

    override get startingXP(): number {
        return 1000;
    }

    getOriginStepConfig(): OriginStepConfig {
        return {
            coreSteps: [
                { key: 'homeWorld', step: 'homeWorld', icon: 'fa-globe', descKey: 'HomeWorldDesc', stepIndex: 1 },
                { key: 'background', step: 'background', icon: 'fa-scroll', descKey: 'BackgroundDesc', stepIndex: 2 },
                { key: 'role', step: 'role', icon: 'fa-user-shield', descKey: 'RoleDesc', stepIndex: 3 },
            ],
            optionalStep: { key: 'elite', step: 'elite', icon: 'fa-star', descKey: 'EliteDesc', stepIndex: 4 },
            equipmentStep: { key: 'equipment', step: 'equipment', icon: 'fa-box', descKey: 'EquipmentDesc', stepIndex: 6 },
            packs: [
                'dh2-core-stats-homeworlds',
                'dh2-core-stats-backgrounds',
                'dh2-core-stats-roles',
                'dh2-core-stats-elite-advances',
                'dh2-beyond-stats-homeworlds',
                'dh2-beyond-stats-backgrounds',
                'dh2-beyond-stats-roles',
                'dh2-within-stats-backgrounds',
                'dh2-within-stats-roles',
                'dh2-without-stats-homeworlds',
                'dh2-without-stats-backgrounds',
                'dh2-without-stats-roles',
            ],
            equipmentPacks: [
                'dh2-core-items-weapons',
                'dh2-core-items-armour',
                'dh2-core-items-ammo',
                'dh2-core-items-gear',
                'dh2-core-items-cybernetics',
                'dh2-core-items-weapon-mods',
                'dh2-beyond-items-weapons',
                'dh2-beyond-items-armour',
                'dh2-beyond-items-armor-mods',
                'dh2-beyond-items-ammo',
                'dh2-beyond-items-gear',
                'dh2-beyond-items-weapon-mods',
                'dh2-within-items-weapons',
                'dh2-within-items-armour',
                'dh2-within-items-armor-mods',
                'dh2-within-items-ammo',
                'dh2-within-items-gear',
                'dh2-without-items-weapons',
                'dh2-without-items-armour',
                'dh2-without-items-ammo',
                'dh2-without-items-gear',
            ],
        };
    }

    getHeaderFields(actor: WH40KBaseActor): SidebarHeaderField[] {
        const originPath = (actor.system?.originPath ?? {}) as Record<string, string | number>;
        return [
            this.makePlayerField(actor),
            this.makeField(game.i18n.localize('WH40K.OriginPath.HomeWorld'), 'system.originPath.homeWorld', originPath.homeWorld ?? '', 'Home World'),
            this.makeField(game.i18n.localize('WH40K.OriginPath.Background'), 'system.originPath.background', originPath.background ?? '', 'Background'),
            this.makeField(game.i18n.localize('WH40K.OriginPath.Role'), 'system.originPath.role', originPath.role ?? '', 'Role'),
            this.makeField('Divination', 'system.originPath.divination', originPath.divination ?? '', 'Divination'),
        ];
    }

    /** DH2e characteristic aptitude pairs (Core Rulebook Table 2-3) */
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

    /** DH2e skill aptitude pairs (Core Rulebook Table 2-5) */
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
