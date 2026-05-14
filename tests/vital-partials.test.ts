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
import infoCardSrc from '../src/templates/actor/partial/vital-info-card.hbs?raw';
import editBodySrc from '../src/templates/actor/partial/vital-edit-body.hbs?raw';

initializeStoryHandlebars();
let isExpandedReturn = false;
Handlebars.registerHelper('isExpanded', () => isExpandedReturn);
// `hideIfNot` is provided by initializeStoryHandlebars() in production; for
// testing we mirror Foundry's behaviour: returns 'style="display:none"' when
// the value is falsy, else an empty string. Some setups already register it;
// guard against double-registration.
if (!Handlebars.helpers.hideIfNot) {
    Handlebars.registerHelper('hideIfNot', (cond: unknown) => (cond ? '' : new Handlebars.SafeString('style="display:none;"')));
}

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

    it('renders readonly when readonly=true (display-only fields)', () => {
        const html = editInputTemplate({
            name: 'system.derived.example',
            label: 'Derived',
            value: 4,
            readonly: true,
        });
        const input = dom(html).querySelector('input[name="system.derived.example"]');
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

describe('vital-info-card partial', () => {
    it('renders icon, title and a body slot via partial-block (warn accent default)', () => {
        Handlebars.registerPartial('test-info-card', infoCardSrc);
        const wrapped = Handlebars.compile(
            '{{#> test-info-card icon="fa-book" title="Fatigue Rules"}}<p class="rule">Any fatigue: -10 penalty.</p>{{/test-info-card}}',
        );
        const html = wrapped({});
        const root = dom(html);
        // Icon mounts with the requested FA class, gold tint by default.
        const icon = root.querySelector('i.fa-book');
        expect(icon).not.toBeNull();
        expect(icon?.className).toContain('tw-text-gold');
        // Title text appears in a strong element.
        const strong = root.querySelector('strong');
        expect(strong?.textContent?.trim()).toBe('Fatigue Rules');
        // Body slot is forwarded into the card.
        expect(root.querySelector('p.rule')?.textContent).toContain('Any fatigue: -10 penalty.');
    });

    it('switches accent classes for "gold" variant (fate)', () => {
        Handlebars.registerPartial('test-info-card-gold', infoCardSrc);
        const wrapped = Handlebars.compile(
            '{{#> test-info-card-gold icon="fa-book-open" title="About Fate" accent="gold"}}<p>fate body</p>{{/test-info-card-gold}}',
        );
        const root = dom(wrapped({}));
        const inner = root.querySelector('div.tw-rounded-lg > div');
        expect(inner?.className).toContain('tw-border-l-[color:var(--wh40k-fate-border)]');
        expect(inner?.className).toContain('tw-bg-[rgba(0,0,0,0.1)]');
    });

    it('switches accent classes and icon tint for "crimson" variant', () => {
        Handlebars.registerPartial('test-info-card-crimson', infoCardSrc);
        const wrapped = Handlebars.compile(
            '{{#> test-info-card-crimson icon="fa-skull" title="Critical" accent="crimson"}}<p>danger</p>{{/test-info-card-crimson}}',
        );
        const root = dom(wrapped({}));
        const icon = root.querySelector('i.fa-skull');
        expect(icon?.className).toContain('tw-text-crimson');
        const inner = root.querySelector('div.tw-rounded-lg > div');
        expect(inner?.className).toContain('tw-bg-[var(--wh40k-wounds-bg)]');
    });

    it('applies optional wrapperClass / iconClass / innerClass extra utilities', () => {
        Handlebars.registerPartial('test-info-card-extra', infoCardSrc);
        const wrapped = Handlebars.compile(
            '{{#> test-info-card-extra icon="fa-book" title="T" wrapperClass="tw-mt-4" iconClass="tw-text-xl" innerClass="my-extra"}}body{{/test-info-card-extra}}',
        );
        const root = dom(wrapped({}));
        const outer = root.querySelector('div.tw-rounded-lg');
        expect(outer?.className).toContain('tw-mt-4');
        const inner = root.querySelector('.my-extra');
        expect(inner).not.toBeNull();
        const icon = root.querySelector('i.fa-book');
        expect(icon?.className).toContain('tw-text-xl');
    });

    it('does not crash when the body slot is omitted', () => {
        Handlebars.registerPartial('test-info-card-empty', infoCardSrc);
        const wrapped = Handlebars.compile('{{#> test-info-card-empty icon="fa-book" title="T"}}{{/test-info-card-empty}}');
        // Should compile and render without throwing.
        expect(() => wrapped({})).not.toThrow();
        const root = dom(wrapped({}));
        expect(root.querySelector('strong')?.textContent?.trim()).toBe('T');
    });
});

describe('vital-edit-body partial', () => {
    // The body partial nests vital-edit-input, so we register both under their
    // canonical full paths so the {{> systems/.../vital-edit-input}} reference
    // resolves at compile time.
    Handlebars.registerPartial('systems/wh40k-rpg/templates/actor/partial/vital-edit-input', editInputSrc);
    Handlebars.registerPartial('test-edit-body', editBodySrc);

    function renderEditBody(ctx: Record<string, unknown>, body = '<p class="extras">extras</p>'): HTMLElement {
        const wrapped = Handlebars.compile(
            `{{#> test-edit-body key=key actor=actor fields=fields editIcon=editIcon editTitle=editTitle wrapperClass=wrapperClass}}${body}{{/test-edit-body}}`,
        );
        return dom(wrapped(ctx));
    }

    it('renders the wrapper gated by isExpanded(<key>_details)', () => {
        isExpandedReturn = false;
        const collapsed = renderEditBody({
            key: 'wounds',
            actor: { id: 'a1', flags: {} },
            fields: [{ name: 'system.wounds.max', label: 'Max Wounds', value: 12 }],
        });
        // hideIfNot returns the style attr when collapsed.
        const wrapper = collapsed.firstElementChild as HTMLElement;
        expect(wrapper.getAttribute('style')).toContain('display:none');

        isExpandedReturn = true;
        const expanded = renderEditBody({
            key: 'wounds',
            actor: { id: 'a1', flags: {} },
            fields: [{ name: 'system.wounds.max', label: 'Max Wounds', value: 12 }],
        });
        expect((expanded.firstElementChild as HTMLElement).getAttribute('style') ?? '').not.toContain('display:none');
    });

    it('emits one vital-edit-input per `fields` entry with the schema name path verbatim', () => {
        isExpandedReturn = true;
        const root = renderEditBody({
            key: 'fate',
            actor: { id: 'a1', flags: {} },
            editTitle: 'Edit Fate Points',
            fields: [
                { name: 'system.fate.max', label: 'Max Fate Points', value: 3, min: '0', max: '10', placeholder: 'Max' },
                { name: 'system.fate.value', label: 'Current Fate', value: 1, min: '0', max: 3, placeholder: 'Current' },
            ],
        });
        const inputs = root.querySelectorAll('input[type="number"]');
        expect(inputs.length).toBe(2);
        expect(inputs[0].getAttribute('name')).toBe('system.fate.max');
        expect(inputs[0].getAttribute('value')).toBe('3');
        expect(inputs[1].getAttribute('name')).toBe('system.fate.value');
        expect(inputs[1].getAttribute('max')).toBe('3');
    });

    it('renders the optional editIcon + editTitle heading when editTitle is set', () => {
        isExpandedReturn = true;
        const root = renderEditBody({
            key: 'fatigue',
            actor: { id: 'a1', flags: {} },
            editIcon: 'fa-cog',
            editTitle: 'Edit Values',
            fields: [{ name: 'system.fatigue.value', label: 'Current Fatigue', value: 0 }],
        });
        const heading = root.querySelector('div.tw-rounded-lg > div.tw-flex');
        expect(heading?.textContent).toContain('Edit Values');
        expect(heading?.querySelector('i.fa-cog')).not.toBeNull();
    });

    it('omits the heading row when editTitle is not set (experience panel)', () => {
        isExpandedReturn = true;
        const root = renderEditBody({
            key: 'experience',
            actor: { id: 'a1', flags: {} },
            fields: [{ name: 'system.experience.total', label: 'Total XP Earned', value: 100 }],
        });
        // No heading => first child of the edit card is the grid wrapper.
        const card = root.querySelector('div.tw-rounded-lg');
        const firstInner = card?.firstElementChild as HTMLElement | null;
        // Either there's no fa-cog icon at all, or the first child is the grid (no heading row).
        expect(card?.querySelector('i.fa-cog')).toBeNull();
        expect(firstInner?.className ?? '').toContain('tw-grid');
    });

    it('renders the partial-block body slot AFTER the edit card (used by wounds extras)', () => {
        isExpandedReturn = true;
        const root = renderEditBody(
            {
                key: 'wounds',
                actor: { id: 'a1', flags: {} },
                editTitle: 'Edit Wounds',
                fields: [{ name: 'system.wounds.max', label: 'Max Wounds', value: 12 }],
            },
            '<div class="critical-extra">CRIT</div><div class="injuries-extra">INJ</div>',
        );
        const wrapper = root.firstElementChild as HTMLElement;
        const children = Array.from(wrapper.children);
        // First child = edit card; subsequent children = partial-block payload.
        expect(children[0].className).toContain('tw-rounded-lg');
        expect(wrapper.querySelector('.critical-extra')).not.toBeNull();
        expect(wrapper.querySelector('.injuries-extra')).not.toBeNull();
        // Body slot renders below the edit card in DOM order.
        const editIdx = children.findIndex((c) => c.className.includes('tw-rounded-lg'));
        const critIdx = children.findIndex((c) => c.classList.contains('critical-extra'));
        expect(critIdx).toBeGreaterThan(editIdx);
    });

    it('appends optional wrapperClass utilities to the outer wrapper', () => {
        isExpandedReturn = true;
        const root = renderEditBody({
            key: 'experience',
            actor: { id: 'a1', flags: {} },
            wrapperClass: 'experience_details tw-extra',
            fields: [{ name: 'system.experience.total', label: 'Total XP', value: 100 }],
        });
        const wrapper = root.firstElementChild as HTMLElement;
        expect(wrapper.className).toContain('experience_details');
        expect(wrapper.className).toContain('tw-extra');
    });
});
