#!/usr/bin/env node
/**
 * Generate a `*.test.ts` skeleton for a DataModel or Document.
 *
 *   node scripts/scaffold-datamodel-test.mjs src/module/data/item/weapon.ts
 *
 * Writes alongside the source:
 *   src/module/data/item/weapon.test.ts
 *
 * The skeleton imports the model + a relevant mock factory, instantiates one,
 * and asserts a couple of derived properties. Agents replace the assertion
 * placeholders with the actual expected values for the model under test.
 *
 * Refuses to overwrite an existing file.
 */
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, basename, dirname, relative } from 'node:path';

const target = process.argv[2];
if (!target) {
    console.error('Usage: scaffold-datamodel-test.mjs <path-to-data-or-document.ts>');
    process.exit(2);
}

const abs = resolve(process.cwd(), target);
if (!existsSync(abs)) {
    console.error(`[scaffold-datamodel-test] source not found: ${abs}`);
    process.exit(1);
}
if (!abs.endsWith('.ts') || abs.endsWith('.test.ts') || abs.endsWith('.stories.ts')) {
    console.error('[scaffold-datamodel-test] target must be a non-test, non-story .ts file');
    process.exit(2);
}

const out = abs.replace(/\.ts$/, '.test.ts');
if (existsSync(out)) {
    console.error(`[scaffold-datamodel-test] already exists: ${out}`);
    process.exit(1);
}

const src = readFileSync(abs, 'utf8');
// Look for `export default class Foo` or `export class Foo` to discover the export name.
const exportMatch =
    src.match(/export\s+default\s+class\s+(\w+)/) ?? src.match(/export\s+class\s+(\w+)/);
const className = exportMatch ? exportMatch[1] : 'Model';
const isDefault = !!src.match(/export\s+default\s+class/);

const base = basename(abs, '.ts');
const importPath = `./${base}`;

const tpl = `import { describe, expect, it } from 'vitest';
${isDefault ? `import ${className} from '${importPath}';` : `import { ${className} } from '${importPath}';`}

/**
 * Tests for ${className}. Replace the placeholder assertions with actual
 * expected values for this model — the scaffold gives you a working harness;
 * the asserted values are yours to fill in based on the model's schema.
 */
describe('${className}', () => {
    it('instantiates with default values', () => {
        // TODO: replace with realistic input for this model. Many DataModels
        // expect at least a partial schema-shaped object.
        const input: Record<string, unknown> = {};
        const instance = new ${className}(input as never);
        expect(instance).toBeDefined();
    });

    it('computes derived data when prepareDerivedData is called', () => {
        const input: Record<string, unknown> = {};
        const instance = new ${className}(input as never);
        // DataModels expose prepareDerivedData when extending SystemDataModel.
        // Document classes use prepareData. Adjust to match the model under test.
        if (typeof (instance as { prepareDerivedData?: () => void }).prepareDerivedData === 'function') {
            (instance as { prepareDerivedData: () => void }).prepareDerivedData();
        }
        // TODO: assert on the derived properties this model is responsible for.
        expect(instance).toBeDefined();
    });
});
`;

writeFileSync(out, tpl, 'utf8');
console.log(`[scaffold-datamodel-test] wrote ${out}`);
