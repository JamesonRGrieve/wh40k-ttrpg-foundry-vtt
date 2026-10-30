import type { Page } from '@playwright/test';

/**
 * A page probe for attack-cue captures (#594): counts the cue graphics added to the
 * canvas interface layer and freezes the frame shortly after a cue appears, so a
 * screenshot holds an animation that lasts well under a second. Freezing feeds every
 * animation frame a constant timestamp, which stops both the cue's progress and
 * PIXI's ticker on the frame already drawn; `release` lets them run again.
 *
 * Two triggers: `reset(true)` freezes after the first cue graphic drawn, and
 * `armOn(event)` freezes after the system's `wh40k-rpg.attackCuePlayed` hook reports
 * that event drawn on the canvas — for an outcome whose own cue follows others.
 */

interface CueProbeGlobals {
    canvas: { interface: { addChild: (...children: object[]) => object } };
    PIXI: { Graphics: abstract new (...a: never[]) => object };
    Hooks: { on: (hook: string, fn: (played: { event: string; renderer: string }) => void) => number };
}

interface CueProbe {
    drawn: number;
    frozen: boolean;
    release: () => void;
    reset: (freeze: boolean) => void;
    armOn: (event: string) => void;
}

declare global {
    // eslint-disable-next-line no-var -- a global installed at runtime must be declared with `var` to land on globalThis
    var wh40kCueProbe: CueProbe | undefined;
}

/** Install the probe on the page; `freezeAfterMs` is how long after its trigger the frame freezes. */
export async function installCueProbe(page: Page, freezeAfterMs: number): Promise<void> {
    await page.evaluate((delay: number) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (`canvas`, `PIXI`, `Hooks`) are injected by the licensed app; no shipped types
        const g = globalThis as unknown as CueProbeGlobals;
        const realRaf = window.requestAnimationFrame.bind(window);
        let frozenTs: number | null = null;
        let lastTs = 0;
        let armedFirst = false;
        let armedEvent: string | null = null;
        window.requestAnimationFrame = (cb: FrameRequestCallback): number =>
            realRaf((ts) => {
                lastTs = ts;
                cb(frozenTs ?? ts);
            });
        const probe: CueProbe = {
            drawn: 0,
            frozen: false,
            release: () => {
                frozenTs = null;
                probe.frozen = false;
            },
            reset: (freeze: boolean) => {
                probe.drawn = 0;
                armedFirst = freeze;
                armedEvent = null;
            },
            armOn: (event: string) => {
                armedFirst = false;
                armedEvent = event;
            },
        };
        const freezeSoon = (): void => {
            window.setTimeout(() => {
                frozenTs = lastTs;
                probe.frozen = true;
            }, delay);
        };
        const layer = g.canvas.interface;
        const addChild = layer.addChild.bind(layer);
        layer.addChild = (...children: object[]): object => {
            if (children.some((c) => c instanceof g.PIXI.Graphics)) {
                probe.drawn += 1;
                if (armedFirst && probe.drawn === 1) freezeSoon();
            }
            return addChild(...children);
        };
        g.Hooks.on('wh40k-rpg.attackCuePlayed', (played) => {
            if (armedEvent === null || played.event !== armedEvent || played.renderer !== 'canvas') return;
            armedEvent = null;
            freezeSoon();
        });
        globalThis.wh40kCueProbe = probe;
    }, freezeAfterMs);
}

/** Let the frozen frame run again. */
export async function releaseFreeze(page: Page): Promise<void> {
    await page.evaluate(() => {
        globalThis.wh40kCueProbe?.release();
    });
}

/** Freeze shortly after the next `event` cue this page draws. */
export async function armCueFreeze(page: Page, event: string): Promise<void> {
    await page.evaluate((e: string) => globalThis.wh40kCueProbe?.armOn(e), event);
}

/** Wait (up to `watchMs`) for the probe to freeze; true once it has. */
export async function awaitCueFreeze(page: Page, watchMs: number): Promise<boolean> {
    return page.evaluate(async (watch: number) => globalThis.wh40kE2E.pollUntil(() => globalThis.wh40kCueProbe?.frozen === true, watch), watchMs);
}
