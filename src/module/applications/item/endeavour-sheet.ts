/**
 * @file EndeavourSheet — ApplicationV2 sheet for Rogue Trader Endeavour items.
 *
 * Endeavours track Dynasty-scale goals (per RAW Rogue Trader, Core p. 290–298).
 * Each Endeavour owns a list of Objectives; objectives toggle complete, AP
 * accrues, and once `apEarned >= apRequired` the reward is granted by the
 * Endeavour panel action on the actor sheet.
 */

import type EndeavourData from '../../data/item/endeavour.ts';
import type BaseItemSheet from './base-item-sheet.ts';
import defineSimpleItemSheet from './define-simple-item-sheet.ts';

/** Local narrow view of the endeavour DataModel as exposed on this sheet's `item.system`. */
type EndeavourSystem = Pick<EndeavourData, 'apEarned' | 'apRequired' | 'objectives' | 'reward'>;

/**
 * Add a blank Objective to the current Endeavour.
 */
async function addObjective(this: BaseItemSheet): Promise<void> {
    const sys = this.item.system as unknown as EndeavourSystem;
    const next = [...sys.objectives, { name: '', description: '', complete: false, ap: 0 }];
    await this.item.update({ 'system.objectives': next });
}

/**
 * Remove the Objective at the index encoded on the click target's
 * `data-index` attribute. Decrements `apEarned` if the removed objective
 * was complete so the running total stays consistent.
 */
async function removeObjective(this: BaseItemSheet, _event: Event, target: HTMLElement): Promise<void> {
    const idxStr = target.dataset['index'];
    if (idxStr === undefined) return;
    const idx = Number.parseInt(idxStr, 10);
    if (!Number.isFinite(idx)) return;
    const sys = this.item.system as unknown as EndeavourSystem;
    if (idx < 0 || idx >= sys.objectives.length) return;
    const removed = sys.objectives[idx];
    const next = sys.objectives.filter((_, i) => i !== idx);
    const update: Record<string, unknown> = { 'system.objectives': next };
    if (removed?.complete) {
        update['system.apEarned'] = Math.max(0, sys.apEarned - removed.ap);
    }
    await this.item.update(update);
}

/**
 * Sheet for Endeavour items.
 *
 * Layout: a Details tab listing the AP totals and the reward Profit Factor /
 * narrative; an Objectives tab with the editable objective list and per-row
 * complete/AP fields; a Description tab for the GM's longer-form Endeavour
 * brief.
 */
const EndeavourSheet = defineSimpleItemSheet({
    className: 'EndeavourSheet',
    classes: ['wh40k-rpg', 'sheet', 'item', 'endeavour'],
    template: 'systems/wh40k-rpg/templates/item/item-endeavour-sheet.hbs',
    width: 620,
    height: 680,
    tabs: [
        { tab: 'details', group: 'primary', label: 'WH40K.Endeavours.Header' },
        { tab: 'objectives', group: 'primary', label: 'WH40K.Endeavours.Objectives' },
        { tab: 'description', group: 'primary', label: 'WH40K.Description.Label' },
    ],
    defaultTab: 'details',
    actions: {
        addObjective,
        removeObjective,
    },
});

export default EndeavourSheet;
