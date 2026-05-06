/**
 * Vitest specs for the item-table.hbs + item-table-row.hbs partials. Both are
 * block partials, so each spec wraps them in a tiny outer template that
 * supplies block content. Helpers from `stories/template-support.ts` register
 * the project-wide Handlebars helpers (localize, eq, defaultVal, iconSvg, …).
 */
import Handlebars from 'handlebars';
import { describe, expect, it } from 'vitest';
import { initializeStoryHandlebars } from '../stories/template-support';

import itemTableSrc from '../src/templates/actor/partial/item-table.hbs?raw';
import itemTableRowSrc from '../src/templates/actor/partial/item-table-row.hbs?raw';

initializeStoryHandlebars();

Handlebars.registerPartial('item-table-test', itemTableSrc);
Handlebars.registerPartial('item-table-row-test', itemTableRowSrc);

function dom(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
}

function renderTable(hashLiteral: string, body = ''): HTMLElement {
    const tpl = Handlebars.compile(`{{#> item-table-test ${hashLiteral}}}${body}{{/item-table-test}}`);
    return dom(tpl({}));
}

function renderRow(hashLiteral: string, body = '', context: Record<string, unknown> = {}): HTMLElement {
    const tpl = Handlebars.compile(`{{#> item-table-row-test ${hashLiteral}}}${body}{{/item-table-row-test}}`);
    return dom(tpl(context));
}

describe('item-table.hbs', () => {
    it('renders one header cell per entry plus the trailing add cell', () => {
        const root = renderTable(
            'addAction="itemCreate" addType="weapon" headers=(array (object cellClass="table-cell--span2" label="Name") (object label="Class") (object label="Type"))',
        );
        const headRow = root.querySelector('.table-row--head');
        expect(headRow).not.toBeNull();
        // 3 header cells + 1 trailing add cell
        expect(headRow!.children.length).toBe(4);
        expect(headRow!.textContent).toMatch(/Name/);
        expect(headRow!.textContent).toMatch(/Class/);
        expect(headRow!.textContent).toMatch(/Type/);
    });

    it('omits the add cell when addAction is absent', () => {
        const root = renderTable('headers=(array (object label="A"))');
        expect(root.querySelector('.table-cell--last')).toBeNull();
    });

    it('emits the addType on the add control button', () => {
        const root = renderTable('addAction="itemCreate" addType="shipComponent" headers=(array (object label="X"))');
        const addBtn = root.querySelector('[data-action="itemCreate"]');
        expect(addBtn).not.toBeNull();
        expect(addBtn!.getAttribute('data-type')).toBe('shipComponent');
    });

    it('applies per-system theme variants on the table border', () => {
        const root = renderTable('headers=(array)');
        const tbl = root.querySelector('.wh40k-table--border');
        expect(tbl).not.toBeNull();
        // The literal class names must be present in the rendered DOM so
        // Tailwind's template scan picks them up at build time.
        const cls = tbl!.className;
        expect(cls).toMatch(/dh2e:tw-border-bronze/);
        expect(cls).toMatch(/rt:tw-border-amber-700/);
        expect(cls).toMatch(/im:tw-border-crimson/);
    });

    it('renders block-content rows below the head row', () => {
        const root = renderTable('headers=(array (object label="X"))', '<div class="custom-row">child</div>');
        expect(root.querySelector('.custom-row')?.textContent).toBe('child');
    });
});

describe('item-table-row.hbs', () => {
    const ctx = { item: { id: 'itm-1', name: 'Bolt Pistol', img: 'icons/bolt.png' } };

    it('renders an edit-toggle cell pointing at editAction by default', () => {
        const root = renderRow('item=item', '', ctx);
        const editBtn = root.querySelector('.item-edit');
        expect(editBtn).not.toBeNull();
        expect(editBtn!.getAttribute('data-action')).toBe('itemEdit');
        expect(editBtn!.getAttribute('data-item-id')).toBe('itm-1');
    });

    it('honors a custom editAction override', () => {
        const root = renderRow('item=item editAction="customEdit"', '', ctx);
        const editBtn = root.querySelector('.item-edit');
        expect(editBtn!.getAttribute('data-action')).toBe('customEdit');
    });

    it('suppresses the leading edit cell when editAction is false', () => {
        const root = renderRow('item=item editAction=false', '', ctx);
        expect(root.querySelector('.table-cell--settingstoggle')).toBeNull();
    });

    it('renders one cell per entry in `cells`', () => {
        const root = renderRow('item=item cells=(array (object value="A") (object value="B") (object value="C"))', '', ctx);
        const valueCells = root.querySelectorAll('.table-cell .display');
        expect(valueCells.length).toBe(3);
        expect(valueCells[0].textContent).toBe('A');
        expect(valueCells[2].textContent).toBe('C');
    });

    it('renders one toolbar button per `actions` entry', () => {
        const root = renderRow(
            'item=item actions=(array (object action="itemRoll" iconKey="fa:dice-d20" title="Roll") (object action="itemDelete" iconKey="fa:trash" title="Delete"))',
            '',
            ctx,
        );
        const toolbar = root.querySelector('.table-cell--last');
        expect(toolbar).not.toBeNull();
        const buttons = toolbar!.querySelectorAll('[data-action]');
        expect(buttons.length).toBe(2);
        expect(buttons[0].getAttribute('data-action')).toBe('itemRoll');
        expect(buttons[1].getAttribute('data-action')).toBe('itemDelete');
        for (const btn of Array.from(buttons)) {
            expect(btn.getAttribute('data-item-id')).toBe('itm-1');
        }
    });

    it('renders an SVG via the iconSvg helper for each action', () => {
        const root = renderRow('item=item actions=(array (object action="itemDelete" iconKey="fa:trash" title="Delete"))', '', ctx);
        const svg = root.querySelector('[data-action="itemDelete"] svg');
        expect(svg).not.toBeNull();
        // Helper-emitted classes are namespaced with `wh40k-icon--<family>-<name>`.
        expect(svg!.getAttribute('class')).toMatch(/wh40k-icon--fa-trash/);
    });

    it('emits the row-level data-item-id attr for drop-zone wiring', () => {
        const root = renderRow('item=item dragType="weapon"', '', ctx);
        const row = root.querySelector('.table-row');
        expect(row).not.toBeNull();
        expect(row!.getAttribute('data-item-id')).toBe('itm-1');
        expect(row!.getAttribute('data-item-type')).toBe('weapon');
        expect(row!.classList.contains('item-drag')).toBe(true);
    });

    it('renders a description toggle cell when nameToggleId is provided', () => {
        const root = renderRow('item=item nameToggleId="description_itm-1"', '<span class="custom-desc">desc body</span>', ctx);
        const descCell = root.querySelector('.table-cell--description');
        expect(descCell).not.toBeNull();
        expect(descCell!.classList.contains('description_itm-1')).toBe(true);
        expect(descCell!.querySelector('.custom-desc')?.textContent).toBe('desc body');
    });

    it('omits the description cell when nameToggleId is unset', () => {
        const root = renderRow('item=item', '', ctx);
        expect(root.querySelector('.table-cell--description')).toBeNull();
    });
});
