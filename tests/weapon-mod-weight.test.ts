/**
 * Regression guard (#641): a weapon modification's weight, edited on its sheet,
 * is submitted with the rest of the form.
 *
 * The weight "stored 0" because every submit of this sheet was dropped: its
 * template nested a form in the form-root sheet (#612, 2b7a67013), and then its
 * availability / craftsmanship selects submitted labels that failed validation
 * (605a934fc). Tier B (`weapon-mod-weight.spec.ts`) proves the save; this pins
 * the template shape that makes it possible.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const TEMPLATE = readFileSync(resolve(__dirname, '../src/templates/item/item-weapon-mod-sheet.hbs'), 'utf8');

describe('weapon-mod sheet template', () => {
    it('binds the weight once, as a number field of the sheet form', () => {
        const inputs = [...TEMPLATE.matchAll(/<input[^>]*name="system\.weight"[^>]*>/g)].map((m) => m[0]);
        expect(inputs).toHaveLength(1);
        expect(inputs[0]).toContain('type="number"');
        expect(inputs[0]).toContain('data-dtype="Number"');
    });

    it('opens no form of its own (the sheet root is the form)', () => {
        expect(TEMPLATE).not.toMatch(/<form[\s>]/);
    });

    it('submits schema choice keys for availability and craftsmanship, so the submit validates', () => {
        expect(TEMPLATE).toContain('selectOptions dh.availabilities');
        expect(TEMPLATE).toContain('selectOptions dh.craftsmanships');
        expect(TEMPLATE).not.toContain('arrayToObject dh.items');
    });
});
