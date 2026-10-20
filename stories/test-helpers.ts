/**
 * Helpers for Storybook stories and Vitest interactive tests. Wraps the
 * existing Handlebars-based rendering pipeline (`stories/template-support.ts`)
 * with ergonomic primitives so each new story drops from ~30 lines of
 * boilerplate to ~5.
 *
 *     import templateSrc from '../src/templates/dialogs/confirmation.hbs?raw';
 *     import { renderSheet, clickAction } from '../stories/test-helpers';
 *
 *     export const Default = {
 *         render: () => renderSheet(templateSrc, { title: 'Confirm', body: '…' }),
 *     };
 *     export const Submit = {
 *         render: (args) => renderSheet(templateSrc, args),
 *         play: async ({ canvasElement }) => {
 *             clickAction(canvasElement, 'confirm');
 *         },
 *     };
 */
import HbsStory from 'handlebars';
import { renderTemplate as renderStoryTemplate } from './mocks';
import { initializeStoryHandlebars } from './template-support';

initializeStoryHandlebars();

// Story render context: Handlebars accepts arbitrary objects.
// Use `object` (not `Record<string, unknown>`) so typed Storybook `args`
// objects can flow in without `as unknown as Record<string, unknown>` casts
// at every call site.
type Context = object;

/**
 * Compile a single Handlebars template source and render it against the
 * provided context. Returns a detached HTMLElement so callers can mount it
 * wherever they need.
 */
let renderSheetCounter = 0;

export function renderSheet(templateSource: string, context: Context = {}): HTMLElement {
    // If the source contains `{{> @partial-block}}`, we need the template
    // to be invoked AS a block partial so `@partial-block` resolves to
    // empty block content (rather than throwing). Register the source as a
    // uniquely-named partial and compile a tiny wrapper that calls it via
    // `{{#> name}}{{/name}}`.
    if (templateSource.includes('@partial-block')) {
        const name = `__renderSheet_${renderSheetCounter++}`;
        HbsStory.registerPartial(name, templateSource);
        const wrapper = HbsStory.compile(`{{#> ${name}}}{{/${name}}}`);
        return syncSelectedOptions(renderStoryTemplate(wrapper, context));
    }
    const tpl = HbsStory.compile(templateSource);
    return syncSelectedOptions(renderStoryTemplate(tpl, context));
}

/**
 * Make every `<select>` under `root` select the option its markup marks
 * `selected`, and return `root`.
 *
 * A browser already does this when it parses the markup. happy-dom (the unit
 * test DOM) does not when whitespace separates the options, which is how every
 * template writes them: it counts the text nodes, so `<option selected>` in
 * third place reads back as the second option, and a story's `select.value` /
 * `assertField` checks fail there and only there. Re-applying the authored
 * `selected` attribute makes both DOMs agree; in a browser it changes nothing.
 * For a single select the last marked option wins, as in HTML parsing.
 */
export function syncSelectedOptions<T extends ParentNode>(root: T): T {
    for (const select of Array.from(root.querySelectorAll('select'))) {
        const options = Array.from(select.options);
        if (select.multiple) {
            for (const option of options) option.selected = option.hasAttribute('selected');
            continue;
        }
        const marked = options.filter((option) => option.hasAttribute('selected')).at(-1);
        if (marked !== undefined) select.selectedIndex = options.indexOf(marked);
    }
    return root;
}

/**
 * Options for {@link renderSheetParts}.
 *
 * `systemId` stamps `data-wh40k-system="<id>"` on the composed wrapper so that
 * per-system Tailwind variants (`dh2:tw-*`, `rt:tw-*`, …) — which only fire
 * when an ancestor carries the attribute — activate inside the story (CLAUDE.md
 * "Adaptation procedure 3a"). When `systemId` is supplied, a `theme-dark` class
 * is also added so foundry2.css's theme tokens cascade (matching the mock
 * `renderTemplate` shell). Override the theme name (or pass `null` to suppress
 * it) via `theme`. Callers that omit both keep the bare `wh40k-rpg sheet`
 * wrapper unchanged.
 */
export interface RenderSheetPartsOptions {
    systemId?: string;
    theme?: string | null;
}

/**
 * Compose multiple Handlebars partials into a single rendered tree, mimicking
 * what an ApplicationV2 sheet does when it concatenates its `static PARTS`.
 * Each entry contributes one template + (optionally) a per-part context that
 * extends `baseContext`. Returns the wrapper element with each part appended.
 *
 * Use this for full-sheet stories — header + tabs + body in one tree — so that
 * Tailwind cascade breaks and theme regressions surface visually. Pass
 * `options.systemId` to activate per-system variants on the composed tree.
 */
export function renderSheetParts(
    parts: Array<{ template: string; context?: Context; partClass?: string }>,
    baseContext: Context = {},
    options: RenderSheetPartsOptions = {},
): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg', 'sheet');
    if (options.systemId !== undefined) {
        wrapper.dataset['wh40kSystem'] = options.systemId;
        // Default the theme to `dark` when system theming is engaged, mirroring
        // the mock `renderTemplate` shell; `theme: null` opts out explicitly.
        const theme = options.theme === undefined ? 'dark' : options.theme;
        if (theme !== null) wrapper.classList.add(`theme-${theme}`);
    } else if (typeof options.theme === 'string') {
        wrapper.classList.add(`theme-${options.theme}`);
    }
    for (const part of parts) {
        const tpl = HbsStory.compile(part.template);
        const html = tpl({ ...baseContext, ...(part.context ?? {}) });
        const slot = document.createElement('div');
        if (part.partClass !== undefined) slot.className = part.partClass;
        slot.innerHTML = html;
        wrapper.appendChild(slot);
    }
    return syncSelectedOptions(wrapper);
}

