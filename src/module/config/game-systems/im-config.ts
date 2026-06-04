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
            // Imperium Maledictum core creation: Origin (world) → Faction → Role.
            // The Inquisition Player's Guide packs (im-inquisition-origins-*) are
            // intentionally excluded until their place in chargen is settled.
            packs: ['im-core-origins-worlds', 'im-core-origins-factions', 'im-core-origins-roles'],
        };
    }

    getHeaderFields(actor: WH40KBaseActor): SidebarHeaderField[] {
        const get = (key: string): string | number => this.readOriginPathField(actor, key);
        return [
            this.makeField('Patron', 'system.originPath.homeWorld', get('homeWorld'), 'Patron'),
            this.makeField('Faction', 'system.originPath.background', get('background'), 'Faction'),
            this.makeField('Role', 'system.originPath.role', get('role')),
            this.makeField('Endeavour', 'system.originPath.motivation', get('motivation'), 'Endeavour'),
        ];
    }

    // Characteristic + skill aptitude tables are inherited from AptitudeBasedSystemConfig (#298) — IM shares the DH2e values.
}
