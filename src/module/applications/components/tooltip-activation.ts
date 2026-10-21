/**
 * @file Opening rich tooltips on hover and keyboard focus (#692).
 *
 * The rich tooltip (`TooltipsWH40K`) fills Foundry's `#tooltip` once Foundry's
 * TooltipManager has activated on an element. Foundry activates on hover only for
 * an element carrying `data-tooltip` (or `-text` / `-html`), and never on focus,
 * so an element marked only with `data-wh40k-tooltip` opened nothing. This module
 * is the one place that opens them: on hover it activates the manager for any
 * rich-tooltip element Foundry does not already serve, on focus for every one,
 * and it makes each rich-tooltip element in rendered content reachable by Tab.
 */

/** An element that opens a rich tooltip: its type and its payload, on the same element. */
const RICH_TOOLTIP_SELECTOR = '[data-wh40k-tooltip][data-wh40k-tooltip-data]';

/** Elements the browser already puts in the Tab order. */
const NATIVELY_FOCUSABLE = 'a[href], button, input, select, textarea, summary, [contenteditable="true"]';

/** Foundry's hover delay before a tooltip opens, used when the manager does not declare one. */
const DEFAULT_ACTIVATION_MS = 500;

/** The slice of Foundry's TooltipManager this module drives. */
export interface ActivatableTooltipManager {
    element: HTMLElement | null;
    activate: (element: HTMLElement, options: { text: string }) => void;
    deactivate: () => void;
}

/** The rich-tooltip element an event landed on, or null. */
function richTooltipElement(target: EventTarget | null): HTMLElement | null {
    return target instanceof HTMLElement && target.matches(RICH_TOOLTIP_SELECTOR) ? target : null;
}

/** Whether Foundry's own hover handler opens this element's tooltip (it carries a `data-tooltip*` attribute). */
function foundryOpensOnHover(element: HTMLElement): boolean {
    const { tooltip, tooltipText, tooltipHtml } = element.dataset;
    return tooltipText !== undefined || tooltipHtml !== undefined || (tooltip !== undefined && (tooltip !== '' || element.ariaLabel !== null));
}

/** Open the manager on a rich-tooltip element; its own text is the fallback while the rich content builds. */
function open(manager: ActivatableTooltipManager, element: HTMLElement): void {
    manager.activate(element, { text: element.textContent.trim() || (element.dataset['wh40kTooltip'] ?? '') });
}

/**
 * Open rich tooltips on hover and focus under `root`.
 * @param root     The document whose body receives the listeners.
 * @param manager  Resolves Foundry's TooltipManager (read lazily: `game.tooltip`).
 * @param delayMs  The hover delay before a tooltip opens.
 * @returns A function that removes the listeners.
 */
export function activateRichTooltips(root: Document, manager: () => ActivatableTooltipManager, delayMs = DEFAULT_ACTIVATION_MS): () => void {
    let pending: HTMLElement | null = null;
    let timer: number | null = null;
    const cancel = (): void => {
        if (timer !== null) window.clearTimeout(timer);
        timer = null;
        pending = null;
    };

    const onPointerEnter = (event: Event): void => {
        const element = richTooltipElement(event.target);
        if (element === null || foundryOpensOnHover(element)) return;
        cancel();
        pending = element;
        timer = window.setTimeout(() => {
            timer = null;
            if (pending === element && element.isConnected) open(manager(), element);
            pending = null;
        }, delayMs);
    };
    const onPointerLeave = (event: Event): void => {
        if (event.target === pending) cancel();
    };
    const onFocusIn = (event: Event): void => {
        const element = richTooltipElement(event.target);
        if (element !== null) open(manager(), element);
    };
    const onFocusOut = (event: Event): void => {
        const current = manager();
        if (event.target instanceof HTMLElement && current.element === event.target) current.deactivate();
    };

    const { body } = root;
    body.addEventListener('pointerenter', onPointerEnter, { capture: true, passive: true });
    body.addEventListener('pointerleave', onPointerLeave, { capture: true, passive: true });
    body.addEventListener('focusin', onFocusIn);
    body.addEventListener('focusout', onFocusOut);
    return () => {
        cancel();
        body.removeEventListener('pointerenter', onPointerEnter, { capture: true });
        body.removeEventListener('pointerleave', onPointerLeave, { capture: true });
        body.removeEventListener('focusin', onFocusIn);
        body.removeEventListener('focusout', onFocusOut);
    };
}

/** Put every rich-tooltip element under `root` in the Tab order, unless it already is or opts out with its own `tabindex`. */
export function makeRichTooltipsFocusable(root: ParentNode): void {
    for (const element of root.querySelectorAll<HTMLElement>(RICH_TOOLTIP_SELECTOR)) {
        if (element.hasAttribute('tabindex') || element.matches(NATIVELY_FOCUSABLE)) continue;
        element.tabIndex = 0;
    }
}
