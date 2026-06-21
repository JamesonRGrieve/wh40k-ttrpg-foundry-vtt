/**
 * @file Shared sheet-animation primitives (#276).
 *
 * VisualFeedbackMixin and EnhancedAnimationsMixin independently re-implemented the
 * same requestAnimationFrame counter loop (with identical ease-out-cubic timing),
 * the same flash-then-remove class toggle, and two divergent copies of the brief
 * toast notification. Those primitives live here now so both mixins share one
 * engine instead of carrying byte-near-identical copies. (VisualFeedbackMixin is
 * now a thin alias of EnhancedAnimationsMixin — see those files.)
 *
 * These are pure DOM/timing helpers — no Foundry, sheet, or content coupling.
 */

/** Ease-out cubic: fast start, smooth deceleration. `progress` in [0, 1]. */
export function easeOutCubic(progress: number): number {
    return 1 - (1 - progress) ** 3;
}

/** Options for {@link rafTween}. */
export interface RafTweenOptions {
    /** Start value. */
    from: number;
    /** End value. */
    to: number;
    /** Duration in milliseconds. */
    duration: number;
    /** Called every frame with the eased current value (and once at the end with `to`). */
    onFrame: (value: number) => void;
    /** Called once after the final frame. */
    onComplete?: () => void;
    /** Called with each scheduled rAF id (for cancellation bookkeeping). */
    onSchedule?: (frameId: number) => void;
}

/**
 * Tween a numeric value from `from` to `to` over `duration` ms using ease-out-cubic,
 * driving `onFrame` each animation frame. The final frame is emitted with the exact
 * `to` value via easing, then `onComplete` runs. `onSchedule` receives each rAF id
 * scheduled for a *subsequent* frame so callers can cancel an in-flight tween.
 */
export function rafTween(options: RafTweenOptions): void {
    const { from, to, duration, onFrame, onComplete, onSchedule } = options;
    const start = Date.now();
    const difference = to - from;

    const step = (): void => {
        const elapsed = Date.now() - start;
        const progress = Math.min(elapsed / duration, 1);
        onFrame(from + difference * easeOutCubic(progress));

        if (progress < 1) {
            const frameId = requestAnimationFrame(step);
            onSchedule?.(frameId);
        } else {
            onComplete?.();
        }
    };

    requestAnimationFrame(step);
}

/**
 * Flash an element by (re-)applying a CSS animation class. Clears `clearClasses`
 * first (default: just `animClass`), forces a reflow so re-adding restarts the
 * animation, then removes `animClass` after `duration` ms.
 */
export function flashElement(element: HTMLElement, animClass: string, duration = 500, clearClasses?: readonly string[]): void {
    element.classList.remove(...(clearClasses ?? [animClass]));
    void element.offsetWidth; // force reflow so the animation restarts on re-add
    element.classList.add(animClass);
    setTimeout(() => {
        element.classList.remove(animClass);
    }, duration);
}

/** Placement strategy for {@link showBriefNotification}. */
export type BriefNotificationPosition =
    /** `position: absolute`, centred horizontally above the anchor (page-scroll-aware). */
    | 'above'
    /** `position: fixed`, just to the right of the anchor (viewport-anchored). */
    | 'right';

/** Options for {@link showBriefNotification}. */
export interface ShowBriefNotificationOptions {
    /** Where to place the toast relative to the anchor element. Default `'above'`. */
    position?: BriefNotificationPosition;
}

/** How long (ms) the toast stays fully visible before it fades out. */
const BRIEF_NOTIFICATION_VISIBLE_MS: Record<BriefNotificationPosition, number> = {
    above: 2000,
    right: 1500,
};

/** Duration (ms) of the enter/leave opacity+transform transition. */
const BRIEF_NOTIFICATION_TRANSITION_MS = 200;

/** Shared base styling for the toast, independent of placement. */
const BRIEF_NOTIFICATION_BASE_CSS = [
    'color: white',
    'padding: 4px 8px',
    'border-radius: 4px',
    'font-size: 0.85em',
    'pointer-events: none',
    'z-index: 10000',
    'white-space: nowrap',
    'background: rgba(0, 0, 0, 0.9)',
    'box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3)',
].join('; ');

/**
 * Spawn a short-lived toast notification anchored to `element`, fade it in, then
 * fade and remove it. `position` selects the placement strategy that previously
 * diverged between the two animation mixins: `'above'` (absolute, centred above
 * the anchor) or `'right'` (fixed, to the right of the anchor).
 *
 * Pure DOM/timing helper — appends to `document.body` and self-cleans; no Foundry
 * or sheet coupling.
 */
export function showBriefNotification(element: HTMLElement, message: string, type = 'info', options: ShowBriefNotificationOptions = {}): void {
    const position = options.position ?? 'above';
    const rect = element.getBoundingClientRect();

    const toast = document.createElement('div');
    toast.className = `brief-notification brief-notification-${type}`;
    toast.textContent = message;

    const placement =
        position === 'right'
            ? [`position: fixed`, `left: ${rect.right + 10}px`, `top: ${rect.top}px`, `transform: translateX(-10px)`]
            : [`position: absolute`, `left: ${rect.left + rect.width / 2}px`, `top: ${rect.top - 30}px`, `transform: translateX(-50%)`];

    toast.style.cssText = [
        BRIEF_NOTIFICATION_BASE_CSS,
        ...placement,
        'opacity: 0',
        `transition: opacity ${BRIEF_NOTIFICATION_TRANSITION_MS}ms ease, transform ${BRIEF_NOTIFICATION_TRANSITION_MS}ms ease`,
    ].join('; ');

    document.body.appendChild(toast);

    const enterTransform = position === 'right' ? 'translateX(0)' : 'translateX(-50%) translateY(-5px)';
    const exitTransform = position === 'right' ? 'translateX(10px)' : 'translateX(-50%) translateY(-10px)';

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = enterTransform;
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = exitTransform;
        setTimeout(() => toast.remove(), BRIEF_NOTIFICATION_TRANSITION_MS);
    }, BRIEF_NOTIFICATION_VISIBLE_MS[position]);
}
