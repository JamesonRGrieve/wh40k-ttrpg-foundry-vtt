import { recordCoverage } from './lib/coverage-tracker';
import { GAME_SYSTEM_IDS, joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Data-driven coverage of every (actor type × game system) pair declared in
 * the system manifest. Creates the document, opens its sheet, asserts no
 * uncaught error fired during render, then deletes it. One test per pair.
 *
 * The pair list is enumerated from `CONFIG.Actor.dataModels` at runtime —
 * adding a new actor type to `system.json` + a DataModel + a sheet adds a
 * test row automatically.
 */

interface ActorTypeProbe {
    type: string;
    docId: string | null;
    sheetRendered: boolean;
    pageErrors: string[];
}

async function probeActorType(
    page: import('@playwright/test').Page,
    type: string,
    gameSystem: string,
): Promise<ActorTypeProbe> {
    const errors: string[] = [];
    const listener = (err: Error) => errors.push(err.message);
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(
            async ({ type, gameSystem }) => {
                const { Actor } = globalThis as unknown as {
                    Actor?: { create?: (data: object) => Promise<{ id?: string; sheet?: { render?: (force?: boolean) => Promise<unknown>; close?: () => Promise<unknown> }; delete?: () => Promise<unknown> } | null> };
                };
                if (!Actor?.create) return { docId: null, sheetRendered: false, createError: 'Actor.create unavailable' };
                let actor;
                try {
                    actor = await Actor.create({
                        name: `probe-${type}-${gameSystem}`,
                        type,
                        system: { gameSystem },
                    });
                } catch (err) {
                    return { docId: null, sheetRendered: false, createError: String((err as Error)?.message ?? err) };
                }
                if (!actor) return { docId: null, sheetRendered: false, createError: 'Actor.create returned null (silent failure)' };
                let sheetRendered = false;
                if (actor.sheet?.render) {
                    await actor.sheet.render(true);
                    sheetRendered = true;
                    await actor.sheet.close?.();
                }
                await actor.delete?.();
                return { docId: actor.id ?? null, sheetRendered, createError: null };
            },
            { type, gameSystem },
        );
        if (!result.docId && result.createError) errors.unshift(`create: ${result.createError}`);
        return { type, docId: result.docId, sheetRendered: result.sheetRendered, pageErrors: errors };
    } finally {
        page.off('pageerror', listener);
    }
}

async function listActorTypes(page: import('@playwright/test').Page): Promise<string[]> {
    return page.evaluate(() => {
        const cfg = (globalThis as unknown as { CONFIG?: { Actor?: { dataModels?: Record<string, unknown> } } }).CONFIG;
        return Object.keys(cfg?.Actor?.dataModels ?? {}).filter((t) => t !== 'base');
    });
}

/**
 * Per-system actor types follow a `<systemPrefix>-<role>` naming convention
 * (`dh2-character`, `bc-vehicle`, `rt-starship`, …). The GameSystemId used at
 * runtime carries a trailing 'e' for DH1/DH2 (dh1e, dh2e) which the manifest
 * prefix drops — this map keeps the test honest about that translation.
 */
const SYSTEM_PREFIX: Record<string, string> = {
    bc: 'bc',
    dh1e: 'dh1',
    dh2e: 'dh2',
    dw: 'dw',
    ow: 'ow',
    rt: 'rt',
    im: 'im',
};

function typesForSystem(allTypes: string[], gameSystem: string): string[] {
    const prefix = SYSTEM_PREFIX[gameSystem];
    if (!prefix) return [];
    return allTypes.filter((t) => t.startsWith(`${prefix}-`));
}

test.describe.serial('actor types × systems (Tier B)', () => {
    let allActorTypes: string[] = [];

    test.beforeAll(async ({ browser }) => {
        const page = await browser.newPage();
        const joined = await joinAsGM(page);
        if (!joined) {
            await page.close();
            return;
        }
        allActorTypes = await listActorTypes(page);
        await page.close();
    });

    for (const gameSystem of GAME_SYSTEM_IDS) {
        test(`every actor type creates + renders sheet in gameSystem='${gameSystem}'`, async ({ page }) => {
            const joined = await joinAsGM(page);
            test.skip(!joined, 'GM join failed');
            const actorTypes = typesForSystem(allActorTypes, gameSystem);
            test.skip(actorTypes.length === 0, `no <${SYSTEM_PREFIX[gameSystem]}-*> actor types declared`);
            const failures: string[] = [];
            for (const type of actorTypes) {
                const probe = await probeActorType(page, type, gameSystem).catch((err) => ({
                    type,
                    docId: null,
                    sheetRendered: false,
                    pageErrors: [String(err?.message ?? err)],
                }));
                if (probe.docId === null) {
                    const reason = probe.pageErrors[0] ?? 'Actor.create returned null';
                    failures.push(`${type}: ${reason}`);
                    continue;
                }
                recordCoverage('actor.type-system', `${type}::${gameSystem}`);
                if (!probe.sheetRendered) {
                    failures.push(`${type}: sheet did not render`);
                    continue;
                }
                if (probe.pageErrors.length > 0) {
                    failures.push(`${type}: ${probe.pageErrors[0]}`);
                    continue;
                }
                recordCoverage('actor.sheet-render', `${type}::${gameSystem}`);
            }
            expect(failures, `${failures.length}/${actorTypes.length} actor types failed in ${gameSystem}:\n  - ${failures.join('\n  - ')}`).toEqual([]);
        });
    }
});
