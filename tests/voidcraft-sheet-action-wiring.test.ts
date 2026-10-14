/**
 * Regression guard (#186): every button on the voidcraft sheet must name an
 * action the sheet registers. The Weapons tab's Fire button once named
 * `itemFire`, which no sheet registers, so clicking it did nothing and
 * `#fireShipWeapon` — the only path that adds Lock on Target's, Come to New
 * Heading's and Evasive Manoeuvres' rows to a ship's Ballistic Skill test — was
 * unreachable from the sheet.
 *
 * The same tab also needs its `displayStrength` / `displayCrit` helpers
 * registered at runtime; only the story harness registered them, so the live
 * Weapons tab threw "Missing helper" as soon as a ship mounted a weapon.
 *
 * A source scan because `VoidcraftActorSheet` cannot be constructed under
 * happy-dom. The templates are the voidcraft tab/header templates plus the
 * ship panels they include.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const ACTOR_APPS = resolve(ROOT, 'src/module/applications/actor');
const VOIDCRAFT_TEMPLATES = resolve(ROOT, 'src/templates/actor/voidcraft');
const PANEL_TEMPLATES = resolve(ROOT, 'src/templates/actor/panel');

/** The keys of the first `actions: { … }` map in a sheet's source. */
function registeredActions(file: string): Set<string> {
    const src = readFileSync(resolve(ACTOR_APPS, file), 'utf8');
    const start = src.indexOf('actions: {');
    expect(start, `${file} declares no actions map`).toBeGreaterThan(-1);
    const end = src.indexOf('\n        },', start);
    const block = src.slice(start, end);
    return new Set(Array.from(block.matchAll(/^\s+(\w+): \w+\.#\w+/gmu), (match) => match[1]));
}

/** Every action a template's buttons name: `data-action="…"` and the item-table partials' `…Action="…"` / `action="…"` hash params. */
function templateActions(path: string): string[] {
    const src = readFileSync(path, 'utf8');
    return Array.from(src.matchAll(/(?:data-action|\baction|addAction|editAction)="(\w+)"/gu), (match) => match[1]);
}

const templates = [
    ...readdirSync(VOIDCRAFT_TEMPLATES)
        .filter((name) => name.endsWith('.hbs'))
        .map((name) => resolve(VOIDCRAFT_TEMPLATES, name)),
    ...readdirSync(PANEL_TEMPLATES)
        .filter((name) => name.startsWith('ship-') && name.endsWith('.hbs'))
        .map((name) => resolve(PANEL_TEMPLATES, name)),
];

describe('voidcraft sheet button wiring', () => {
    const registered = new Set([...registeredActions('voidcraft-sheet.ts'), ...registeredActions('base-actor-sheet.ts')]);

    it.each(templates.map((path) => [path.slice(ROOT.length + 1), path]))('%s names only registered actions', (_label, path) => {
        const unregistered = templateActions(path).filter((action) => !registered.has(action));
        expect(unregistered).toEqual([]);
    });

    it('registers the Weapons tab display helpers in production, not only in Storybook', () => {
        // The helpers existed as exported functions but were registered only by the
        // story harness, so the live Weapons tab failed to render once a ship had a weapon.
        const helpers = readFileSync(resolve(ROOT, 'src/module/handlebars/handlebars-helpers.ts'), 'utf8');
        const panel = readFileSync(resolve(PANEL_TEMPLATES, 'ship-weapons-panel.hbs'), 'utf8');
        for (const helper of ['displayStrength', 'displayCrit']) {
            expect(panel).toContain(`(${helper} `);
            expect(helpers).toContain(`registerHelper('${helper}'`);
        }
    });

    it('fires a ship weapon through #fireShipWeapon', () => {
        expect(templateActions(resolve(PANEL_TEMPLATES, 'ship-weapons-panel.hbs'))).toContain('fireShipWeapon');
        expect(registered.has('fireShipWeapon')).toBe(true);
    });
});
