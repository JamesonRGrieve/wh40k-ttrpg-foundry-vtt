/**
 * Vitest specs for the item-table.hbs + item-table-row.hbs partials. Both are
 * block partials, so each spec wraps them in a tiny outer template that
 * supplies block content. Helpers from `stories/template-support.ts` register
 * the project-wide Handlebars helpers (localize, eq, defaultVal, iconSvg, …).
 */
import HbsLib from 'handlebars';
import { describe, expect, it } from 'vitest';
import itemTableRowSrc from '../src/templates/actor/partial/item-table-row.hbs?raw';
import itemTableSrc from '../src/templates/actor/partial/item-table.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';

initializeStoryHandlebars();

HbsLib.registerPartial('item-table-test', itemTableSrc);
HbsLib.registerPartial('item-table-row-test', itemTableRowSrc);

function dom(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
}

function renderTable(hashLiteral: string, body = ''): HTMLElement {
    const tpl = HbsLib.compile(`{{#> item-table-test ${hashLiteral}}}${body}{{/item-table-test}}`);
    return dom(tpl({}));
}

function renderRow(hashLiteral: string, body = '', context: object = {}): HTMLElement {
    const tpl = HbsLib.compile(`{{#> item-table-row-test ${hashLiteral}}}${body}{{/item-table-row-test}}`);
    return dom(tpl(context));
}

