import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of the "Origin Path Incomplete" prompt gate (#541,
 * src/module/utils/origin-path-prompt.ts, CharacterSheet#maybePromptOriginPathIncomplete).
 *
 * A pregen whose sheet came from an authored build carries
 * `flags["wh40k-rpg"].sheetSource = "authored-build"` (written by the campaign
 * world export) and opens with no prompt, though it has no origin path. A
 * genuinely unbuilt character, with the same empty origin path and no marker,
 * is still prompted. Both sheets are captured as they open.
 *
 * Each flow records under `origin-prompt.flow`. Keys MUST match
 * ORIGIN_PROMPT_FLOWS in scripts/e2e-coverage.mjs.
 */

const ORIGIN_PROMPT_FLOWS = ['pregen-opens-without-prompt', 'unbuilt-character-prompted'] as const;
type FlowName = (typeof ORIGIN_PROMPT_FLOWS)[number];

/** How long a sheet is watched for the prompt after it renders (the prompt fires from first render). */
const PROMPT_WATCH_MS = 3_000;

interface OpenResult {
    actorId: string | null;
    sheetId: string | null;
    prompted: boolean;
    dialogId: string | null;
}

/** Create a DH2 character (optionally flagged), open its sheet, and report whether the prompt appeared. */
async function openCharacter(page: Page, name: string, flags: object): Promise<OpenResult> {
    return page.evaluate(
        async (args: { name: string; flags: object; watchMs: number }): Promise<OpenResult> => {
            interface SheetLike {
                id: string;
                rendered: boolean;
                render: (o: { force: boolean }) => Promise<object>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                Actor: { create: (d: object) => Promise<{ id: string; sheet: SheetLike } | null> };
                game: { i18n: { localize: (key: string) => string } };
            };
            const { waitFor, pollUntil, scaledMs: scale } = globalThis.wh40kE2E;
            const title = g.game.i18n.localize('WH40K.OriginPath.IncompletePrompt.Title');
            const promptDialog = (): HTMLElement | undefined =>
                Array.from(document.querySelectorAll<HTMLElement>('.application.dialog, dialog.application')).find((el) => el.textContent.includes(title));

            const actor = await g.Actor.create({ name: args.name, type: 'dh2-character', flags: args.flags });
            if (actor === null) return { actorId: null, sheetId: null, prompted: false, dialogId: null };
            await actor.sheet.render({ force: true });
            await waitFor(() => actor.sheet.rendered, `${args.name} sheet render`, scale(10_000));
            const prompted = await pollUntil(() => promptDialog() !== undefined, scale(args.watchMs));
            return { actorId: actor.id, sheetId: actor.sheet.id, prompted, dialogId: promptDialog()?.id ?? null };
        },
        { name, flags, watchMs: PROMPT_WATCH_MS },
    );
}

/** Switch the world's "prompt for an incomplete origin path" setting. */
async function setPromptEnabled(page: Page, enabled: boolean): Promise<void> {
    await page.evaluate(async (value: boolean) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game.settings` is injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { settings: { set: (scope: string, key: string, v: boolean) => Promise<object> } } };
        await g.game.settings.set('wh40k-rpg', 'prompt-incomplete-origin-path', value);
    }, enabled);
}

/** Close any open prompt dialog and delete the probe actors. */
async function cleanup(page: Page, actorIds: string[]): Promise<void> {
    await page.evaluate(async (ids: string[]) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            game: { actors: { get: (i: string) => { delete: () => Promise<void> } | undefined } };
            foundry: { applications: { instances: Map<string, { close: () => Promise<void>; options: { classes?: string[] } }> } };
        };
        for (const app of g.foundry.applications.instances.values()) {
            // eslint-disable-next-line no-await-in-loop -- sequential cleanup
            if (app.options.classes?.includes('dialog') === true) await app.close().catch(() => undefined);
        }
        for (const id of ids) {
            // eslint-disable-next-line no-await-in-loop -- sequential cleanup
            await g.game.actors
                .get(id)
                ?.delete()
                .catch(() => undefined);
        }
    }, actorIds);
}

test.describe.serial('origin-path prompt skips authored-build pregens (Tier B, #541)', () => {
    test.setTimeout(scaledMs(180_000));
    test('a pregen opens with no prompt; an unbuilt character is still prompted', async ({ page }) => {
        await joinOrSkip(page);
        const results: Array<{ name: FlowName; ok: boolean; detail: string | null }> = [];
        const created: string[] = [];

        // joinAsGM switches the prompt off world-wide so it cannot cover other specs' sheets.
        await setPromptEnabled(page, true);
        try {
            const pregen = await openCharacter(page, 'Pregen Acolyte', { 'wh40k-rpg': { sheetSource: 'authored-build' } });
            if (pregen.actorId !== null) created.push(pregen.actorId);
            if (pregen.sheetId !== null) {
                await clearScreenOverlays(page, pregen.sheetId);
                await snap(page, 'origin-prompt-pregen-sheet-no-prompt', { fullPage: true });
            }
            const pregenOk = pregen.sheetId !== null && !pregen.prompted;
            results.push({
                name: 'pregen-opens-without-prompt',
                ok: pregenOk,
                detail: pregenOk ? null : `sheet ${String(pregen.sheetId)}, prompted=${String(pregen.prompted)}`,
            });
            await cleanup(page, []);

            const unbuilt = await openCharacter(page, 'Unbuilt Acolyte', {});
            if (unbuilt.actorId !== null) created.push(unbuilt.actorId);
            if (unbuilt.prompted) await snap(page, 'origin-prompt-unbuilt-character-prompted', { fullPage: true });
            results.push({
                name: 'unbuilt-character-prompted',
                ok: unbuilt.prompted,
                detail: unbuilt.prompted ? null : 'no Origin Path Incomplete dialog appeared',
            });
        } finally {
            await cleanup(page, created);
            await setPromptEnabled(page, false);
        }

        const fired = new Map(results.map((r) => [r.name, r]));
        const failures: string[] = [];
        for (const flow of ORIGIN_PROMPT_FLOWS) {
            const result = fired.get(flow);
            if (result?.ok === true) recordCoverage('origin-prompt.flow', flow);
            else failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
