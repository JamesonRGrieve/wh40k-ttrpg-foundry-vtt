import type { Page } from '@playwright/test';
import { createActor, deleteDocuments, openActorSheet } from './combat-resolution-flow';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B for #662: the shared item table (`actor/partial/item-table.hbs` +
 * `item-table-row.hbs`) lost its layout when the legacy CSS was deleted, so
 * every caller stacked its headers and cells into one column. The table is now
 * a grid with subgrid rows, so each header and the cells beneath it share a
 * column.
 *
 * The four voidcraft tables are checked on the live voidcraft sheet. For each
 * table the spec asserts that the header cells sit on one line in distinct
 * columns, and that every row has one cell per header starting at that header's
 * x. It then snaps the table.
 *
 * The other four callers (weapon, armour, vehicle weapons, vehicle upgrades)
 * were panels no live sheet mounted, so they were deleted. The second test
 * checks that the live character and craft sheets list the same items by name.
 */

/** What one rendered table's layout looks like. */
interface TableLayout {
    found: boolean;
    headerCount: number;
    /** Whether the header cells all overlap vertically: one line, not stacked. */
    headerOnOneLine: boolean;
    headerColumns: number;
    rowCount: number;
    misalignedRows: number;
}

/**
 * Mark the visible table matching `selector` for capture and measure its
 * layout. Cells are compared by their left edge, rounded to whole pixels.
 */
async function measureTable(page: Page, selector: string, label: string): Promise<TableLayout> {
    return page.evaluate(
        ({ sel, mark }): TableLayout => {
            const table = Array.from(document.querySelectorAll<HTMLElement>(sel)).find((el) => el.offsetParent !== null);
            if (table === undefined) return { found: false, headerCount: 0, headerOnOneLine: false, headerColumns: 0, rowCount: 0, misalignedRows: 0 };
            table.dataset['e2eTable'] = mark;
            const left = (el: Element): number => Math.round(el.getBoundingClientRect().left);
            const headers = Array.from(table.querySelector('[data-table-header]')?.children ?? []);
            const headerLefts = headers.map(left);
            const rows = Array.from(table.querySelectorAll(':scope > [data-item-id]'));
            const misaligned = rows.filter((row) => {
                const lefts = Array.from(row.children)
                    .filter((cell) => !cell.hasAttribute('data-description-id'))
                    .map(left);
                return lefts.length !== headerLefts.length || lefts.some((x, i) => x !== headerLefts[i]);
            });
            return {
                found: true,
                headerCount: headers.length,
                // Cells are vertically centred, so their tops differ with their height; on one line
                // they still overlap (the lowest top is above the highest bottom).
                headerOnOneLine:
                    Math.max(...headers.map((el) => el.getBoundingClientRect().top)) < Math.min(...headers.map((el) => el.getBoundingClientRect().bottom)),
                headerColumns: new Set(headerLefts).size,
                rowCount: rows.length,
                misalignedRows: misaligned.length,
            };
        },
        { sel: selector, mark: label },
    );
}

/** Measure, snap and assert one table. */
async function checkTable(page: Page, selector: string, label: string, expected: { headers: number; rows: number }): Promise<void> {
    const layout = await measureTable(page, selector, label);
    expect(layout.found, `${label}: the table should render`).toBe(true);
    await snap(page, `item-table-${label}`, { selector: `[data-e2e-table="${label}"]` });
    expect(layout.headerCount, `${label}: header cells`).toBe(expected.headers);
    expect(layout.headerOnOneLine, `${label}: header cells sit on one line`).toBe(true);
    expect(layout.headerColumns, `${label}: each header has its own column`).toBe(expected.headers);
    expect(layout.rowCount, `${label}: rows`).toBe(expected.rows);
    expect(layout.misalignedRows, `${label}: every row lines up under the header`).toBe(0);
}

/** Open the actor's sheet on `tab`, and assert that tab shows `name`; then snap the sheet. */
async function expectListed(page: Page, args: { actorId: string; tab: string; name: string; shot: string }): Promise<void> {
    const sheetId = await openActorSheet(page, args.actorId, args.tab);
    const entry = page.locator(`#${sheetId} .tab.active`).getByText(args.name, { exact: true }).first();
    await entry.scrollIntoViewIfNeeded();
    await expect(entry, `${args.name} on the ${args.tab} tab`).toBeVisible();
    await snap(page, args.shot, { selector: `#${sheetId}` });
}

