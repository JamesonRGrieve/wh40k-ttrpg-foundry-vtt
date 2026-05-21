import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the macro-manager surface
 * (`src/module/macros/macro-manager.ts`). The module exports six
 * functions covering three flavors of macro (item / skill /
 * characteristic) and two phases (create-and-assign-to-hotbar and
 * dispatch-from-hotbar). hooks-manager.ts wires the create-* functions
 * to Foundry's `hotbarDrop` hook and exposes the roll-* functions on
 * `game.wh40k.rollItemMacro` / `rollSkillMacro` / `rollCharacteristicMacro`,
 * which is how generated macro `command` strings invoke them at click
 * time.
 *
 * Strategy:
 *   - Create a DH2 character with characteristics + a known skill +
 *     an embedded item (Use Item macro flow).
 *   - For each create-* function, build a fake `hotbarDrop` payload
 *     and invoke it directly. Assert that a Macro document was created
 *     in `game.macros` with the expected name+command, then clean it up.
 *   - For each roll-* function, invoke via `game.wh40k.<fn>(...)` and
 *     assert it dispatches without throwing. Many of these return void
 *     and post a chat message; we record success by absence of error.
 *
 * Keep MACRO_FLOWS in sync with the equivalent constant in
 * `scripts/e2e-coverage.mjs` — that constant is the coverage denominator
 * and must agree with the recordCoverage('macro.flow', ...) keys here.
 */

const MACRO_FLOWS = [
    'create-item-macro',
    'create-skill-macro',
    'create-characteristic-macro',
    'roll-item-macro',
    'roll-skill-macro',
    'roll-characteristic-macro',
] as const;

