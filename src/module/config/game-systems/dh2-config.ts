/**
 * @file Dark Heresy 2nd Edition system configuration.
 * Aptitude-based advancement with 4 skill ranks.
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { AptitudeBasedSystemConfig } from './aptitude-based-system-config.ts';
import type { OriginStepConfig, SidebarHeaderField } from './types.ts';

export class DH2eSystemConfig extends AptitudeBasedSystemConfig {
    readonly id = 'dh2' as const;
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
                'dh2-core-origins-homeworlds',
                'dh2-core-origins-backgrounds',
                'dh2-core-origins-roles',
                'dh2-core-origins-elite-advances',
                'dh2-beyond-origins-homeworlds',
                'dh2-beyond-origins-backgrounds',
                'dh2-beyond-origins-roles',
                'dh2-within-origins-homeworlds',
                'dh2-within-origins-backgrounds',
                'dh2-within-origins-roles',
                'dh2-without-origins-homeworlds',
                'dh2-without-origins-backgrounds',
                'dh2-without-origins-roles',
            ],
            equipmentPacks: [
                'dh2-core-items-weapons',
                'dh2-core-items-armour',
                'dh2-core-items-ammo',
                'dh2-core-items-wearables',
                'dh2-core-items-tools',
                'dh2-core-items-consumables',
                'dh2-core-items-cybernetics',
                'dh2-core-items-weapon-mods',
                'dh2-beyond-items-weapons',
                'dh2-beyond-items-armour',
                'dh2-beyond-items-armor-mods',
                'dh2-beyond-items-ammo',
                'dh2-beyond-items-tools',
                'dh2-beyond-items-weapon-mods',
                'dh2-within-items-weapons',
                'dh2-within-items-armour',
                'dh2-within-items-armor-mods',
                'dh2-within-items-ammo',
                'dh2-within-items-relics',
                'dh2-within-items-services',
                'dh2-within-items-weapon-mods',
                'dh2-without-items-weapons',
                'dh2-without-items-armour',
                'dh2-without-items-armor-mods',
                'dh2-without-items-ammo',
                'dh2-without-items-consumables',
                'dh2-without-items-relics',
                'dh2-without-items-services',
                'dh2-without-items-tools',
                'dh2-without-items-weapon-mods',
            ],
        };
    }

    /**
     * DH2e: psyker unlock is the "Psyker" elite advance (step='elite').
     * Compendium item: dh2-core-origins-elite-advances/psyker.
     */
    override isPsyker(actor: WH40KBaseActor): boolean {
        return this.ownsOriginPathItem(actor, 'elite', 'psyker');
    }

    getHeaderFields(_actor: WH40KBaseActor): SidebarHeaderField[] {
        // Home World / Background / Role are shown as origin-path bubbles, and
        // Divination already renders as the italic quote beneath the portrait
        // (sidebar-header). Listing any of them again as static text rows here is
        // redundant (#226), so the sidebar fields panel is empty for DH2.
        return [];
    }

    // Characteristic + skill aptitude tables are inherited from AptitudeBasedSystemConfig (#298).
}
