import { closeWindow, createActor, deleteDocuments, openActorSheet } from './combat-resolution-flow';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B for the Inventory tab's Carry bar (#545).
 *
 * The bar sits in the header of the Carried / Elsewhere panel, which every PC and
 * NPC sheet mounts on its Inventory tab. Only an actor that tracks encumbrance gets
 * the bar: every line's PC does, and no NPC does. An NPC's header must show no bar
 * and no empty "/ KG".
 */

const LINES = ['dh2', 'dh1', 'rt', 'bc', 'ow', 'dw', 'im'] as const;
/** The Carried / Elsewhere panel's header: the panel with the give-selected button. */
const INVENTORY_HEADER = '.wh40k-panel:has([data-action="giveCheckedItems"]) > .wh40k-panel-header';

test.describe.serial('Inventory Carry bar (Tier B, #545)', () => {
    for (const line of LINES) {
        test(`${line}: the PC's Inventory header has the Carry bar and the NPC's has none`, async ({ page }) => {
            await joinOrSkip(page);
            const pc = await createActor(page, { data: { name: `e2e-545 ${line} PC`, type: `${line}-character`, system: { gameSystem: line } } });
            const npc = await createActor(page, { data: { name: `e2e-545 ${line} NPC`, type: `${line}-npc`, system: { gameSystem: line } } });
            try {
                const pcSheet = await openActorSheet(page, pc.id, 'equipment');
                const pcHeader = page.locator(`#${pcSheet} ${INVENTORY_HEADER}`);
                await expect(pcHeader).toBeVisible();
                await expect(pcHeader.locator('[data-carry-bar]')).toBeVisible();
                await expect(pcHeader.locator('[data-carry-bar]')).toContainText(/\d+ \/ \d+/);
                if (line === 'dh2') {
                    await clearScreenOverlays(page, pcSheet);
                    await snap(page, 'inventory-carry-bar-pc-header', { selector: `#${pcSheet} ${INVENTORY_HEADER}` });
                }
                await closeWindow(page, pcSheet);

                const npcSheet = await openActorSheet(page, npc.id, 'equipment');
                const npcHeader = page.locator(`#${npcSheet} ${INVENTORY_HEADER}`);
                await expect(npcHeader).toBeVisible();
                await expect(npcHeader.locator('[data-carry-bar]')).toHaveCount(0);
                await expect(npcHeader).not.toContainText(/\/\s*kg/i);
                if (line === 'dh2') {
                    await clearScreenOverlays(page, npcSheet);
                    await snap(page, 'inventory-carry-bar-npc-header', { selector: `#${npcSheet} ${INVENTORY_HEADER}` });
                }
                await closeWindow(page, npcSheet);
            } finally {
                await deleteDocuments(page, { actors: [pc.id, npc.id] });
            }
        });
    }
});