describe('item-table.hbs', () => {
    it('renders one header cell per entry plus the trailing add cell', () => {
        const root = renderTable(
            'addAction="itemCreate" addType="weapon" headers=(array (object weight=2 label="Name") (object label="Class") (object label="Type"))',
        );
        const headRow = root.querySelector('[data-table-header]');
        expect(headRow).not.toBeNull();
        const headRowEl = headRow as Element;
        // 3 header cells + 1 trailing add cell
        expect(headRowEl.children).toHaveLength(4);
        expect(headRowEl.textContent).toMatch(/Name/);
        expect(headRowEl.textContent).toMatch(/Class/);
        expect(headRowEl.textContent).toMatch(/Type/);
    });

    it('omits the add cell when addAction is absent', () => {
        const root = renderTable('headers=(array (object label="A"))');
        expect(root.querySelector('[data-table-header]')?.children).toHaveLength(1);
        expect(root.querySelector('[data-action="itemCreate"]')).toBeNull();
    });

    // #662: the legacy CSS that laid the table out was deleted, so the header and every
    // row stacked into one column. The table now carries its own grid.
    it('lays the table out as a grid whose columns come from its headers', () => {
        const root = renderTable('addAction="itemCreate" headers=(array (object weight=2 label="Name") (object label="Class") (object fit=true label="Go"))');
        const table = root.querySelector<HTMLElement>('[data-table]');
        expect(table?.classList.contains('tw-grid')).toBe(true);
        expect(table?.classList.contains('tw-grid-cols-[var(--wh40k-item-table-cols)]')).toBe(true);
        expect(table?.style.getPropertyValue('--wh40k-item-table-cols')).toBe('minmax(0, 2fr) minmax(0, 1fr) max-content max-content');
        const header = root.querySelector('[data-table-header]');
        expect(header?.classList.contains('tw-grid-cols-subgrid')).toBe(true);
        expect(header?.classList.contains('tw-col-span-full')).toBe(true);
    });

    it('renders a row with exactly one cell per column, so it lines up under the header', () => {
        const tpl = HbsLib.compile(
            '{{#> item-table-test addAction="itemCreate" headers=(array (object weight=2 label="Name") (object label="Class") (object label="Type"))}}' +
                '{{#> item-table-row-test item=item cells=(array (object value="Basic") (object value="Las")) actions=(array (object action="itemDelete" iconKey="fa:trash" title="Delete"))}}{{/item-table-row-test}}' +
                '{{/item-table-test}}',
        );
        const root = dom(tpl({ item: { id: 'w1', name: 'Lasgun' } }));
        const header = root.querySelector('[data-table-header]');
        const row = root.querySelector('[data-item-id="w1"]');
        expect(row?.classList.contains('tw-grid-cols-subgrid')).toBe(true);
        expect(row?.children.length).toBe(header?.children.length);
        // The edit cog shares the name column instead of taking a column of its own.
        expect(row?.children[0]?.querySelector('.item-edit')).not.toBeNull();
        expect(row?.children[0]?.textContent).toContain('Lasgun');
    });

    it('emits the addType on the add control button', () => {
        const root = renderTable('addAction="itemCreate" addType="shipComponent" headers=(array (object label="X"))');
        const addBtn = root.querySelector('[data-action="itemCreate"]');
        expect(addBtn).not.toBeNull();
        expect((addBtn as Element).getAttribute('data-type')).toBe('shipComponent');
    });

    it('applies per-system theme variants on the table border', () => {
        const root = renderTable('headers=(array)');
        const tbl = root.querySelector('[data-table]');
        expect(tbl).not.toBeNull();
        // The literal class names must be present in the rendered DOM so
        // Tailwind's template scan picks them up at build time.
        const cls = (tbl as Element).className;
        expect(cls).toMatch(/dh2:tw-border-bronze/);
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
        const editBtnEl = editBtn as Element;
        expect(editBtnEl.getAttribute('data-action')).toBe('itemEdit');
        expect(editBtnEl.getAttribute('data-item-id')).toBe('itm-1');
    });

    it('honors a custom editAction override', () => {
        const root = renderRow('item=item editAction="customEdit"', '', ctx);
        const editBtn = root.querySelector('.item-edit');
        expect(editBtn).not.toBeNull();
        expect((editBtn as Element).getAttribute('data-action')).toBe('customEdit');
    });

    it('suppresses the leading edit cell when editAction is false', () => {
        const root = renderRow('item=item editAction=false', '', ctx);
        expect(root.querySelector('.item-edit')).toBeNull();
    });

    it('renders one cell per entry in `cells`', () => {
        const root = renderRow('item=item cells=(array (object value="A") (object value="B") (object value="C"))', '', ctx);
        // Value spans have no class attr; icon spans do — exclude them.
        const valueCells = Array.from(root.querySelectorAll('span:not([class])')).filter((s) => s.textContent !== ctx.item.name);
        expect(valueCells).toHaveLength(3);
        expect(valueCells[0].textContent).toBe('A');
        expect(valueCells[2].textContent).toBe('C');
    });

    it('renders one toolbar button per `actions` entry', () => {
        const root = renderRow(
            'item=item actions=(array (object action="itemRoll" iconKey="fa:dice-d20" title="Roll") (object action="itemDelete" iconKey="fa:trash" title="Delete"))',
            '',
            ctx,
        );
        const buttons = root.querySelectorAll('[data-action]:not(.item-edit)');
        expect(buttons).toHaveLength(2);
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
        expect((svg as Element).getAttribute('class')).toMatch(/wh40k-icon--fa-trash/);
    });

    it('emits the row-level data-item-id attr for drop-zone wiring', () => {
        const root = renderRow('item=item dragType="weapon"', '', ctx);
        const row = root.querySelector('[data-item-id]');
        expect(row).not.toBeNull();
        const rowEl = row as Element;
        expect(rowEl.getAttribute('data-item-id')).toBe('itm-1');
        expect(rowEl.getAttribute('data-item-type')).toBe('weapon');
        expect(rowEl.classList.contains('item-drag')).toBe(true);
    });

    it('renders a description toggle cell when nameToggleId is provided', () => {
        const root = renderRow('item=item nameToggleId="description_itm-1"', '<span class="custom-desc">desc body</span>', ctx);
        const descCell = root.querySelector('[data-description-id]');
        expect(descCell).not.toBeNull();
        const descCellEl = descCell as Element;
        expect(descCellEl.getAttribute('data-description-id')).toBe('description_itm-1');
        // The description spans the whole row beneath the cells (#662).
        expect(descCellEl.classList.contains('tw-col-span-full')).toBe(true);
        expect(descCellEl.querySelector('.custom-desc')?.textContent).toBe('desc body');
    });

    it('omits the description cell when nameToggleId is unset', () => {
        const root = renderRow('item=item', '', ctx);
        expect(root.querySelector('[data-description-id]')).toBeNull();
    });
});