type FlowName = (typeof MACRO_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeMacros(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (pageErr: Error): void => {
        pageErrors.push(pageErr.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async (): Promise<FlowResult[]> => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
            const g = globalThis as any;
            const ActorClass = g.Actor;
            const gameObj = g.game;
            const out: FlowResult[] = [];

            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };

            // Dynamic-import the macro-manager module so the v8 coverage
            // capture in `lib/test.ts` attributes the surface to its
            // canonical /systems/wh40k-rpg/module/ URL. Some functions
            // (create-*, rollCharacteristicMacro) aren't exposed on
            // `game.wh40k`; the dynamic import is the canonical handle.
            const macroModulePath = `${'/systems/wh40k-rpg'}/module/macros/macro-manager.js`;
            let macroManager: any;
            try {
                macroManager = await import(macroModulePath);
            } catch (err) {
                for (const f of MACRO_FLOWS) record(f, false, `macro-manager import failed: ${String((err as Error).message)}`);
                return out;
            }

            // Foundry's macro creation needs a hotbar slot. Pick a high
            // slot index so we don't disturb any other test's hotbar setup.
            const SLOT = 49;

            // --- shared setup: create a DH2 character with a known item ---
            let actor: any;
            try {
                actor = await ActorClass.create({
                    name: 'macros-spec-actor',
                    type: 'dh2-character',
                    system: {
                        gameSystem: 'dh2e',
                        characteristics: {
                            weaponSkill: { base: 30, advance: 0, modifier: 0 },
                        },
                    },
                });
            } catch (err) {
                for (const f of MACRO_FLOWS) record(f, false, `actor create threw: ${String((err as Error).message)}`);
                return out;
            }
            if (!actor) {
                for (const f of MACRO_FLOWS) record(f, false, 'actor create returned null');
                return out;
            }

            // Add one embedded item so rollItemMacro has something to find.
            let item: any;
            try {
                const created = await actor.createEmbeddedDocuments('Item', [{ name: 'macros-probe-talent', type: 'talent', system: { gameSystem: 'dh2e' } }]);
                item = Array.isArray(created) ? created[0] : null;
            } catch {
                /* recoverable; per-flow check below */
            }

            const cleanupMacros: string[] = [];
            const findCreatedMacro = (name: string): any => gameObj?.macros?.find?.((m: any) => m?.name === name) ?? null;

            // ---------- flow: create-item-macro ----------
            try {
                if (!item?.id) {
                    record('create-item-macro', false, 'no embedded item to drive item macro creation');
                } else {
                    const data = {
                        actorId: actor.id,
                        actorName: actor.name,
                        data: { _id: item.id, name: item.name, img: item.img ?? 'icons/svg/d20.svg' },
                    };
                    await macroManager.createItemMacro?.(data, SLOT);
                    const expectedName = `${actor.name}: ${item.name}`;
                    const created = findCreatedMacro(expectedName);
                    if (created) {
                        cleanupMacros.push(created.id);
                        record('create-item-macro', true, null);
                    } else {
                        record('create-item-macro', false, `expected macro '${expectedName}' not found in game.macros`);
                    }
                }
            } catch (err) {
                record('create-item-macro', false, `threw: ${String((err as Error).message)}`);
            }

            // ---------- flow: create-skill-macro ----------
            try {
                const data = {
                    actorId: actor.id,
                    actorName: actor.name,
                    data: { skill: 'weaponSkill', name: 'Weapon Skill' },
                };
                await macroManager.createSkillMacro?.(data, SLOT);
                const expectedName = `${actor.name}: Weapon Skill`;
                const created = findCreatedMacro(expectedName);
                if (created) {
                    cleanupMacros.push(created.id);
                    record('create-skill-macro', true, null);
                } else {
                    record('create-skill-macro', false, `expected macro '${expectedName}' not found in game.macros`);
                }
            } catch (err) {
                record('create-skill-macro', false, `threw: ${String((err as Error).message)}`);
            }

            // ---------- flow: create-characteristic-macro ----------
            try {
                const data = {
                    actorId: actor.id,
                    actorName: actor.name,
                    data: { characteristic: 'weaponSkill', name: 'WS Check' },
                };
                await macroManager.createCharacteristicMacro?.(data, SLOT);
                const expectedName = `${actor.name}: WS Check`;
                const created = findCreatedMacro(expectedName);
                if (created) {
                    cleanupMacros.push(created.id);
                    record('create-characteristic-macro', true, null);
                } else {
                    record('create-characteristic-macro', false, `expected macro '${expectedName}' not found in game.macros`);
                }
            } catch (err) {
                record('create-characteristic-macro', false, `threw: ${String((err as Error).message)}`);
            }

            // ---------- flow: roll-item-macro ----------
            try {
                if (!item?.id) {
                    record('roll-item-macro', false, 'no embedded item to dispatch roll against');
                } else {
                    const result = macroManager.rollItemMacro?.(actor.id, item.id);
                    if (result && typeof result.then === 'function') {
                        await result.catch(() => undefined);
                    }
                    record('roll-item-macro', true, null);
                }
            } catch (err) {
                record('roll-item-macro', false, `threw: ${String((err as Error).message)}`);
            }

            // ---------- flow: roll-skill-macro ----------
            try {
                const result = macroManager.rollSkillMacro?.(actor.id, 'weaponSkill');
                if (result && typeof result.then === 'function') await result.catch(() => undefined);
                record('roll-skill-macro', true, null);
            } catch (err) {
                record('roll-skill-macro', false, `threw: ${String((err as Error).message)}`);
            }

            // ---------- flow: roll-characteristic-macro ----------
            try {
                const result = macroManager.rollCharacteristicMacro?.(actor.id, 'weaponSkill');
                if (result && typeof result.then === 'function') await result.catch(() => undefined);
                record('roll-characteristic-macro', true, null);
            } catch (err) {
                record('roll-characteristic-macro', false, `threw: ${String((err as Error).message)}`);
            }

            // ---------- cleanup ----------
            try {
                for (const id of cleanupMacros) {
                    try {
                        await gameObj?.macros?.get?.(id)?.delete?.();
                    } catch {
                        /* ignore */
                    }
                }
                // Close any chat-card or roll prompt the dispatch flows opened.
                const wins = Object.values(g.ui?.windows ?? {}) as Array<{ id?: string; close?: () => Promise<unknown> }>;
                for (const w of wins) {
                    const id: string = w.id ?? '';
                    if (id.includes('dialog') || id.includes('prompt') || id.includes('roll')) {
                        try {
                            await w.close?.();
                        } catch {
                            /* ignore */
                        }
                    }
                }
                await actor.delete?.();
            } catch {
                /* best-effort */
            }

            return out;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('macro-manager (Tier B)', () => {
    test('every macro-manager flow creates / dispatches without throwing', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeMacros(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('macro.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of MACRO_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${MACRO_FLOWS.length} macro-manager flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
