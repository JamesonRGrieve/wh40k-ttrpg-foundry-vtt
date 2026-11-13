import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of the typed settings table (#712): the tables in
 * `wh40k-rpg-settings.ts` and `managers/event-tracker.ts` are what Foundry
 * registered, an accessor reads the stored value through the table, and the
 * movement-automation setting reaches the token movement cost (the token read
 * the unregistered key `movementAutomation`, which threw, so automation could
 * not be switched off).
 *
 * Each flow records under `settings-table.flow`. Keys MUST match
 * SETTINGS_TABLE_FLOWS in scripts/e2e-coverage.mjs.
 */

const SETTINGS_TABLE_FLOWS = ['table-keys-registered', 'accessor-reads-stored-value', 'movement-automation-off-plain-cost'] as const;
type FlowName = (typeof SETTINGS_TABLE_FLOWS)[number];

const SETTINGS_URL = '/systems/wh40k-rpg/module/wh40k-rpg-settings.js';
const TRACKER_URL = '/systems/wh40k-rpg/module/managers/event-tracker.js';

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

interface TableEntryLike {
    key: string;
    type: { name: string };
}

async function probeSettingsTable(page: Page): Promise<FlowResult[]> {
    return page.evaluate(
        async ({ settingsUrl, trackerUrl }): Promise<FlowResult[]> => {
            const out: FlowResult[] = [];
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: {
                    settings: {
                        settings: Map<string, { type?: { name?: string } }>;
                        get: (ns: string, key: string) => string | boolean | number | object;
                        set: (ns: string, key: string, value: string | boolean | number | object) => Promise<object>;
                    };
                };
                CONFIG: {
                    Token: {
                        movement: {
                            actions: Partial<
                                Record<string, { getCostFunction?: (token: object) => (cost: number, from?: object, to?: object, distance?: number) => number }>
                            >;
                        };
                    };
                };
            };
            const settingsMod = (await import(/* @vite-ignore */ settingsUrl)) as {
                WH40KSettings: { TABLE: Record<string, TableEntryLike>; isResyncOnReadyEnabled: () => boolean; getMovementAutomation: () => string };
            };
            const trackerMod = (await import(/* @vite-ignore */ trackerUrl)) as { EVENT_TRACKER_SETTINGS: Record<string, string> };
            const { WH40KSettings } = settingsMod;

            // 1. every table key is registered, with the table's runtime type
            const registered = g.game.settings.settings;
            const missing = Object.values(WH40KSettings.TABLE)
                .filter((entry) => registered.get(`wh40k-rpg.${entry.key}`)?.type?.name !== entry.type.name)
                .map((entry) => `${entry.key}(${registered.get(`wh40k-rpg.${entry.key}`)?.type?.name ?? 'missing'} ≠ ${entry.type.name})`);
            const trackerMissing = Object.values(trackerMod.EVENT_TRACKER_SETTINGS).filter((key) => !registered.has(`wh40k-rpg.${key}`));
            const allRegistered = missing.length === 0 && trackerMissing.length === 0 && Object.keys(WH40KSettings.TABLE).length === 51;
            out.push({
                name: 'table-keys-registered',
                ok: allRegistered,
                detail: allRegistered
                    ? null
                    : `table ${Object.keys(WH40KSettings.TABLE).length}; mismatched ${missing.join(', ')}; tracker missing ${trackerMissing.join(', ')}`,
            });

            // 2. an accessor reads the stored value, and the default for a rejected one
            const before = g.game.settings.get('wh40k-rpg', 'resync-on-ready');
            try {
                await g.game.settings.set('wh40k-rpg', 'resync-on-ready', false);
                const off = WH40KSettings.isResyncOnReadyEnabled();
                await g.game.settings.set('wh40k-rpg', 'resync-on-ready', true);
                const on = WH40KSettings.isResyncOnReadyEnabled();
                out.push({
                    name: 'accessor-reads-stored-value',
                    ok: !off && on,
                    detail: !off && on ? null : `stored false read ${off}, stored true read ${on}`,
                });
            } finally {
                await g.game.settings.set('wh40k-rpg', 'resync-on-ready', before);
            }

            // 3. movement automation `none` gives the plain movement cost
            const automation = g.game.settings.get('wh40k-rpg', 'movement-automation');
            try {
                await g.game.settings.set('wh40k-rpg', 'movement-automation', 'none');
                const half = g.CONFIG.Token.movement.actions['half'];
                const costOf = (): number | undefined => half?.getCostFunction?.({ actor: { system: { movement: {} } } })(5, undefined, undefined, 3);
                const off = costOf();
                await g.game.settings.set('wh40k-rpg', 'movement-automation', 'full');
                const tracked = costOf();
                const ok = off === 5 && tracked === 8 && WH40KSettings.getMovementAutomation() === 'full';
                out.push({ name: 'movement-automation-off-plain-cost', ok, detail: ok ? null : `none → ${off}, full → ${tracked}` });
            } catch (err) {
                out.push({ name: 'movement-automation-off-plain-cost', ok: false, detail: err instanceof Error ? err.message : String(err) });
            } finally {
                await g.game.settings.set('wh40k-rpg', 'movement-automation', automation);
            }
            return out;
        },
        { settingsUrl: SETTINGS_URL, trackerUrl: TRACKER_URL },
    );
}

test.describe.serial('the typed settings table (Tier B, #712)', () => {
    test.setTimeout(scaledMs(120_000));
    test('the tables are what Foundry registered, and accessors and the token read them', async ({ page }) => {
        await joinOrSkip(page);
        const results = await probeSettingsTable(page);
        const fired = new Map(results.map((r) => [r.name, r]));
        const failures: string[] = [];
        for (const flow of SETTINGS_TABLE_FLOWS) {
            const result = fired.get(flow);
            if (result?.ok === true) recordCoverage('settings-table.flow', flow);
            else failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
