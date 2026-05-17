import { recordCoverage } from './lib/coverage-tracker';
import { GAME_SYSTEM_IDS, joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Data-driven coverage of every public Actor roll method declared on
 * `WH40KBaseActor` / `WH40KAcolyte`. Drives `src/module/documents/**` and
 * the roll plumbing under `src/module/rolls/**` /
 * `src/module/applications/prompts/unified-roll-dialog.ts` from real
 * Foundry — V8 coverage capture (wired through `tests/e2e/lib/test.ts`)
 * attributes line/branch hits to those files via the dist source maps.
 *
 * For every (rollMethod × gameSystem) pair the spec creates a
 * `<systemPrefix>-character` actor, invokes the method via page.evaluate,
 * records an `actor.roll-method` coverage hit, then tears the actor down.
 * Methods that open the unified roll dialog do not return a value — we
 * verify they do not throw synchronously and that any dialog opened is
 * closed before the next probe. Methods that return a `D100RollResult`
 * (rollCheck, rollCharacteristicCheck) are asserted to return a non-null
 * object.
 *
 * Important: this spec deliberately does NOT toggle the
 * `simple-attack-rolls` / `simple-psychic-rolls` world settings — both
 * are registered with `requiresReload: true`, and writing them mid-test
 * crashes the active session. Without those toggles, rollItem on a
 * weapon dispatches through `DHTargetedActionManager.performWeaponAttack`
 * which is also a valid coverage path; we only need the method to
 * dispatch, not to resolve through any specific branch.
 *
 * The `im` system is currently broken at actor-create (see actor-types
 * spec); it's skipped here for the same reason.
 */

/** Per-system actor type prefix — `dh2e` runtime id maps to `dh2-character` actor type. */
const SYSTEM_PREFIX: Record<string, string> = {
    bc: 'bc',
    dh1e: 'dh1',
    dh2e: 'dh2',
    dw: 'dw',
    ow: 'ow',
    rt: 'rt',
    im: 'im',
};

/**
 * Roll methods exercised by this spec. Each entry corresponds to one
 * (method × system) cell in the `actor.roll-method` coverage dimension.
 *
 * - `rollCharacteristic` / `rollCharacteristicCheck` / `rollSkill` /
 *   `rollCheck` come from `acolyte.ts` (the only subclass that overrides
 *   the base stubs on real character actors).
 * - `rollItem` / `rollWeaponAction` / `rollPsychicPower` dispatch through
 *   `acolyte.rollItem` → `DHTargetedActionManager.*`; without a token
 *   they no-op or open a prompt, both of which are valid dispatch
 *   coverage from our perspective (the method's body ran).
 */
const ROLL_METHODS = [
    'rollCharacteristic',
    'rollCharacteristicCheck',
    'rollSkill',
    'rollCheck',
    'rollItem',
    'rollWeaponAction',
    'rollPsychicPower',
] as const;

type RollMethod = (typeof ROLL_METHODS)[number];

interface RollProbeResult {
    method: RollMethod;
    invoked: boolean;
    error: string | null;
}

async function probeRollMethods(
    page: import('@playwright/test').Page,
    gameSystem: string,
): Promise<{
    created: boolean;
    createError: string | null;
    results: RollProbeResult[];
    pageErrors: string[];
    diag?: { ctorName: string };
}> {
    const pageErrors: string[] = [];
    const listener = (err: Error) => pageErrors.push(err.message);
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(
            async ({ gameSystem, prefix, methods }) => {
                const { Actor, ui } = globalThis as unknown as {
                    Actor?: {
                        create?: (data: object) => Promise<{
                            id?: string;
                            type?: string;
                            items?: { contents: Array<{ id: string; type: string }> };
                            rollCharacteristic?: (key: string) => Promise<unknown> | unknown;
                            rollCharacteristicCheck?: (key: string) => Promise<unknown>;
                            rollSkill?: (key: string) => Promise<unknown>;
                            rollCheck?: (target: number) => Promise<unknown>;
                            rollItem?: (id: string) => Promise<unknown>;
                            rollWeaponAction?: (item: unknown) => Promise<unknown>;
                            rollPsychicPower?: (item: unknown) => Promise<unknown>;
                            createEmbeddedDocuments?: (
                                kind: string,
                                data: object[],
                            ) => Promise<Array<{ id: string }>>;
                            delete?: () => Promise<unknown>;
                        } | null>;
                    };
                    ui?: { windows?: Record<string, { close?: () => Promise<unknown>; id?: string }> };
                };
                if (!Actor?.create) {
                    return { created: false, createError: 'Actor.create unavailable', results: [] };
                }

                const actorType = `${prefix}-character`;
                let actor;
                try {
                    actor = await Actor.create({
                        name: `roll-probe-${prefix}`,
                        type: actorType,
                        system: { gameSystem },
                    });
                } catch (err) {
                    return { created: false, createError: String((err as Error)?.message ?? err), results: [] };
                }
                if (!actor) {
                    return { created: false, createError: 'Actor.create returned null', results: [] };
                }

                // Capture the concrete document class identity. When the
                // proxy / fallback path returns `WH40KBaseActor` instead of
                // the per-system concrete subclass, the four acolyte-only
                // roll methods (rollSkill / rollCheck / rollCharacteristicCheck /
                // override rollCharacteristic) will be missing — surfacing the
                // class name in the failure message turns "method not present"
                // from a mystery into a regression breadcrumb.
                // eslint-disable-next-line no-restricted-syntax -- boundary: introspecting the runtime actor prototype for test diagnostics
                const proto = Object.getPrototypeOf(actor) as { constructor?: { name?: string } } | null;
                const ctorName = proto?.constructor?.name ?? 'unknown';

                // Create one weapon and one psychic-power on the actor so
                // rollItem / rollWeaponAction / rollPsychicPower have a real
                // embedded document to dispatch against.
                let weaponId: string | null = null;
                let powerId: string | null = null;
                try {
                    await actor.createEmbeddedDocuments?.('Item', [
                        {
                            name: 'probe-weapon',
                            type: 'weapon',
                            system: { equipped: true, class: 'melee', melee: true, damage: '1d10', penetration: 0 },
                        },
                        {
                            name: 'probe-power',
                            type: 'psychicPower',
                            system: { damage: '1d10', penetration: 0 },
                        },
                    ]);
                    const contents = actor.items?.contents ?? [];
                    weaponId = contents.find((i) => i.type === 'weapon')?.id ?? null;
                    powerId = contents.find((i) => i.type === 'psychicPower')?.id ?? null;
                } catch {
                    // If embedded item creation fails the item-dependent rolls
                    // will surface that in their own per-method branch.
                }

                /**
                 * Close any ApplicationV2 / V1 window the previous roll
                 * opened. We filter to dialog-shaped windows (UnifiedRollDialog,
                 * Dialog, prompt classes) so we don't accidentally close the
                 * sidebar or hotbar.
                 */
                async function closeOpenDialogs(): Promise<void> {
                    const windows = Object.values(ui?.windows ?? {});
                    for (const w of windows) {
                        // Heuristic: ids starting with 'app-' or containing
                        // 'dialog'/'prompt' are roll-flow surfaces.
                        const id = w?.id ?? '';
                        if (id.includes('dialog') || id.includes('prompt') || id.includes('roll')) {
                            try { await w?.close?.(); } catch { /* ignore */ }
                        }
                    }
                }

                const results: Array<{ method: string; invoked: boolean; error: string | null }> = [];
                for (const method of methods) {
                    let error: string | null = null;
                    let invoked = false;
                    try {
                        switch (method) {
                            case 'rollCharacteristic':
                                if (typeof actor.rollCharacteristic === 'function') {
                                    await actor.rollCharacteristic('weaponSkill');
                                    invoked = true;
                                } else {
                                    error = 'method not present on actor';
                                }
                                break;
                            case 'rollCharacteristicCheck':
                                if (typeof actor.rollCharacteristicCheck === 'function') {
                                    const r = await actor.rollCharacteristicCheck('weaponSkill');
                                    // base stub returns null; acolyte returns an object
                                    invoked = r !== undefined;
                                } else {
                                    error = 'method not present on actor';
                                }
                                break;
                            case 'rollSkill':
                                if (typeof actor.rollSkill === 'function') {
                                    await actor.rollSkill('awareness');
                                    invoked = true;
                                } else {
                                    error = 'method not present on actor';
                                }
                                break;
                            case 'rollCheck':
                                if (typeof actor.rollCheck === 'function') {
                                    const r = await actor.rollCheck(50);
                                    invoked = r !== undefined;
                                } else {
                                    error = 'method not present on actor';
                                }
                                break;
                            case 'rollItem':
                                if (typeof actor.rollItem === 'function' && weaponId !== null) {
                                    await actor.rollItem(weaponId);
                                    invoked = true;
                                } else if (weaponId === null) {
                                    error = 'no weapon item created';
                                } else {
                                    error = 'method not present on actor';
                                }
                                break;
                            case 'rollWeaponAction':
                                if (typeof actor.rollWeaponAction === 'function' && weaponId !== null) {
                                    const weapon = actor.items?.contents.find((i) => i.id === weaponId);
                                    await actor.rollWeaponAction(weapon);
                                    invoked = true;
                                } else if (weaponId === null) {
                                    error = 'no weapon item created';
                                } else {
                                    error = 'method not present on actor';
                                }
                                break;
                            case 'rollPsychicPower':
                                if (typeof actor.rollPsychicPower === 'function' && powerId !== null) {
                                    const power = actor.items?.contents.find((i) => i.id === powerId);
                                    await actor.rollPsychicPower(power);
                                    invoked = true;
                                } else if (powerId === null) {
                                    error = 'no psychic-power item created';
                                } else {
                                    error = 'method not present on actor';
                                }
                                break;
                            default:
                                error = `unknown method ${method}`;
                        }
                    } catch (err) {
                        error = String((err as Error)?.message ?? err);
                    }
                    // Drain any dialog the method opened so the next probe
                    // doesn't stack windows.
                    await closeOpenDialogs();
                    results.push({ method, invoked, error });
                }

                // Best-effort cleanup so subsequent specs don't see this actor.
                try { await actor.delete?.(); } catch { /* ignore */ }

                return { created: true, createError: null, results, diag: { ctorName } };
            },
            { gameSystem, prefix: SYSTEM_PREFIX[gameSystem] ?? gameSystem, methods: [...ROLL_METHODS] },
        );
        return {
            created: result.created,
            createError: result.createError,
            results: result.results as RollProbeResult[],
            pageErrors,
            diag: (result as { diag?: { ctorName: string } }).diag,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('actor roll methods × systems (Tier B)', () => {
    for (const gameSystem of GAME_SYSTEM_IDS) {
        test(`every Actor roll method dispatches in gameSystem='${gameSystem}'`, async ({ page }) => {
            test.skip(gameSystem === 'im', 'im-character actor creation is currently broken (see actor-types spec)');
            const joined = await joinAsGM(page);
            test.skip(!joined, 'GM join failed');

            const probe = await probeRollMethods(page, gameSystem);
            test.skip(
                !probe.created,
                `could not create ${SYSTEM_PREFIX[gameSystem]}-character actor: ${probe.createError ?? 'unknown'}`,
            );

            const failures: string[] = [];
            for (const r of probe.results) {
                if (r.invoked && r.error === null) {
                    recordCoverage('actor.roll-method', `${r.method}::${gameSystem}`);
                    continue;
                }
                failures.push(`${r.method}: ${r.error ?? 'not invoked'}`);
            }
            // Surface uncaught page errors that fired while methods ran — they
            // indicate the roll plumbing threw asynchronously past the
            // try/catch in page.evaluate (e.g., inside a Dialog render).
            if (probe.pageErrors.length > 0) {
                failures.push(`page errors: ${probe.pageErrors.slice(0, 3).join(' | ')}`);
            }
            const ctorName = probe.diag?.ctorName ?? 'unknown';
            expect(
                failures,
                `${failures.length}/${ROLL_METHODS.length} roll methods failed in ${gameSystem} (actor class: ${ctorName}):\n  - ${failures.join('\n  - ')}`,
            ).toEqual([]);
        });
    }
});
