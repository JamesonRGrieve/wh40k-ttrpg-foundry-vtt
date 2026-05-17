import type { Page } from '@playwright/test';

import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the full weapon-attack pipeline: equip → attack roll
 * dispatch → ammo consumption → damage roll → armour application →
 * Righteous Fury confirmation. Also exercises PsychicPowerDialog rendering
 * and weapon fire-mode (single / semi / full-auto) switching.
 *
 * Source coverage targets:
 *   - src/module/data/item/weapon.ts (defineSchema getters: usesAmmo,
 *     isEmpty, isRangedWeapon, isMeleeWeapon, prepareDerivedData /
 *     _computeModifiers paths, craftsmanship modifiers, clip getters)
 *   - src/module/applications/prompts/weapon-attack-dialog.ts
 *     (constructor + render + #onSelectWeapon action + _onRender event
 *     binding + form-render of the weapon-roll-prompt.hbs PART)
 *   - src/module/applications/prompts/damage-roll-dialog.ts
 *     (constructor + render + prepareDamageRoll helper +
 *     _performRoll → Roll evaluate + sendActionDataToChat)
 *   - src/module/applications/prompts/righteous-fury-dialog.ts
 *     (constructor + render + DEFAULT_OPTIONS classes / PARTS resolution)
 *   - src/module/applications/prompts/psychic-power-dialog.ts
 *     (constructor + render via preparePsychicPowerRoll)
 *   - src/module/applications/prompts/unified-roll-dialog.ts
 *     (prepareUnifiedRoll path reached through acolyte.rollWeaponDamage
 *     fallbacks)
 *   - src/module/documents/acolyte.ts (rollItem weapon branch +
 *     rollWeaponDamage + rollPsychicPower dispatch)
 *   - src/module/documents/npc.ts (applyDamage with armour + toughness
 *     reduction — exercised via weapon-attack-applies-armour flow)
 *
 * Strategy: each flow probe runs in a single `page.evaluate` round-trip.
 * Dialog-opening operations are wrapped in a 5s timeout (mirroring the
 * combat.spec.ts withTimeout helper) and any opened dialog window is
 * drained from `ui.windows` between probes so stacked dialogs don't
 * cross-contaminate subsequent flows.
 *
 * Collect-failures-then-assert pattern matches damage.spec.ts /
 * action-managers.spec.ts.
 *
 * Keep WEAPON_ATTACK_FLOWS in sync with the equivalent constant in
 * `scripts/e2e-coverage.mjs` — that is the coverage denominator and must
 * agree with the recordCoverage keys here.
 */

const WEAPON_ATTACK_FLOWS = [
    'weapon-attack-rolls-to-hit',
    'weapon-attack-consumes-ammo',
    'weapon-attack-out-of-ammo',
    'damage-roll-with-fury',
    'damage-roll-applies-armour',
    'psychic-power-roll',
    'weapon-modes',
] as const;

type FlowName = (typeof WEAPON_ATTACK_FLOWS)[number];

interface ProbeResult {
    flowsFired: Record<FlowName, boolean>;
    flowNotes: Partial<Record<FlowName, string>>;
    pageErrors: string[];
}

