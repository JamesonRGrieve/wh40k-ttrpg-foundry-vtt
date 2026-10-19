/**
 * Stories for the canonical `item-table.hbs` + `item-table-row.hbs` partials
 * and their two pilot consumers (weapon-panel, armour-panel). Renders in
 * isolation as well as composed with the surrounding panel chrome, exercised
 * across multiple game systems via the `data-wh40k-system` ancestor variant
 * recipe.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import armourPanelSrc from '../src/templates/actor/panel/armour-panel.hbs?raw';
import shipComponentsPanelSrc from '../src/templates/actor/panel/ship-components-panel.hbs?raw';
import shipCrewPanelSrc from '../src/templates/actor/panel/ship-crew-panel.hbs?raw';
import shipUpgradesPanelSrc from '../src/templates/actor/panel/ship-upgrades-panel.hbs?raw';
import shipWeaponsPanelSrc from '../src/templates/actor/panel/ship-weapons-panel.hbs?raw';
import vehicleUpgradesPanelSrc from '../src/templates/actor/panel/vehicle-upgrades-panel.hbs?raw';
import vehicleWeaponsPanelSrc from '../src/templates/actor/panel/vehicle-weapons-panel.hbs?raw';
import weaponPanelSrc from '../src/templates/actor/panel/weapon-panel.hbs?raw';
import itemTableRowSrc from '../src/templates/actor/partial/item-table-row.hbs?raw';
import itemTableSrc from '../src/templates/actor/partial/item-table.hbs?raw';
import { mockItem } from './mocks';
import { renderSheet, renderSheetParts } from './test-helpers';

const meta: Meta = {
    title: 'Inventory/Item Table',
};
export default meta;

type Story = StoryObj;

interface MockWeapon {
    id: string;
    name: string;
    img: string;
    isWeapon: boolean;
    system: {
        class: string;
        type: string;
        equipped: string;
        damageLabel: string;
        damage: { penetration: number };
        rangeLabel: string;
        rateOfFireLabel: string;
        clip: { value: number };
        effectiveClipMax: number;
        reload: string;
        special: string[];
    };
}

interface MockArmour {
    id: string;
    name: string;
    img: string;
    isArmour: boolean;
    system: {
        type: string;
        equipped: string;
        head: number;
        leftArm: number;
        rightArm: number;
        body: number;
        leftLeg: number;
        rightLeg: number;
    };
}

function makeWeapons(): MockWeapon[] {
    return [
        {
            id: 'w-1',
            name: 'M36 Kantrael Lasgun',
            img: 'icons/svg/d20-black.svg',
            isWeapon: true,
            system: {
                class: 'Basic',
                type: 'Energy',
                equipped: 'Equipped',
                damageLabel: '1d10+3 E',
                damage: { penetration: 0 },
                rangeLabel: '100m',
                rateOfFireLabel: 'S/3/-',
                clip: { value: 24 },
                effectiveClipMax: 24,
                reload: 'Full',
                special: ['Reliable'],
            },
        },
        {
            id: 'w-2',
            name: 'Bolt Pistol',
            img: 'icons/svg/d20-black.svg',
            isWeapon: true,
            system: {
                class: 'Pistol',
                type: 'Bolt',
                equipped: 'Stowed',
                damageLabel: '1d10+5 X',
                damage: { penetration: 4 },
                rangeLabel: '30m',
                rateOfFireLabel: 'S/2/-',
                clip: { value: 8 },
                effectiveClipMax: 8,
                reload: 'Full',
                special: ['Tearing'],
            },
        },
    ];
}

function makeArmour(): MockArmour[] {
    return [
        {
            id: 'a-1',
            name: 'Carapace Chest',
            img: 'icons/svg/shield.svg',
            isArmour: true,
            system: {
                type: 'Carapace',
                equipped: 'Worn',
                head: 0,
                leftArm: 0,
                rightArm: 0,
                body: 5,
                leftLeg: 0,
                rightLeg: 0,
            },
        },
    ];
}

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

/** Composed: full weapon-panel using the new partials. */
function makeWeaponContext(systemId: string): { actor: { items: MockWeapon[] }; gameSystem: string } {
    return {
        actor: { items: makeWeapons() },
        gameSystem: systemId,
    };
}

export const WeaponPanelDH2: Story = {
    name: 'Composed / Weapon panel (DH2e)',
    render: () => {
        const wrapper = renderSheetParts([{ template: weaponPanelSrc, context: makeWeaponContext('dh2') }], {});
        wrapper.dataset.wh40kSystem = 'dh2';
        return wrapper;
    },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        const addBtn = view.getAllByText(/Lasgun/)[0];
        await expect(addBtn).toBeTruthy();
        // The toolbar dispatch action ids are intact.
        const rollBtns = canvasElement.querySelectorAll('[data-action="itemRoll"]');
        await expect(rollBtns.length).toBe(2);
        await expectTablesOnGrid(canvasElement);
    },
};

export const WeaponPanelIM: Story = {
    name: 'Composed / Weapon panel (IM)',
    render: () => {
        const wrapper = renderSheetParts([{ template: weaponPanelSrc, context: makeWeaponContext('im') }], {});
        wrapper.dataset.wh40kSystem = 'im';
        return wrapper;
    },
    play: async ({ canvasElement }) => expectTablesOnGrid(canvasElement),
};

