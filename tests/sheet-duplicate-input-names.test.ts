/**
 * Regression guard: one sheet never renders two inputs for the same field.
 *
 * History: FormDataExtended collects same-named inputs into an array, so a field
 * edited in two places on one sheet fails schema validation on EVERY save
 * ("must be a number"). It shipped twice:
 *  - craft: the sidebar header's quick stats and the Combat / Overview tabs both
 *    edited `system.armour.front.value` and `system.size`;
 *  - RT starship: the sidebar header's stat boxes and the Crew tab's crew panel
 *    both edited `system.crew.morale` / `population` / `crewRating`.
 * The headers now show those values read-only (`stat-box … readonly=true`).
 *
 * Each sheet family's templates are scanned with every partial they include,
 * since a field can arrive through a panel partial. A field may appear in several
 * branches of ONE template (if/else), so each template counts once per name.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const TEMPLATES = resolve(__dirname, '..', 'src/templates');
/** Sheet families whose templates render into one form: header + every tab. */
const FAMILIES = ['actor/player', 'actor/npc', 'actor/craft', 'actor/voidcraft'] as const;
/** A literal `system.*` field path bound to an input, directly or via a partial's hash param. */
const FIELD_NAME = /\b(?:name|valueName|maxName)="(system\.[\w.]+)"/g;
/** A partial call that renders its fields as text, not inputs. */
const READONLY_PARTIAL = /\{\{>[^}]*\breadonly=true\b[^}]*\}\}/g;
const PARTIAL_INCLUDE = /\{\{#?>\s*systems\/wh40k-rpg\/templates\/([\w/.-]+\.hbs)/g;

/** The family's own templates plus every partial they reach. */
function familyTemplates(family: string): Set<string> {
    const queue = readdirSync(join(TEMPLATES, family))
        .filter((f) => f.endsWith('.hbs'))
        .map((f) => `${family}/${f}`);
    const seen = new Set<string>();
    for (let rel = queue.shift(); rel !== undefined; rel = queue.shift()) {
        if (seen.has(rel) || !existsSync(join(TEMPLATES, rel))) continue;
        seen.add(rel);
        for (const m of readFileSync(join(TEMPLATES, rel), 'utf8').matchAll(PARTIAL_INCLUDE)) queue.push(m[1]);
    }
    return seen;
}

function fieldOwners(family: string): Map<string, string[]> {
    const owners = new Map<string, string[]>();
    for (const rel of familyTemplates(family)) {
        const source = readFileSync(join(TEMPLATES, rel), 'utf8').replace(READONLY_PARTIAL, '');
        for (const name of new Set([...source.matchAll(FIELD_NAME)].map((m) => m[1]))) owners.set(name, [...(owners.get(name) ?? []), rel]);
    }
    return owners;
}

describe.each(FAMILIES)('%s sheet input names', (family) => {
    it('finds editable fields to check', () => {
        expect(fieldOwners(family).size).toBeGreaterThan(0);
    });

    it('declares each field in only one template', () => {
        const duplicated = [...fieldOwners(family)].filter(([, files]) => files.length > 1).map(([name, files]) => `${name}: ${files.join(', ')}`);
        expect(duplicated).toEqual([]);
    });
});
