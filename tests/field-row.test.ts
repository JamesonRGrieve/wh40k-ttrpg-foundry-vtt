/**
 * field-row partial smoke tests.
 *
 * Asserts that the shared field-row partial preserves schema name= paths
 * byte-for-byte (the Foundry form parser writes back through them) and
 * renders the correct element structure with Tailwind utility classes.
 */

import { describe, expect, it } from 'vitest';
import fieldRowSrc from '../src/templates/shared/field-row.hbs?raw';
import { renderSheet } from '../stories/test-helpers';

// Render through the shared renderSheet helper (#269); fieldRowTemplate returns the mounted root.
const fieldRowTemplate = (ctx: object): HTMLElement => renderSheet(fieldRowSrc, ctx);

describe('field-row partial', () => {
    it('renders default text input with required hash params', () => {
        const html = fieldRowTemplate({
            label: 'Gender',
            name: 'system.bio.gender',
            value: 'Male',
        });
        const root = html;
        const row = root.querySelector('div');
        expect(row).not.toBeNull();
        const labelEl = root.querySelector('label');
        expect(labelEl === null ? null : labelEl.textContent.trim()).toBe('Gender');
        const input = root.querySelector('input');
        expect(input?.getAttribute('type')).toBe('text');
        expect(input?.getAttribute('name')).toBe('system.bio.gender');
        expect(input?.getAttribute('value')).toBe('Male');
    });

    it('honours type="number" when requested', () => {
        const html = fieldRowTemplate({
            label: 'Age',
            name: 'system.bio.age',
            value: 32,
            type: 'number',
        });
        const input = html.querySelector('input');
        expect(input?.getAttribute('type')).toBe('number');
        expect(input?.getAttribute('name')).toBe('system.bio.age');
        expect(input?.getAttribute('value')).toBe('32');
    });

    it('renders <select> with options when type="select"', () => {
        const html = fieldRowTemplate({
            label: 'Build',
            name: 'system.bio.build',
            value: 'lean',
            type: 'select',
            options: { lean: 'Lean', stocky: 'Stocky', tall: 'Tall' },
        });
        const root = html;
        const select = root.querySelector('select');
        expect(select).not.toBeNull();
        expect(select?.getAttribute('name')).toBe('system.bio.build');
        const options = root.querySelectorAll('option');
        expect(options).toHaveLength(3);
        const selected = Array.from(options).find((o) => o.hasAttribute('selected'));
        expect(selected?.getAttribute('value')).toBe('lean');
    });

    it('emits placeholder when provided', () => {
        const html = fieldRowTemplate({
            label: 'Eyes',
            name: 'system.bio.eyes',
            value: '',
            placeholder: 'Eye colour',
        });
        const input = html.querySelector('input');
        expect(input?.getAttribute('placeholder')).toBe('Eye colour');
    });

    it('appends optional class hash params without dropping the base classes', () => {
        const html = fieldRowTemplate({
            label: 'Hair',
            name: 'system.bio.hair',
            value: 'Black',
            rowClass: 'tw-col-span-2',
            labelClass: 'tw-text-xs',
            inputClass: 'tw-uppercase',
        });
        const root = html;
        // renderSheet wraps the partial in Foundry's .app > .window-content shell, so scope to
        // the field-row's own root (tw-flex-col) rather than the shell's first <div>.
        expect(root.querySelector('.tw-flex-col')?.className).toContain('tw-col-span-2');
        expect(root.querySelector('label')?.className).toContain('tw-text-xs');
        expect(root.querySelector('input')?.className).toContain('tw-uppercase');
    });
});
