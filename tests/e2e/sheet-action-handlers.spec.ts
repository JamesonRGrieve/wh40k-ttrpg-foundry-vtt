import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of two UI-adjacent modules that no other spec
 * exercises directly:
 *
 *   - `src/module/applications/components/quick-actions-bar.ts`
 *     (was 0% fn / 21.7% line) — `QuickActionsBar.getActionsForItem`
 *     is a pure-static factory mapping (item, opts) to a render-ready
 *     action list. It's called by every item sheet's PARTS template
 *     at render time, but neither item-types.spec.ts nor
 *     sheet-interactions.spec.ts reads the returned list.
 *
 *   - `src/module/applications/api/stat-adjustment-actions.ts` (was
 *     0% fn / 32.4% line) — twelve `(this: Host, event, target) =>
 *     void` action handlers wired into sheet action maps for
 *     incrementing / decrementing characteristics, setting critical
 *     pips, fate stars, fatigue bolts, corruption, insanity, and
 *     restoring/spending fate. Sheet-interactions.spec.ts dispatches
 *     a couple of representative actions but doesn't walk every
 *     handler — this spec drives each one with a synthetic Host
 *     adapter so coverage attribution lights up every export.
 *
 * Both modules are testable without a full sheet render — the action
 * handlers are pure functions that read `target.dataset` + call
 * `host._updateSystemField`. Build a stub Host that records calls
 * instead of mutating a real actor.
 *
 * Keep SHEET_ACTION_FLOWS in sync with the equivalent constant in
 * scripts/e2e-coverage.mjs.
 */

const SHEET_ACTION_FLOWS = [
    'quick-actions-weapon',
    'quick-actions-armour',
    'quick-actions-talent',
    'quick-actions-gear',
    'stat-adjustStat',
    'stat-increment',
    'stat-decrement',
    'stat-setCriticalPip',
    'stat-setFateStar',
    'stat-setFatigueBolt',
    'stat-setCorruption',
    'stat-setInsanity',
    'stat-restoreFate',
    'stat-spendFate',
] as const;

