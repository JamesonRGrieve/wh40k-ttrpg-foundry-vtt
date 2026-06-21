import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { easeOutCubic, flashElement, rafTween, showBriefNotification } from './animation-utils.ts';

describe('easeOutCubic', () => {
    it('maps the unit interval with ease-out shape', () => {
        expect(easeOutCubic(0)).toBe(0);
        expect(easeOutCubic(1)).toBe(1);
        expect(easeOutCubic(0.5)).toBeCloseTo(0.875); // 1 - 0.5^3
    });
});

describe('rafTween', () => {
    let queue: FrameRequestCallback[];
    let now: number;

    beforeEach(() => {
        queue = [];
        now = 1000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            queue.push(cb);
            return queue.length;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    /** Drain the rAF queue one frame at a time at the supplied timestamps. */
    function drive(timestamps: number[]): void {
        for (const t of timestamps) {
            now = t;
            const cb = queue.shift();
            cb?.(t);
        }
    }

    it('emits eased frames and a final onComplete at the exact end value', () => {
        const emitted: number[] = [];
        let completed = false;
        rafTween({ from: 0, to: 100, duration: 100, onFrame: (v) => emitted.push(v), onComplete: () => (completed = true) });

        drive([1000, 1050, 1100]); // progress 0, 0.5, 1

        expect(emitted[0]).toBe(0); // eased(0) = 0
        expect(emitted[1]).toBeCloseTo(87.5); // 100 * (1 - 0.5^3)
        expect(emitted.at(-1)).toBe(100); // eased(1) = 1 → exact end
        expect(completed).toBe(true);
    });

    it('reports each scheduled frame id via onSchedule (for cancellation)', () => {
        const scheduled: number[] = [];
        rafTween({ from: 0, to: 10, duration: 100, onFrame: () => {}, onSchedule: (id) => scheduled.push(id) });

        drive([1000, 1050, 1100]);

        // The initial frame is not reported; subsequent (progress < 1) frames are.
        expect(scheduled.length).toBeGreaterThan(0);
    });
});

describe('flashElement', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('adds the animation class and removes it after the duration', () => {
        const el = document.createElement('div');
        flashElement(el, 'tw-animate-flash-update', 300);
        expect(el.classList.contains('tw-animate-flash-update')).toBe(true);

        vi.advanceTimersByTime(300);
        expect(el.classList.contains('tw-animate-flash-update')).toBe(false);
    });

    it('clears the supplied class set before applying (so a different prior animation is cleared)', () => {
        const el = document.createElement('div');
        el.classList.add('tw-animate-stat-decrease');
        flashElement(el, 'tw-animate-stat-increase', 300, ['tw-animate-stat-increase', 'tw-animate-stat-decrease']);
        expect(el.classList.contains('tw-animate-stat-decrease')).toBe(false);
        expect(el.classList.contains('tw-animate-stat-increase')).toBe(true);
    });
});

describe('showBriefNotification', () => {
    let rafQueue: FrameRequestCallback[];

    beforeEach(() => {
        rafQueue = [];
        vi.useFakeTimers();
        // happy-dom's rAF is not driven by fake timers; capture and drive it manually.
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            rafQueue.push(cb);
            return rafQueue.length;
        });
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    /** Run every queued requestAnimationFrame callback once. */
    function flushRaf(): void {
        const callbacks = rafQueue.splice(0, rafQueue.length);
        for (const cb of callbacks) cb(0);
    }

    it('appends a toast carrying the message + type class, then removes it after the lifecycle', () => {
        const anchor = document.createElement('div');
        document.body.appendChild(anchor);

        showBriefNotification(anchor, 'saved', 'success');

        const toast = document.querySelector('.brief-notification');
        expect(toast).not.toBeNull();
        expect(toast?.textContent).toBe('saved');
        expect(toast?.classList.contains('brief-notification-success')).toBe(true);

        // Enter transition (rAF) raises opacity.
        flushRaf();
        expect((toast as HTMLElement).style.opacity).toBe('1');

        // After the visible window + the leave transition, the toast is gone.
        vi.advanceTimersByTime(2000); // visible window for the default 'above' placement
        vi.advanceTimersByTime(200); // leave transition before .remove()
        expect(document.querySelector('.brief-notification')).toBeNull();
    });

    it("defaults to 'above' placement (absolute, centred) and applies 'right' (fixed) when requested", () => {
        const anchor = document.createElement('div');
        document.body.appendChild(anchor);

        showBriefNotification(anchor, 'a', 'info');
        const above = document.querySelector<HTMLElement>('.brief-notification');
        expect(above?.style.position).toBe('absolute');
        expect(above?.style.transform).toContain('translateX(-50%)');
        above?.remove();

        showBriefNotification(anchor, 'b', 'info', { position: 'right' });
        const right = document.querySelector<HTMLElement>('.brief-notification');
        expect(right?.style.position).toBe('fixed');
    });

    it("removes the 'right'-placed toast after its shorter visible window", () => {
        const anchor = document.createElement('div');
        document.body.appendChild(anchor);

        showBriefNotification(anchor, 'x', 'warning', { position: 'right' });
        expect(document.querySelector('.brief-notification')).not.toBeNull();

        vi.advanceTimersByTime(1500); // 'right' visible window
        vi.advanceTimersByTime(200); // leave transition
        expect(document.querySelector('.brief-notification')).toBeNull();
    });
});
