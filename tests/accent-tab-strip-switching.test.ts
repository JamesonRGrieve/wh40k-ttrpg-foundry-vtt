/**
 * #690: the origin-path, trait and talent item sheets share the accent tab strip.
 * Their tabs could not switch:
 * - the origin and trait sheets had no `.wh40k-tab-content` container, so the
 *   sheet's tab machinery bound nothing;
 * - the origin panels hard-coded `tw-hidden`, which no tab switch clears, so the
 *   Description tab (text, GM notes, Source) stayed out of reach.
 *
 * Each sheet's TabsSwitch story clicks every tab through the machinery a live sheet
 * runs (PrimarySheetMixin → sheet-tabs.ts); this suite runs those plays.
 */
import { describe, expect, it } from 'vitest';
import { bindSheetTabs } from '../src/module/applications/api/sheet-tabs.ts';
import * as originStories from '../src/module/applications/item/origin-path-sheet.stories.ts';
import * as talentStories from '../src/module/applications/item/talent-sheet.stories.ts';
import * as traitStories from '../src/module/applications/item/trait-sheet.stories.ts';
import { namedStoryPlayTests } from './lib/story-runner.ts';

describe('origin-path sheet tabs switch (#690)', () => {
    namedStoryPlayTests(originStories, ['TabsSwitch']);
});

describe('trait sheet tabs switch (#690)', () => {
    namedStoryPlayTests(traitStories, ['TabsSwitch']);
});

describe('talent sheet tabs switch (#690)', () => {
    namedStoryPlayTests(talentStories, ['TabsSwitch']);
});

describe('sheet tab machinery', () => {
    function sheet(withContainer: boolean): HTMLElement {
        const root = document.createElement('div');
        root.innerHTML = `
            <nav class="tabs wh40k-tabs" data-group="primary">
                <button data-tab="a" data-group="primary"></button><button data-tab="b" data-group="primary"></button>
            </nav>
            <section class="${withContainer ? 'wh40k-tab-content' : ''}">
                <div class="tab active" data-tab="a" data-group="primary"></div><div class="tab" data-tab="b" data-group="primary"></div>
            </section>`;
        return root;
    }
    const config = [{ navSelector: '.wh40k-tabs', contentSelector: '.wh40k-tab-content' }];

    it('a click moves .active to the clicked tab and its panel, and records it', () => {
        const root = sheet(true);
        const tabGroups: Record<string, string> = {};
        bindSheetTabs(root, config, tabGroups);
        root.querySelector<HTMLElement>('button[data-tab="b"]')?.click();
        expect([...root.querySelectorAll('.active')].map((el) => (el as HTMLElement).dataset['tab'])).toEqual(['b', 'b']);
        expect(tabGroups['primary']).toBe('b');
    });

    it('binds nothing without the content container, so the template must carry it', () => {
        const root = sheet(false);
        bindSheetTabs(root, config, {});
        root.querySelector<HTMLElement>('button[data-tab="b"]')?.click();
        expect(root.querySelector('.tab[data-tab="b"]')?.classList.contains('active')).toBe(false);
    });
});
