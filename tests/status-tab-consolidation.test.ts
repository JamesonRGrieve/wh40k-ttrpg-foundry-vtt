/**
 * Regression guard (#263): the Status tab was consolidated into Overview and
 * removed. Its vitals (wounds / fatigue / corruption / insanity / experience /
 * fate) were already on Overview, and movement moved to Combat (#266). Every
 * Status-only panel must now appear on the Overview tab so nothing is silently
 * lost, and the Status tab plumbing (PART, TABS entry, part-context branch,
 * template, preload entry) must be gone.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const CHAR_SHEET = readRepoFile('src/module/applications/actor/character-sheet.ts');
const PRELOAD = readRepoFile('src/module/handlebars/handlebars-manager.ts');

/**
 * Overview's markup, with its `{{> … }}` includes inlined one level deep.
 *
 * The guard below asserts each relocated panel is REACHABLE FROM OVERVIEW. Parts
 * of the tab now live in shared partials (#494 extracted the Vitals and Active
 * Effects blocks so the Combat tab could render them without duplication), so a
 * flat read of tab-overview.hbs would report those panels missing when they are
 * merely one indirection away. Resolving includes keeps the guard honest and
 * survives future extractions.
 */
function readOverviewResolved(): string {
    const root = readRepoFile('src/templates/actor/player/tab-overview.hbs');
    const includePattern = /\{\{>\s*systems\/wh40k-rpg\/(templates\/[^\s}]+\.hbs)/g;
    let resolved = root;
    for (const match of root.matchAll(includePattern)) {
        const relative: string | undefined = match[1];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (ESLint's parser project) has the flag off so it types this capture-group read as `string`, while tsconfig.json has it on and requires the guard.
        if (relative === undefined) continue;
        try {
            resolved += `\n${readRepoFile(`src/${relative}`)}`;
        } catch {
            // A partial that cannot be read is a separate failure surface
            // (preload-drift covers missing partials); don't mask it here.
        }
    }
    return resolved;
}

const OVERVIEW = readOverviewResolved();

describe('Status tab removal (#263)', () => {
    it('deletes the tab-status.hbs template', () => {
        expect(existsSync(resolve(__dirname, '../src/templates/actor/player/tab-status.hbs'))).toBe(false);
    });

    it('removes the status PART, TABS entry, and part-context branch', () => {
        expect(CHAR_SHEET).not.toContain('tab-status.hbs');
        expect(CHAR_SHEET).not.toContain("tab: 'status'");
        expect(CHAR_SHEET).not.toContain("partId === 'status'");
    });

    it('drops the status template from the Handlebars preload list', () => {
        expect(PRELOAD).not.toContain('tab-status.hbs');
    });
});

describe('Status panels relocated to Overview (#263 — no silent data loss)', () => {
    const relocated = [
        'shock-panel.hbs',
        'possession-panel.hbs',
        'subtlety-panel.hbs',
        'bc-alignment-panel.hbs',
        'dw-cohesion-panel.hbs',
        'dw-mode-panel.hbs',
        'dw-renown-panel.hbs',
        'dw-requisition-panel.hbs',
        'dw-oath-panel.hbs',
        'dw-mission-panel.hbs',
        'dw-vehicle-panel.hbs',
        'ow-comrade-panel.hbs',
        'ow-logistics-panel.hbs',
        'ow-orders-panel.hbs',
        'ow-mission-gear-panel.hbs',
        'ow-vehicle-movement-panel.hbs',
        'ow-comrade-healing-panel.hbs',
        'ow-mount-panel.hbs',
        'ow-battlefield-panel.hbs',
        'dark-pact-panel.hbs',
        'mortification-button.hbs',
        'fanatic-button.hbs',
        'crusader-button.hbs',
        'grapple-controller-panel.hbs',
    ];

    it.each(relocated)('Overview now includes %s', (panel) => {
        expect(OVERVIEW).toContain(panel);
    });

    // Active Effects is surfaced on Overview via the compact dashboard-zone in
    // the Vitals column, not the full active-effects-panel.hbs partial. The
    // duplicate full panel was removed; this guards that the at-a-glance
    // Active Effects display is not silently lost from Overview.
    it('keeps an Active Effects display on Overview (compact dashboard zone)', () => {
        expect(OVERVIEW).toContain('title="Active Effects"');
    });
});
