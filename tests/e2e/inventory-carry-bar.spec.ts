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
/** The Inventory tab itself. */
const INVENTORY_TAB = 'section.tab[data-tab="equipment"]';
/** The PC's carried load, in kg. */
const CARRIED_KG = 12;

test.describe.serial('Inventory Carry bar (Tier B, #545)', () => {
    for (const line of LINES) {
        test(`${line}: the PC's Inventory header has the Carry bar and the NPC's has none`, async ({ page }) => {
            await joinOrSkip(page);
            // The PC carries a load, the case in which the tab once drew a second bar above the panel.
            const pc = await createActor(page, {
                data: { name: `e2e-545 ${line} PC`, type: `${line}-character`, system: { gameSystem: line } },
                items: [{ name: 'e2e-545 Field Pack', type: 'gear', system: { weight: CARRIED_KG } }],
            });
            const npc = await createActor(page, { data: { name: `e2e-545 ${line} NPC`, type: `${line}-npc`, system: { gameSystem: line } } });
            try {
                const pcSheet = await openActorSheet(page, pc.id, 'equipment');
                const pcHeader = page.locator(`#${pcSheet} ${INVENTORY_HEADER}`);
                await expect(pcHeader).toBeVisible();
                await expect(pcHeader.locator('[data-carry-bar]')).toBeVisible();
                await expect(pcHeader.locator('[data-carry-bar]')).toContainText(new RegExp(`\\b${CARRIED_KG} / \\d`));
                // Exactly one Carry bar on the whole tab: the panel header's.
                await expect(page.locator(`#${pcSheet} ${INVENTORY_TAB} [data-carry-bar]`)).toHaveCount(1);
                await expect(page.locator(`#${pcSheet} ${INVENTORY_TAB}`)).not.toContainText(/carrying/i);
                if (line === 'dh2') {
                    await clearScreenOverlays(page, pcSheet);
                    await snap(page, 'inventory-carry-bar-pc-header', { selector: `#${pcSheet} ${INVENTORY_HEADER}` });
                    await snap(page, 'inventory-carry-bar-pc-tab-top', { selector: `#${pcSheet} ${INVENTORY_TAB}` });
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