/** The weapon table under each of the six lines' themes: the grid holds in every one (#662). */
export const WeaponPanelAllLines: Story = {
    name: 'Composed / Weapon panel (all six lines)',
    render: () => {
        const host = document.createElement('div');
        host.className = 'tw-flex tw-flex-col tw-gap-3';
        for (const line of GAME_LINES) {
            const wrapper = renderSheetParts([{ template: weaponPanelSrc, context: makeWeaponContext(line) }], {});
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

export const WeaponPanelRT: Story = {
    name: 'Composed / Weapon panel (RT)',
    render: () => {
        const wrapper = renderSheetParts([{ template: weaponPanelSrc, context: makeWeaponContext('rt') }], {});
        wrapper.dataset.wh40kSystem = 'rt';
        return wrapper;
    },
    play: async ({ canvasElement }) => expectTablesOnGrid(canvasElement),
};

/** DH2 and RT side by side: DH2 frames in old gold, RT in void blue with gold lettering. */
export const ArmourPanelDH2VersusRT: Story = {
    name: 'Composed / Armour panel (DH2e vs RT palette)',
    render: () => {
        const host = document.createElement('div');
        host.className = 'tw-flex tw-flex-col tw-gap-3';
        for (const line of ['dh2', 'rt']) {
            const wrapper = renderSheetParts([{ template: armourPanelSrc, context: { actor: { items: makeArmour() } } }], {});
            wrapper.dataset.wh40kSystem = line;
            host.appendChild(wrapper);
        }
        return host;
    },
    play: async ({ canvasElement }) => {
        const roots = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-wh40k-system]'));
        await expect(roots.map((root) => root.dataset['wh40kSystem'])).toEqual(['dh2', 'rt']);
        // The panel header carries both lines' frame variants; each line's own resolves on its root.
        const header = canvasElement.querySelector('[data-wh40k-system="rt"] [class*="rt:tw-border-b-"]');
        await expect(header?.className).toContain('rt:tw-border-b-void-l20');
        await expect(header?.className).toContain('dh2:tw-border-b-gold-raw');
    },
};

export const ArmourPanelDH2: Story = {
    name: 'Composed / Armour panel (DH2e)',
    render: () => {
        const wrapper = renderSheetParts([{ template: armourPanelSrc, context: { actor: { items: makeArmour() } } }], {});
        wrapper.dataset.wh40kSystem = 'dh2';
        return wrapper;
    },
    play: async ({ canvasElement }) => expectTablesOnGrid(canvasElement),
};

export const ArmourPanelIM: Story = {
    name: 'Composed / Armour panel (IM)',
    render: () => {
        const wrapper = renderSheetParts([{ template: armourPanelSrc, context: { actor: { items: makeArmour() } } }], {});
        wrapper.dataset.wh40kSystem = 'im';
        return wrapper;
    },
    play: async ({ canvasElement }) => expectTablesOnGrid(canvasElement),
};

/** Verify that mockItem-based weapon/armour also flow through the panel correctly. */
export const ComposedWithMockItem: Story = {
    name: 'Composed / Mock-driven weapon panel',
    render: () => {
        const items = [mockItem({ name: 'Mock Weapon' })];
        const wrapper = renderSheetParts([{ template: weaponPanelSrc, context: { actor: { items } } }], {});
        wrapper.dataset.wh40kSystem = 'dh2';
        return wrapper;
    },
};

/* ----------------------------------------------------------------------- */
/*  Chunk D2: Ship + Vehicle panels through item-table                     */
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

interface MockVehicleWeapon {
    id: string;
    name: string;
    img: string;
    system: { class: string; range: string; damageLabel: string; damage: { formula: string; bonus: number } };
}

interface MockVehicleUpgrade {
    id: string;
    name: string;
    img: string;
    system: {
        upgradeTypeLabel: string;
        difficultyFormatted: string;
        modifiersHtml: string;
    };
}

function vehicleContext(systemId: string): {
    weapons: MockVehicleWeapon[];
    upgrades: MockVehicleUpgrade[];
    editable: boolean;
    system: { weapons: string };
    gameSystem: string;
} {
    const weapons: MockVehicleWeapon[] = [
        {
            id: 'vw-1',
            name: 'Hull Heavy Bolter',
            img: 'icons/svg/weapon.svg',
            system: { class: 'Heavy', range: '150m', damageLabel: '1d10+5 X', damage: { formula: '1d10', bonus: 5 } },
        },
    ];
    const upgrades: MockVehicleUpgrade[] = [
        {
            id: 'vu-1',
            name: 'Reinforced Plating',
            img: 'icons/svg/plating.svg',
            system: {
                upgradeTypeLabel: 'Defense',
                difficultyFormatted: 'Hard (-20)',
                modifiersHtml: '<span class="tw-text-success tw-text-xs">Armour: +2</span><span class="tw-text-crimson tw-text-xs">Speed: -1</span>',
            },
        },
    ];
    return {
        weapons,
        upgrades,
        editable: false,
        system: { weapons: '<p>Crew-served bolter.</p>' },
        gameSystem: systemId,
    };
}

export const VehicleWeaponsPanelDH2: Story = {
    name: 'Composed / Vehicle weapons (DH2e)',
    render: () => {
        const wrapper = renderSheetParts([{ template: vehicleWeaponsPanelSrc, context: vehicleContext('dh2') }], {});
        wrapper.dataset.wh40kSystem = 'dh2';
        return wrapper;
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('i.fa-trash')).toBeNull();
        // The editor + add button live OUTSIDE the migrated table — they must remain.
        const addBtn = canvasElement.querySelector('[data-action="itemCreate"][data-type="weapon"]');
        await expect(addBtn).toBeTruthy();
        await expectTablesOnGrid(canvasElement);
    },
};

export const VehicleUpgradesPanelDH2: Story = {
    name: 'Composed / Vehicle upgrades (DH2e)',
    render: () => {
        const wrapper = renderSheetParts([{ template: vehicleUpgradesPanelSrc, context: vehicleContext('dh2') }], {});
        wrapper.dataset.wh40kSystem = 'dh2';
        return wrapper;
    },
    play: async ({ canvasElement }) => expectTablesOnGrid(canvasElement),
};
