import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Responsive Statistics columns (#267) — Tier B e2e.
 *
 * This issue reopened TWICE on "visually unverified" floor tweaks. Rather than
 * eyeball a PNG, this spec MEASURES the real reflow: it opens a dh2-character's
 * Statistics tab, resizes the sheet to three widths, and reads the resolved
 * `grid-template-columns` track count off the skills grid at each — asserting the
 * auto-fit grid genuinely steps 3 → 2 → 1 as the panel narrows, and that the
 * skill-row icon keeps its fixed 16px width (never squished) at every width, which
 * is the specific regression the `shrink-0` fix addressed. Screenshots are captured
 * at each width as the visual record.
 *
 * The measurement is screenshot-independent (computed style), so it passes/fails
 * deterministically in the licensed CI lane; the PNGs are for human review.
 */

interface WidthProbe {
    width: number;
    columns: number;
    iconWidth: number;
    skillRows: number;
    /** The grid container's rendered width — ~0 means the Statistics tab is hidden. */
    gridWidth: number;
}
interface ResponsiveResult {
    setupOk: boolean;
    gridFound: boolean;
    probes: WidthProbe[];
    error: string | null;
}

// Sheet widths chosen around the 20rem (320px) per-column floor. The sheet chrome
// eats ~290px, so the grid CONTAINER is ~sheet−290: 1200→~910 (2–3 tracks),
// 860→~570 (2 tracks), 520→~230 (1 track). All ≤ 1200 so the sheet, anchored at
// left:20 in the 1440px viewport, is never width-clamped. Wide/narrow endpoints +
// monotonicity are what the assertions pin — the exact wide count depends on chrome.
const WIDTHS = [1200, 860, 520] as const;

test('statistics skills grid reflows 3 → 2 → 1 columns by panel width (#267)', async ({ page }) => {
    await joinOrSkip(page, 'no Gamemaster user available in this test world');

    const result = await page.evaluate(
        async (widths: readonly number[]): Promise<ResponsiveResult> => {
            interface ActorSheet {
                render: (force?: boolean) => Promise<void>;
                changeTab?: (tab: string, group: string) => void;
                setPosition?: (position: { width?: number; height?: number; left?: number; top?: number }) => void;
                element?: HTMLElement | { querySelector?: (sel: string) => HTMLElement | null; querySelectorAll?: (sel: string) => NodeListOf<HTMLElement> };
            }
            interface ActorDoc {
                sheet: ActorSheet;
            }
            interface ActorCtorShape {
                create?: (data: object) => Promise<ActorDoc | null>;
            }
            interface FoundryGlobal {
                Actor?: ActorCtorShape;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime global (Actor), no browser type surface
            const g = globalThis as unknown as FoundryGlobal;
            const ActorCls = g.Actor;
            if (ActorCls?.create == null) return { setupOk: false, gridFound: false, probes: [], error: 'Actor.create unavailable' };

            let actor: ActorDoc | null;
            try {
                actor = await ActorCls.create({
                    name: 'statistics-responsive-probe',
                    type: 'dh2-character',
                    // A fresh dh2-character already renders the full standard skill list
                    // (trained + untrained), so the grid has ~20 rows to lay out.
                    system: { gameSystem: 'dh2' },
                });
            } catch (err) {
                return { setupOk: false, gridFound: false, probes: [], error: err instanceof Error ? err.message : String(err) };
            }
            if (actor == null) return { setupOk: false, gridFound: false, probes: [], error: 'Actor.create returned null' };

            await actor.sheet.render(true);
            await new Promise<void>((r) => {
                setTimeout(r, 300);
            });
            actor.sheet.changeTab?.('skills', 'primary');
            await new Promise<void>((r) => {
                setTimeout(r, 250);
            });

            const rootEl = actor.sheet.element as HTMLElement | undefined;
            if (rootEl?.querySelector('[data-testid="skills-responsive-grid"]') == null) {
                return { setupOk: true, gridFound: false, probes: [], error: 'skills-responsive-grid not found' };
            }

            // eslint-disable-next-line @typescript-eslint/promise-function-async -- canonical promisified setTimeout; there is nothing to await
            const sleep = (ms: number): Promise<void> =>
                new Promise<void>((r) => {
                    setTimeout(r, ms);
                });

            // `setPosition` re-renders the sheet, which DETACHES the old grid node —
            // holding a reference across resizes measures a stale element (width 0
            // forever). So RE-QUERY the live grid every time, and re-activate the
            // Statistics tab (a resize reverts it to Overview, hiding the grid) until it
            // is genuinely laid out (width > 0), polling so fixed delays can't race.
            const liveGrid = (): HTMLElement | null => rootEl.querySelector('[data-testid="skills-responsive-grid"]') ?? null;
            const waitForLaidOutGrid = async (): Promise<HTMLElement | null> => {
                for (let attempt = 0; attempt < 15; attempt += 1) {
                    actor.sheet.changeTab?.('skills', 'primary');
                    const tabControl = rootEl.querySelector('[data-tab="skills"][data-group="primary"], nav [data-tab="skills"]') ?? null;
                    if (tabControl instanceof HTMLElement) tabControl.click();
                    // eslint-disable-next-line no-await-in-loop -- poll loop: settle then re-check the LIVE node
                    await sleep(150);
                    const g2 = liveGrid();
                    if (g2 !== null && g2.getBoundingClientRect().width > 1 && g2.offsetParent !== null) return g2;
                }
                return liveGrid();
            };

            const probes: WidthProbe[] = [];
            for (const width of widths) {
                // Anchor top-left so the (up to 1200px) sheet stays fully inside the
                // 1440px viewport — otherwise Foundry clamps the width and the measured
                // container shrinks unpredictably.
                actor.sheet.setPosition?.({ left: 20, top: 20, width, height: 820 });
                // eslint-disable-next-line no-await-in-loop -- sequential resize→settle→re-activate→measure per width
                await sleep(200);
                // eslint-disable-next-line no-await-in-loop -- sequential per width (see above)
                const grid = await waitForLaidOutGrid();
                const tracks = grid !== null ? getComputedStyle(grid).gridTemplateColumns : 'none';
                // Resolved value is space-separated px tracks ("540px 540px"); count them.
                const columns = tracks === 'none' || tracks.trim() === '' ? 0 : tracks.trim().split(/\s+/).length;
                const icon = grid?.querySelector('[data-testid="skill-icon"]') ?? null;
                const iconWidth = icon !== null ? Math.round(icon.getBoundingClientRect().width) : -1;
                const skillRows = grid?.querySelectorAll('[data-testid="skill-icon"]').length ?? 0;
                const gridWidth = grid !== null ? Math.round(grid.getBoundingClientRect().width) : 0;
                probes.push({ width, columns, iconWidth, skillRows, gridWidth });
            }
            return { setupOk: true, gridFound: true, probes, error: null };
        },
        [...WIDTHS],
    );

    // Snap the narrow state for the visual record (the width most prone to clipping).
    await snap(page, 'statistics-columns-narrow');

    expect(result.error, result.error ?? 'ok').toBeNull();
    expect(result.setupOk, 'actor + sheet set up').toBe(true);
    expect(result.gridFound, 'skills-responsive-grid rendered').toBe(true);
    expect(result.probes).toHaveLength(WIDTHS.length);

    // Surface the measured geometry in the run log for diagnosis.
    // eslint-disable-next-line no-console -- e2e diagnostic; Playwright pipes test stdout to the report
    console.log('[#267 probes]', JSON.stringify(result.probes));

    // Length asserted above, so the three probes are defined (the test tsconfig has
    // noUncheckedIndexedAccess off, so these are non-nullable).
    const [wide, mid, narrow] = result.probes;
    // The grid must actually hold skill rows, or column counts are meaningless.
    expect(wide.skillRows, 'skills render in the grid').toBeGreaterThan(0);
    // Guard the whole assertion set: a hidden Statistics tab would make every width
    // read one column. Require the grid to be genuinely laid out at the wide width.
    expect(wide.gridWidth, `Statistics tab must be visible/laid out (grid width at ${wide.width}px sheet: ${wide.gridWidth}px)`).toBeGreaterThan(400);

    // Monotonic reflow: columns never INCREASE as the panel narrows.
    expect(wide.columns, 'wide ≥ mid columns').toBeGreaterThanOrEqual(mid.columns);
    expect(mid.columns, 'mid ≥ narrow columns').toBeGreaterThanOrEqual(narrow.columns);
    // The endpoints: wide fits multiple columns, narrow collapses to one.
    expect(wide.columns, 'wide shows ≥ 2 columns').toBeGreaterThanOrEqual(2);
    expect(narrow.columns, 'narrow collapses to a single column').toBe(1);

    // The #267 icon-squish fix: the fixed 16px skill icon never compresses, at ANY
    // width — the name span (tw-truncate) absorbs the width change instead.
    for (const probe of result.probes) {
        expect(probe.iconWidth, `skill icon stays 16px at width ${probe.width} (got ${probe.iconWidth})`).toBe(16);
    }
});
