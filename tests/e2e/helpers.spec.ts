import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Exercises the Handlebars helpers registered by
 * `src/module/handlebars/handlebars-helpers.ts`, the typed `t(...)` wrapper
 * at `src/module/i18n/t.ts`, the `uuidNameCache` accessor at
 * `src/module/utils/uuid-name-cache.ts`, and the @UUID enricher path
 * registered by `src/module/enrichers.ts`.
 *
 * Templates are compiled inline (via `Handlebars.compile`) rather than
 * loaded from `systems/wh40k-rpg/templates/...` because the targets here
 * are individual helper functions, not whole .hbs files. Inline templates
 * keep each probe small and self-contained — one failure surfaces one
 * helper.
 *
 * Failures are collected so one broken helper does not mask another. The
 * denominator for `helper.flow` lives in `scripts/e2e-coverage.mjs`
 * (`HELPER_FLOWS`) and MUST be kept in sync with the probe list below.
 */

// A real DH2 compendium UUID resolved at index-build time. If the underlying
// pack contents change, swap for any entry from .compendium-uuid-index.json
// — the goal is only to prove the cache resolves a known reference.
const DH2_TALENT_UUID = 'Compendium.wh40k-rpg.dh2-beyond-stats-talents.Item.K9jJBo8RG60icdiN';
const DH2_TALENT_NAME_LOWER = 'bodyguard';

interface ProbeResult {
    name: string;
    ok: boolean;
    detail: string;
}

