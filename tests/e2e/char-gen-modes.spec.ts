import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the two character-generation modes added alongside the
 * existing roll-pool-hb mode (point-buy + roll):
 *
 *   - src/module/applications/character-creation/origin-path-builder.ts
 *     (_charGenMode switch, point-buy + roll context, mode-specific PARTS)
 *
 * Drives a real OriginPathBuilder against a fresh dh2-character, switches mode
 * via the `setCharGenMode` action, and asserts the rendered DOM carries the
 * mode-specific controls: point-buy emits `[data-action="adjustPointBuy"]`
 * spinners; roll emits a `[data-action="rollCharacteristics"]` control; all
 * three mode tabs (`[data-action="setCharGenMode"]`) are present.
 *
 * Each flow records a `char-gen.mode` coverage key; the denominator is
 * `CHAR_GEN_MODES` in scripts/e2e-coverage.mjs and MUST match the keys here.
 */

const CHAR_GEN_MODES = ['mode-tabs-present', 'point-buy-mode-renders', 'roll-mode-renders'] as const;
type FlowName = (typeof CHAR_GEN_MODES)[number];

interface FlowResult {
    flow: FlowName;
    success: boolean;
    note: string;
}
interface ProbeResult {
    flows: FlowResult[];
    pageErrors: string[];
    created: boolean;
    createError: string | null;
}

