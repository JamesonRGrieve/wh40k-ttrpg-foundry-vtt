import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { GAME_SYSTEM_IDS, joinAsGM, type GameSystemId } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the full actor-sheet render surface — every applicable
 * (actorType × gameSystem × {view, edit}) triple — captured as a full-sheet
 * PNG under `tests/e2e/screenshots/actor/`.
 *
 * Keys MUST match the SCREENSHOT_ACTOR_FLOWS constant in
 * scripts/e2e-coverage.mjs (registered by the orchestrator). Generates PNGs
 * under tests/e2e/screenshots/actor/ (gitignored by the orchestrator).
 *
 * For each (actorType, gameSystem) pair this spec:
 *   1. Seeds an actor with realistic non-empty data (name, characteristics,
 *      wounds, fate, armour, a smattering of test fields per kind). All
 *      stochastic ids/values derive from a deterministic LCG so screenshot
 *      diffs are stable run-to-run.
 *   2. Renders the sheet via `actor.sheet.render({force: true})` and waits
 *      500ms so the ApplicationV2 PARTS pipeline settles and tab content
 *      paints. Captures a view-mode screenshot clipped to the sheet's
 *      bounding box.
 *   3. Invokes the `toggleEditMode` action handler bound through
 *      `sheet.options.actions`, waits 500ms for the re-render, then captures
 *      an edit-mode screenshot at the same bounding box.
 *   4. Closes the sheet and deletes the actor (in a finally block so a
 *      throw mid-flow still cleans up).
 *
 * Pairs come from `CONFIG.Actor.dataModels` hand-mirrored as the
 * SCREENSHOT_ACTOR_FLOWS constant. Three per-system actor types
 * (character / npc / vehicle) plus the cross-system `loot` type plus the
 * RT-only `starship` — total 58 keys (29 pairs × 2 modes).
 */

const SCREENSHOT_ACTOR_FLOWS = [
    'bc-character::bc::view',
    'bc-character::bc::edit',
    'bc-npc::bc::view',
    'bc-npc::bc::edit',
    'bc-vehicle::bc::view',
    'bc-vehicle::bc::edit',
    'loot::bc::view',
    'loot::bc::edit',
    'dh1-character::dh1e::view',
    'dh1-character::dh1e::edit',
    'dh1-npc::dh1e::view',
    'dh1-npc::dh1e::edit',
    'dh1-vehicle::dh1e::view',
    'dh1-vehicle::dh1e::edit',
    'loot::dh1e::view',
    'loot::dh1e::edit',
    'dh2-character::dh2e::view',
    'dh2-character::dh2e::edit',
    'dh2-npc::dh2e::view',
    'dh2-npc::dh2e::edit',
    'dh2-vehicle::dh2e::view',
    'dh2-vehicle::dh2e::edit',
    'loot::dh2e::view',
    'loot::dh2e::edit',
    'dw-character::dw::view',
    'dw-character::dw::edit',
    'dw-npc::dw::view',
    'dw-npc::dw::edit',
    'dw-vehicle::dw::view',
    'dw-vehicle::dw::edit',
    'loot::dw::view',
    'loot::dw::edit',
    'ow-character::ow::view',
    'ow-character::ow::edit',
    'ow-npc::ow::view',
    'ow-npc::ow::edit',
    'ow-vehicle::ow::view',
    'ow-vehicle::ow::edit',
    'loot::ow::view',
    'loot::ow::edit',
    'rt-character::rt::view',
    'rt-character::rt::edit',
    'rt-npc::rt::view',
    'rt-npc::rt::edit',
    'rt-vehicle::rt::view',
    'rt-vehicle::rt::edit',
    'rt-starship::rt::view',
    'rt-starship::rt::edit',
    'loot::rt::view',
    'loot::rt::edit',
    'im-character::im::view',
    'im-character::im::edit',
    'im-npc::im::view',
    'im-npc::im::edit',
    'im-vehicle::im::view',
    'im-vehicle::im::edit',
    'loot::im::view',
    'loot::im::edit',
] as const;

type ScreenshotFlow = (typeof SCREENSHOT_ACTOR_FLOWS)[number];

/**
 * Minimal structural shapes for the Foundry runtime globals the browser-side
 * probes touch. The real Foundry types are not loaded in the page context, so
 * these capture exactly the surface the probe exercises — nothing wider.
 */
