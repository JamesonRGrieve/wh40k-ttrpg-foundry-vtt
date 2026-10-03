import type { ConsoleMessage } from '@playwright/test';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Regression guard: an actor sheet must render its BODY, not just its header.
 *
 * A sheet can fail in a way no other Tier B check sees: `render()` resolves, no
 * uncaught error fires, and the window opens — showing only the portrait + name
 * header. `actor-types.spec.ts` only asserts "render resolved + no pageerror", so
 * it passes on exactly that broken sheet. (It happened when a runtime module
 * imported an npm package the browser could not resolve: the system never
 * initialised and every document fell back to Foundry's default sheet.) This spec
 * asserts the visible outcome instead — a visible, non-empty active tab — and
 * attaches every console message from the join onward, since a failure here is
 * often logged only as a module-resolution error at boot, or not at all.
 */

interface SheetProbe {
    activeTabVisible: boolean;
    activeTabText: number;
    error: string | null;
}

/** The browser-side Actor API slice this probe drives. */
interface ProbeSheet {
    render: (force: boolean) => Promise<object>;
    element: HTMLElement;
    close: () => Promise<object>;
}
interface ProbeActor {
    sheet: ProbeSheet;
    delete: () => Promise<object>;
}
interface ProbeGlobal {
    Actor: { create: (data: object) => Promise<ProbeActor | null> };
}

/** How long (base, scaled) a rendered sheet is given to settle into a visible body before it is measured. */
const SETTLE_MS = 1500;

/** Characters of text the active tab must exceed to count as rendered content. */
const MIN_ACTIVE_TAB_TEXT = 20;

const TYPES = ['dh2-npc', 'dh2-character', 'dh2-terracraft'] as const;

for (const type of TYPES) {
    test(`${type} sheet renders a visible body, not just its header`, async ({ page }, testInfo) => {
        // Listen BEFORE joining: a client boot that never reaches `game.ready`
        // (so the join skips) must still leave its console output in the report.
        const messages: string[] = [];
        page.on('console', (msg: ConsoleMessage) => messages.push(`[${msg.type()}] ${msg.text()}`));
        page.on('pageerror', (err: Error) => messages.push(`[pageerror] ${err.message}\n${err.stack ?? ''}`));
        try {
            await joinOrSkip(page);
        } finally {
            // Take the join's messages out in one step, before the await, so the
            // render phase's attachment below holds only its own output.
            const joinOutput = messages.splice(0).join('\n');
            await testInfo.attach('console-join', { body: joinOutput || '(no console output)', contentType: 'text/plain' });
        }

        const probe = await page.evaluate(
            async ({ actorType, settleMs, minText }): Promise<SheetProbe> => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's browser-side Actor global is runtime-only, with no shipped types
                const g = globalThis as unknown as ProbeGlobal;
                let actor: ProbeActor | null;
                try {
                    actor = await g.Actor.create({ name: `body-probe-${actorType}`, type: actorType });
                } catch (err) {
                    return { activeTabVisible: false, activeTabText: 0, error: `create: ${err instanceof Error ? err.message : String(err)}` };
                }
                if (actor === null) return { activeTabVisible: false, activeTabText: 0, error: 'Actor.create returned null' };
                try {
                    await actor.sheet.render(true);
                    const sheetEl = actor.sheet.element;
                    const measure = (): { activeTabVisible: boolean; activeTabText: number } => {
                        const content = sheetEl.querySelector('.window-content') ?? sheetEl;
                        const active = content.querySelector('.tab.active');
                        const box = active?.getBoundingClientRect();
                        const visible =
                            active !== null && box !== undefined && box.width > 0 && box.height > 0 && getComputedStyle(active).visibility !== 'hidden';
                        return { activeTabVisible: visible, activeTabText: (active?.textContent ?? '').trim().length };
                    };
                    // Wait (up to the settle budget) for a visible, non-empty active tab; the assertions report a miss.
                    await globalThis.wh40kE2E.pollUntil(() => {
                        const m = measure();
                        return m.activeTabVisible && m.activeTabText > minText;
                    }, settleMs);
                    return { ...measure(), error: null };
                } finally {
                    await actor.sheet.close();
                    await actor.delete();
                }
            },
            { actorType: type, settleMs: scaledMs(SETTLE_MS), minText: MIN_ACTIVE_TAB_TEXT },
        );

        await testInfo.attach('console-render', { body: messages.join('\n') || '(no console output)', contentType: 'text/plain' });
        await testInfo.attach('probe', { body: JSON.stringify(probe, null, 2), contentType: 'application/json' });

        expect(probe.error).toBeNull();
        expect(probe.activeTabVisible, 'the active tab must be visible').toBe(true);
        expect(probe.activeTabText, 'the active tab must have content').toBeGreaterThan(MIN_ACTIVE_TAB_TEXT);
    });
}
