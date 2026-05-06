/**
 * Stories for the canonical `item-table.hbs` + `item-table-row.hbs` partials
 * and their two pilot consumers (weapon-panel, armour-panel). Renders in
 * isolation as well as composed with the surrounding panel chrome, exercised
 * across multiple game systems via the `data-wh40k-system` ancestor variant
 * recipe.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import Handlebars from 'handlebars';

import itemTableSrc from '../src/templates/actor/partial/item-table.hbs?raw';
import itemTableRowSrc from '../src/templates/actor/partial/item-table-row.hbs?raw';
import weaponPanelSrc from '../src/templates/actor/panel/weapon-panel.hbs?raw';
import armourPanelSrc from '../src/templates/actor/panel/armour-panel.hbs?raw';
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

/** Direct partial — table chrome only (header + add cell, no rows). */
export const TableChromeOnly: Story = {
    name: 'Table / Chrome only',
    render: () =>
        renderSheet(itemTableSrc, {
            headers: [{ cellClass: 'table-cell--span2', label: 'Name' }, { label: 'Class' }, { label: 'Type' }, { label: 'Equipped' }],
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
        const tpl = Handlebars.compile(itemTableRowSrc, { partials: true });
        // Compose by hand to slot block content into the description.
        const wrapper = document.createElement('div');
        wrapper.classList.add('wh40k-rpg', 'sheet');
        wrapper.dataset.wh40kSystem = 'dh2e';
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
        wrapper.innerHTML = tpl(ctx);
        return wrapper;
    },
};

/** Composed: full weapon-panel using the new partials. */
function makeWeaponContext(systemId: string) {
    return {
        actor: { items: makeWeapons() },
        gameSystem: systemId,
    };
}

export const WeaponPanelDH2: Story = {
    name: 'Composed / Weapon panel (DH2e)',
    render: () => {
        const wrapper = renderSheetParts([{ template: weaponPanelSrc, context: makeWeaponContext('dh2e') }], {});
        wrapper.dataset.wh40kSystem = 'dh2e';
        return wrapper;
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const addBtn = canvas.getAllByText(/Lasgun/)[0];
        expect(addBtn).toBeTruthy();
        // The toolbar dispatch action ids are intact.
        const rollBtns = canvasElement.querySelectorAll('[data-action="itemRoll"]');
        expect(rollBtns.length).toBe(2);
    },
};

export const WeaponPanelIM: Story = {
    name: 'Composed / Weapon panel (IM)',
    render: () => {
        const wrapper = renderSheetParts([{ template: weaponPanelSrc, context: makeWeaponContext('im') }], {});
        wrapper.dataset.wh40kSystem = 'im';
        return wrapper;
    },
};

export const WeaponPanelRT: Story = {
    name: 'Composed / Weapon panel (RT)',
    render: () => {
        const wrapper = renderSheetParts([{ template: weaponPanelSrc, context: makeWeaponContext('rt') }], {});
        wrapper.dataset.wh40kSystem = 'rt';
        return wrapper;
    },
};

export const ArmourPanelDH2: Story = {
    name: 'Composed / Armour panel (DH2e)',
    render: () => {
        const wrapper = renderSheetParts([{ template: armourPanelSrc, context: { actor: { items: makeArmour() } } }], {});
        wrapper.dataset.wh40kSystem = 'dh2e';
        return wrapper;
    },
};

export const ArmourPanelIM: Story = {
    name: 'Composed / Armour panel (IM)',
    render: () => {
        const wrapper = renderSheetParts([{ template: armourPanelSrc, context: { actor: { items: makeArmour() } } }], {});
        wrapper.dataset.wh40kSystem = 'im';
        return wrapper;
    },
};

/** Verify that mockItem-based weapon/armour also flow through the panel correctly. */
export const ComposedWithMockItem: Story = {
    name: 'Composed / Mock-driven weapon panel',
    render: () => {
        const items = [mockItem({ name: 'Mock Weapon' })];
        const wrapper = renderSheetParts([{ template: weaponPanelSrc, context: { actor: { items } } }], {});
        wrapper.dataset.wh40kSystem = 'dh2e';
        return wrapper;
    },
};
