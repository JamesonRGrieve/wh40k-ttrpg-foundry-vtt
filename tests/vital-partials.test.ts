/**
 * Smoke tests for the vital-meter sub-partials.
 *
 * These render the partials against story-style Handlebars setup and assert that
 * critical contracts hold:
 *   - input `name=` paths are byte-identical to the originals (so the form parser
 *     keeps writing into the same schema slots);
 *   - data-action / data-field attributes resolve as expected on increment / decrement /
 *     adjustStat / setCriticalPip buttons;
 *   - the shell renders the expected `data-toggle="{key}_details"` toggle key and
 *     optional badge slot.
 */

import Handlebars from 'handlebars';
import { describe, expect, it } from 'vitest';
import { initializeStoryHandlebars } from '../stories/template-support';
import shellSrc from '../src/templates/actor/partial/vital-panel-shell.hbs?raw';
import quickControlsSrc from '../src/templates/actor/partial/vital-quick-controls.hbs?raw';
import progressBarSrc from '../src/templates/actor/partial/vital-progress-bar.hbs?raw';
import editInputSrc from '../src/templates/actor/partial/vital-edit-input.hbs?raw';
import quickAdjustSrc from '../src/templates/actor/partial/vital-quick-adjust.hbs?raw';

initializeStoryHandlebars();
Handlebars.registerHelper('isExpanded', () => false);

const shellTemplate = Handlebars.compile(shellSrc);
const quickControlsTemplate = Handlebars.compile(quickControlsSrc);
const progressBarTemplate = Handlebars.compile(progressBarSrc);
const editInputTemplate = Handlebars.compile(editInputSrc);
const quickAdjustTemplate = Handlebars.compile(quickAdjustSrc);

function dom(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
}

describe('vital-quick-controls partial', () => {
    it('renders minus / value-only / plus when no max is provided', () => {
        const html = quickControlsTemplate({
            wrapperClass: 'wh40k-corruption-value tw-flex',
            cssPrefix: 'wh40k-corruption',
            field: 'system.corruption',
            current: 42,
        });
        const root = dom(html);
        const decBtn = root.querySelector('button[data-action="decrement"]');
        const incBtn = root.querySelector('button[data-action="increment"]');
        expect(decBtn?.getAttribute('data-field')).toBe('system.corruption');
        expect(decBtn?.getAttribute('data-min')).toBe('0');
        expect(incBtn?.getAttribute('data-field')).toBe('system.corruption');
        expect(root.querySelector('.wh40k-corruption-current')?.textContent?.trim()).toBe('42');
        expect(root.querySelector('.wh40k-corruption-sep')).toBeNull();
        expect(root.querySelector('.wh40k-corruption-max')).toBeNull();
    });

    it('renders value / max separator when maxLabel is provided', () => {
        const html = quickControlsTemplate({
            wrapperClass: 'wh40k-wounds-tracker',
            cssPrefix: 'wh40k-wounds',
            field: 'system.wounds.value',
            current: 8,
            maxLabel: 12,
        });
        const root = dom(html);
        expect(root.querySelector('.wh40k-wounds-current')?.textContent?.trim()).toBe('8');
        expect(root.querySelector('.wh40k-wounds-max')?.textContent?.trim()).toBe('12');
        expect(root.querySelector('.wh40k-wounds-sep')?.textContent).toBe('/');
    });

    it('emits the calculator button when showCalculator=true', () => {
        const html = quickControlsTemplate({
            wrapperClass: 'wh40k-wounds-tracker',
            cssPrefix: 'wh40k-wounds',
            field: 'system.wounds.value',
            current: 8,
            maxLabel: 12,
            showCalculator: true,
            statKey: 'wounds',
        });
        const calc = dom(html).querySelector('button[data-action="showStatBreakdown"]');
        expect(calc).not.toBeNull();
        expect(calc?.getAttribute('data-stat-key')).toBe('wounds');
    });

    it('respects maxValue by emitting data-max on the increment button', () => {
        const html = quickControlsTemplate({
            wrapperClass: 'wh40k-fate-tracker',
            cssPrefix: 'wh40k-fate',
            field: 'system.fate.value',
            current: 1,
            maxLabel: 3,
            maxValue: 3,
        });
        const inc = dom(html).querySelector('button[data-action="increment"]');
        expect(inc?.getAttribute('data-max')).toBe('3');
    });
});