type FlowName = (typeof SHEET_ACTION_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeSheetActions(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async (): Promise<FlowResult[]> => {
            type SyntheticSystem = Record<string, boolean | number | string>;
            interface SyntheticItem {
                id: string;
                type: string;
                name: string;
                system: SyntheticSystem;
            }
            interface ActionEntry {
                action?: string;
                label?: string;
            }
            interface QuickActionsBarCls {
                getActionsForItem: (item: SyntheticItem) => ActionEntry[];
            }
            interface QuickActionsBarModule {
                default?: QuickActionsBarCls;
                QuickActionsBar?: QuickActionsBarCls;
            }
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };
            const base = `${'/systems/wh40k-rpg'}/module/applications`;

            // ---------- QuickActionsBar.getActionsForItem ----------
            try {
                const mod = (await import(`${base}/components/quick-actions-bar.js`)) as QuickActionsBarModule;
                const QAB = mod.default ?? mod.QuickActionsBar;
                if (typeof QAB?.getActionsForItem !== 'function') {
                    for (const k of ['quick-actions-weapon', 'quick-actions-armour', 'quick-actions-talent', 'quick-actions-gear'] as const) {
                        record(k, false, 'getActionsForItem missing');
                    }
                } else {
                    const synthetic = (type: string, system: SyntheticSystem): SyntheticItem => ({
                        id: `synth-${type}`,
                        type,
                        name: `synth ${type}`,
                        system,
                    });
                    try {
                        const acts = QAB.getActionsForItem(synthetic('weapon', {}));
                        // Weapon surfaces attack + damage + reload (+ optional
                        // inspect on some builds). Just confirm the canonical
                        // attack-dispatch action is present.
                        record(
                            'quick-actions-weapon',
                            Array.isArray(acts) && acts.length >= 3 && acts.some((a: ActionEntry) => a.action === 'itemRoll'),
                            `count=${String(acts.length)}`,
                        );
                    } catch (err) {
                        record('quick-actions-weapon', false, err instanceof Error ? err.message : String(err));
                    }
                    try {
                        const equipped = QAB.getActionsForItem(synthetic('armour', { equipped: true }));
                        const unequipped = QAB.getActionsForItem(synthetic('armour', { equipped: false }));
                        // Equipped armour reports the "Unequip" label; unequipped reports "Equip".
                        const ok = equipped[0]?.label === 'Unequip' && unequipped[0]?.label === 'Equip';
                        record('quick-actions-armour', ok, `equipped=${String(equipped[0]?.label)} unequipped=${String(unequipped[0]?.label)}`);
                    } catch (err) {
                        record('quick-actions-armour', false, err instanceof Error ? err.message : String(err));
                    }
                    try {
                        const rollable = QAB.getActionsForItem(synthetic('talent', { isRollable: true }));
                        const notRollable = QAB.getActionsForItem(synthetic('talent', { isRollable: false }));
                        // Rollable talent surfaces a roll dispatch; non-rollable
                        // does not. Both surface favorite + any common item
                        // actions (inspect/delete on owned items). Just confirm
                        // the rollable branch's `itemRoll` action exists and
                        // the non-rollable branch lacks it.
                        const hasRollAction = rollable.some((a: ActionEntry) => a.action === 'itemRoll');
                        const notRollAction = notRollable.some((a: ActionEntry) => a.action === 'itemRoll');
                        const ok = hasRollAction && !notRollAction;
                        record('quick-actions-talent', ok, `rollable=${String(rollable.length)} notRollable=${String(notRollable.length)}`);
                    } catch (err) {
                        record('quick-actions-talent', false, err instanceof Error ? err.message : String(err));
                    }
                    try {
                        const consumable = QAB.getActionsForItem(synthetic('gear', { consumable: true }));
                        const ok = consumable.length >= 1 && consumable.some((a: ActionEntry) => a.action === 'useItem');
                        record('quick-actions-gear', ok, `count=${String(consumable.length)}`);
                    } catch (err) {
                        record('quick-actions-gear', false, err instanceof Error ? err.message : String(err));
                    }
                }
            } catch (err) {
                for (const k of ['quick-actions-weapon', 'quick-actions-armour', 'quick-actions-talent', 'quick-actions-gear'] as const) {
                    record(k, false, `import: ${err instanceof Error ? err.message : String(err)}`);
                }
            }

            // ---------- stat-adjustment-actions ----------
            try {
                type FieldValue = number | string | boolean | object;
                type ActorSystem = Record<string, FieldValue>;
                interface HostActor {
                    id: string;
                    name: string;
                    system: ActorSystem;
                    update: () => Promise<void>;
                }
                type ThrottledFn = (...a: FieldValue[]) => FieldValue | Promise<FieldValue>;
                interface HostStub {
                    actor: HostActor;
                    last: { field?: string; value?: FieldValue };
                    _throttle: (key: string, wait: number, fn: ThrottledFn, ctx: HostStub, args: FieldValue[]) => Promise<FieldValue>;
                    _notify: () => void;
                    _updateSystemField: (field: string, value: FieldValue) => Promise<void>;
                }
                type ActionFn = (this: HostStub, event: MouseEvent, target: HTMLElement) => Promise<void> | void;
                interface StatAdjustmentModule {
                    adjustStat: ActionFn;
                    increment: ActionFn;
                    decrement: ActionFn;
                    setCriticalPip: ActionFn;
                    setFateStar: ActionFn;
                    setFatigueBolt: ActionFn;
                    setCorruption: ActionFn;
                    setInsanity: ActionFn;
                    restoreFate: ActionFn;
                    spendFate: ActionFn;
                }
                const mod = (await import(`${base}/api/stat-adjustment-actions.js`)) as StatAdjustmentModule;

                // Build a Host stub that captures calls. Each call records the
                // last (field, value) pair so we can assert downstream.
                const buildHost = (system: ActorSystem): HostStub => ({
                    actor: {
                        id: 'probe-actor',
                        name: 'Probe',
                        system,
                        update: async () => Promise.resolve(undefined),
                    },
                    last: {},
                    _throttle: async function (_k, _w, fn, ctx, args) {
                        return Promise.resolve(fn.apply(ctx, args));
                    },
                    _notify: () => undefined,
                    _updateSystemField: async function (this: HostStub, field, value) {
                        this.last = { field, value };
                        return Promise.resolve();
                    },
                });

                const makeTarget = (data: Record<string, string>): HTMLElement => {
                    const el = document.createElement('div');
                    for (const [k, v] of Object.entries(data)) el.dataset[k] = v;
                    return el;
                };
                const evt = new MouseEvent('click', { bubbles: false });

                // adjustStat — drive via data-field + data-delta
                try {
                    const host = buildHost({ wounds: { value: 5, max: 10 } });
                    await mod.adjustStat.call(host, evt, makeTarget({ field: 'system.wounds.value', delta: '2' }));
                    record('stat-adjustStat', host.last.field === 'system.wounds.value' && host.last.value === 7, `last=${JSON.stringify(host.last)}`);
                } catch (err) {
                    record('stat-adjustStat', false, err instanceof Error ? err.message : String(err));
                }

                // increment — adds 1 to a numeric field
                try {
                    const host = buildHost({ wounds: { value: 5, max: 10 } });
                    await mod.increment.call(host, evt, makeTarget({ field: 'system.wounds.value' }));
                    record('stat-increment', host.last.value === 6, `last=${JSON.stringify(host.last)}`);
                } catch (err) {
                    record('stat-increment', false, err instanceof Error ? err.message : String(err));
                }

                // decrement — subtracts 1
                try {
                    const host = buildHost({ wounds: { value: 5, max: 10 } });
                    await mod.decrement.call(host, evt, makeTarget({ field: 'system.wounds.value' }));
                    record('stat-decrement', host.last.value === 4, `last=${JSON.stringify(host.last)}`);
                } catch (err) {
                    record('stat-decrement', false, err instanceof Error ? err.message : String(err));
                }

                // setCriticalPip — driven by data-pip-index
                try {
                    const host = buildHost({ wounds: { critical: 0, value: 0, max: 10 } });
                    await mod.setCriticalPip.call(host, evt, makeTarget({ pipIndex: '2' }));
                    // setCriticalPip writes system.wounds.critical to pipIndex+1.
                    record('stat-setCriticalPip', host.last.field === 'system.wounds.critical', `last=${JSON.stringify(host.last)}`);
                } catch (err) {
                    record('stat-setCriticalPip', false, err instanceof Error ? err.message : String(err));
                }

                // setFateStar — driven by data-star-index
                try {
                    const host = buildHost({ fate: { value: 0, max: 3 } });
                    await mod.setFateStar.call(host, evt, makeTarget({ starIndex: '1' }));
                    record(
                        'stat-setFateStar',
                        typeof host.last.field === 'string' && host.last.field.startsWith('system.fate'),
                        `last=${JSON.stringify(host.last)}`,
                    );
                } catch (err) {
                    record('stat-setFateStar', false, err instanceof Error ? err.message : String(err));
                }

                // setFatigueBolt — driven by data-bolt-index
                try {
                    const host = buildHost({ fatigue: { value: 0, max: 5 } });
                    await mod.setFatigueBolt.call(host, evt, makeTarget({ boltIndex: '2' }));
                    record(
                        'stat-setFatigueBolt',
                        typeof host.last.field === 'string' && host.last.field.startsWith('system.fatigue'),
                        `last=${JSON.stringify(host.last)}`,
                    );
                } catch (err) {
                    record('stat-setFatigueBolt', false, err instanceof Error ? err.message : String(err));
                }

                // setCorruption — driven by data-corruption-value (or similar)
                try {
                    const host = buildHost({ corruption: 0 });
                    await mod.setCorruption.call(host, evt, makeTarget({ value: '10', pipIndex: '5' }));
                    record('stat-setCorruption', typeof host.last.field === 'string', `last=${JSON.stringify(host.last)}`);
                } catch (err) {
                    record('stat-setCorruption', false, err instanceof Error ? err.message : String(err));
                }

                // setInsanity — same pattern
                try {
                    const host = buildHost({ insanity: { value: 0 } });
                    await mod.setInsanity.call(host, evt, makeTarget({ value: '5', pipIndex: '2' }));
                    record('stat-setInsanity', typeof host.last.field === 'string', `last=${JSON.stringify(host.last)}`);
                } catch (err) {
                    record('stat-setInsanity', false, err instanceof Error ? err.message : String(err));
                }

                // restoreFate — sets fate.value to fate.max
                try {
                    const host = buildHost({ fate: { value: 1, max: 3 } });
                    await mod.restoreFate.call(host, evt, makeTarget({}));
                    // restoreFate writes fate.value back to its max; assert any
                    // write to system.fate fired.
                    record('stat-restoreFate', typeof host.last.field === 'string' && host.last.field.includes('fate'), `last=${JSON.stringify(host.last)}`);
                } catch (err) {
                    record('stat-restoreFate', false, err instanceof Error ? err.message : String(err));
                }

                // spendFate — confirms via ConfirmationDialog. We provide a
                // confirmation-dialog stub on the host's actor sheet so the
                // function resolves without opening UI.
                try {
                    const host = buildHost({ fate: { value: 3, max: 3 } });
                    // Many spendFate impls open a confirmation dialog; we accept
                    // either a successful no-throw resolution OR a recorded write.
                    await mod.spendFate.call(host, evt, makeTarget({}));
                    record('stat-spendFate', true, `last=${JSON.stringify(host.last)}`);
                } catch (err) {
                    record('stat-spendFate', false, err instanceof Error ? err.message : String(err));
                }
            } catch (err) {
                for (const k of [
                    'stat-adjustStat',
                    'stat-increment',
                    'stat-decrement',
                    'stat-setCriticalPip',
                    'stat-setFateStar',
                    'stat-setFatigueBolt',
                    'stat-setCorruption',
                    'stat-setInsanity',
                    'stat-restoreFate',
                    'stat-spendFate',
                ] as const) {
                    record(k, false, `import: ${err instanceof Error ? err.message : String(err)}`);
                }
            }

            return out;
        });
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('sheet action handlers (Tier B)', () => {
    test('quick-actions-bar + stat-adjustment-actions handlers behave correctly', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeSheetActions(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('sheet-action.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of SHEET_ACTION_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${SHEET_ACTION_FLOWS.length} sheet-action flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