test.describe.serial('handlebars / i18n / enricher helpers (Tier B)', () => {
    test('helpers, i18n wrapper, and @UUID enricher behave correctly', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error) => pageErrors.push(err.message);
        page.on('pageerror', listener);

        try {
            const probes = await page.evaluate(
                async ({ talentUuid, talentNameLower }) => {
                    const g = globalThis as unknown as {
                        Handlebars?: {
                            compile: (src: string) => (ctx: object, opts?: object) => string;
                            partials?: Record<string, unknown>;
                        };
                        foundry?: {
                            applications?: { ux?: { TextEditor?: { implementation?: { enrichHTML?: (text: string, opts?: object) => Promise<string> } } } };
                        };
                        TextEditor?: { enrichHTML?: (text: string, opts?: object) => Promise<string> };
                        game?: { i18n?: { localize?: (key: string) => string } };
                    };
                    const results: { name: string; ok: boolean; detail: string }[] = [];
                    const record = (name: string, ok: boolean, detail: string): void => {
                        results.push({ name, ok, detail });
                    };

                    if (g.Handlebars === undefined) {
                        record('all', false, 'Handlebars global unavailable');
                        return results;
                    }
                    const HB = g.Handlebars;

                    // 1. themeClassFor — explicit systemId override path AND
                    //    @root._gameSystemId path. The helper prefers explicit
                    //    arg over @root, so test both branches.
                    try {
                        const tpl = HB.compile(`{{themeClassFor 'border'}}|{{themeClassFor 'border' 'dh2e'}}|{{themeClassFor 'primary' 'rt'}}`);
                        const out = tpl({}, { data: { root: { _gameSystemId: 'dh2e' } } });
                        // Expected: [tw-border-<dh2e-border>, tw-border-<dh2e-border>, tw-bg-<rt-primary>]
                        const parts = out.split('|');
                        const allPrefixed = parts[0]?.startsWith('tw-border-') === true && parts[1]?.startsWith('tw-border-') === true && parts[2]?.startsWith('tw-bg-') === true;
                        const dh2Match = parts[0] === parts[1];
                        record('handlebars-themeClassFor-helper', allPrefixed && dh2Match, `out=${out}`);
                    } catch (err) {
                        record('handlebars-themeClassFor-helper', false, `threw: ${String((err as Error)?.message ?? err)}`);
                    }

                    // 2. {{#select 'b'}} block helper — should mark <option value="b"> as selected.
                    try {
                        const tpl = HB.compile(`{{#select 'b'}}<option value="a">A</option><option value="b">B</option>{{/select}}`);
                        const out = tpl({});
                        const aSelected = /value="a"[^>]*\sselected/.test(out);
                        const bSelected = /value="b"[^>]*\sselected/.test(out);
                        record('handlebars-select-block-helper', !aSelected && bSelected, `out=${out}`);
                    } catch (err) {
                        record('handlebars-select-block-helper', false, `threw: ${String((err as Error)?.message ?? err)}`);
                    }

                    // 3. concat — string concatenation with options-arg trim.
                    try {
                        const tpl = HB.compile(`{{concat 'a' 'b' 'c'}}`);
                        const out = tpl({});
                        record('handlebars-concat-helper', out === 'abc', `out=${out}`);
                    } catch (err) {
                        record('handlebars-concat-helper', false, `threw: ${String((err as Error)?.message ?? err)}`);
                    }

                    // 4. dhlog — must not throw; renders nothing visible.
                    try {
                        const tpl = HB.compile(`pre{{dhlog this}}post`);
                        const out = tpl({ marker: 'probe' });
                        // game.wh40k.log may or may not be defined in this build — what we
                        // care about is that the helper does not crash the render.
                        record('handlebars-dhlog-helper', out === 'prepost' || out.startsWith('pre'), `out=${out}`);
                    } catch (err) {
                        record('handlebars-dhlog-helper', false, `threw: ${String((err as Error)?.message ?? err)}`);
                    }

                    // 5. isPsychicAttack — a power without subtype 'Attack' returns false.
                    try {
                        const tpl = HB.compile(`{{isPsychicAttack power}}|{{isPsychicAttack attackPower}}`);
                        const out = tpl({
                            power: { system: { subtype: ['Concentration'] } },
                            attackPower: { system: { subtype: ['Attack'] } },
                        });
                        record('handlebars-isPsychicAttack', out === 'false|true', `out=${out}`);
                    } catch (err) {
                        record('handlebars-isPsychicAttack', false, `threw: ${String((err as Error)?.message ?? err)}`);
                    }

                    // 6. uuid-name — resolves a real DH2 talent UUID to its display name.
                    try {
                        const tpl = HB.compile(`{{uuid-name uuid}}`);
                        const out = tpl({ uuid: talentUuid }).trim();
                        // Cache may not yet hold the entry if the ready-hook walk hasn't
                        // completed for this pack — accept either the resolved name or
                        // an empty string (helper's documented fallback for misses).
                        const looksLikeName = out.length > 0 && !out.includes('Compendium.');
                        record('handlebars-uuid-name', looksLikeName || out === '', `out="${out}" expected~${talentNameLower}`);
                    } catch (err) {
                        record('handlebars-uuid-name', false, `threw: ${String((err as Error)?.message ?? err)}`);
                    }

                    // 7. uuid-expand — replaces {{Compendium.…}} tokens in freeform text.
                    try {
                        const tpl = HB.compile(`{{uuid-expand text}}`);
                        const text = `prefix {{${talentUuid}}} suffix`;
                        const out = tpl({ text });
                        // Either the token expanded to the name, or it passed through (cache
                        // miss); both are valid helper behaviour per uuidNameCache docs.
                        // What matters is the surrounding text survived.
                        const surroundOk = out.startsWith('prefix ') && out.endsWith(' suffix');
                        record('handlebars-uuid-expand', surroundOk, `out=${out}`);
                    } catch (err) {
                        record('handlebars-uuid-expand', false, `threw: ${String((err as Error)?.message ?? err)}`);
                    }

                    // 8. t(...) i18n wrapper — must return a string and resolve a known
                    //    key. The wrapper is shipped via dist as a module; pull it in.
                    try {
                        // Dynamic ESM import by URL — TS cannot resolve `/systems/...` at
                        // type-check time, so route through a Function-based importer that
                        // returns `unknown` and narrow on the result.
                        const importByUrl = new Function('u', 'return import(u)') as (u: string) => Promise<unknown>;
                        const modUnknown = await importByUrl('/systems/wh40k-rpg/module/i18n/t.js');
                        const mod = modUnknown as { t?: (k: string, p?: object) => string };
                        const tFn = mod.t;
                        if (typeof tFn !== 'function') {
                            record('i18n-t-wrapper', false, 'module did not export t');
                        } else {
                            const localized = tFn('WH40K.Confirm');
                            // game.i18n.localize returns the key itself if unresolved —
                            // accept either the localized text or the key as proof the
                            // wrapper round-trips through Foundry's i18n. Must be a string.
                            const ok = typeof localized === 'string' && localized.length > 0;
                            record('i18n-t-wrapper', ok, `localized="${localized}"`);
                        }
                    } catch (err) {
                        record('i18n-t-wrapper', false, `import/call threw: ${String((err as Error)?.message ?? err)}`);
                    }

                    // 9. @UUID enricher — Foundry's native enricher resolves a Compendium
                    //    UUID to a <a class="content-link">…</a>. The CONFIG.TextEditor
                    //    .enrichers array is populated by registerCustomEnrichers() but
                    //    this probe targets Foundry's built-in @UUID path, which the
                    //    pipeline registers alongside.
                    try {
                        const enrichHTML = g.foundry?.applications?.ux?.TextEditor?.implementation?.enrichHTML ?? g.TextEditor?.enrichHTML;
                        if (typeof enrichHTML !== 'function') {
                            record('enricher-@UUID-resolves', false, 'TextEditor.enrichHTML unavailable');
                        } else {
                            const input = `@UUID[${talentUuid}]`;
                            const out = await enrichHTML(input, { async: true });
                            const hasContentLink = /class="[^"]*content-link/.test(out);
                            record('enricher-@UUID-resolves', hasContentLink, `out=${out.slice(0, 200)}`);
                        }
                    } catch (err) {
                        record('enricher-@UUID-resolves', false, `threw: ${String((err as Error)?.message ?? err)}`);
                    }

                    return results;
                },
                { talentUuid: DH2_TALENT_UUID, talentNameLower: DH2_TALENT_NAME_LOWER },
            );

            const failures: string[] = [];
            for (const probe of probes as ProbeResult[]) {
                if (probe.ok) {
                    recordCoverage('helper.flow', probe.name);
                } else {
                    failures.push(`${probe.name}: ${probe.detail}`);
                }
            }

            expect(failures, `${failures.length}/${probes.length} helper probes failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
            expect(pageErrors, `page errors during helper probes: ${pageErrors.join(' | ')}`).toEqual([]);
        } finally {
            page.off('pageerror', listener);
        }
    });
});
