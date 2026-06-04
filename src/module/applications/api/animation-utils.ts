/**
 * @file Shared sheet-animation primitives (#276).
 *
 * VisualFeedbackMixin and EnhancedAnimationsMixin independently re-implemented the
 * same requestAnimationFrame counter loop (with identical ease-out-cubic timing)
 * and the same flash-then-remove class toggle. Those primitives live here now so
 * both mixins (which keep their distinct public APIs) share one engine instead of
 * carrying byte-near-identical copies.
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
