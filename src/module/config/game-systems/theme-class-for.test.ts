import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SystemConfigRegistry, themeClassFor } from './index.ts';
import { ALL_SYSTEM_IDS, type SystemThemeRole } from './types.ts';

/**
 * `themeClassFor` is the single source of truth the inline 7-system accent
 * chains migrate onto (#422). Two invariants must hold or the migration
 * silently breaks rendering:
 *
 *  1. It emits the correct `tw-<prefix>-<theme value>` for every system/role,
 *     so a chain routed through the helper keeps its per-system colour.
 *  2. Every class it can emit is listed in `tailwind.config.js` `safelist` —
 *     the helper builds class names at render time, invisible to Tailwind's
 *     static template scan, so an un-safelisted value tree-shakes to nothing
 *     and the element renders unstyled.
 */
describe('themeClassFor (#422 SSOT)', () => {
    const ROLES: readonly SystemThemeRole[] = ['primary', 'accent', 'border'];
    const PREFIX: Record<SystemThemeRole, string> = {
        primary: 'tw-bg-',
        accent: 'tw-text-',
        border: 'tw-border-',
    };

    it.each(ALL_SYSTEM_IDS)('emits the config theme value for every role (%s)', (systemId) => {
        const theme = SystemConfigRegistry.get(systemId).theme;
        for (const role of ROLES) {
            expect(themeClassFor(systemId, role)).toBe(`${PREFIX[role]}${theme[role]}`);
        }
    });

    it('safelists every class the helper can emit (else it tree-shakes to invisible)', () => {
        const safelistSource = readFileSync(join(process.cwd(), 'tailwind.config.js'), 'utf8');
        for (const systemId of ALL_SYSTEM_IDS) {
            for (const role of ROLES) {
                const cls = themeClassFor(systemId, role);
                expect(safelistSource, `${cls} (${systemId}/${role}) missing from tailwind safelist`).toContain(`'${cls}'`);
            }
        }
    });
});