type ProbeActionHandler = (event: MouseEvent, target: HTMLElement) => void | Promise<void>;
interface ProbeSheet {
    id?: string;
    element?: HTMLElement | null;
    render: (opts: { force: boolean }) => Promise<void>;
    close?: () => Promise<void>;
    options?: { actions?: Record<string, ProbeActionHandler | undefined> };
}
interface ProbeActor {
    id?: string | null;
    sheet?: ProbeSheet;
    delete?: () => Promise<void>;
}
type ProbeJsonValue = string | number | boolean | null | ProbeJsonValue[] | { [key: string]: ProbeJsonValue };
interface ProbeActorSeed {
    name: string;
    type: string;
    system: ProbeActorSystem;
}
interface ProbeActorSystem {
    gameSystem: string;
    [key: string]: ProbeJsonValue;
}
interface ProbeActorConstructor {
    create: (data: ProbeActorSeed) => Promise<ProbeActor | null>;
}
interface FoundryGlobal {
    Actor?: ProbeActorConstructor;
    game?: { actors?: { get?: (id: string) => ProbeActor | undefined } };
    __screenshotActorIds?: string[];
}

/**
 * `<systemId>` is the runtime GameSystemId (`dh1e`/`dh2e` carry a trailing
 * `e`); actor type prefixes in `CONFIG.Actor.dataModels` drop it (`dh1-` /
 * `dh2-`). Same translation `actor-types.spec.ts` uses.
 */
const SYSTEM_PREFIX: Record<GameSystemId, string> = {
    bc: 'bc',
    dh1e: 'dh1',
    dh2e: 'dh2',
    dw: 'dw',
    ow: 'ow',
    rt: 'rt',
    im: 'im',
};

/**
 * Per-system actor-type roster. `loot` is system-agnostic; `starship` is
 * RT-only. Everything else follows the `<prefix>-<role>` shape.
 */
function actorTypesForSystem(systemId: GameSystemId): string[] {
    const prefix = SYSTEM_PREFIX[systemId];
    const base = [`${prefix}-character`, `${prefix}-npc`, `${prefix}-vehicle`];
    if (systemId === 'rt') base.push('rt-starship');
    base.push('loot');
    return base;
}

interface ProbeResult {
    keysFired: Record<ScreenshotFlow, boolean>;
    keyNotes: Partial<Record<ScreenshotFlow, string>>;
    boundingBoxes: Partial<Record<string, { x: number; y: number; width: number; height: number } | null>>;
    pageErrors: string[];
}

const SCREENSHOT_DIR = 'tests/e2e/screenshots/actor';

/**
 * Drive ONE (actorType × systemId) pair through view+edit screenshot
 * capture. Runs entirely in the browser context except for the screenshot
 * step, which is initiated from the Node side once we have the bounding
 * box. Returns a discriminated result the outer test loop turns into
 * coverage entries.
 */
