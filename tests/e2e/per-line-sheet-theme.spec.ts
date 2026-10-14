import type { Page } from '@playwright/test';
import { assertFlowResults } from './lib/flow-assert';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { createProbeActor, deleteProbeActors, openProbeSheet } from './lib/sheet-probe';
import { test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of a character sheet's own line (#596,
 * src/module/applications/actor/character-sheet.ts `_gameSystemId`).
 *
 * `makeSystemVariant()` sets each per-line sheet class's `_gameSystemId` on its
 * prototype, but CharacterSheet declared the same name as a class field, which gave
 * every sheet instance an own `undefined` that shadowed it. The field is now a
 * `declare`: a DH2 and an RT character sheet each read their line from the class,
 * stamp it on the sheet root as `data-wh40k-system`, and theme their per-line
 * elements in that line's palette: the same Movement panel takes different colours on
 * each. Both sheets are captured on their Combat tab, and each Movement panel close up with
 * the elements whose colour differs between the lines outlined.
 *
 * Each flow records under `per-line-sheet-theme.flow`. Keys MUST match
 * PER_LINE_SHEET_THEME_FLOWS in scripts/e2e-coverage.mjs.
 */

const PER_LINE_SHEET_THEME_FLOWS = ['dh2-sheet-reads-its-line', 'rt-sheet-reads-its-line', 'lines-theme-differently'] as const;
type FlowName = (typeof PER_LINE_SHEET_THEME_FLOWS)[number];

const LINES = ['dh2', 'rt'] as const;
type Line = (typeof LINES)[number];

interface LineRead {
    ownProperty: boolean;
    classLine: string | null;
    stamped: string | null;
    colours: string[];
}

/** The sheet's line as the class carries it, as its root stamps it, and its themed elements' colours. */
async function readLine(page: Page, actorId: string): Promise<LineRead | null> {
    return page.evaluate((id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            game: { actors: { get: (i: string) => { sheet: { element: HTMLElement; _gameSystemId?: string } } | undefined } };
        };
        const sheet = g.game.actors.get(id)?.sheet;
        if (sheet === undefined) return null;
        // The Movement panel: the same template on both lines, so its themed elements pair up.
        const panel = sheet.element.querySelector('[data-movement-type]')?.closest<HTMLElement>('.wh40k-panel');
        panel?.setAttribute('data-e2e-theme-panel', '');
        panel?.scrollIntoView({ block: 'center' });
        const themed =
            panel === null || panel === undefined
                ? []
                : Array.from(panel.querySelectorAll<HTMLElement>('[class*="dh2:"], [class*="rt:"], [class*="tw-text-gold"]'));
        const colours = themed.map((el) => {
            const style = getComputedStyle(el);
            return `${style.color}|${style.backgroundColor}|${style.borderBottomColor}|${style.borderTopColor}`;
        });
        return {
            ownProperty: Object.hasOwn(sheet, '_gameSystemId'),
            classLine: sheet._gameSystemId ?? null,
            stamped: sheet.element.dataset['wh40kSystem'] ?? null,
            colours,
        };
    }, actorId);
}

test.describe.serial('a character sheet reads its own line (Tier B, #596)', () => {
    test.setTimeout(scaledMs(240_000));
    test('DH2 and RT character sheets stamp their line and theme in its palette', async ({ page }) => {
        await joinOrSkip(page);
        const results: Array<{ name: FlowName; ok: boolean; detail: string | null }> = [];
        const record = (name: FlowName, ok: boolean, detail: string): void => {
            results.push({ name, ok, detail: ok ? null : detail });
        };
        const actors: string[] = [];
        const reads = new Map<Line, LineRead>();
        const actorByLine = new Map<Line, string>();
        try {
            for (const line of LINES) {
                // eslint-disable-next-line no-await-in-loop -- one sheet at a time, captured in turn
                const actorId = await createProbeActor(page, {
                    name: `Theme probe (${line})`,
                    type: `${line}-character`,
                    flags: { 'wh40k-rpg': { sheetSource: 'authored-build' } },
                });
                if (actorId === null) continue;
                actors.push(actorId);
                actorByLine.set(line, actorId);
                // eslint-disable-next-line no-await-in-loop -- one sheet at a time, captured in turn
                const sheet = await openProbeSheet(page, actorId, { tab: 'combat' });
                if (sheet === null) continue;
                // eslint-disable-next-line no-await-in-loop -- reads the sheet just opened
                const read = await readLine(page, actorId);
                if (read !== null) reads.set(line, read);
                const flow: FlowName = line === 'dh2' ? 'dh2-sheet-reads-its-line' : 'rt-sheet-reads-its-line';
                record(
                    flow,
                    read !== null && !read.ownProperty && read.classLine === line && read.stamped === line,
                    `${line} sheet ${JSON.stringify({ ...read, colours: read?.colours.length })}`,
                );
                // eslint-disable-next-line no-await-in-loop -- captures the sheet just opened
                await snap(page, `per-line-theme-${line}-character-combat`, { selector: `#${sheet.appId}`, closeWindows: true, keepWindow: sheet.appId });
            }
            const dh2 = reads.get('dh2')?.colours ?? [];
            const rt = reads.get('rt')?.colours ?? [];
            // Outline the Movement panel elements whose colour differs between the lines and
            // capture the panel on each, so the difference is visible side by side.
            const differing = dh2.flatMap((colour, index) => (colour !== rt[index] ? [index] : []));
            for (const line of LINES) {
                const actorId = actorByLine.get(line);
                if (actorId === undefined) continue;
                // eslint-disable-next-line no-await-in-loop -- one sheet at a time, captured in turn
                const sheet = await openProbeSheet(page, actorId, { tab: 'combat' });
                if (sheet === null) continue;
                // eslint-disable-next-line no-await-in-loop -- marks the sheet just opened
                await page.evaluate(
                    (args: { appId: string; indices: number[] }) => {
                        const panel = document.getElementById(args.appId)?.querySelector('[data-movement-type]')?.closest<HTMLElement>('.wh40k-panel');
                        panel?.setAttribute('data-e2e-theme-panel', '');
                        panel?.scrollIntoView({ block: 'center' });
                        const themed = Array.from(panel?.querySelectorAll<HTMLElement>('[class*="dh2:"], [class*="rt:"], [class*="tw-text-gold"]') ?? []);
                        for (const index of args.indices) themed.at(index)?.style.setProperty('outline', '2px dashed #ff00ff');
                    },
                    { appId: sheet.appId, indices: differing },
                );
                // eslint-disable-next-line no-await-in-loop -- captures the sheet just marked
                await snap(page, `per-line-theme-${line}-movement-panel-differences`, {
                    selector: `#${sheet.appId} [data-e2e-theme-panel]`,
                    closeWindows: true,
                    keepWindow: sheet.appId,
                });
            }
            record(
                'lines-theme-differently',
                dh2.length > 0 && dh2.length === rt.length && dh2.some((colour, index) => colour !== rt[index]),
                `dh2 themed elements ${dh2.length}, rt ${rt.length}; dh2 ${JSON.stringify(dh2.slice(0, 3))} rt ${JSON.stringify(rt.slice(0, 3))}`,
            );
        } finally {
            await deleteProbeActors(page, actors);
        }
        assertFlowResults({ results }, PER_LINE_SHEET_THEME_FLOWS, { dimension: 'per-line-sheet-theme.flow', label: 'per-line sheet theme' });
    });
});