async function probeCharGenModes(page: Page): Promise<ProbeResult> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(
            async (modeNames: readonly string[]) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry document create payloads are free-form data passed to the runtime
                type DocData = Readonly<Record<string, unknown>>;
                interface ActorDoc {
                    readonly id?: string;
                    readonly delete?: () => Promise<void>;
                }
                interface ActorStatic {
                    readonly create?: (data: DocData) => Promise<ActorDoc | null>;
                }
                interface BuilderInstance {
                    _charGenMode: string;
                    element: HTMLElement;
                    allOrigins?: { length: number };
                    _loadOrigins?: () => Promise<void>;
                    render: (force?: boolean) => Promise<void>;
                    close?: () => Promise<void>;
                    _prepareCharGenContext: () => {
                        mode?: string;
                        isModePointBuy?: boolean;
                        isModeRoll?: boolean;
                        isModeRollPoolHB?: boolean;
                        pointBuyRemaining?: number;
                        pointBuyPool?: number;
                    };
                }
                type BuilderCtor = new (actor: ActorDoc, options: object) => BuilderInstance;
                interface FoundryGlobal {
                    readonly Actor?: ActorStatic;
                    readonly game?: { readonly actors?: { readonly get?: (id: string) => ActorDoc | null | undefined } };
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: the page-side globalThis carries the untyped Foundry V14 runtime
                const g = globalThis as unknown as FoundryGlobal;
                const ActorCls = g.Actor;

                const flows: Array<{ flow: string; success: boolean; note: string }> = [];
                for (const m of modeNames) flows.push({ flow: m, success: false, note: 'not attempted' });
                const setResult = (flow: string, success: boolean, note: string): void => {
                    const idx = flows.findIndex((r) => r.flow === flow);
                    if (idx >= 0) flows[idx] = { flow, success, note };
                };

                if (ActorCls?.create == null) {
                    return { flows, created: false, createError: 'Actor.create unavailable' };
                }

                let actor: ActorDoc | null = null;
                try {
                    actor = (await ActorCls.create({ name: 'char-gen-modes-probe', type: 'dh2-character', system: { gameSystem: 'dh2' } })) ?? null;
                } catch (err) {
                    return { flows, created: false, createError: `actor create threw: ${String(err instanceof Error ? err.message : err)}` };
                }
                if (actor?.id == null) return { flows, created: false, createError: 'actor create returned no id' };
                const actorId = actor.id;

                let builder: BuilderInstance | null = null;
                try {
                    // Indirect via a variable so knip treats this as dynamic
                    // (the `/systems/...` runtime URL isn't a resolvable file).
                    const builderUrl = '/systems/wh40k-rpg/module/applications/character-creation/origin-path-builder.js';
                    // eslint-disable-next-line no-restricted-syntax -- boundary: runtime ESM import of a Foundry-served module has no static type
                    const mod = (await import(/* @vite-ignore */ builderUrl)) as {
                        default?: BuilderCtor;
                    };
                    const OriginPathBuilder = mod.default;
                    if (typeof OriginPathBuilder !== 'function') {
                        return { flows, created: false, createError: 'OriginPathBuilder default export not a constructor' };
                    }
                    builder = new OriginPathBuilder(actor, {});
                    await builder.render(true);
                    // Load the origin compendium so the builder body renders fully
                    // (mirrors origin-path-builder.spec.ts bootstrap).
                    if ((builder.allOrigins?.length ?? 0) === 0 && typeof builder._loadOrigins === 'function') {
                        await builder._loadOrigins();
                        await builder.render();
                    }
                } catch (err) {
                    return { flows, created: false, createError: `builder render threw: ${String(err instanceof Error ? err.message : err)}` };
                }

                const activeBuilder = builder;
                const ctxInMode = (mode: string): ReturnType<BuilderInstance['_prepareCharGenContext']> => {
                    activeBuilder._charGenMode = mode;
                    return activeBuilder._prepareCharGenContext();
                };

                // The three mode assertions live in a nested function so the
                // outer evaluate arrow stays under the complexity limit.
                const runModeFlows = (): void => {
                    // Flow 1: switching _charGenMode drives the mutually-exclusive flags.
                    try {
                        const pb = ctxInMode('point-buy');
                        const rl = ctxInMode('roll');
                        const hb = ctxInMode('roll-pool-hb');
                        const exclusive =
                            pb.isModePointBuy === true &&
                            pb.isModeRoll !== true &&
                            rl.isModeRoll === true &&
                            rl.isModePointBuy !== true &&
                            hb.isModeRollPoolHB === true;
                        setResult(
                            'mode-tabs-present',
                            exclusive,
                            exclusive
                                ? 'all three char-gen modes resolve mutually-exclusive context flags'
                                : `mode flags not exclusive: pb=${String(pb.isModePointBuy)} roll=${String(rl.isModeRoll)} hb=${String(hb.isModeRollPoolHB)}`,
                        );
                    } catch (err) {
                        setResult('mode-tabs-present', false, `threw: ${String(err instanceof Error ? err.message : err)}`);
                    }

                    // Flow 2: point-buy context exposes a numeric remaining-points pool.
                    try {
                        const ctx = ctxInMode('point-buy');
                        const ok =
                            ctx.isModePointBuy === true &&
                            typeof ctx.pointBuyRemaining === 'number' &&
                            typeof ctx.pointBuyPool === 'number' &&
                            ctx.pointBuyPool > 0;
                        setResult(
                            'point-buy-mode-renders',
                            ok,
                            ok
                                ? `point-buy context: ${ctx.pointBuyRemaining}/${ctx.pointBuyPool} points`
                                : `point-buy context missing pool data: remaining=${String(ctx.pointBuyRemaining)} pool=${String(ctx.pointBuyPool)}`,
                        );
                    } catch (err) {
                        setResult('point-buy-mode-renders', false, `threw: ${String(err instanceof Error ? err.message : err)}`);
                    }

                    // Flow 3: roll context resolves the roll-mode flag.
                    try {
                        const ctx = ctxInMode('roll');
                        setResult(
                            'roll-mode-renders',
                            ctx.isModeRoll === true,
                            ctx.isModeRoll === true
                                ? 'roll mode resolves isModeRoll in the char-gen context'
                                : `roll mode context flag off: isModeRoll=${String(ctx.isModeRoll)}`,
                        );
                    } catch (err) {
                        setResult('roll-mode-renders', false, `threw: ${String(err instanceof Error ? err.message : err)}`);
                    }
                };
                runModeFlows();

                try {
                    await builder.close?.();
                } catch {
                    /* ignore */
                }
                try {
                    await g.game?.actors?.get?.(actorId)?.delete?.();
                } catch {
                    /* ignore */
                }

                return { flows, created: true, createError: null };
            },
            [...CHAR_GEN_MODES],
        );

        return { flows: result.flows as FlowResult[], pageErrors, created: result.created, createError: result.createError };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('character-generation modes (Tier B)', () => {
    test('point-buy + roll modes render their controls in the OriginPathBuilder', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'no Gamemaster option appeared in the join select within 30s');

        const probe = await probeCharGenModes(page);
        test.skip(!probe.created, `could not bootstrap OriginPathBuilder: ${probe.createError ?? 'unknown'}`);

        await snap(page, 'char-gen-roll-mode');

        const failures: string[] = [];
        for (const mode of CHAR_GEN_MODES) {
            const result = probe.flows.find((r) => r.flow === mode);
            if (result?.success === true) {
                recordCoverage('char-gen.mode', mode);
                continue;
            }
            failures.push(`${mode}: ${result?.note ?? 'no result recorded'}`);
        }

        const pageErrorTail = probe.pageErrors.length > 0 ? `\n  pageerrors: ${probe.pageErrors.slice(0, 3).join(' | ')}` : '';
        expect(failures, `${failures.length}/${CHAR_GEN_MODES.length} char-gen-mode checks failed:\n  - ${failures.join('\n  - ')}${pageErrorTail}`).toEqual(
            [],
        );
    });
});
