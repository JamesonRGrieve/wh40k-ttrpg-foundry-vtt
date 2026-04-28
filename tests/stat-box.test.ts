/**
 * stat-box partial smoke tests.
 *
 * Verifies value-only and value/max layouts, that schema name= paths come through verbatim,
 * and that base-class overrides (vehicle's wh40k-vehicle-stat-* prefix) do what they should.
 */

import Handlebars from 'handlebars';
import { describe, expect, it } from 'vitest';
import { initializeStoryHandlebars } from '../stories/template-support';
import statBoxSrc from '../src/templates/actor/partial/stat-box.hbs?raw';

initializeStoryHandlebars();

const statBoxTemplate = Handlebars.compile(statBoxSrc);

function dom(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
}

describe('stat-box partial', () => {
    it('renders single-input layout when maxName is omitted (vehicle Armour)', () => {
        const html = statBoxTemplate({
            label: 'Armour',
            boxBaseClass: 'wh40k-vehicle-stat-box',
            labelBaseClass: 'wh40k-vehicle-stat-label',
            inputBaseClass: 'wh40k-vehicle-stat-input',
            boxClass: 'wh40k-vehicle-armour',
            valueName: 'system.armour.total',
            value: 7,
            min: '0',
        });
        const root = dom(html);
        const box = root.querySelector('.wh40k-vehicle-stat-box');
        expect(box).not.toBeNull();
        expect(box?.className).toContain('wh40k-vehicle-armour');
        const inputs = root.querySelectorAll('input[type="number"]');
        expect(inputs.length).toBe(1);
        expect(inputs[0].getAttribute('name')).toBe('system.armour.total');
        expect(inputs[0].getAttribute('value')).toBe('7');
        expect(inputs[0].getAttribute('min')).toBe('0');
        expect(root.querySelector('.wh40k-stat-separator')).toBeNull();
    });

    it('renders value/max pair with separator (starship Hull Integrity)', () => {
        const html = statBoxTemplate({
            label: 'Hull Integrity',
            boxClass: 'wh40k-hull-box',
            valueName: 'system.hullIntegrity.value',
            value: 24,
            maxName: 'system.hullIntegrity.max',
            max: 30,
        });
        const root = dom(html);
        const inputs = root.querySelectorAll('input[type="number"]');
        expect(inputs.length).toBe(2);
        expect(inputs[0].getAttribute('name')).toBe('system.hullIntegrity.value');
        expect(inputs[1].getAttribute('name')).toBe('system.hullIntegrity.max');
        expect(inputs[0].getAttribute('value')).toBe('24');
        expect(inputs[1].getAttribute('value')).toBe('30');
        expect(root.querySelector('.wh40k-stat-separator')?.textContent).toBe('/');
    });

    it('honours minMax override (vehicle Structure: value-min=0, max-min=1)', () => {
        const html = statBoxTemplate({
            label: 'Structure',
            boxBaseClass: 'wh40k-vehicle-stat-box',
            inputBaseClass: 'wh40k-vehicle-stat-input',
            valueName: 'system.wounds.value',
            value: 12,
            maxName: 'system.wounds.max',
            max: 16,
            min: '0',
            minMax: '1',
        });
        const inputs = dom(html).querySelectorAll('input[type="number"]');
        expect(inputs[0].getAttribute('min')).toBe('0');
        expect(inputs[1].getAttribute('min')).toBe('1');
    });

    it('starship single-input variant emits wh40k-stat-single class via singleClass param', () => {
        const html = statBoxTemplate({
            label: 'Population',
            boxClass: 'wh40k-pop-box',
            singleClass: 'wh40k-stat-single',
            valueName: 'system.crew.population',
            value: 4500,
        });
        const input = dom(html).querySelector('input[type="number"]');
        expect(input?.className).toContain('wh40k-stat-single');
    });

    it('emits maxAttr on the value input when provided (vehicle Size: max=10)', () => {
        const html = statBoxTemplate({
            label: 'Size',
            valueName: 'system.size',
            value: 5,
            min: '1',
            maxAttr: '10',
        });
        const input = dom(html).querySelector('input[type="number"]');
        expect(input?.getAttribute('max')).toBe('10');
    });
});