async function probeActorSheetScreenshot(
    page: Page,
    actorType: string,
    systemId: GameSystemId,
): Promise<{
    boundingBox: { x: number; y: number; width: number; height: number } | null;
    viewRendered: boolean;
    editToggled: boolean;
    cleanup: () => Promise<void>;
    error: string | null;
}> {
    return page
        .evaluate(
            async ({ actorType: actorTypeArg, systemId: systemIdArg }) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `globalThis` is untyped in the page context
                const g = globalThis as unknown as FoundryGlobal;
                const ActorGlobal = g.Actor;

                // --- Deterministic LCG so repeated runs produce identical pixels.
                // Park-Miller minimum-standard, seeded from a hash of the pair.
                const seedHash = (s: string): number => {
                    let h = 2166136261;
                    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
                    return h >>> 0 || 1;
                };
                let _rng = seedHash(`${actorTypeArg}::${systemIdArg}`) % 2147483647;
                const seededRandom = (): number => {
                    _rng = (_rng * 48271) % 2147483647;
                    return (_rng - 1) / 2147483646;
                };
                const origRandom = Math.random;
                Math.random = seededRandom;

                const restoreRandom = (): void => {
                    Math.random = origRandom;
                };

                if (ActorGlobal == null || typeof ActorGlobal.create !== 'function') {
                    restoreRandom();
                    return {
                        boundingBox: null,
                        viewRendered: false,
                        editToggled: false,
                        actorId: null,
                        error: 'Actor.create unavailable',
                    };
                }

                // Seed shape per kind — kept minimal but non-empty so the sheet
                // has data to render rather than the blank-actor placeholder.
                // The DataModel fills in everything else from its schema defaults.
                const baseName = `screenshot-${actorTypeArg}-${systemIdArg}`;
                const isCharacter = actorTypeArg.endsWith('-character');
                const isNpc = actorTypeArg.endsWith('-npc');
                const isVehicle = actorTypeArg.endsWith('-vehicle');
                const isStarship = actorTypeArg.endsWith('-starship');
                const isLoot = actorTypeArg === 'loot';

                const seed: ProbeActorSeed = {
                    name: baseName,
                    type: actorTypeArg,
                    system: { gameSystem: systemIdArg },
                };
                if (isCharacter) {
                    seed.system = {
                        ...seed.system,
                        wounds: { value: 10, max: 12, critical: 0 },
                        fate: { value: 3, max: 4 },
                        characteristics: {
                            weaponSkill: { advance: 5, base: 30 },
                            ballisticSkill: { advance: 10, base: 30 },
                            strength: { advance: 0, base: 35 },
                            toughness: { advance: 5, base: 35 },
                            agility: { advance: 0, base: 30 },
                            intelligence: { advance: 0, base: 30 },
                            perception: { advance: 5, base: 30 },
                            willpower: { advance: 0, base: 30 },
                            fellowship: { advance: 0, base: 30 },
                        },
                    };
                } else if (isNpc) {
                    seed.system = {
                        ...seed.system,
                        wounds: { value: 8, max: 10, critical: 0 },
                        armour: { mode: 'simple', total: 3 },
                    };
                } else if (isVehicle) {
                    seed.system = {
                        ...seed.system,
                        integrity: { value: 30, max: 40 },
                        crew: { current: 2, max: 4 },
                    };
                } else if (isStarship) {
                    seed.system = {
                        ...seed.system,
                        hull: { value: 50, max: 60 },
                        morale: { value: 90, max: 100 },
                        crewRating: { value: 35, max: 60 },
                    };
                } else if (isLoot) {
                    seed.system = {
                        ...seed.system,
                        description: 'A pile of recovered equipment.',
                    };
                }

                let actor: ProbeActor | null;
                try {
                    actor = await ActorGlobal.create(seed);
                } catch (err) {
                    restoreRandom();
                    return {
                        boundingBox: null,
                        viewRendered: false,
                        editToggled: false,
                        actorId: null,
                        error: `Actor.create threw: ${String(err instanceof Error ? err.message : String(err))}`,
                    };
                }
                if (actor?.id == null) {
                    restoreRandom();
                    return {
                        boundingBox: null,
                        viewRendered: false,
                        editToggled: false,
                        actorId: null,
                        error: 'Actor.create returned null/no-id (silent failure)',
                    };
                }

                // Stash on the window so an outer cleanup pass can finalise even
                // if the spec aborts before the explicit cleanup runs.
                g.__screenshotActorIds = g.__screenshotActorIds ?? [];
                g.__screenshotActorIds.push(actor.id);

                const sheet = actor.sheet;
                if (typeof sheet?.render !== 'function') {
                    restoreRandom();
                    return {
                        boundingBox: null,
                        viewRendered: false,
                        editToggled: false,
                        actorId: actor.id,
                        error: 'actor.sheet.render unavailable',
                    };
                }

                let viewRendered = false;
                try {
                    await sheet.render({ force: true });
                    viewRendered = true;
                } catch (err) {
                    restoreRandom();
                    return {
                        boundingBox: null,
                        viewRendered: false,
                        editToggled: false,
                        actorId: actor.id,
                        error: `sheet.render threw: ${String(err instanceof Error ? err.message : String(err))}`,
                    };
                }

                // Let ApplicationV2 PARTS settle (CSS transitions, async tab
                // content). 500ms matches the spec brief.
                await new Promise<void>((r) => {
                    setTimeout(r, 500);
                });

                // Find the sheet root element in the live DOM. ApplicationV2
                // tags its outer element with data-appid matching sheet.id.
                const appId = String(sheet.id ?? '');
                const directEl = sheet.element instanceof HTMLElement ? sheet.element : null;
                const lookupEl = directEl ?? document.querySelector(`[data-appid="${appId}"]`) ?? document.querySelector(`#${appId}`);

                let boundingBox: { x: number; y: number; width: number; height: number } | null = null;
                if (lookupEl !== null) {
                    const rect = lookupEl.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        boundingBox = {
                            x: Math.max(0, Math.floor(rect.x)),
                            y: Math.max(0, Math.floor(rect.y)),
                            width: Math.ceil(rect.width),
                            height: Math.ceil(rect.height),
                        };
                    }
                }

                restoreRandom();
                return {
                    boundingBox,
                    viewRendered,
                    editToggled: false,
                    actorId: actor.id,
                    error: null,
                };
            },
            { actorType, systemId },
        )
        .then((result) => ({
            boundingBox: result.boundingBox,
            viewRendered: result.viewRendered,
            editToggled: result.editToggled,
            cleanup: async (): Promise<void> => {
                if (result.actorId === null) return;
                await page
                    .evaluate(async (id: string) => {
                        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `globalThis` is untyped in the page context
                        const g = globalThis as unknown as FoundryGlobal;
                        const live = g.game?.actors?.get?.(id);
                        try {
                            await live?.sheet?.close?.();
                        } catch {
                            /* ignore */
                        }
                        try {
                            await live?.delete?.();
                        } catch {
                            /* ignore */
                        }
                    }, result.actorId)
                    .catch(() => {
                        /* ignore */
                    });
            },
            error: result.error,
        }));
}

