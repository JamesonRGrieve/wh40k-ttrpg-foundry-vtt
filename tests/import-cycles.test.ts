/**
 * Guard (#714): no runtime import cycle, and no sheet importing a DataModel
 * module.
 *
 * dependency-cruiser counted 49 cycles. Its rule meant to exclude `import type`
 * edges, but filtered only the edge closing each cycle, so a cycle passing
 * through any type-only edge elsewhere still counted; 48 of the 49 were such
 * phantoms. The rule now uses `viaOnly`, which filters every edge. The one
 * runtime cycle (ActionData → basic action manager → targeted action manager
 * → ActionData) was broken with a handler slot, and the four sheet imports
 * from `data/` go through the actor or `rules/`. Both rules are at 0, strict in
 * the ratchet baseline, and errors in the config.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const requireCjs = createRequire(import.meta.url);

interface ForbiddenRule {
    name: string;
    severity: string;
    to: { circular?: boolean; viaOnly?: { dependencyTypesNot?: string[] }; dependencyTypesNot?: string[] };
}

const config = requireCjs(resolve(ROOT, '.dependency-cruiser.cjs')) as { forbidden: ForbiddenRule[] };
const rule = (name: string): ForbiddenRule | undefined => config.forbidden.find((r) => r.name === name);

describe('import cycles and sheet → DataModel imports (#714)', () => {
    it('counts a cycle only when every edge in it is a runtime import', () => {
        expect(rule('no-circular')?.to).toEqual({ circular: true, viaOnly: { dependencyTypesNot: ['type-only'] } });
    });

    it('holds both rules as errors, and strict in the ratchet baseline', () => {
        expect(rule('no-circular')?.severity).toBe('error');
        expect(rule('sheets-must-not-import-data-models-directly')?.severity).toBe('error');
        const baseline = JSON.parse(readFileSync(resolve(ROOT, '.depcruise-baseline'), 'utf8')) as { strict: string[] };
        expect(baseline.strict).toEqual(expect.arrayContaining(['no-circular', 'sheets-must-not-import-data-models-directly']));
    });

    it('keeps ActionData out of the actions layer: it posts cards through the handler slot', () => {
        const source = readFileSync(resolve(ROOT, 'src/module/rolls/action-data.ts'), 'utf8');
        expect(source).not.toMatch(/from '\.\.\/actions\//);
        expect(source).toContain('actionCardHandlers()');
    });
});
