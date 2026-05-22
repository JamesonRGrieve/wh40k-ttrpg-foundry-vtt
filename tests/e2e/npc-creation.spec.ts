import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the NPC creation pipeline dialogs at
 * `src/module/applications/npc/{quick-create-dialog,batch-create-dialog,template-selector}.ts`.
 * All three were below 10% function coverage before this spec — no
 * other Tier B spec opens any of them (npc-tools.spec.ts targets the
 * parser / exporter / scaler / encounter-builder; nothing renders the
 * creation dialogs).
 *
 * Modules exercised (pre-spec line / fn coverage):
 *   - `quick-create-dialog.ts` (37.7% / 6.7%) — `NPCQuickCreateDialog`
 *     ctor + render with a partial config payload.
 *   - `batch-create-dialog.ts` (38.3% / 7.1%) — `BatchCreateDialog`
 *     ctor + render with a partial batch state.
 *   - `template-selector.ts` (36.8% / 7.1%) — `TemplateSelector` ctor
 *     + render against the registered template compendium.
 *
 * Each flow records under `npc-create.flow`. Keys MUST match the
 * NPC_CREATE_FLOWS constant in scripts/e2e-coverage.mjs.
 */

const NPC_CREATE_FLOWS = ['quick-create-dialog-renders', 'batch-create-dialog-renders', 'template-selector-renders'] as const;

type FlowName = (typeof NPC_CREATE_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

/**
 * Shared surface of the three NPC-creation ApplicationV2 dialogs this probe
 * drives. Only the members exercised here are typed; the dialogs are real
 * Foundry applications with much wider APIs.
 */
interface DialogInstance {
    render: (options: { force: boolean }) => Promise<void>;
    element: HTMLElement | null;
    close?: () => Promise<void>;
}

/** Constructor shapes for the dynamically-imported dialog modules. */
type TwoArgDialogCtor = new (config: object, options: object) => DialogInstance;
type OneArgDialogCtor = new (options: object) => DialogInstance;

/** Exports of the quick/batch dialog modules (config + options ctor). */
interface TwoArgDialogModule {
    default?: TwoArgDialogCtor;
    NPCQuickCreateDialog?: TwoArgDialogCtor;
    BatchCreateDialog?: TwoArgDialogCtor;
}

/** Exports of the template-selector module (single options ctor). */
interface OneArgDialogModule {
    default?: OneArgDialogCtor;
    TemplateSelector?: OneArgDialogCtor;
}

async function probeNPCCreate(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
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

            const base = `${'/systems/wh40k-rpg'}/module/applications/npc`;
            const opened: DialogInstance[] = [];

            // ---------- quick-create-dialog ----------
            try {
                // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic import of a runtime-only Foundry system module path
                const mod = (await import(`${base}/quick-create-dialog.js`)) as TwoArgDialogModule;
                const NPCQuickCreateDialog = mod.default ?? mod.NPCQuickCreateDialog;
                if (typeof NPCQuickCreateDialog !== 'function') {
                    record('quick-create-dialog-renders', false, `default export missing (keys: ${Object.keys(mod).join(',')})`);
                } else {
                    const dlg = new NPCQuickCreateDialog({}, {});
                    opened.push(dlg);
                    await dlg.render({ force: true });
                    await new Promise<void>((r) => {
                        setTimeout(r, 50);
                    });
                    record('quick-create-dialog-renders', dlg.element instanceof HTMLElement, null);
                }
            } catch (err) {
                record('quick-create-dialog-renders', false, err instanceof Error ? err.message : String(err));
            }

            // ---------- batch-create-dialog ----------
            try {
                // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic import of a runtime-only Foundry system module path
                const mod = (await import(`${base}/batch-create-dialog.js`)) as TwoArgDialogModule;
                const BatchCreateDialog = mod.default ?? mod.BatchCreateDialog;
                if (typeof BatchCreateDialog !== 'function') {
                    record('batch-create-dialog-renders', false, `default export missing (keys: ${Object.keys(mod).join(',')})`);
                } else {
                    const dlg = new BatchCreateDialog({}, {});
                    opened.push(dlg);
                    await dlg.render({ force: true });
                    await new Promise<void>((r) => {
                        setTimeout(r, 50);
                    });
                    record('batch-create-dialog-renders', dlg.element instanceof HTMLElement, null);
                }
            } catch (err) {
                record('batch-create-dialog-renders', false, err instanceof Error ? err.message : String(err));
            }

            // ---------- template-selector ----------
            try {
                // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic import of a runtime-only Foundry system module path
                const mod = (await import(`${base}/template-selector.js`)) as OneArgDialogModule;
                const TemplateSelector = mod.default ?? mod.TemplateSelector;
                if (typeof TemplateSelector !== 'function') {
                    record('template-selector-renders', false, `default export missing (keys: ${Object.keys(mod).join(',')})`);
                } else {
                    const dlg = new TemplateSelector({});
                    opened.push(dlg);
                    await dlg.render({ force: true });
                    await new Promise<void>((r) => {
                        setTimeout(r, 50);
                    });
                    record('template-selector-renders', dlg.element instanceof HTMLElement, null);
                }
            } catch (err) {
                record('template-selector-renders', false, err instanceof Error ? err.message : String(err));
            }

            // ---------- cleanup ----------
            for (const w of opened) {
                try {
                    await w.close?.();
                } catch {
                    /* ignore */
                }
            }

            return out;
        });
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('npc creation dialogs (Tier B)', () => {
    test('every npc-creation dialog renders without throwing', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeNPCCreate(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('npc-create.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of NPC_CREATE_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${NPC_CREATE_FLOWS.length} npc-create flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