/**
 * Toggle the sheet into edit mode by invoking the `toggleEditMode` action
 * handler bound through `sheet.options.actions`. Returns the updated
 * bounding box (the sheet may resize on mode change).
 */
async function toggleEditModeAndMeasure(
    page: Page,
    actorId: string,
): Promise<{ boundingBox: { x: number; y: number; width: number; height: number } | null; editToggled: boolean; error: string | null }> {
    return page.evaluate(async (id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `globalThis` is untyped in the page context
        const g = globalThis as unknown as FoundryGlobal;
        const live = g.game?.actors?.get?.(id);
        const sheet = live?.sheet;
        if (sheet == null) {
            return { boundingBox: null, editToggled: false, error: 'sheet missing after view render' };
        }
        const actionMap = sheet.options?.actions ?? {};
        const handler = actionMap.toggleEditMode;
        let editToggled = false;
        let error: string | null = null;
        if (typeof handler !== 'function') {
            error = 'toggleEditMode handler not registered';
        } else {
            try {
                const target = document.createElement('div');
                const event = new MouseEvent('click', { bubbles: false, cancelable: true });
                const rv = handler.call(sheet, event, target);
                if (rv instanceof Promise) await rv;
                editToggled = true;
            } catch (err) {
                error = `toggleEditMode threw: ${String(err instanceof Error ? err.message : String(err))}`;
            }
        }
        // Allow the re-render triggered by the mode flip to settle.
        await new Promise<void>((r) => {
            setTimeout(r, 500);
        });

        const appId = String(sheet.id ?? '');
        const directEl = sheet.element instanceof HTMLElement ? sheet.element : null;
        const el = directEl ?? document.querySelector(`[data-appid="${appId}"]`) ?? document.querySelector(`#${appId}`);
        let boundingBox: { x: number; y: number; width: number; height: number } | null = null;
        if (el !== null) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                boundingBox = {
                    x: Math.max(0, Math.floor(rect.x)),
                    y: Math.max(0, Math.floor(rect.y)),
                    width: Math.ceil(rect.width),
                    height: Math.ceil(rect.height),
                };
            }
        }
        return { boundingBox, editToggled, error };
    }, actorId);
}

