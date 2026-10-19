/**
 * Stories for the canonical `item-table.hbs` + `item-table-row.hbs` partials
 * and their consumers, the voidcraft sheet's weapon, component, upgrade and crew
 * panels. Renders in isolation as well as composed with the surrounding panel
 * chrome, exercised across the game lines via the `data-wh40k-system` ancestor
 * variant recipe.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import shipComponentsPanelSrc from '../src/templates/actor/panel/ship-components-panel.hbs?raw';
import shipCrewPanelSrc from '../src/templates/actor/panel/ship-crew-panel.hbs?raw';
import shipUpgradesPanelSrc from '../src/templates/actor/panel/ship-upgrades-panel.hbs?raw';
import shipWeaponsPanelSrc from '../src/templates/actor/panel/ship-weapons-panel.hbs?raw';
import itemTableRowSrc from '../src/templates/actor/partial/item-table-row.hbs?raw';
import itemTableSrc from '../src/templates/actor/partial/item-table.hbs?raw';
import { renderSheet, renderSheetParts } from './test-helpers';

const meta: Meta = {
    title: 'Inventory/Item Table',
};
export default meta;

type Story = StoryObj;

/** Every game line; the item table is shared by all six. */
const GAME_LINES = ['dh1', 'dh2', 'rt', 'bc', 'dw', 'ow'] as const;

/** The header row of one item table. */
function headerCells(table: Element): HTMLElement[] {
    return Array.from(table.querySelector('[data-table-header]')?.children ?? []).filter((el): el is HTMLElement => el instanceof HTMLElement);
}

/** The cells of one row, without the full-width expandable description. */
function rowCells(row: Element): HTMLElement[] {
    return Array.from(row.children).filter((el): el is HTMLElement => el instanceof HTMLElement && !el.hasAttribute('data-description-id'));
}

/**
 * #662: each item table is laid out as a grid. Its header cells sit side by side on
 * one line, and every row has one cell under each header, starting at the same x.
 * The legacy CSS was deleted, so they used to stack into one column.
 */
async function expectTablesOnGrid(canvasElement: HTMLElement): Promise<void> {
    const left = (cell: Element): number => Math.round(cell.getBoundingClientRect().left);
    const tables = Array.from(canvasElement.querySelectorAll('[data-table]'));
    const problems = tables.flatMap((table, index): string[] => {
        const headers = headerCells(table);
        const headerLefts = headers.map(left);
        // Cells are vertically centred, so their tops differ with their height; on one line
        // they still overlap (the lowest top is above the highest bottom).
        const onOneLine =
            Math.max(...headers.map((cell) => cell.getBoundingClientRect().top)) < Math.min(...headers.map((cell) => cell.getBoundingClientRect().bottom));
        const rows = Array.from(table.querySelectorAll(':scope > [data-item-id]'));
        const found: string[] = [];
        if (headers.length < 2) found.push(`table ${index}: ${headers.length} header cells`);
        if (!onOneLine) found.push(`table ${index}: header cells stack onto more than one line`);
        if (new Set(headerLefts).size !== headers.length) found.push(`table ${index}: header cells share a column`);
        if (rows.length === 0) found.push(`table ${index}: no rows`);
        rows.forEach((row, rowIndex) => {
            const lefts = rowCells(row).map(left);
            if (lefts.join() !== headerLefts.join())
                found.push(`table ${index} row ${rowIndex}: cells at [${lefts.join()}], headers at [${headerLefts.join()}]`);
        });
        return found;
    });
    await expect(tables.length).toBeGreaterThan(0);
    await expect(problems).toEqual([]);
}

/** Direct partial — table chrome only (header + add cell, no rows). */
export const TableChromeOnly: Story = {
    name: 'Table / Chrome only',
    render: () =>
        renderSheet(itemTableSrc, {
            headers: [{ weight: 2, label: 'Name' }, { label: 'Class' }, { label: 'Type' }, { label: 'Equipped' }],
            addAction: 'itemCreate',
            addType: 'weapon',
            addTitleKey: 'WH40K.Combat.AddWeapon',
        }),
};

