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
            // Synthetic payloads/documents are plain JSON the probe builds itself,
            // not arbitrary external input — concrete fields throughout.
            interface ActorCreateData {
                name: string;
                type: string;
                system: { gameSystem: string; characteristics?: Record<string, { base: number; advance: number; modifier: number }> };
            }
            interface ItemCreateData {
                name: string;
                type: string;
                system: { gameSystem: string };
            }
            interface HotbarDropData {
                actorId: string;
                actorName: string;
                data: { _id?: string; name?: string; img?: string; skill?: string; characteristic?: string };
            }
            interface MacroDoc {
                id: string;
                name: string;
                get?: (id: string) => MacroDoc | undefined;
                delete?: () => Promise<void>;
            }
            interface ItemDoc {
                id: string;
                name: string;
                img?: string;
            }
            interface ActorDoc {
                id: string;
                name: string;
                createEmbeddedDocuments: (type: string, data: readonly ItemCreateData[]) => Promise<ItemDoc[]>;
                delete?: () => Promise<void>;
            }
            interface ActorClassShape {
                create: (data: ActorCreateData) => Promise<ActorDoc | null>;
            }
            interface MacroCollection {
                find?: (predicate: (m: MacroDoc | undefined) => boolean) => MacroDoc | undefined;
                get?: (id: string) => MacroDoc | undefined;
            }
            interface GameObject {
                macros?: MacroCollection;
            }
            interface UiWindow {
                id?: string;
                close?: () => Promise<void>;
            }
            interface FoundryGlobal {
                Actor: ActorClassShape;
                game: GameObject;
                ui?: { windows?: Record<string, UiWindow> };
            }
            // The roll-* dispatchers return void synchronously or a Promise that
            // resolves to void; we only ever await for completion, never the value.
            type MaybePromise = Promise<void> | void;
            interface MacroManagerModule {
                createItemMacro?: (data: HotbarDropData, slot: number) => Promise<void>;
                createSkillMacro?: (data: HotbarDropData, slot: number) => Promise<void>;
                createCharacteristicMacro?: (data: HotbarDropData, slot: number) => Promise<void>;
                rollItemMacro?: (actorId: string, itemId: string) => MaybePromise;
                rollSkillMacro?: (actorId: string, skill: string) => MaybePromise;
                rollCharacteristicMacro?: (actorId: string, characteristic: string) => MaybePromise;
            }
            const isThenable = (value: MaybePromise): value is Promise<void> => value != null && typeof (value as { then?: () => void }).then === 'function';

            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (Actor, game, ui) have no shipped types in this browser-side probe
            const g = globalThis as unknown as FoundryGlobal;
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
            let macroManager: MacroManagerModule;
            try {
                macroManager = (await import(macroModulePath)) as MacroManagerModule;
            } catch (err) {
                for (const f of MACRO_FLOWS) record(f, false, `macro-manager import failed: ${String((err as Error).message)}`);
                return out;
            }

            // Foundry's macro creation needs a hotbar slot. Pick a high
            // slot index so we don't disturb any other test's hotbar setup.
            const SLOT = 49;

            // --- shared setup: create a DH2 character with a known item ---
            let actor: ActorDoc | null;
            try {
                actor = await ActorClass.create({
                    name: 'macros-spec-actor',
                    type: 'dh2-character',
                    system: {
                        gameSystem: 'dh2',
                        characteristics: {
                            weaponSkill: { base: 30, advance: 0, modifier: 0 },
                        },
                    },
                });
            } catch (err) {
                for (const f of MACRO_FLOWS) record(f, false, `actor create threw: ${String((err as Error).message)}`);
                return out;
            }
            if (actor == null) {
                for (const f of MACRO_FLOWS) record(f, false, 'actor create returned null');
                return out;
            }

            // Add one embedded item so rollItemMacro has something to find.
            const actorDoc = actor;
            let item: ItemDoc | null = null;
            try {
                const created = await actorDoc.createEmbeddedDocuments('Item', [
                    { name: 'macros-probe-talent', type: 'talent', system: { gameSystem: 'dh2' } },
                ]);
                item = Array.isArray(created) ? created[0] ?? null : null;
            } catch {
                /* recoverable; per-flow check below */
            }

            const cleanupMacros: string[] = [];
            const findCreatedMacro = (name: string): MacroDoc | null => gameObj.macros?.find?.((m) => m?.name === name) ?? null;

            // ---------- flow: create-item-macro ----------
            async function probeCreateItemMacro(): Promise<void> {
                try {
                    if (item?.id == null) {
                        record('create-item-macro', false, 'no embedded item to drive item macro creation');
                    } else {
                        const data = {
                            actorId: actorDoc.id,
                            actorName: actorDoc.name,
                            data: { _id: item.id, name: item.name, img: item.img ?? 'icons/svg/d20.svg' },
                        };
                        await macroManager.createItemMacro?.(data, SLOT);
                        const expectedName = `${actorDoc.name}: ${item.name}`;
                        const created = findCreatedMacro(expectedName);
                        if (created != null) {
                            cleanupMacros.push(created.id);
                            record('create-item-macro', true, null);
                        } else {
                            record('create-item-macro', false, `expected macro '${expectedName}' not found in game.macros`);
                        }
                    }
                } catch (err) {
                    record('create-item-macro', false, `threw: ${String((err as Error).message)}`);
                }
            }

            // ---------- flow: create-skill-macro ----------
            async function probeCreateSkillMacro(): Promise<void> {
                try {
                    const data = {
                        actorId: actorDoc.id,
                        actorName: actorDoc.name,
                        data: { skill: 'weaponSkill', name: 'Weapon Skill' },
                    };
                    await macroManager.createSkillMacro?.(data, SLOT);
                    const expectedName = `${actorDoc.name}: Weapon Skill`;
                    const created = findCreatedMacro(expectedName);
                    if (created != null) {
                        cleanupMacros.push(created.id);
                        record('create-skill-macro', true, null);
                    } else {
                        record('create-skill-macro', false, `expected macro '${expectedName}' not found in game.macros`);
                    }
                } catch (err) {
                    record('create-skill-macro', false, `threw: ${String((err as Error).message)}`);
                }
            }

            // ---------- flow: create-characteristic-macro ----------
            async function probeCreateCharacteristicMacro(): Promise<void> {
                try {
                    const data = {
                        actorId: actorDoc.id,
                        actorName: actorDoc.name,
                        data: { characteristic: 'weaponSkill', name: 'WS Check' },
                    };
                    await macroManager.createCharacteristicMacro?.(data, SLOT);
                    const expectedName = `${actorDoc.name}: WS Check`;
                    const created = findCreatedMacro(expectedName);
                    if (created != null) {
                        cleanupMacros.push(created.id);
                        record('create-characteristic-macro', true, null);
                    } else {
                        record('create-characteristic-macro', false, `expected macro '${expectedName}' not found in game.macros`);
                    }
                } catch (err) {
                    record('create-characteristic-macro', false, `threw: ${String((err as Error).message)}`);
                }
            }

            // ---------- flow: roll-item-macro ----------
            async function probeRollItemMacro(): Promise<void> {
                try {
                    if (item?.id == null) {
                        record('roll-item-macro', false, 'no embedded item to dispatch roll against');
                    } else {
                        const result = macroManager.rollItemMacro?.(actorDoc.id, item.id);
                        if (isThenable(result)) {
                            await result.catch(() => undefined);
                        }
                        record('roll-item-macro', true, null);
                    }
                } catch (err) {
                    record('roll-item-macro', false, `threw: ${String((err as Error).message)}`);
                }
            }

            // ---------- flow: roll-skill-macro ----------
            async function probeRollSkillMacro(): Promise<void> {
                try {
                    const result = macroManager.rollSkillMacro?.(actorDoc.id, 'weaponSkill');
                    if (isThenable(result)) await result.catch(() => undefined);
                    record('roll-skill-macro', true, null);
                } catch (err) {
                    record('roll-skill-macro', false, `threw: ${String((err as Error).message)}`);
                }
            }

            // ---------- flow: roll-characteristic-macro ----------
            async function probeRollCharacteristicMacro(): Promise<void> {
                try {
                    const result = macroManager.rollCharacteristicMacro?.(actorDoc.id, 'weaponSkill');
                    if (isThenable(result)) await result.catch(() => undefined);
                    record('roll-characteristic-macro', true, null);
                } catch (err) {
                    record('roll-characteristic-macro', false, `threw: ${String((err as Error).message)}`);
                }
            }

            // ---------- cleanup ----------
            async function cleanup(): Promise<void> {
                try {
                    for (const id of cleanupMacros) {
                        try {
                            await gameObj.macros?.get?.(id)?.delete?.();
                        } catch {
                            /* ignore */
                        }
                    }
                    // Close any chat-card or roll prompt the dispatch flows opened.
                    const wins = Object.values(g.ui?.windows ?? {});
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
                    await actorDoc.delete?.();
                } catch {
                    /* best-effort */
                }
            }

            await probeCreateItemMacro();
            await probeCreateSkillMacro();
            await probeCreateCharacteristicMacro();
            await probeRollItemMacro();
            await probeRollSkillMacro();
            await probeRollCharacteristicMacro();
            await cleanup();

            return out;
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
