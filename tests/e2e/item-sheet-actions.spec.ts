import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of two item sheets whose action handlers were
 * previously uncovered by any spec:
 *
 *   - `src/module/applications/item/critical-injury-sheet.ts`
 *     (was 0% fn / 86.8% line) — the `changeSeverity` action handler
 *     reads a numeric `value` from an <input> target and writes it
 *     to `system.severity` via `this.item.update(...)`.
 *
 *   - `src/module/applications/item/skill-sheet.ts`
 *     (was 0% fn / 56.1% line) — four action handlers
 *     (`specialUseAdd`, `specialUseDelete`, `specialUseChat`,
 *     `specialUseRoll`) that mutate `system.specialUses` and dispatch
 *     to `system.toChatSpecialUse(index)` / `actor.rollSkill(...)`.
 *
 * Both sheets are factory-emitted via `defineSimpleItemSheet`, so the
 * action handlers are not exported individually — they're attached
 * to `Sheet.DEFAULT_OPTIONS.actions` at module load. The probe pulls
 * each function off that map and invokes it against a synthetic Host
 * stub that records `item.update(...)` calls and provides a
 * `toChatSpecialUse` / `rollSkill` capture. No real Foundry render
 * required, but the dynamic-imported module attributes coverage to
 * the source files.
 *
 * Keep ITEM_SHEET_ACTION_FLOWS in sync with the equivalent constant in
 * scripts/e2e-coverage.mjs.
 */

const ITEM_SHEET_ACTION_FLOWS = [
    'critical-injury-changeSeverity',
    'critical-injury-changeSeverity-noop',
    'skill-specialUseAdd',
    'skill-specialUseAdd-fromEmpty',
    'skill-specialUseDelete',
    'skill-specialUseDelete-noIndex',
    'skill-specialUseDelete-outOfRange',
    'skill-specialUseChat',
    'skill-specialUseChat-noIndex',
    'skill-specialUseRoll-withActor',
    'skill-specialUseRoll-noActor',
    'skill-specialUseRoll-noIndex',
] as const;