/** Direct partial — single row, no expand. */
export const RowSimple: Story = {
    name: 'Row / Simple',
    render: () =>
        renderSheet(itemTableRowSrc, {
            item: { id: 'r-1', name: 'Sample Item' },
            cells: [{ value: 'Foo' }, { value: 'Bar' }],
            actions: [
                { action: 'itemRoll', iconKey: 'fa:dice-d20', title: 'Roll' },
                { action: 'itemDelete', iconKey: 'fa:trash', title: 'Delete' },
            ],
        }),
};

/** Direct partial — row with expandable description. */
export const RowExpanded: Story = {
    name: 'Row / With description toggle',
    render: () => {
        const wrapper = document.createElement('div');
        wrapper.classList.add('wh40k-rpg', 'sheet');
        wrapper.dataset.wh40kSystem = 'dh2';
        const ctx = {
            item: { id: 'r-2', name: 'Bolt Pistol' },
            dragType: 'weapon',
            nameToggleId: 'description_r-2',
            cells: [{ value: 'Pistol' }, { value: 'Bolt' }, { value: 'Stowed' }],
            actions: [
                { action: 'itemRoll', iconKey: 'fa:dice-d20', title: 'Roll' },
                { action: 'itemDelete', iconKey: 'fa:trash', title: 'Delete' },
            ],
        };
        // The row is a block partial; renderSheet invokes it as one so its description slot resolves.
        wrapper.appendChild(renderSheet(itemTableRowSrc, ctx));
        return wrapper;
    },
    play: async ({ canvasElement }) => {
        const description = canvasElement.querySelector('[data-description-id="description_r-2"]');
        await expect(description?.classList.contains('tw-col-span-full')).toBe(true);
    },
};

/* ----------------------------------------------------------------------- */
/*  The voidcraft sheet's panels through item-table                        */
/* ----------------------------------------------------------------------- */

interface MockShipItem {
    id: string;
    name: string;
    img: string;
    isShipWeapon?: boolean;
    isShipComponent?: boolean;
    isShipUpgrade?: boolean;
    system: object;
}

function makeShipWeapons(): MockShipItem[] {
    return [
        {
            id: 'sw-1',
            name: 'Mars-Pattern Macrocannon',
            img: 'icons/svg/cannon.svg',
            isShipWeapon: true,
            system: { locationLabel: 'Port', strength: 4, damage: '1d10+2', crit: 4, range: 9 },
        },
        {
            id: 'sw-2',
            name: 'Lance Battery',
            img: 'icons/svg/lance.svg',
            isShipWeapon: true,
            system: { locationLabel: 'Prow', strength: 1, damage: '1d10+4', crit: 3, range: 6 },
        },
    ];
}

function makeShipComponents(): MockShipItem[] {
    return [
        {
            id: 'sc-1',
            name: 'Plasma Drive',
            img: 'icons/svg/engine.svg',
            isShipComponent: true,
            system: {
                componentTypeLabel: 'Essential',
                power: { generated: 60, used: 0 },
                powerDisplay: '+60',
                space: 12,
                shipPoints: 2,
            },
        },
        {
            id: 'sc-2',
            name: 'Bridge',
            img: 'icons/svg/bridge.svg',
            isShipComponent: true,
            system: {
                componentTypeLabel: 'Essential',
                power: { generated: 0, used: 1 },
                powerDisplay: '-1',
                space: 1,
                shipPoints: 1,
            },
        },
    ];
}

function makeShipUpgrades(): MockShipItem[] {
    return [
        {
            id: 'su-1',
            name: 'Sanctified Hull',
            img: 'icons/svg/hull.svg',
            isShipUpgrade: true,
            system: { power: 0, space: 1, effect: '<em>+1 Armour</em>' },
        },
    ];
}