describe('vital-progress-bar partial', () => {
    it('renders threshold markers in order', () => {
        const html = progressBarTemplate({
            cssPrefix: 'wh40k-corruption',
            percent: 42,
            containerClass: 'wh40k-corruption-bar-container',
            fillStyleWidth: true,
            thresholds: [
                { at: 30, label: '30', title: 'TAINTED → SOILED (30)' },
                { at: 60, label: '60', title: 'SOILED → DEBASED (60)' },
                { at: 90, label: '90', title: 'DEBASED → PROFANE (90)' },
            ],
        });
        const markers = dom(html).querySelectorAll('.wh40k-threshold-marker');
        expect(markers.length).toBe(3);
        expect(markers[0].getAttribute('style')).toContain('left: 30%');
        expect(markers[2].getAttribute('title')).toBe('DEBASED → PROFANE (90)');
    });

    it('uses fill-style width when fillStyleWidth=true', () => {
        const html = progressBarTemplate({
            cssPrefix: 'wh40k-insanity',
            percent: 70,
            containerClass: 'wh40k-insanity-bar-container',
            fillStyleWidth: true,
        });
        const fill = dom(html).querySelector('.wh40k-insanity-bar-fill');
        expect(fill?.getAttribute('style')).toContain('width: 70%');
    });

    it('uses CSS-variable percent when fillStyleWidth is omitted', () => {
        const html = progressBarTemplate({
            cssPrefix: 'wh40k-wounds',
            percent: 50,
            cssVarName: 'wounds-percent',
            containerClass: 'wh40k-wounds-bar-container',
            showPercentText: 'right',
        });
        const bar = dom(html).querySelector('.wh40k-wounds-bar');
        expect(bar?.getAttribute('style')).toContain('--wounds-percent: 50%');
        expect(dom(html).querySelector('.wh40k-wounds-percent')?.textContent).toContain('50%');
    });
});

describe('vital-edit-input partial', () => {
    it('emits the schema name path verbatim and applies min/max attrs', () => {
        const html = editInputTemplate({
            name: 'system.wounds.max',
            label: 'Max Wounds',
            value: 12,
            min: '1',
            placeholder: 'Max',
        });
        const input = dom(html).querySelector('input[name="system.wounds.max"]');
        expect(input).not.toBeNull();
        expect(input?.getAttribute('value')).toBe('12');
        expect(input?.getAttribute('min')).toBe('1');
        expect(input?.getAttribute('placeholder')).toBe('Max');
        expect(input?.hasAttribute('readonly')).toBe(false);
    });

    it('renders readonly when readonly=true (used by fatigue threshold)', () => {
        const html = editInputTemplate({
            name: 'system.fatigue.max',
            label: 'Threshold',
            value: 4,
            readonly: true,
        });
        const input = dom(html).querySelector('input[name="system.fatigue.max"]');
        expect(input?.hasAttribute('readonly')).toBe(true);
    });
});

describe('vital-quick-adjust partial', () => {
    it('emits four buttons with -5/-1/+1/+5 deltas and the right field/min/max attrs', () => {
        const html = quickAdjustTemplate({
            field: 'system.corruption',
            wrapperClass: 'wh40k-corruption-quick-set tw-flex',
            maxValue: '100',
        });
        const buttons = dom(html).querySelectorAll('button[data-action="adjustStat"]');
        expect(buttons.length).toBe(4);
        const deltas = Array.from(buttons).map((b) => b.getAttribute('data-delta'));
        expect(deltas).toEqual(['-5', '-1', '1', '5']);
        expect(buttons[0].getAttribute('data-min')).toBe('0');
        expect(buttons[3].getAttribute('data-max')).toBe('100');
        Array.from(buttons).forEach((b) => expect(b.getAttribute('data-field')).toBe('system.corruption'));
    });
});

describe('vital-panel-shell partial', () => {
    it('emits the panel header with the configured key/label/icon and a chevron toggle', () => {
        // Register inner partial-block so the shell compiles in isolation.
        Handlebars.registerPartial('test-shell', shellSrc);
        const wrapped = Handlebars.compile(
            '{{#> test-shell key="wounds" label="Wounds" icon="fa-heart-broken" actor=actor rootStateClass=rootStateClass}}<div class="body">body</div>{{/test-shell}}',
        );
        const html = wrapped({ actor: { id: 'a1', flags: {} }, rootStateClass: 'wh40k-wounds-warning' });
        const root = dom(html);
        const header = root.querySelector('.wh40k-panel-header');
        expect(header?.getAttribute('data-toggle')).toBe('wounds_details');
        expect(root.querySelector('.wh40k-panel-title')?.textContent?.trim()).toContain('Wounds');
        expect(root.querySelector('.fa-heart-broken')).not.toBeNull();
        expect(root.querySelector('.wh40k-panel')?.className).toContain('wh40k-wounds-warning');
        expect(root.querySelector('.body')?.textContent).toBe('body');
        expect(root.querySelector('.wh40k-panel-chevron')).not.toBeNull();
    });

    it('renders the optional degree badge when provided', () => {
        Handlebars.registerPartial('test-shell-badge', shellSrc);
        const wrapped = Handlebars.compile(
            '{{#> test-shell-badge key="corruption" label="Corruption" icon="fa-skull" actor=actor badge=badge rootStateClass=rootStateClass}}body{{/test-shell-badge}}',
        );
        const html = wrapped({
            actor: { id: 'a1', flags: {} },
            rootStateClass: 'wh40k-degree-tainted',
            badge: { stateClass: 'wh40k-degree-tainted', icon: 'fa-certificate', label: 'TAINTED', tooltip: 'TAINTED - 0 to tests' },
        });
        const root = dom(html);
        const badge = root.querySelector('.wh40k-corruption-badge');
        expect(badge).not.toBeNull();
        expect(badge?.getAttribute('title')).toBe('TAINTED - 0 to tests');
        expect(badge?.querySelector('.fa-certificate')).not.toBeNull();
        expect(badge?.querySelector('.wh40k-badge-label')?.textContent?.trim()).toBe('TAINTED');
    });
});