type FlowName = (typeof ITEM_SHEET_ACTION_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeItemSheetActions(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async (): Promise<FlowResult[]> => {
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };
            const base = `${'/systems/wh40k-rpg'}/module/applications/item`;

            // Shapes mirroring the slice of sheet/item state the action
            // handlers read and write. The handlers are invoked via
            // `.call(host, …)`, so `host` stands in for the sheet `this`.
            interface SpecialUse {
                name: string;
                description: string;
                modifier: number;
                difficulty: string;
            }
            interface ItemSystem {
                severity?: number;
                specialUses?: SpecialUse[];
                toChatSpecialUse: (index: number) => Promise<void>;
            }
            // Mirror of SkillRollOptions in skill-sheet.ts (the third arg to rollSkill).
            interface SkillRollOptions {
                modifier: number;
                difficulty: string;
                specialUseName: string;
            }
            interface RollCall {
                name: string | null;
                options: SkillRollOptions | undefined;
            }
            interface UpdateChanges {
                'system.severity'?: number;
                'system.specialUses'?: SpecialUse[];
            }
            interface HostActor {
                rollSkill: (name: string, spec: string | number | undefined, options: SkillRollOptions | undefined) => Promise<void>;
            }
            interface HostItem {
                name: string;
                system: ItemSystem;
                actor: HostActor | null;
                update: (changes: UpdateChanges) => Promise<void>;
            }
            interface Host {
                item: HostItem;
            }
            interface HostCapture {
                updates: UpdateChanges[];
                chatCalls: number[];
                rollCalls: RollCall[];
            }
            /** Signature of a sheet action handler (bound to `host` via call). */
            type ActionFn = (this: Host, event: MouseEvent, target: HTMLElement) => Promise<void>;

            const buildHost = (
                system: { severity?: number; specialUses?: SpecialUse[] },
                opts: { withActor?: boolean; itemName?: string | null } = {},
            ): { host: Host; cap: HostCapture } => {
                const cap: HostCapture = { updates: [], chatCalls: [], rollCalls: [] };
                const hasActor = opts.withActor === true;
                const actor: HostActor | null = hasActor
                    ? {
                          rollSkill: async (name: string, _spec: string | number | undefined, options: SkillRollOptions | undefined): Promise<void> => {
                              await Promise.resolve();
                              cap.rollCalls.push({ name, options });
                          },
                      }
                    : null;
                const itemSystem: ItemSystem = {
                    ...system,
                    toChatSpecialUse: async (index: number): Promise<void> => {
                        await Promise.resolve();
                        cap.chatCalls.push(index);
                    },
                };
                const host: Host = {
                    item: {
                        name: opts.itemName ?? 'Probe Skill',
                        system: itemSystem,
                        actor,
                        update: async (changes: UpdateChanges): Promise<void> => {
                            await Promise.resolve();
                            cap.updates.push(changes);
                            // Mirror writes into the in-memory system so subsequent
                            // calls in the same scenario see them.
                            if (changes['system.severity'] !== undefined) itemSystem.severity = changes['system.severity'];
                            if (changes['system.specialUses'] !== undefined) itemSystem.specialUses = changes['system.specialUses'];
                        },
                    },
                };
                return { host, cap };
            };

            const makeTarget = (data: Record<string, string>, value?: string): HTMLElement => {
                const el = value === undefined ? document.createElement('div') : document.createElement('input');
                for (const [k, v] of Object.entries(data)) el.dataset[k] = v;
                if (value !== undefined && el instanceof HTMLInputElement) el.value = value;
                return el;
            };
            const evt = new MouseEvent('click', { bubbles: false });

            // The factory-emitted sheet exposes its action handlers on a
            // static map; we only need the call signature, not the full sheet.
            interface SheetActionModule {
                default?: { DEFAULT_OPTIONS?: { actions?: Record<string, ActionFn | undefined> } };
            }
            const loadActions = async (file: string): Promise<Record<string, ActionFn | undefined>> => {
                const path = `${base}/${file}`;
                // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic import() of a runtime Foundry system module path has no static module type
                const mod = (await import(path)) as SheetActionModule;
                return mod.default?.DEFAULT_OPTIONS?.actions ?? {};
            };

            // ---------- critical-injury-sheet.ts ----------
            async function probeCriticalInjury(): Promise<void> {
                try {
                    const actions = await loadActions('critical-injury-sheet.js');
                    const changeSeverity = actions['changeSeverity'];
                    if (typeof changeSeverity !== 'function') {
                        record('critical-injury-changeSeverity', false, 'changeSeverity action missing');
                        record('critical-injury-changeSeverity-noop', false, 'changeSeverity action missing');
                    } else {
                        // Case 1: severity changes — update is dispatched.
                        try {
                            const { host, cap } = buildHost({ severity: 3 });
                            await changeSeverity.call(host, evt, makeTarget({}, '7'));
                            const ok = cap.updates.length === 1 && cap.updates[0]?.['system.severity'] === 7;
                            record('critical-injury-changeSeverity', ok, `updates=${JSON.stringify(cap.updates)}`);
                        } catch (err) {
                            record('critical-injury-changeSeverity', false, err instanceof Error ? err.message : String(err));
                        }
                        // Case 2: severity unchanged — no update.
                        try {
                            const { host, cap } = buildHost({ severity: 5 });
                            await changeSeverity.call(host, evt, makeTarget({}, '5'));
                            record('critical-injury-changeSeverity-noop', cap.updates.length === 0, `updates=${JSON.stringify(cap.updates)}`);
                        } catch (err) {
                            record('critical-injury-changeSeverity-noop', false, err instanceof Error ? err.message : String(err));
                        }
                    }
                } catch (err) {
                    for (const k of ['critical-injury-changeSeverity', 'critical-injury-changeSeverity-noop'] as const) {
                        record(k, false, `import: ${err instanceof Error ? err.message : String(err)}`);
                    }
                }
            }

            // ---------- skill-sheet.ts ----------
            async function probeSkillSheet(): Promise<void> {
                try {
                    const actions = await loadActions('skill-sheet.js');
                    const { specialUseAdd, specialUseDelete, specialUseChat, specialUseRoll } = actions;

                    const skillKeys: FlowName[] = [
                        'skill-specialUseAdd',
                        'skill-specialUseAdd-fromEmpty',
                        'skill-specialUseDelete',
                        'skill-specialUseDelete-noIndex',
                        'skill-specialUseDelete-outOfRange',
                        'skill-specialUseChat',
                        'skill-specialUseChat-noIndex',
                        'skill-specialUseRoll-withActor',
                        'skill-specialUseRoll-noActor',
                        'skill-specialUseRoll-noIndex',
                    ];

                    if (
                        typeof specialUseAdd !== 'function' ||
                        typeof specialUseDelete !== 'function' ||
                        typeof specialUseChat !== 'function' ||
                        typeof specialUseRoll !== 'function'
                    ) {
                        for (const k of skillKeys) record(k, false, 'skill-sheet action missing');
                    } else {
                        // specialUseAdd — appends to non-empty list.
                        try {
                            const { host, cap } = buildHost({ specialUses: [{ name: 'Existing', description: '', modifier: 0, difficulty: '' }] });
                            await specialUseAdd.call(host, evt, makeTarget({}));
                            const next = cap.updates[0]?.['system.specialUses'];
                            record('skill-specialUseAdd', Array.isArray(next) && next.length === 2, `next.length=${next?.length ?? 'undefined'}`);
                        } catch (err) {
                            record('skill-specialUseAdd', false, err instanceof Error ? err.message : String(err));
                        }

                        // specialUseAdd — works when specialUses is missing / non-array.
                        try {
                            const { host, cap } = buildHost({});
                            await specialUseAdd.call(host, evt, makeTarget({}));
                            const next = cap.updates[0]?.['system.specialUses'];
                            record('skill-specialUseAdd-fromEmpty', Array.isArray(next) && next.length === 1, `next=${JSON.stringify(next)}`);
                        } catch (err) {
                            record('skill-specialUseAdd-fromEmpty', false, err instanceof Error ? err.message : String(err));
                        }

                        // specialUseDelete — removes entry at data-index.
                        try {
                            const { host, cap } = buildHost({
                                specialUses: [
                                    { name: 'A', description: '', modifier: 0, difficulty: '' },
                                    { name: 'B', description: '', modifier: 0, difficulty: '' },
                                    { name: 'C', description: '', modifier: 0, difficulty: '' },
                                ],
                            });
                            await specialUseDelete.call(host, evt, makeTarget({ index: '1' }));
                            const next = cap.updates[0]?.['system.specialUses'];
                            const ok = Array.isArray(next) && next.length === 2 && next[0]?.name === 'A' && next[1]?.name === 'C';
                            record('skill-specialUseDelete', ok, `next=${JSON.stringify(next)}`);
                        } catch (err) {
                            record('skill-specialUseDelete', false, err instanceof Error ? err.message : String(err));
                        }

                        // specialUseDelete — no data-index attribute → no-op.
                        try {
                            const { host, cap } = buildHost({ specialUses: [{ name: 'A', description: '', modifier: 0, difficulty: '' }] });
                            await specialUseDelete.call(host, evt, makeTarget({}));
                            record('skill-specialUseDelete-noIndex', cap.updates.length === 0, `updates=${JSON.stringify(cap.updates)}`);
                        } catch (err) {
                            record('skill-specialUseDelete-noIndex', false, err instanceof Error ? err.message : String(err));
                        }

                        // specialUseDelete — out-of-range index → no-op.
                        try {
                            const { host, cap } = buildHost({ specialUses: [{ name: 'A', description: '', modifier: 0, difficulty: '' }] });
                            await specialUseDelete.call(host, evt, makeTarget({ index: '99' }));
                            record('skill-specialUseDelete-outOfRange', cap.updates.length === 0, `updates=${JSON.stringify(cap.updates)}`);
                        } catch (err) {
                            record('skill-specialUseDelete-outOfRange', false, err instanceof Error ? err.message : String(err));
                        }

                        // specialUseChat — posts entry to chat.
                        try {
                            const { host, cap } = buildHost({
                                specialUses: [
                                    { name: 'A', description: '', modifier: 0, difficulty: '' },
                                    { name: 'B', description: '', modifier: 0, difficulty: '' },
                                ],
                            });
                            await specialUseChat.call(host, evt, makeTarget({ index: '1' }));
                            record('skill-specialUseChat', cap.chatCalls.length === 1 && cap.chatCalls[0] === 1, `chatCalls=${JSON.stringify(cap.chatCalls)}`);
                        } catch (err) {
                            record('skill-specialUseChat', false, err instanceof Error ? err.message : String(err));
                        }

                        // specialUseChat — no index → no-op.
                        try {
                            const { host, cap } = buildHost({ specialUses: [{ name: 'A', description: '', modifier: 0, difficulty: '' }] });
                            await specialUseChat.call(host, evt, makeTarget({}));
                            record('skill-specialUseChat-noIndex', cap.chatCalls.length === 0, `chatCalls=${JSON.stringify(cap.chatCalls)}`);
                        } catch (err) {
                            record('skill-specialUseChat-noIndex', false, err instanceof Error ? err.message : String(err));
                        }

                        // specialUseRoll — actor-owned: posts to chat AND calls rollSkill.
                        try {
                            const { host, cap } = buildHost(
                                { specialUses: [{ name: 'Trick', description: '', modifier: 10, difficulty: 'Hard' }] },
                                { withActor: true, itemName: 'Tech-Use' },
                            );
                            await specialUseRoll.call(host, evt, makeTarget({ index: '0' }));
                            const ok = cap.chatCalls.length === 1 && cap.rollCalls.length === 1 && cap.rollCalls[0]?.name === 'Tech-Use';
                            record('skill-specialUseRoll-withActor', ok, `chat=${cap.chatCalls.length} rolls=${cap.rollCalls.length}`);
                        } catch (err) {
                            record('skill-specialUseRoll-withActor', false, err instanceof Error ? err.message : String(err));
                        }

                        // specialUseRoll — no actor: posts to chat only.
                        try {
                            const { host, cap } = buildHost(
                                { specialUses: [{ name: 'Trick', description: '', modifier: 10, difficulty: 'Hard' }] },
                                { withActor: false },
                            );
                            await specialUseRoll.call(host, evt, makeTarget({ index: '0' }));
                            const ok = cap.chatCalls.length === 1 && cap.rollCalls.length === 0;
                            record('skill-specialUseRoll-noActor', ok, `chat=${cap.chatCalls.length} rolls=${cap.rollCalls.length}`);
                        } catch (err) {
                            record('skill-specialUseRoll-noActor', false, err instanceof Error ? err.message : String(err));
                        }

                        // specialUseRoll — no data-index → no-op.
                        try {
                            const { host, cap } = buildHost({ specialUses: [{ name: 'Trick', description: '', modifier: 0, difficulty: '' }] });
                            await specialUseRoll.call(host, evt, makeTarget({}));
                            const ok = cap.chatCalls.length === 0 && cap.rollCalls.length === 0;
                            record('skill-specialUseRoll-noIndex', ok, `chat=${cap.chatCalls.length} rolls=${cap.rollCalls.length}`);
                        } catch (err) {
                            record('skill-specialUseRoll-noIndex', false, err instanceof Error ? err.message : String(err));
                        }
                    }
                } catch (err) {
                    for (const k of [
                        'skill-specialUseAdd',
                        'skill-specialUseAdd-fromEmpty',
                        'skill-specialUseDelete',
                        'skill-specialUseDelete-noIndex',
                        'skill-specialUseDelete-outOfRange',
                        'skill-specialUseChat',
                        'skill-specialUseChat-noIndex',
                        'skill-specialUseRoll-withActor',
                        'skill-specialUseRoll-noActor',
                        'skill-specialUseRoll-noIndex',
                    ] as const) {
                        record(k, false, `import: ${err instanceof Error ? err.message : String(err)}`);
                    }
                }
            }

            await probeCriticalInjury();
            await probeSkillSheet();

            return out;
        });
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('item sheet action handlers (Tier B)', () => {
    test('critical-injury + skill sheet action handlers behave correctly', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeItemSheetActions(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('item-sheet-action.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of ITEM_SHEET_ACTION_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${ITEM_SHEET_ACTION_FLOWS.length} item-sheet-action flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
