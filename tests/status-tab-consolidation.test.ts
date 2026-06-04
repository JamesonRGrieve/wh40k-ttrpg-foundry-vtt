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
const OVERVIEW = readRepoFile('src/templates/actor/player/tab-overview.hbs');
const PRELOAD = readRepoFile('src/module/handlebars/handlebars-manager.ts');

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
        'active-effects-panel.hbs',
        'dark-pact-panel.hbs',
        'mortification-button.hbs',
        'fanatic-button.hbs',
        'crusader-button.hbs',
        'grapple-controller-panel.hbs',
    ];

    it.each(relocated)('Overview now includes %s', (panel) => {
        expect(OVERVIEW).toContain(panel);
    });
});
