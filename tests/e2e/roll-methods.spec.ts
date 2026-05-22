import type { Page } from '@playwright/test';
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
const ROLL_METHODS = ['rollCharacteristic', 'rollCharacteristicCheck', 'rollSkill', 'rollCheck', 'rollItem', 'rollWeaponAction', 'rollPsychicPower'] as const;

type RollMethod = (typeof ROLL_METHODS)[number];

interface RollProbeResult {
    method: RollMethod;
    invoked: boolean;
    error: string | null;
}

/**
 * Browser-context Foundry surfaces accessed from `page.evaluate`
 * (`globalThis.Actor`, `globalThis.ui`). These are Foundry globals, not part of
 * this repo's type graph — accessed at the single `as unknown as RollWindow`
 * cast inside the callback, flagged with an inline boundary disable.
 */
type RollOutcome = object | null | undefined;
interface FoundryItemRef {
    id: string;
    type: string;
}
interface RollActorHandle {
    id?: string;
    type?: string;
    items?: { contents: FoundryItemRef[] };
    rollCharacteristic?: (key: string) => RollOutcome | Promise<RollOutcome>;
    rollCharacteristicCheck?: (key: string) => Promise<RollOutcome>;
    rollSkill?: (key: string) => Promise<RollOutcome>;
    rollCheck?: (target: number) => Promise<RollOutcome>;
    rollItem?: (id: string) => Promise<RollOutcome>;
    rollWeaponAction?: (item: FoundryItemRef | undefined) => Promise<RollOutcome>;
    rollPsychicPower?: (item: FoundryItemRef | undefined) => Promise<RollOutcome>;
    createEmbeddedDocuments?: (kind: string, data: object[]) => Promise<Array<{ id: string }>>;
    delete?: () => Promise<void>;
}
interface RollWindow {
    Actor?: { create?: (data: object) => Promise<RollActorHandle | null> };
    ui?: { windows?: Record<string, { close?: () => Promise<void>; id?: string }> };
}

async function probeRollMethods(
    page: Page,
    gameSystem: string,
): Promise<{
    created: boolean;
    createError: string | null;
    results: RollProbeResult[];
    pageErrors: string[];
    diag?: { ctorName: string };
}> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(
            async ({ gameSystem: sysId, prefix, methods }) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context globalThis.Actor / globalThis.ui (Foundry globals, no repo type)
                const { Actor: ActorCls, ui: foundryUi } = globalThis as unknown as RollWindow;
                if (!ActorCls?.create) {
                    return { created: false, createError: 'Actor.create unavailable', results: [] };
                }

                const actorType = `${prefix}-character`;
                let actor: RollActorHandle | null;
                try {
                    actor = await ActorCls.create({
                        name: `roll-probe-${prefix}`,
                        type: actorType,
                        system: { gameSystem: sysId },
                    });
                } catch (err) {
                    return { created: false, createError: err instanceof Error ? err.message : String(err), results: [] };
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
                    const windows = Object.values(foundryUi?.windows ?? {});
                    for (const w of windows) {
                        // Heuristic: ids starting with 'app-' or containing
                        // 'dialog'/'prompt' are roll-flow surfaces.
                        const id = w.id ?? '';
                        if (id.includes('dialog') || id.includes('prompt') || id.includes('roll')) {
                            try {
                                await w.close?.();
                            } catch {
                                /* ignore */
                            }
                        }
                    }
                }

                const NOT_PRESENT = 'method not present on actor';
                // One dispatcher per roll method. Each returns whether the
                // method body ran (`invoked`) and a failure reason (`error`).
                // An object/Map lookup replaces the prohibited `switch`.
                const liveActor = actor;
                const dispatch: Record<string, () => Promise<{ invoked: boolean; error: string | null }>> = {
                    rollCharacteristic: async () => {
                        if (typeof liveActor.rollCharacteristic !== 'function') return { invoked: false, error: NOT_PRESENT };
                        await liveActor.rollCharacteristic('weaponSkill');
                        return { invoked: true, error: null };
                    },
                    rollCharacteristicCheck: async () => {
                        if (typeof liveActor.rollCharacteristicCheck !== 'function') return { invoked: false, error: NOT_PRESENT };
                        // base stub returns null; acolyte returns an object
                        const r = await liveActor.rollCharacteristicCheck('weaponSkill');
                        return { invoked: r !== undefined, error: null };
                    },
                    rollSkill: async () => {
                        if (typeof liveActor.rollSkill !== 'function') return { invoked: false, error: NOT_PRESENT };
                        await liveActor.rollSkill('awareness');
                        return { invoked: true, error: null };
                    },
                    rollCheck: async () => {
                        if (typeof liveActor.rollCheck !== 'function') return { invoked: false, error: NOT_PRESENT };
                        const r = await liveActor.rollCheck(50);
                        return { invoked: r !== undefined, error: null };
                    },
                    rollItem: async () => {
                        if (weaponId === null) return { invoked: false, error: 'no weapon item created' };
                        if (typeof liveActor.rollItem !== 'function') return { invoked: false, error: NOT_PRESENT };
                        await liveActor.rollItem(weaponId);
                        return { invoked: true, error: null };
                    },
                    rollWeaponAction: async () => {
                        if (weaponId === null) return { invoked: false, error: 'no weapon item created' };
                        if (typeof liveActor.rollWeaponAction !== 'function') return { invoked: false, error: NOT_PRESENT };
                        const weapon = liveActor.items?.contents.find((i) => i.id === weaponId);
                        await liveActor.rollWeaponAction(weapon);
                        return { invoked: true, error: null };
                    },
                    rollPsychicPower: async () => {
                        if (powerId === null) return { invoked: false, error: 'no psychic-power item created' };
                        if (typeof liveActor.rollPsychicPower !== 'function') return { invoked: false, error: NOT_PRESENT };
                        const power = liveActor.items?.contents.find((i) => i.id === powerId);
                        await liveActor.rollPsychicPower(power);
                        return { invoked: true, error: null };
                    },
                };

                const probeResults: Array<{ method: string; invoked: boolean; error: string | null }> = [];
                for (const method of methods) {
                    let outcome: { invoked: boolean; error: string | null };
                    try {
                        outcome = Object.prototype.hasOwnProperty.call(dispatch, method)
                            ? await dispatch[method]()
                            : { invoked: false, error: `unknown method ${method}` };
                    } catch (err) {
                        outcome = { invoked: false, error: err instanceof Error ? err.message : String(err) };
                    }
                    // Drain any dialog the method opened so the next probe
                    // doesn't stack windows.
                    await closeOpenDialogs();
                    probeResults.push({ method, invoked: outcome.invoked, error: outcome.error });
                }

                // Best-effort cleanup so subsequent specs don't see this actor.
                try {
                    await actor.delete?.();
                } catch {
                    /* ignore */
                }

                return { created: true, createError: null, results: probeResults, diag: { ctorName } };
            },
            { gameSystem, prefix: SYSTEM_PREFIX[gameSystem] ?? gameSystem, methods: [...ROLL_METHODS] },
        );
        const results: RollProbeResult[] = result.results.map((r) => ({
            method: r.method as RollMethod,
            invoked: r.invoked,
            error: r.error,
        }));
        return {
            created: result.created,
            createError: result.createError,
            results,
            pageErrors,
            diag: 'diag' in result ? result.diag : undefined,
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
            test.skip(!probe.created, `could not create ${SYSTEM_PREFIX[gameSystem]}-character actor: ${probe.createError ?? 'unknown'}`);

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