function shipContext(systemId: string): {
    actor: { items: MockShipItem[] };
    source: { crew: { population: number; crewRating: number; morale: { value: number; max: number } } };
    shipRoles: Array<{ id: string; name: string; img: string; system: { officer: string; effect: string } }>;
    gameSystem: string;
} {
    return {
        actor: { items: [...makeShipWeapons(), ...makeShipComponents(), ...makeShipUpgrades()] },
        source: {
            crew: { population: 30000, crewRating: 30, morale: { value: 80, max: 100 } },
        },
        shipRoles: [
            {
                id: 'role-1',
                name: 'Captain',
                img: 'icons/svg/role.svg',
                system: { officer: 'Lyra Sade', effect: '+5 Command' },
            },
        ],
        gameSystem: systemId,
    };
}

export const ShipWeaponsPanelDH2: Story = {
    name: 'Composed / Ship weapons (DH2e)',
    render: () => {
        const wrapper = renderSheetParts([{ template: shipWeaponsPanelSrc, context: shipContext('dh2') }], {});
        wrapper.dataset.wh40kSystem = 'dh2';
        return wrapper;
    },
    play: async ({ canvasElement }) => {
        // Material Icons must NOT survive the migration.
        await expect(canvasElement.querySelector('.material-icons')).toBeNull();
        // Each ship-weapon row carries the fire + delete actions.
        await expect(canvasElement.querySelectorAll('[data-action="fireShipWeapon"]').length).toBe(2);
        await expect(canvasElement.querySelectorAll('[data-action="itemDelete"]').length).toBe(2);
        await expectTablesOnGrid(canvasElement);
    },
};

/** The ship weapons table under each of the six lines' themes: the grid holds in every one (#662). */
export const ShipWeaponsPanelAllLines: Story = {
    name: 'Composed / Ship weapons (all six lines)',
    render: () => {
        const host = document.createElement('div');
        host.className = 'tw-flex tw-flex-col tw-gap-3';
        for (const line of GAME_LINES) {
            const wrapper = renderSheetParts([{ template: shipWeaponsPanelSrc, context: shipContext(line) }], {});
            wrapper.dataset.wh40kSystem = line;
            host.appendChild(wrapper);
        }
        return host;
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelectorAll('[data-table]').length).toBe(GAME_LINES.length);
        await expectTablesOnGrid(canvasElement);
    },
};

export const ShipWeaponsPanelRT: Story = {
    name: 'Composed / Ship weapons (RT)',
    render: () => {
        const wrapper = renderSheetParts([{ template: shipWeaponsPanelSrc, context: shipContext('rt') }], {});
        wrapper.dataset.wh40kSystem = 'rt';
        return wrapper;
    },
    play: async ({ canvasElement }) => expectTablesOnGrid(canvasElement),
};

export const ShipComponentsPanelDH2: Story = {
    name: 'Composed / Ship components (DH2e)',
    render: () => {
        const wrapper = renderSheetParts([{ template: shipComponentsPanelSrc, context: shipContext('dh2') }], {});
        wrapper.dataset.wh40kSystem = 'dh2';
        return wrapper;
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.material-icons')).toBeNull();
        // Each row exposes both itemEdit (cog) and itemDelete actions in the toolbar.
        await expect(canvasElement.querySelectorAll('[data-action="itemEdit"]').length).toBeGreaterThanOrEqual(2);
        await expectTablesOnGrid(canvasElement);
    },
};

export const ShipUpgradesPanelDH2: Story = {
    name: 'Composed / Ship upgrades (DH2e)',
    render: () => {
        const wrapper = renderSheetParts([{ template: shipUpgradesPanelSrc, context: shipContext('dh2') }], {});
        wrapper.dataset.wh40kSystem = 'dh2';
        return wrapper;
    },
    play: async ({ canvasElement }) => expectTablesOnGrid(canvasElement),
};

export const ShipCrewPanelDH2: Story = {
    name: 'Composed / Ship crew (DH2e)',
    render: () => {
        const wrapper = renderSheetParts([{ template: shipCrewPanelSrc, context: shipContext('dh2') }], {});
        wrapper.dataset.wh40kSystem = 'dh2';
        return wrapper;
    },
    play: async ({ canvasElement }) => expectTablesOnGrid(canvasElement),
};