function asParent(node: ParentNode | HTMLElement): ParentNode {
    return node;
}

/**
 * Click the element matching `[data-action="<name>"]` in `canvas`. Throws if
 * not found, so the play function reports the missing handle rather than
 * silently passing. Pair with the @testing-library `expect`/`within` from
 * `storybook/test` for assertions.
 */
export function clickAction(container: ParentNode | HTMLElement, action: string): void {
    const el = asParent(container).querySelector<HTMLElement>(`[data-action="${action}"]`);
    if (!el) throw new Error(`clickAction: no element with [data-action="${action}"] in container`);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

/** One click {@link captureActionClicks} saw: the `data-action` and the clicked element's other data attributes. */
export interface CapturedActionClick {
    action: string;
    dataset: Record<string, string | undefined>;
}

/**
 * Record every `[data-action]` click inside `container`, resolved the way
 * ApplicationV2's delegated handler resolves it (the closest `[data-action]`
 * ancestor of the event target). A story has no application to dispatch to, so
 * this is how a play asserts that a control sends the action (and data) its
 * handler expects. Returns the live list; read it after clicking.
 */
export function captureActionClicks(container: HTMLElement): CapturedActionClick[] {
    const seen: CapturedActionClick[] = [];
    container.addEventListener('click', (event) => {
        const el = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
        if (el === null) return;
        const { action, ...dataset } = el.dataset;
        seen.push({ action: action ?? '', dataset });
    });
    return seen;
}

/**
 * Lock a rendered sheet the way Foundry's `DocumentSheetV2._toggleDisabled(true)`
 * does for a document the user cannot edit (a compendium entry): every form
 * control is disabled. Pair with `enableViewOnlyControls` to reproduce what the
 * system's `_toggleDisabled` override shows a viewer (#629).
 */
export function lockSheetControls(container: ParentNode | HTMLElement): void {
    for (const control of asParent(container).querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'button, input, select, textarea',
    )) {
        control.disabled = true;
    }
}

/**
 * Fill form fields and dispatch a submit on the enclosing form. Field names
 * map to `name="..."` attributes (e.g. `system.wounds.value`). Throws if a
 * named field is not present in the canvas.
 */
export function submitForm(container: ParentNode | HTMLElement, values: Record<string, string | number | boolean>): void {
    const parent = asParent(container);
    let form: HTMLFormElement | null = null;
    for (const [name, value] of Object.entries(values)) {
        const el = parent.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${name}"]`);
        if (!el) throw new Error(`submitForm: no element with [name="${name}"] in canvas`);
        if (el instanceof HTMLInputElement && el.type === 'checkbox') {
            el.checked = Boolean(value);
        } else {
            el.value = String(value);
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        if (!form && el.form) form = el.form;
    }
    if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

/**
 * Assert that the currently active tab matches `name`. Looks for the
 * `[data-tab="<name>"]` element and checks for the `.active` class.
 */
export function assertActiveTab(container: ParentNode | HTMLElement, name: string): void {
    const el = asParent(container).querySelector<HTMLElement>(`[data-tab="${name}"]`);
    if (!el) throw new Error(`assertActiveTab: no [data-tab="${name}"] in container`);
    if (!el.classList.contains('active')) {
        throw new Error(`assertActiveTab: [data-tab="${name}"] is not .active`);
    }
}

/**
 * Show the sheet's `name` tab, as Foundry's `changeTab` does: its panel and its
 * nav button take `.active`, every other primary-group panel and button drop it.
 * Returns `root`, so a story's `render` can compose it.
 */
export function activateTab<T extends HTMLElement>(root: T, name: string): T {
    for (const el of root.querySelectorAll<HTMLElement>('[data-group="primary"][data-tab]')) {
        el.classList.toggle('active', el.dataset['tab'] === name);
    }
    return root;
}

/** One item-detail-section.hbs panel: its title key and its rendered title. */
export interface DetailSectionTitle {
    key: string;
    title: string;
}

/** The item-detail-section.hbs panels inside `tab`'s panel, in order, with their titles. */
export function detailSectionTitles(root: ParentNode, tab: string): DetailSectionTitle[] {
    return [...root.querySelectorAll<HTMLElement>(`.tab[data-tab="${tab}"] [data-item-section]`)].map((section) => ({
        key: section.dataset['itemSection'] ?? '',
        title: section.querySelector('header h3')?.textContent.trim() ?? '',
    }));
}

/**
 * Assert the value of a named form field.
 */
export function assertField(container: ParentNode | HTMLElement, name: string, expected: string | number | boolean): void {
    const el = asParent(container).querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${name}"]`);
    if (!el) throw new Error(`assertField: no [name="${name}"] in container`);
    const actual = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el.value;
    const expectedNorm = el instanceof HTMLInputElement && el.type === 'checkbox' ? Boolean(expected) : String(expected);
    if (actual !== expectedNorm) {
        throw new Error(`assertField: [name="${name}"] is ${JSON.stringify(actual)}, expected ${JSON.stringify(expectedNorm)}`);
    }
}
