/**
 * tab-strip partial smoke tests.
 *
 * The partial is the new shared replacement for the duplicated <nav>{{#each tabs}}<a/>{{/each}}</nav>
 * pattern that was sitting in player/tabs.hbs and vehicle/tabs.hbs. These tests verify both call
 * shapes produce the right markup: data-tab path, data-group attr, active class application,
 * and the optional <label> wrapper used by the older vehicle/starship chrome.
 */

import Handlebars from 'handlebars';
import { describe, expect, it } from 'vitest';
import { initializeStoryHandlebars } from '../stories/template-support';
import tabStripSrc from '../src/templates/actor/partial/tab-strip.hbs?raw';

initializeStoryHandlebars();

const tabStripTemplate = Handlebars.compile(tabStripSrc);

function dom(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
}

describe('tab-strip partial', () => {
    it('renders one <a> per tab with data-tab from `tab` field (player shape)', () => {
        const html = tabStripTemplate({
            tabs: [
                { tab: 'overview', group: 'primary', label: 'Overview', cssClass: 'tab-overview', active: true },
                { tab: 'combat', group: 'primary', label: 'Combat', cssClass: 'tab-combat', active: false },
                { tab: 'biography', group: 'primary', label: 'Biography', cssClass: 'tab-biography' },
            ],
            navClass: '!tw-flex !tw-flex-col',
            itemClass: 'wh40k-nav-item',
        });
        const root = dom(html);
        const items = root.querySelectorAll('a.wh40k-nav-item');
        expect(items.length).toBe(3);
        expect(items[0].getAttribute('data-tab')).toBe('overview');
        expect(items[0].className).toContain('active');
        expect(items[1].className).not.toContain('active');
        expect(items[1].className).toContain('tab-combat');
        expect(items[2].getAttribute('data-tab')).toBe('biography');
    });

    it('falls back to `id` field when `tab` is absent (vehicle shape)', () => {
        const html = tabStripTemplate({
            tabs: [
                { id: 'stats', group: 'primary', label: 'Stats', cssClass: 'tab-stats', active: false },
                { id: 'crew', group: 'primary', label: 'Crew', cssClass: 'tab-crew', active: true },
            ],
            navClass: 'wh40k-vehicle-tabs',
            itemClass: 'wh40k-tab-btn',
        });
        const items = dom(html).querySelectorAll('a.wh40k-nav-item');
        expect(items[0].getAttribute('data-tab')).toBe('stats');
        expect(items[1].getAttribute('data-tab')).toBe('crew');
        expect(items[1].className).toContain('active');
    });

    it('emits material-icon spans when tabs include an icon attr (label-wrap chrome)', () => {
        const html = tabStripTemplate({
            tabs: [
                { tab: 'stats', group: 'primary', label: 'Stats', icon: 'speed' },
                { tab: 'weapons', group: 'primary', label: 'Weapons', icon: 'gps_fixed' },
            ],
            withLabelWrap: true,
            itemClass: 'wh40k-nav-item',
        });
        const root = dom(html);
        const labels = root.querySelectorAll('label.wh40k-navigation__item');
        expect(labels.length).toBe(2);
        expect(labels[0].querySelector('.material-icons')?.textContent?.trim()).toBe('speed');
        expect(labels[1].querySelector('.material-icons')?.textContent?.trim()).toBe('gps_fixed');
    });

    it('every <a> emits data-action="tab" so the V14 PrimarySheet handler picks up clicks', () => {
        const html = tabStripTemplate({
            tabs: [
                { tab: 'overview', group: 'primary', label: 'Overview' },
                { tab: 'combat', group: 'primary', label: 'Combat' },
            ],
        });
        const items = dom(html).querySelectorAll('a.wh40k-nav-item');
        Array.from(items).forEach((a) => expect(a.getAttribute('data-action')).toBe('tab'));
    });

    it('defaults data-group to "primary" when tabs entry omits group', () => {
        const html = tabStripTemplate({
            tabs: [{ tab: 'overview', label: 'Overview' }],
        });
        const item = dom(html).querySelector('a.wh40k-nav-item');
        expect(item?.getAttribute('data-group')).toBe('primary');
    });
});
