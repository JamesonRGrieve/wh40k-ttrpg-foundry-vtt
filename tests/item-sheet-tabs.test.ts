/**
 * Regression guard (#638): every item-sheet tab can be opened.
 *
 * The shared item tab strip rendered a `<nav>` without `tabs` / `wh40k-tabs`.
 * BaseItemSheet binds tab clicks through `.wh40k-tabs`, so a click on any tab of
 * the ~15 sheets using the strip did nothing, and Foundry's
 * `ApplicationV2#changeTab` (which finds the tab by `.tabs [data-group][data-tab]`)
 * threw "No matching tab element" — the gear and Navigator-power Effects tabs
 * could not be opened. The NPC-template sheet's strip also emitted an empty
 * `data-tab` (its tab entries had no `tab` field), dispatched a non-existent
 * `changeTab` action, and its sections were not `.tab` panels.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import stripSrc from '../src/templates/item/partial/item-tab-strip.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';
import { renderSheet } from '../stories/test-helpers';

initializeStoryHandlebars();

const ROOT = resolve(__dirname, '..');
const ITEM_TEMPLATES = join(ROOT, 'src/templates/item');

function hbsFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return hbsFiles(path);
        return entry.name.endsWith('.hbs') ? [path] : [];
    });
}

describe('item tab strip', () => {
    it('renders a nav Foundry and BaseItemSheet both recognise', () => {
        const nav = renderSheet(stripSrc, {
            tabs: [
                { tab: 'details', label: 'Details', icon: 'fa-info', active: true },
                { tab: 'effects', label: 'Effects', icon: 'fa-bolt' },
            ],
        });
        const root = nav.matches('nav') ? nav : nav.querySelector('nav');
        expect(root?.classList.contains('tabs')).toBe(true);
        expect(root?.classList.contains('wh40k-tabs')).toBe(true);
        expect([...(root?.querySelectorAll<HTMLElement>('[data-tab]') ?? [])].map((b) => b.dataset['tab'])).toEqual(['details', 'effects']);
    });

    it('every primary tab nav in an item template is a `.tabs` nav', () => {
        const offenders = hbsFiles(ITEM_TEMPLATES).flatMap((file) =>
            [...readFileSync(file, 'utf8').matchAll(/<nav class="([^"]*)"[^>]*data-group="primary"/g)]
                .filter((m) => !m[1].split(/\s+/).includes('tabs'))
                .map(() => relative(ROOT, file)),
        );
        expect(offenders).toEqual([]);
    });

    it('every tab a sheet lists in its strip has a `.tab` panel to open', () => {
        const missing = hbsFiles(ITEM_TEMPLATES).flatMap((file) => {
            const src = readFileSync(file, 'utf8');
            if (!src.includes('item-tab-strip.hbs')) return [];
            const listed = [...src.matchAll(/\(object tab="([\w-]+)"/g)].map((m) => m[1]);
            const panels = new Set(
                [...src.matchAll(/class="([^"]*)"[^>]*data-tab="([\w-]+)"/g)].filter((m) => m[1].split(/\s+/).includes('tab')).map((m) => m[2]),
            );
            return listed.filter((tab) => !panels.has(tab)).map((tab) => `${relative(ROOT, file)}: ${tab}`);
        });
        expect(missing).toEqual([]);
    });
});

describe('item sheet tab configs', () => {
    it("every sheet's default tab is one its template renders (a missing one hid every panel)", () => {
        const SHEETS = join(ROOT, 'src/module/applications/item');
        const wrong = readdirSync(SHEETS)
            .filter((name) => name.endsWith('-sheet.ts'))
            .flatMap((name) => {
                const source = readFileSync(join(SHEETS, name), 'utf8');
                const template = /templates\/(item\/[\w/-]+\.hbs)/.exec(source)?.[1];
                const defaultTab = /defaultTab: '([\w-]+)'/.exec(source)?.[1];
                if (template === undefined || defaultTab === undefined) return [];
                const markup = readFileSync(join(ROOT, 'src/templates', template), 'utf8');
                if (!markup.includes('item-tab-strip.hbs') && !/class="[^"]*\btabs\b/.test(markup)) return [];
                return markup.includes(`data-tab="${defaultTab}"`) || markup.includes(`tab="${defaultTab}"`) ? [] : [`${name}: ${defaultTab}`];
            });
        expect(wrong).toEqual([]);
    });
});

describe('NPC-template sheet tabs', () => {
    it('BaseItemSheet localizes the tab labels the strip prints verbatim', () => {
        const base = readFileSync(join(ROOT, 'src/module/applications/item/base-item-sheet.ts'), 'utf8');
        expect(base).toContain('label: label === undefined ? undefined : game.i18n.localize(label)');
    });

    it('the tab entries carry the `tab` id the strip prints as data-tab', () => {
        const mixin = readFileSync(join(ROOT, 'src/module/applications/api/primary-sheet-mixin.ts'), 'utf8');
        expect(mixin).toMatch(/id: tab,\s*\/\/[^\n]*\n\s*tab,/);
    });

    it('dispatches Foundry’s core `tab` action and renders `.tab` panels', () => {
        expect(readFileSync(join(ITEM_TEMPLATES, 'npc-template/tabs.hbs'), 'utf8')).toContain('dataAction="tab"');
        for (const tab of ['basics', 'characteristics', 'equipment', 'abilities', 'preview']) {
            expect(readFileSync(join(ITEM_TEMPLATES, `npc-template/tab-${tab}.hbs`), 'utf8')).toContain(
                `<section class="tab {{tab.cssClass}}" data-tab="${tab}"`,
            );
        }
    });
});