test.describe.serial('Item table grid (Tier B, #662)', () => {
    test('the voidcraft weapon, component, upgrade and crew tables line up as grids', async ({ page }) => {
        await joinOrSkip(page);
        const ship = await createActor(page, {
            data: { name: 'e2e-662 Frigate', type: 'rt-voidcraft', system: { gameSystem: 'rt', hullType: 'frigate', hullClass: 'Sword' } },
            items: [
                { name: 'Sunsear Laser Battery', type: 'shipWeapon', system: { strength: 2, damage: '1d10+4', crit: 4, range: 9 } },
                { name: 'Mars Pattern Macrocannons', type: 'shipWeapon', system: { strength: 3, damage: '1d10+2', crit: 5, range: 6 } },
                {
                    name: 'Mark-201.b Auger Array',
                    type: 'shipComponent',
                    system: { componentType: 'auger', condition: 'functional', essential: true, shipPoints: 1 },
                },
                { name: 'Reinforced Bulkheads', type: 'shipUpgrade', system: { shipPoints: 2 } },
                { name: 'Helmsman', type: 'shipRole' },
            ],
        });
        try {
            const weaponsSheet = await openActorSheet(page, ship.id, 'weapons');
            await checkTable(page, `#${weaponsSheet} [data-table]`, 'ship-weapons', { headers: 7, rows: 2 });

            const componentsSheet = await openActorSheet(page, ship.id, 'components');
            const componentTables = `#${componentsSheet} [data-table]`;
            await checkTable(page, `${componentTables}:has([data-type="shipComponent"])`, 'ship-components', { headers: 6, rows: 1 });
            await checkTable(page, `${componentTables}:has([data-type="shipUpgrade"])`, 'ship-upgrades', { headers: 5, rows: 1 });

            const crewSheet = await openActorSheet(page, ship.id, 'crew');
            await checkTable(page, `#${crewSheet} [data-table]`, 'ship-crew', { headers: 3, rows: 1 });
        } finally {
            await deleteDocuments(page, { actors: [ship.id] });
        }
    });

    // The weapon, armour, vehicle weapon and vehicle upgrade panels were item-table
    // callers no live sheet mounted; they were deleted. What they listed is on these
    // live tabs, each by name.
    test('the live sheets list the weapons, armour and vehicle upgrades the deleted panels did', async ({ page }) => {
        await joinOrSkip(page);
        const character = await createActor(page, {
            data: { name: 'e2e-662 Acolyte', type: 'dh2-character', system: { gameSystem: 'dh2' } },
            items: [
                { name: 'M36 Kantrael Lasgun', type: 'weapon', system: { class: 'basic', type: 'las' } },
                { name: 'Flak Vest', type: 'armour', system: { type: 'flak' } },
            ],
        });
        const vehicle = await createActor(page, {
            data: { name: 'e2e-662 Chimera', type: 'dh2-vehicle', system: { gameSystem: 'dh2' } },
            items: [
                { name: 'Hull Heavy Bolter', type: 'weapon', system: { class: 'heavy', type: 'bolt' } },
                { name: 'Reinforced Plating', type: 'vehicleUpgrade' },
            ],
        });
        try {
            await expectListed(page, { actorId: character.id, tab: 'combat', name: 'M36 Kantrael Lasgun', shot: 'live-character-combat-weapons' });
            await expectListed(page, { actorId: character.id, tab: 'equipment', name: 'Flak Vest', shot: 'live-character-equipment-armour' });
            await expectListed(page, { actorId: vehicle.id, tab: 'combat', name: 'Hull Heavy Bolter', shot: 'live-vehicle-combat-weapons' });
            await expectListed(page, { actorId: vehicle.id, tab: 'components', name: 'Reinforced Plating', shot: 'live-vehicle-components-upgrades' });
        } finally {
            await deleteDocuments(page, { actors: [character.id, vehicle.id] });
        }
    });
});
