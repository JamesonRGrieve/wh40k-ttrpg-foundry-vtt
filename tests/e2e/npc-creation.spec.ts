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

async function probeNPCCreate(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async (): Promise<FlowResult[]> => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: dynamic-imported modules are runtime-only */
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };

            const base = `${'/systems/wh40k-rpg'}/module/applications/npc`;
            const opened: any[] = [];

            // ---------- quick-create-dialog ----------
            try {
                const mod = await import(`${base}/quick-create-dialog.js`);
                const NPCQuickCreateDialog = mod.default ?? mod.NPCQuickCreateDialog;
                if (typeof NPCQuickCreateDialog !== 'function') {
                    record('quick-create-dialog-renders', false, `default export missing (keys: ${Object.keys(mod).join(',')})`);
                } else {
                    const dlg = new NPCQuickCreateDialog({}, {});
                    opened.push(dlg);
                    await dlg.render({ force: true });
                    await new Promise((r) => setTimeout(r, 50));
                    record('quick-create-dialog-renders', dlg.element instanceof HTMLElement, null);
                }
            } catch (err) {
                record('quick-create-dialog-renders', false, String((err as Error)?.message ?? err));
            }

            // ---------- batch-create-dialog ----------
            try {
                const mod = await import(`${base}/batch-create-dialog.js`);
                const BatchCreateDialog = mod.default ?? mod.BatchCreateDialog;
                if (typeof BatchCreateDialog !== 'function') {
                    record('batch-create-dialog-renders', false, `default export missing (keys: ${Object.keys(mod).join(',')})`);
                } else {
                    const dlg = new BatchCreateDialog({}, {});
                    opened.push(dlg);
                    await dlg.render({ force: true });
                    await new Promise((r) => setTimeout(r, 50));
                    record('batch-create-dialog-renders', dlg.element instanceof HTMLElement, null);
                }
            } catch (err) {
                record('batch-create-dialog-renders', false, String((err as Error)?.message ?? err));
            }

            // ---------- template-selector ----------
            try {
                const mod = await import(`${base}/template-selector.js`);
                const TemplateSelector = mod.default ?? mod.TemplateSelector;
                if (typeof TemplateSelector !== 'function') {
                    record('template-selector-renders', false, `default export missing (keys: ${Object.keys(mod).join(',')})`);
                } else {
                    const dlg = new TemplateSelector({});
                    opened.push(dlg);
                    await dlg.render({ force: true });
                    await new Promise((r) => setTimeout(r, 50));
                    record('template-selector-renders', dlg.element instanceof HTMLElement, null);
                }
            } catch (err) {
                record('template-selector-renders', false, String((err as Error)?.message ?? err));
            }

            // ---------- cleanup ----------
            for (const w of opened) {
                try {
                    await w?.close?.();
                } catch {
                    /* ignore */
                }
            }

            return out;
            /* eslint-enable @typescript-eslint/no-explicit-any */
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
