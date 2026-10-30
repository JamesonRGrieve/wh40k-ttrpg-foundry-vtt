/**
 * Regression: the BC Chaos Ritual dialog's Kind selects were truncated.
 *
 * The dialog was an inline `.form-group` per modifier row holding the Kind
 * label + select, the Value label + input and the Description label + input in
 * one flex line, so in a 400px dialog each select shrank until its label
 * ("Component / Reagent") was cut. The body is now a template whose rows stack:
 * the select spans the row, Value and Description sit beneath it.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRitualDialogRows } from '../src/module/actions/bc-ritual-actions';
import templateSrc from '../src/templates/prompt/bc-ritual-dialog.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';
import { renderSheet } from '../stories/test-helpers';

initializeStoryHandlebars();

const label = (key: string): string => `L:${key.split('.').pop() ?? key}`;

describe('buildRitualDialogRows', () => {
    it('pre-allocates the four ritual-modifier rows, seeding Daemonic Mastery from the actor', () => {
        const rows = buildRitualDialogRows(3, label);
        expect(rows.map((row) => row.kinds.find((k) => k.selected)?.value)).toEqual(['cult-affiliation', 'sacrifice', 'daemonic-mastery', 'gm-other']);
        expect(rows.map((row) => row.value)).toEqual([0, 0, 3, 0]);
        expect(rows.map((row) => row.index)).toEqual([0, 1, 2, 3]);
    });

    it('lets every row choose any kind, labelled from the langpack', () => {
        for (const row of buildRitualDialogRows(0, label)) {
            expect(row.kinds).toHaveLength(6);
            expect(row.kinds.filter((k) => k.selected)).toHaveLength(1);
            expect(row.kinds.map((k) => k.label)).toContain('L:ComponentReagent');
        }
    });
});

describe('bc-ritual-dialog.hbs', () => {
    const root = (): HTMLElement => renderSheet(templateSrc, { rows: buildRitualDialogRows(2, label) });

    it('renders the fields the dialog callback reads, by name', () => {
        const el = root();
        expect(el.querySelector('[name="templateId"]')).not.toBeNull();
        expect(el.querySelector<HTMLInputElement>('[name="baseTarget"]')?.value).toBe('30');
        for (const i of [0, 1, 2, 3]) {
            expect(el.querySelector(`[name="mod-kind-${i}"]`)).not.toBeNull();
            expect(el.querySelector(`[name="mod-value-${i}"]`)).not.toBeNull();
            expect(el.querySelector(`[name="mod-description-${i}"]`)).not.toBeNull();
        }
        // The `selected` attribute (happy-dom's select.value does not track it reliably).
        expect(el.querySelector<HTMLOptionElement>('[name="mod-kind-2"] option[selected]')?.value).toBe('daemonic-mastery');
        expect(el.querySelector<HTMLInputElement>('[name="mod-value-2"]')?.value).toBe('2');
    });

    it('gives each Kind select the full width of its row, never sharing a line with the value and description', () => {
        const el = root();
        const select = el.querySelector<HTMLSelectElement>('[name="mod-kind-0"]');
        expect(select?.classList.contains('tw-w-full')).toBe(true);
        // The row is a two-column label/control grid: one control per line.
        const row = el.querySelector('[data-mod-row="0"]');
        expect(row?.className).toContain('tw-grid-cols-[max-content_1fr]');
        expect(row?.querySelectorAll('select, input')).toHaveLength(3);
        // Every control has its own associated label.
        for (const control of row?.querySelectorAll<HTMLElement>('select, input') ?? []) {
            expect(row?.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
        }
    });

    it('labels the ritual field "Ritual", not the internal template id (#634)', () => {
        const field = root().querySelector('[name="templateId"]')?.closest('label');
        expect(field?.textContent.trim()).toBe('Ritual');
        const lang = JSON.parse(readFileSync(resolve(__dirname, '../src/lang/en.json'), 'utf8')) as { WH40K: { BC: { Ritual: Record<string, string> } } };
        expect(lang.WH40K.BC.Ritual['DialogRitual']).toBe('Ritual');
        expect(lang.WH40K.BC.Ritual['DialogTemplateId']).toBeUndefined();
    });

    it('sizes the label column to its longest label, which never wraps (#634)', () => {
        const labels = [...(root().querySelector('[data-mod-row="0"]')?.querySelectorAll('label') ?? [])];
        expect(labels).toHaveLength(3);
        expect(labels.filter((labelEl) => !labelEl.classList.contains('tw-whitespace-nowrap'))).toEqual([]);
    });
});
