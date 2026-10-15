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
 * The four voidcraft tables are checked on the live voidcraft sheet. The other
 * four callers (weapon, armour, vehicle weapons, vehicle upgrades) are
 * preloaded partials that no live sheet mounts today, so they are rendered
 * through Foundry's own `renderTemplate` with real owned items and the
 * system's built stylesheet. For each table the spec asserts that the header
 * cells sit on one line in distinct columns, and that every row has one cell
 * per header starting at that header's x. It then snaps the table.
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

/**
 * Render a panel partial through Foundry's `renderTemplate` into a sheet-like
 * host (the `.wh40k-rpg` ancestor scopes the Tailwind utilities). The context
 * is built in-page from the actor's real owned items.
 */
async function renderPanel(
    page: Page,
    args: { actorId: string; template: string; kind: 'character' | 'vehicle-weapons' | 'vehicle-upgrades'; hostId: string },
): Promise<void> {
    await page.evaluate(async ({ actorId, template, kind, hostId }) => {
        interface OwnedItem {
            type: string;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (game, foundry.applications.handlebars) have no browser-side types
        const g = globalThis as unknown as {
            game: { actors: { get: (id: string) => { items: { contents: OwnedItem[] } } | undefined } };
            foundry: { applications: { handlebars: { renderTemplate: (path: string, data: object) => Promise<string> } } };
        };
        const actor = g.game.actors.get(actorId);
        if (actor === undefined) throw new Error('actor not found');
        const items = actor.items.contents;
        const context =
            kind === 'character'
                ? { actor: { items }, gameSystem: 'dh2', isGM: true }
                : kind === 'vehicle-weapons'
                ? { weapons: items.filter((item) => item.type === 'weapon'), system: { weapons: '' }, editable: false, gameSystem: 'dh2' }
                : { upgrades: items.filter((item) => item.type === 'vehicleUpgrade'), gameSystem: 'dh2' };
        const html = await g.foundry.applications.handlebars.renderTemplate(template, context);
        document.getElementById(hostId)?.remove();
        const host = document.createElement('div');
        host.id = hostId;
        host.className = 'wh40k-rpg sheet';
        host.dataset['wh40kSystem'] = 'dh2';
        host.dataset['e2eCapture'] = '';
        Object.assign(host.style, {
            position: 'fixed',
            top: '80px',
            left: '120px',
            width: '560px',
            zIndex: '100',
            // An opaque backdrop: the panel's own background is translucent over the sheet window.
            background: '#1b1a17',
        });
        host.innerHTML = html;
        document.body.appendChild(host);
        await globalThis.wh40kE2E.settle(100);
    }, args);
}

async function removeHost(page: Page, hostId: string): Promise<void> {
    await page.evaluate((id) => document.getElementById(id)?.remove(), hostId);
}

const PANELS = 'systems/wh40k-rpg/templates/actor/panel';

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

    test('the weapon, armour, vehicle weapon and vehicle upgrade tables line up as grids', async ({ page }) => {
        await joinOrSkip(page);
        const character = await createActor(page, {
            data: { name: 'e2e-662 Acolyte', type: 'dh2-character', system: { gameSystem: 'dh2' } },
            items: [
                { name: 'M36 Kantrael Lasgun', type: 'weapon', system: { class: 'basic', type: 'las' } },
                { name: 'Stub Automatic', type: 'weapon', system: { class: 'pistol', type: 'solid-projectile' } },
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
        const host = 'e2e-662-host';
        try {
            await renderPanel(page, { actorId: character.id, template: `${PANELS}/weapon-panel.hbs`, kind: 'character', hostId: host });
            // Two weapons plus the Unarmed attack every new character is given.
            await checkTable(page, `#${host} [data-table]`, 'weapon', { headers: 5, rows: 3 });

            await renderPanel(page, { actorId: character.id, template: `${PANELS}/armour-panel.hbs`, kind: 'character', hostId: host });
            await checkTable(page, `#${host} [data-table]`, 'armour', { headers: 5, rows: 1 });

            await renderPanel(page, { actorId: vehicle.id, template: `${PANELS}/vehicle-weapons-panel.hbs`, kind: 'vehicle-weapons', hostId: host });
            await checkTable(page, `#${host} [data-table]`, 'vehicle-weapons', { headers: 5, rows: 1 });

            await renderPanel(page, { actorId: vehicle.id, template: `${PANELS}/vehicle-upgrades-panel.hbs`, kind: 'vehicle-upgrades', hostId: host });
            await checkTable(page, `#${host} [data-table]`, 'vehicle-upgrades', { headers: 5, rows: 1 });
        } finally {
            await removeHost(page, host);
            await deleteDocuments(page, { actors: [character.id, vehicle.id] });
        }
    });
});