async function runAllScreenshots(page: Page): Promise<ProbeResult> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);

    const keysFired: Record<string, boolean> = {};
    const keyNotes: Partial<Record<string, string>> = {};
    const boundingBoxes: Partial<Record<string, { x: number; y: number; width: number; height: number } | null>> = {};

    for (const key of SCREENSHOT_ACTOR_FLOWS) keysFired[key] = false;

    try {
        for (const systemId of GAME_SYSTEM_IDS) {
            const types = actorTypesForSystem(systemId);
            for (const actorType of types) {
                const viewKey = `${actorType}::${systemId}::view` as ScreenshotFlow;
                const editKey = `${actorType}::${systemId}::edit` as ScreenshotFlow;

                // Render the sheet in view mode and measure the box.
                let probe: Awaited<ReturnType<typeof probeActorSheetScreenshot>>;
                try {
                    probe = await probeActorSheetScreenshot(page, actorType, systemId);
                } catch (err) {
                    keyNotes[viewKey] = `probe threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    keyNotes[editKey] = `view-mode probe threw, skipping edit-mode`;
                    continue;
                }

                if (probe.error !== null || !probe.viewRendered) {
                    keyNotes[viewKey] = probe.error ?? 'view-mode render did not complete';
                    keyNotes[editKey] = 'view-mode render failed, skipping edit-mode';
                    await probe.cleanup();
                    continue;
                }

                try {
                    const clip = probe.boundingBox ?? undefined;
                    const screenshotPath = `${SCREENSHOT_DIR}/${actorType}__${systemId}__view.png`;
                    if (clip) {
                        await page.screenshot({ path: screenshotPath, clip, fullPage: false });
                    } else {
                        await page.screenshot({ path: screenshotPath, fullPage: true });
                    }
                    boundingBoxes[viewKey] = probe.boundingBox;
                    keysFired[viewKey] = true;
                    keyNotes[viewKey] = clip
                        ? `view captured at clip ${clip.width}x${clip.height} @ (${clip.x},${clip.y})`
                        : 'view captured as full page (no bounding box)';
                } catch (err) {
                    keyNotes[viewKey] = `view screenshot threw: ${String(err instanceof Error ? err.message : String(err))}`;
                }

                // Toggle edit mode and re-screenshot. Need the actor id to
                // locate the live sheet; pull it back from the probe by
                // checking the most-recent stash entry.
                const recentActorId = await page.evaluate(() => {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `globalThis` is untyped in the page context
                    const g = globalThis as unknown as FoundryGlobal;
                    const ids = g.__screenshotActorIds;
                    return ids != null && ids.length > 0 ? ids[ids.length - 1] : null;
                });

                if (recentActorId === null) {
                    keyNotes[editKey] = 'actor id missing after view render — cannot toggle';
                    await probe.cleanup();
                    continue;
                }

                try {
                    const toggled = await toggleEditModeAndMeasure(page, recentActorId);
                    if (toggled.error !== null || !toggled.editToggled) {
                        keyNotes[editKey] = toggled.error ?? 'toggleEditMode did not fire';
                    } else {
                        const clip = toggled.boundingBox ?? undefined;
                        const editScreenshotPath = `${SCREENSHOT_DIR}/${actorType}__${systemId}__edit.png`;
                        if (clip) {
                            await page.screenshot({ path: editScreenshotPath, clip, fullPage: false });
                        } else {
                            await page.screenshot({ path: editScreenshotPath, fullPage: true });
                        }
                        boundingBoxes[editKey] = toggled.boundingBox;
                        keysFired[editKey] = true;
                        keyNotes[editKey] = clip
                            ? `edit captured at clip ${clip.width}x${clip.height} @ (${clip.x},${clip.y})`
                            : 'edit captured as full page (no bounding box)';
                    }
                } catch (err) {
                    keyNotes[editKey] = `edit screenshot threw: ${String(err instanceof Error ? err.message : String(err))}`;
                } finally {
                    await probe.cleanup();
                }
            }
        }
    } finally {
        page.off('pageerror', listener);
    }

    return {
        keysFired: keysFired,
        keyNotes: keyNotes,
        boundingBoxes,
        pageErrors,
    };
}

test.describe.serial('actor-sheet screenshots (Tier B)', () => {
    // 58 keys × ~2s per pair (render + 500ms settle + screenshot + edit
    // + 500ms + screenshot + cleanup) ~= 2 minutes worst case. Allow 5 to
    // tolerate slow renders on per-system first-touch initialisation.
    test.setTimeout(300_000);

    test('every (actorType × gameSystem × {view,edit}) renders and screenshots', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await runAllScreenshots(page);

        const failures: string[] = [];
        for (const key of SCREENSHOT_ACTOR_FLOWS) {
            if (probe.keysFired[key]) {
                recordCoverage('screenshot.actor.flow', key);
            } else {
                const note = probe.keyNotes[key] ?? 'flow did not fire and no diagnostic note recorded';
                failures.push(`${key}: ${note}`);
            }
        }

        const pageErrorTail = probe.pageErrors.length > 0 ? `\n  pageerrors: ${probe.pageErrors.slice(0, 5).join(' | ')}` : '';

        expect(
            failures,
            `${failures.length}/${SCREENSHOT_ACTOR_FLOWS.length} actor-sheet screenshot probes failed:\n  - ${failures.join('\n  - ')}${pageErrorTail}`,
        ).toEqual([]);
    });
});