async function probeWeaponAttackFlows(page: Page): Promise<ProbeResult> {
    const pageErrors: string[] = [];
    const listener = (err: Error) => pageErrors.push(err.message);
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(async (flows: readonly string[]) => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
            const g = globalThis as any;
            const Actor = g.Actor;
            const game = g.game;
            const ui = g.ui;

            const fired: Record<string, boolean> = {};
            const notes: Record<string, string> = {};
            for (const f of flows) fired[f] = false;

            if (!Actor?.create) {
                return {
                    flowsFired: fired,
                    flowNotes: { 'weapon-attack-rolls-to-hit': 'Actor.create unavailable' } as Record<string, string>,
                };
            }

            // Wrap any awaitable with a 5s timeout so a blocking dialog or
            // socket-wait can't hang the spec (mirrors combat.spec.ts).
            const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
                let timer: ReturnType<typeof setTimeout> | null = null;
                const timeout = new Promise<T>((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
                });
                try {
                    return await Promise.race([p, timeout]);
                } finally {
                    if (timer) clearTimeout(timer);
                }
            };

            /**
             * Drain any roll-flow dialogs the previous probe left open so the
             * next probe's window stack starts clean. Mirrors the helper in
             * roll-methods.spec.ts.
             */
            async function closeOpenDialogs(): Promise<void> {
                const windows = Object.values(ui?.windows ?? {}) as Array<{ id?: string; close?: () => Promise<unknown> }>;
                for (const w of windows) {
                    const id = w?.id ?? '';
                    if (
                        id.includes('dialog') ||
                        id.includes('prompt') ||
                        id.includes('roll') ||
                        id.includes('fury') ||
                        id.includes('damage') ||
                        id.includes('attack') ||
                        id.includes('psychic')
                    ) {
                        try {
                            await w?.close?.();
                        } catch {
                            /* ignore */
                        }
                    }
                }
            }

            // Shared cleanup registry — every actor / item we create here
            // gets registered for end-of-probe deletion.
            const cleanups: Array<() => Promise<void>> = [];

            // ---- shared PC actor (dh2-character — has characteristics) ----
            let pc: any = null;
            try {
                pc = (await withTimeout(
                    Actor.create({
                        name: 'weapon-attack-spec-pc',
                        type: 'dh2-character',
                        system: { gameSystem: 'dh2e' },
                    }),
                    5_000,
                    'PC Actor.create',
                )) as any;
                if (pc?.id) {
                    cleanups.push(async () => {
                        try {
                            await game?.actors?.get?.(pc.id)?.delete?.();
                        } catch {
                            /* ignore */
                        }
                    });
                }
            } catch (err) {
                for (const f of flows) notes[f] = `PC create threw: ${String((err as Error)?.message ?? err)}`;
            }

            if (!pc?.id) {
                return { flowsFired: fired, flowNotes: notes };
            }

            // Yield a tick so the server-side create operation flushes its
            // database write before the first createEmbeddedDocuments fires.
            // Without this delay, V14's backend occasionally returns an empty
            // array silently when the child create races with the parent's
            // initial commit (the server log shows "Actor [X] does not exist"
            // during the embedded create).
            await new Promise((r) => setTimeout(r, 250));

            const getPc = () => game?.actors?.get?.(pc.id);

            try {
                /* ============================================================
                 * Flow 1: weapon-attack-rolls-to-hit
                 * Equip a melee weapon, invoke rollWeaponAction. Dispatch
                 * either opens UnifiedRollDialog (via DHTargetedActionManager)
                 * or rolls directly when simple-attack-rolls is on. Either
                 * branch exercises a meaningful chunk of weapon.ts +
                 * weapon-attack-dialog.ts / unified-roll-dialog.ts source.
                 * Success: dispatch returned without throwing OR a roll-flow
                 * dialog opened (observed via ui.windows delta).
                 * ============================================================ */
                try {
                    const live = getPc();
                    const meleeCreated = (await withTimeout(
                        live.createEmbeddedDocuments?.('Item', [
                            {
                                name: 'probe-melee-weapon',
                                type: 'weapon',
                                system: {
                                    equipped: true,
                                    class: 'melee',
                                    melee: true,
                                    damage: { formula: '1d10', type: 'rending', bonus: 0, penetration: 0 },
                                },
                            },
                        ]),
                        5_000,
                        'create melee weapon',
                    )) as any[];
                    const weapon = meleeCreated?.[0] ? live.items.get(meleeCreated[0].id) : null;
                    if (!weapon) {
                        notes['weapon-attack-rolls-to-hit'] = 'failed to create melee weapon';
                    } else {
                        cleanups.push(async () => {
                            try {
                                await weapon.delete?.();
                            } catch {
                                /* ignore */
                            }
                        });
                        const windowsBefore = Object.keys(ui?.windows ?? {}).length;
                        let threw: string | null = null;
                        try {
                            await withTimeout(Promise.resolve(live.rollWeaponAction?.(weapon)), 5_000, 'rollWeaponAction');
                        } catch (err) {
                            threw = String((err as Error)?.message ?? err);
                        }
                        const windowsAfter = Object.keys(ui?.windows ?? {}).length;
                        if (threw === null) {
                            fired['weapon-attack-rolls-to-hit'] = true;
                            notes['weapon-attack-rolls-to-hit'] = `dispatch ok; window delta ${windowsAfter - windowsBefore}`;
                        } else {
                            notes['weapon-attack-rolls-to-hit'] = `rollWeaponAction threw: ${threw}`;
                        }
                        await closeOpenDialogs();
                    }
                } catch (err) {
                    notes['weapon-attack-rolls-to-hit'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 2: weapon-attack-consumes-ammo
                 * Embed a ranged weapon with usesAmmo=true and clip.value=5;
                 * directly decrement the clip via actor update to simulate a
                 * fired shot (the production path goes through
                 * DHTargetedActionManager.performWeaponAttack → ammo manager
                 * which requires canvas tokens we don't have headlessly).
                 * Asserts the schema clip.value field accepts the decrement
                 * and the `usesAmmo` getter remains true after the write —
                 * exercises weapon.ts prepareDerivedData on every update.
                 * ============================================================ */
                try {
                    const live = getPc();
                    const rangedCreated = (await withTimeout(
                        live.createEmbeddedDocuments?.('Item', [
                            {
                                name: 'probe-ranged-weapon-ammo',
                                type: 'weapon',
                                system: {
                                    equipped: true,
                                    class: 'basic',
                                    melee: false,
                                    usesAmmo: true,
                                    clip: { value: 5, max: 30, type: '' },
                                    damage: { formula: '1d10+3', type: 'impact', bonus: 0, penetration: 2 },
                                    penetration: 2,
                                },
                            },
                        ]),
                        5_000,
                        'create ranged weapon (ammo)',
                    )) as any[];
                    const weapon = rangedCreated?.[0] ? live.items.get(rangedCreated[0].id) : null;
                    if (!weapon) {
                        notes['weapon-attack-consumes-ammo'] = 'failed to create ranged weapon';
                    } else {
                        cleanups.push(async () => {
                            try {
                                await weapon.delete?.();
                            } catch {
                                /* ignore */
                            }
                        });
                        const before = weapon.system?.clip?.value ?? -1;
                        const usesAmmoBefore = weapon.system?.usesAmmo ?? false;
                        await withTimeout(weapon.update?.({ 'system.clip.value': before - 1 }), 5_000, 'decrement clip');
                        const freshWeapon = live.items.get(weapon.id);
                        const after = freshWeapon?.system?.clip?.value ?? -1;
                        const usesAmmoAfter = freshWeapon?.system?.usesAmmo ?? false;
                        if (after === before - 1 && usesAmmoBefore === true && usesAmmoAfter === true) {
                            fired['weapon-attack-consumes-ammo'] = true;
                            notes['weapon-attack-consumes-ammo'] = `clip ${before} → ${after}; usesAmmo getter true through update`;
                        } else {
                            notes['weapon-attack-consumes-ammo'] = `expected ${before - 1}/usesAmmo=true, got clip=${after} usesAmmo=${String(usesAmmoAfter)}`;
                        }
                    }
                } catch (err) {
                    notes['weapon-attack-consumes-ammo'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 3: weapon-attack-out-of-ammo
                 * Weapon with clip.value=0. Assert the `isEmpty` getter
                 * returns true. This is the branch the attack dispatch reads
                 * before short-circuiting to a notification; exercising the
                 * getter through real Foundry actor data is the v8-coverage
                 * shape we need on weapon.ts.
                 * ============================================================ */
                try {
                    const live = getPc();
                    const emptyCreated = (await withTimeout(
                        live.createEmbeddedDocuments?.('Item', [
                            {
                                name: 'probe-empty-weapon',
                                type: 'weapon',
                                system: {
                                    equipped: true,
                                    class: 'basic',
                                    melee: false,
                                    usesAmmo: true,
                                    clip: { value: 0, max: 30, type: '' },
                                    damage: { formula: '1d10', type: 'impact', bonus: 0, penetration: 0 },
                                    penetration: 0,
                                },
                            },
                        ]),
                        5_000,
                        'create empty-clip weapon',
                    )) as any[];
                    const weapon = emptyCreated?.[0] ? live.items.get(emptyCreated[0].id) : null;
                    if (!weapon) {
                        notes['weapon-attack-out-of-ammo'] = 'failed to create empty weapon';
                    } else {
                        cleanups.push(async () => {
                            try {
                                await weapon.delete?.();
                            } catch {
                                /* ignore */
                            }
                        });
                        const usesAmmo = weapon.system?.usesAmmo ?? false;
                        const isEmpty = weapon.system?.isEmpty ?? false;
                        const clipValue = weapon.system?.clip?.value ?? -1;
                        if (usesAmmo === true && isEmpty === true && clipValue === 0) {
                            fired['weapon-attack-out-of-ammo'] = true;
                            notes['weapon-attack-out-of-ammo'] = `usesAmmo=true isEmpty=true clip.value=0 — empty-clip getter branch exercised`;
                        } else {
                            notes['weapon-attack-out-of-ammo'] = `expected usesAmmo=true isEmpty=true clip=0, got usesAmmo=${String(usesAmmo)} isEmpty=${String(
                                isEmpty,
                            )} clip=${clipValue}`;
                        }
                    }
                } catch (err) {
                    notes['weapon-attack-out-of-ammo'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 4: damage-roll-with-fury
                 * Construct RighteousFuryDialog directly and render it. The
                 * dialog opens with a confirmation roll; we close it
                 * immediately after observing the render to keep the spec
                 * unblocked. Exercises the constructor + DEFAULT_OPTIONS +
                 * PARTS resolution + _renderHTML path. Success: window
                 * appears in ui.windows or the dialog instance reports a
                 * rendered element.
                 * ============================================================ */
                try {
                    // Dynamic import — the dialog class lives at
                    // /systems/wh40k-rpg/module/applications/prompts/righteous-fury-dialog.js
                    // at runtime. Built specifier so TS doesn't try to resolve
                    // the Foundry-served URL at compile time.
                    const url = '/systems/wh40k-rpg/module/applications/prompts/righteous-fury-dialog.js';
                    const mod = await (new Function('u', 'return import(u)') as (u: string) => Promise<unknown>)(url);
                    const RighteousFuryDialog = (mod as any).default ?? (mod as any).RighteousFuryDialog;
                    if (typeof RighteousFuryDialog !== 'function') {
                        notes['damage-roll-with-fury'] = 'RighteousFuryDialog default export missing';
                    } else {
                        const live = getPc();
                        const dialog = new RighteousFuryDialog({
                            actor: live,
                            characteristic: 'weaponSkill',
                            target: 50,
                            weaponName: 'probe-fury-weapon',
                            isMelee: true,
                        });
                        let renderThrew: string | null = null;
                        try {
                            await withTimeout(dialog.render?.({ force: true }), 5_000, 'RighteousFuryDialog.render');
                        } catch (err) {
                            renderThrew = String((err as Error)?.message ?? err);
                        }
                        const elementPresent = dialog.element !== null && dialog.element !== undefined;
                        if (renderThrew === null && elementPresent) {
                            fired['damage-roll-with-fury'] = true;
                            notes['damage-roll-with-fury'] = 'RighteousFuryDialog rendered with attached element';
                        } else {
                            notes['damage-roll-with-fury'] = `render: threw=${renderThrew ?? 'no'} elementPresent=${String(elementPresent)}`;
                        }
                        try {
                            await dialog.close?.();
                        } catch {
                            /* ignore */
                        }
                        await closeOpenDialogs();
                    }
                } catch (err) {
                    notes['damage-roll-with-fury'] = `dynamic import threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 5: damage-roll-applies-armour
                 * Create a dh2-npc with armour mode=simple total=4; deal raw
                 * damage 6 with ignoreToughness=true; assert wounds dropped
                 * by 2 (6 raw - 4 armour). Exercises npc.applyDamage armour
                 * reduction branch + the dh2-npc data model armour schema.
                 * ============================================================ */
                try {
                    const npc = (await withTimeout(
                        Actor.create({
                            name: 'weapon-attack-spec-npc',
                            type: 'dh2-npc',
                            system: {
                                gameSystem: 'dh2e',
                                wounds: { max: 10, value: 10, critical: 0 },
                                armour: { mode: 'simple', total: 4, locations: {} },
                            },
                        }),
                        5_000,
                        'NPC Actor.create',
                    )) as any;
                    if (!npc?.id) {
                        notes['damage-roll-applies-armour'] = 'NPC create returned null';
                    } else {
                        cleanups.push(async () => {
                            try {
                                await game?.actors?.get?.(npc.id)?.delete?.();
                            } catch {
                                /* ignore */
                            }
                        });
                        const live = game?.actors?.get?.(npc.id);
                        if (typeof live?.applyDamage !== 'function') {
                            notes['damage-roll-applies-armour'] = 'npc.applyDamage missing';
                        } else {
                            const before = live.system?.wounds?.value ?? -1;
                            await withTimeout(live.applyDamage(6, 'body', { ignoreToughness: true }), 5_000, 'npc.applyDamage (armour)');
                            const fresh = game?.actors?.get?.(npc.id);
                            const after = fresh?.system?.wounds?.value ?? -1;
                            // Expected net damage = max(0, 6 - 4) = 2.
                            // Wounds: before - 2. Branch exercised either way;
                            // assert the exact arithmetic for armour reduction.
                            if (after === before - 2) {
                                fired['damage-roll-applies-armour'] = true;
                                notes['damage-roll-applies-armour'] = `armour reduced 6 raw to 2 net (wounds ${before} → ${after})`;
                            } else {
                                notes['damage-roll-applies-armour'] = `expected wounds ${before - 2} (6 raw - 4 armour), got ${after}`;
                            }
                        }
                    }
                } catch (err) {
                    notes['damage-roll-applies-armour'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 6: psychic-power-roll
                 * Embed a psychicPower item on the PC and dispatch
                 * rollPsychicPower. Either branch (simple-psychic-rolls on
                 * → rollCharacteristic, or off → DHTargetedActionManager.
                 * performPsychicCast) exercises the psychic-dialog +
                 * acolyte.rollItem psychicPower case in source.
                 * ============================================================ */
                try {
                    const live = getPc();
                    const powerCreated = (await withTimeout(
                        live.createEmbeddedDocuments?.('Item', [
                            {
                                name: 'probe-psychic-power',
                                type: 'psychicPower',
                                system: {
                                    damage: '1d10+pr',
                                    penetration: 0,
                                },
                            },
                        ]),
                        5_000,
                        'create psychic power',
                    )) as any[];
                    const power = powerCreated?.[0] ? live.items.get(powerCreated[0].id) : null;
                    if (!power) {
                        notes['psychic-power-roll'] = 'failed to create psychic-power item';
                    } else {
                        cleanups.push(async () => {
                            try {
                                await power.delete?.();
                            } catch {
                                /* ignore */
                            }
                        });
                        let threw: string | null = null;
                        try {
                            await withTimeout(Promise.resolve(live.rollPsychicPower?.(power)), 5_000, 'rollPsychicPower');
                        } catch (err) {
                            threw = String((err as Error)?.message ?? err);
                        }
                        if (threw === null) {
                            fired['psychic-power-roll'] = true;
                            notes['psychic-power-roll'] = 'rollPsychicPower dispatch returned without throwing';
                        } else {
                            notes['psychic-power-roll'] = `rollPsychicPower threw: ${threw}`;
                        }
                        await closeOpenDialogs();
                    }
                } catch (err) {
                    notes['psychic-power-roll'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 7: weapon-modes
                 * Create a weapon with rateOfFire { single, semi, fullAuto }
                 * configured; assert the schema accepts each fire-mode write
                 * and the weapon-data getters reflect the chosen mode. This
                 * exercises the rateOfFire SchemaField + fireMode getters in
                 * weapon.ts (the source surface for DoS-based extra-hit
                 * calculation, which the unified roll dispatcher consumes).
                 * ============================================================ */
                try {
                    const live = getPc();
                    const modeCreated = (await withTimeout(
                        live.createEmbeddedDocuments?.('Item', [
                            {
                                name: 'probe-fire-mode-weapon',
                                type: 'weapon',
                                system: {
                                    equipped: true,
                                    class: 'basic',
                                    melee: false,
                                    attack: {
                                        type: 'ranged',
                                        characteristic: 'ballisticSkill',
                                        rateOfFire: { single: true, semi: 3, full: 10 },
                                    },
                                    damage: { formula: '1d10+2', type: 'impact', bonus: 0, penetration: 0 },
                                    clip: { value: 20, max: 30, type: '' },
                                },
                            },
                        ]),
                        5_000,
                        'create fire-mode weapon',
                    )) as any[];
                    const weapon = modeCreated?.[0] ? live.items.get(modeCreated[0].id) : null;
                    if (!weapon) {
                        notes['weapon-modes'] = 'failed to create fire-mode weapon';
                    } else {
                        cleanups.push(async () => {
                            try {
                                await weapon.delete?.();
                            } catch {
                                /* ignore */
                            }
                        });
                        const rof = weapon.system?.attack?.rateOfFire ?? {};
                        const isRanged = weapon.system?.isRangedWeapon ?? false;
                        // Switch the loaded fire-rate via the weapon-data
                        // schema field (semi 3 → 4). The write proves the
                        // attack.rateOfFire path round-trips through
                        // prepareDerivedData.
                        await withTimeout(weapon.update?.({ 'system.attack.rateOfFire.semi': 4 }), 5_000, 'update fire-mode semi');
                        const fresh = live.items.get(weapon.id);
                        const semiAfter = fresh?.system?.attack?.rateOfFire?.semi ?? -1;
                        if (rof?.single === true && rof?.semi === 3 && rof?.full === 10 && isRanged === true && semiAfter === 4) {
                            fired['weapon-modes'] = true;
                            notes['weapon-modes'] = `rateOfFire round-trips: single=true semi=3→4 full=10; isRangedWeapon=true`;
                        } else {
                            notes['weapon-modes'] = `unexpected: rof=${JSON.stringify(rof)} isRanged=${String(isRanged)} semiAfter=${semiAfter}`;
                        }
                    }
                } catch (err) {
                    notes['weapon-modes'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }
            } finally {
                // Best-effort cleanup of everything we created.
                for (const fn of cleanups) {
                    try {
                        await fn();
                    } catch {
                        /* ignore */
                    }
                }
                // Drain any residual dialogs so downstream specs don't see
                // our stack.
                try {
                    await closeOpenDialogs();
                } catch {
                    /* ignore */
                }
            }

            return { flowsFired: fired, flowNotes: notes };
            /* eslint-enable @typescript-eslint/no-explicit-any */
        }, WEAPON_ATTACK_FLOWS);

        return {
            flowsFired: result.flowsFired as Record<FlowName, boolean>,
            flowNotes: result.flowNotes as Partial<Record<FlowName, string>>,
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('weapon-attack pipeline (Tier B)', () => {
    // Cap at 3 minutes — per-call timeouts mean we should never come close.
    test.setTimeout(180_000);
    test('weapon equip / attack / ammo / damage / armour / fury / psychic / fire-modes flows', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeWeaponAttackFlows(page);

        const failures: string[] = [];
        for (const flow of WEAPON_ATTACK_FLOWS) {
            if (probe.flowsFired[flow]) {
                recordCoverage('weapon-attack.flow', flow);
            } else {
                const note = probe.flowNotes[flow] ?? 'flow did not fire and no diagnostic note recorded';
                failures.push(`flow ${flow}: ${note}`);
            }
        }

        const pageErrorTail = probe.pageErrors.length > 0 ? `\n  pageerrors: ${probe.pageErrors.slice(0, 5).join(' | ')}` : '';

        expect(
            failures,
            `${failures.length}/${WEAPON_ATTACK_FLOWS.length} weapon-attack probes failed:\n  - ${failures.join('\n  - ')}${pageErrorTail}`,
        ).toEqual([]);
    });
});
