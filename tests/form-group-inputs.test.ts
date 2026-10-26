/**
 * The shared `.tw-form-group` field styling (#701 item 25). Batch Create's
 * inputs rendered borderless on a transparent background: the component's
 * border and background read `var(--color-border-light-tertiary)` and
 * `var(--color-bg-option)` with no fallback, neither is defined under Foundry
 * V14's dark theme, so both declarations were invalid at computed-value time.
 */
import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const TAILWIND_CONFIG = readRepoFile('tailwind.config.js');
const FIELD_BLOCK = /'& input\[type="text"\][^']*': \{([^}]*)\}/u.exec(TAILWIND_CONFIG)?.[1] ?? '';

describe('shared form-group fields (#701)', () => {
    it('finds the field block', () => {
        expect(FIELD_BLOCK).toContain('border:');
    });

    it('gives every var() in the field look a fallback', () => {
        const vars = FIELD_BLOCK.match(/var\([^)]*\)/gu) ?? [];
        expect(vars.length).toBeGreaterThan(0);
        expect(vars.filter((v) => !v.includes(','))).toEqual([]);
    });

    it('uses the border, background and text colour Quick Create carries', () => {
        const quickCreate = readRepoFile('src/templates/dialogs/npc-quick-create.hbs');
        for (const token of ['var(--color-border-light, #555)', 'var(--color-bg-input, #222)', 'var(--color-text-light, #fff)']) {
            expect(FIELD_BLOCK).toContain(token);
            expect(quickCreate).toContain(token.replace(', ', ','));
        }
    });
});
