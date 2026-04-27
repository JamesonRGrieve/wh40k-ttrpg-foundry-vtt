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
import Handlebars from 'handlebars';
import { initializeStoryHandlebars } from './template-support';
import { renderTemplate } from './mocks';

initializeStoryHandlebars();

type Context = Record<string, unknown>;

/**
 * Compile a single Handlebars template source and render it against the
 * provided context. Returns a detached HTMLElement so callers can mount it
 * wherever they need.
 */
export function renderSheet(templateSource: string, context: Context = {}): HTMLElement {
    const tpl = Handlebars.compile(templateSource);
    return renderTemplate(tpl, context);
}

/**
 * Compose multiple Handlebars partials into a single rendered tree, mimicking
 * what an ApplicationV2 sheet does when it concatenates its `static PARTS`.
 * Each entry contributes one template + (optionally) a per-part context that
 * extends `baseContext`. Returns the wrapper element with each part appended.
 *
 * Use this for full-sheet stories — header + tabs + body in one tree — so that
 * Tailwind cascade breaks and theme regressions surface visually.
 */
export function renderSheetParts(
    parts: Array<{ template: string; context?: Context; partClass?: string }>,
    baseContext: Context = {},
): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg', 'sheet');
    for (const part of parts) {
        const tpl = Handlebars.compile(part.template);
        const html = tpl({ ...baseContext, ...(part.context ?? {}) });
        const slot = document.createElement('div');
        if (part.partClass) slot.className = part.partClass;
        slot.innerHTML = html;
        wrapper.appendChild(slot);
    }
    return wrapper;
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
export function clickAction(canvas: ParentNode | HTMLElement, action: string): void {
    const el = asParent(canvas).querySelector<HTMLElement>(`[data-action="${action}"]`);
    if (!el) throw new Error(`clickAction: no element with [data-action="${action}"] in canvas`);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

/**
 * Fill form fields and dispatch a submit on the enclosing form. Field names
 * map to `name="..."` attributes (e.g. `system.wounds.value`). Throws if a
 * named field is not present in the canvas.
 */
export function submitForm(
    canvas: ParentNode | HTMLElement,
    values: Record<string, string | number | boolean>,
): void {
    const parent = asParent(canvas);
    let form: HTMLFormElement | null = null;
    for (const [name, value] of Object.entries(values)) {
        const el = parent.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
            `[name="${name}"]`,
        );
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
export function assertActiveTab(canvas: ParentNode | HTMLElement, name: string): void {
    const el = asParent(canvas).querySelector<HTMLElement>(`[data-tab="${name}"]`);
    if (!el) throw new Error(`assertActiveTab: no [data-tab="${name}"] in canvas`);
    if (!el.classList.contains('active')) {
        throw new Error(`assertActiveTab: [data-tab="${name}"] is not .active`);
    }
}

/**
 * Assert the value of a named form field.
 */
export function assertField(
    canvas: ParentNode | HTMLElement,
    name: string,
    expected: string | number | boolean,
): void {
    const el = asParent(canvas).querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        `[name="${name}"]`,
    );
    if (!el) throw new Error(`assertField: no [name="${name}"] in canvas`);
    const actual = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el.value;
    const expectedNorm = el instanceof HTMLInputElement && el.type === 'checkbox' ? Boolean(expected) : String(expected);
    if (actual !== expectedNorm) {
        throw new Error(`assertField: [name="${name}"] is ${JSON.stringify(actual)}, expected ${JSON.stringify(expectedNorm)}`);
    }
}
