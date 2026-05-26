import type { Page } from '@playwright/test';
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

interface ProbeActorResult {
    docId: string | null;
    sheetRendered: boolean;
    createError: string | null;
}

interface BrowserActorSheet {
    render?: (force?: boolean) => Promise<void>;
    close?: () => Promise<void>;
}

interface BrowserActorDocument {
    id?: string;
    sheet?: BrowserActorSheet;
    delete?: () => Promise<void>;
}

interface BrowserActorClass {
    create?: (data: object) => Promise<BrowserActorDocument | null>;
}

interface ActorProbeGlobal {
    Actor?: BrowserActorClass;
}

interface ActorConfigGlobal {
    CONFIG?: { Actor?: { dataModels?: Record<string, object> } };
}

async function probeActorType(page: Page, type: string, gameSystem: string): Promise<ActorTypeProbe> {
    const errors: string[] = [];
    const listener = (err: Error): void => {
        errors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(
            async ({ actorType, actorGameSystem }): Promise<ProbeActorResult> => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side Actor global is runtime-only, no shipped types
                const browserCtx = globalThis as unknown as ActorProbeGlobal;
                const ActorClass = browserCtx.Actor;
                if (!ActorClass?.create) return { docId: null, sheetRendered: false, createError: 'Actor.create unavailable' };
                let actor: BrowserActorDocument | null;
                try {
                    actor = await ActorClass.create({
                        name: `probe-${actorType}-${actorGameSystem}`,
                        type: actorType,
                        system: { gameSystem: actorGameSystem },
                    });
                } catch (err) {
                    return { docId: null, sheetRendered: false, createError: err instanceof Error ? err.message : String(err) };
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
            { actorType: type, actorGameSystem: gameSystem },
        );
        if (result.docId === null && result.createError !== null) errors.unshift(`create: ${result.createError}`);
        return { type, docId: result.docId, sheetRendered: result.sheetRendered, pageErrors: errors };
    } finally {
        page.off('pageerror', listener);
    }
}

async function listActorTypes(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side CONFIG global is runtime-only, no shipped types
        const cfg = (globalThis as unknown as ActorConfigGlobal).CONFIG;
        return Object.keys(cfg?.Actor?.dataModels ?? {}).filter((t) => t !== 'base');
    });
}

/**
 * Per-system actor types follow a `<systemPrefix>-<role>` naming convention
 * (`dh2-character`, `bc-vehicle`, `rt-starship`, …). The GameSystemId used at
 * runtime carries a trailing 'e' for DH1/DH2 (dh1, dh2) which the manifest
 * prefix drops — this map keeps the test honest about that translation.
 */
const SYSTEM_PREFIX: Record<string, string> = {
    bc: 'bc',
    dh1: 'dh1',
    dh2: 'dh2',
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
                const probe = await probeActorType(page, type, gameSystem).catch(
                    // eslint-disable-next-line no-restricted-syntax -- boundary: promise rejection value is typed unknown, narrowed by the instanceof guard below
                    (err: unknown): ActorTypeProbe => ({
                        type,
                        docId: null,
                        sheetRendered: false,
                        pageErrors: [err instanceof Error ? err.message : String(err)],
                    }),
                );
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
