import type { Page } from '@playwright/test';
import { expect } from './test';

/**
 * Guard for behavioural `data-wh40k-hook` selectors.
 *
 * A class name that exists only so a spec can find an element is not styling —
 * those hooks live on `data-wh40k-hook="<id>"` instead, which keeps the template
 * genuinely Tailwind-only (see `pnpm css:offenders`). The hazard the move
 * introduces is silence: most panel probes read through the match
 * (`el?.textContent ?? ''`, `el !== null`), so a hook that is renamed, dropped
 * from the template, or mistyped in the selector turns the probe into a
 * vacuously-green no-op instead of a failure.
 *
 * {@link countHooks} tallies the hooks the page ACTUALLY rendered and
 * {@link expectHooks} fails when an expected one is missing, so the grip a spec
 * has on the DOM is itself asserted rather than assumed.
 */

/** Tally `data-wh40k-hook` values across the whole live document. */
export async function countHooks(page: Page): Promise<Record<string, number>> {
    return page.evaluate(() => {
        const counts: Record<string, number> = {};
        for (const el of Array.from(document.querySelectorAll('[data-wh40k-hook]'))) {
            const hook = el.getAttribute('data-wh40k-hook');
            if (hook === null || hook === '') continue;
            counts[hook] = (counts[hook] ?? 0) + 1;
        }
        return counts;
    });
}

/**
 * Assert every expected hook matched at least one rendered element. Reports the
 * hooks that WERE found alongside the misses, so a rename shows up as a diff
 * rather than a bare "not found".
 */
export function expectHooks(counts: Record<string, number>, expected: readonly string[]): void {
    const missing = expected.filter((hook) => (counts[hook] ?? 0) < 1);
    const rendered = Object.keys(counts).sort().join(', ');
    expect(missing, `data-wh40k-hook selector(s) matched no element: [${missing.join(', ')}]. Rendered hooks: [${rendered}]`).toEqual([]);
}

/** Every `data-wh40k-hook` id authored in a template, read from the deployed copy Foundry serves. */
export async function fetchAuthoredHooks(page: Page, templateUrl: string): Promise<string[]> {
    return page.evaluate(async (url: string) => {
        const text = await (await fetch(url)).text();
        // Capture group 1 is non-optional in the pattern, so `m[1]` is always a string.
        return Array.from(text.matchAll(/data-wh40k-hook="([^"]+)"/g)).map((m) => m[1]);
    }, templateUrl);
}

/**
 * Assert a hook is AUTHORED in its template even though the fixture under test
 * deliberately does not render it.
 *
 * A probe that asserts absence (`expect(hasEnterButton).toBe(false)`) is vacuous
 * in the opposite direction from a presence probe: rename the hook or mistype the
 * selector and the absence assertion passes for the wrong reason. Checking the
 * template still authors that exact id is what keeps the negative meaningful.
 */
export function expectHooksAuthored(authored: readonly string[], expected: readonly string[]): void {
    const missing = expected.filter((hook) => !authored.includes(hook));
    expect(missing, `hook(s) no longer authored in the template: [${missing.join(', ')}]. Authored: [${[...authored].sort().join(', ')}]`).toEqual([]);
}
