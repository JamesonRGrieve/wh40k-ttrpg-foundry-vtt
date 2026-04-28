/**
 * @file CriticalInjurySheet - ApplicationV2 sheet for critical injury items
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';
import type BaseItemSheet from './base-item-sheet.ts';
import type { WH40KItem } from '../../documents/item.ts';

/**
 * Handle severity change - re-render to update displayed effect.
 */
async function changeSeverity(this: BaseItemSheet, _event: Event, target: HTMLElement): Promise<void> {
    const item = (this as unknown as { item: WH40KItem }).item;
    const newSeverity = parseInt((target as HTMLInputElement).value, 10);
    const sys = item.system as { severity?: number };
    if (newSeverity !== sys.severity) {
        await item.update({ 'system.severity': newSeverity });
    }
}

/**
 * Sheet for critical injury items.
 * Displays injury details with severity slider and body location visual.
 */
const CriticalInjurySheet = defineSimpleItemSheet({
    className: 'CriticalInjurySheet',
    classes: ['wh40k-rpg', 'sheet', 'item', 'critical-injury'],
    template: 'systems/wh40k-rpg/templates/item/item-critical-injury-sheet.hbs',
    width: 560,
    height: 620,
    tabs: [
        { tab: 'details', group: 'primary', label: 'Details' },
        { tab: 'description', group: 'primary', label: 'Description' },
    ],
    defaultTab: 'details',
    actions: {
        changeSeverity,
    },
    extraContext: {
        damageTypes: {
            impact: 'Impact',
            rending: 'Rending',
            explosive: 'Explosive',
            energy: 'Energy',
        },
        bodyParts: {
            head: 'Head',
            arm: 'Arm',
            body: 'Body',
            leg: 'Leg',
        },
    },
});

export default CriticalInjurySheet;
