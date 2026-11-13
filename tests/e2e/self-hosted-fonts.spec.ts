import type { Request as PlaywrightRequest } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of the self-hosted fonts (#709). The sheets' faces and
 * Material Icons ship in `dist/fonts/`; nothing is fetched from Google.
 *
 * - `no-google-font-requests`: joining the world makes no request to
 *   fonts.googleapis.com or fonts.gstatic.com.
 * - `system-faces-load`: each family the sheets use loads from the system's own
 *   `/systems/wh40k-rpg/fonts/` files.
 * - `material-icons-render-as-glyphs`: an icon name renders as one ligature
 *   glyph, not as its letters.
 *
 * Each flow records under `self-hosted-fonts.flow`. Keys MUST match
 * SELF_HOSTED_FONTS_FLOWS in scripts/e2e-coverage.mjs.
 */

const SELF_HOSTED_FONTS_FLOWS = ['no-google-font-requests', 'system-faces-load', 'material-icons-render-as-glyphs'] as const;
type FlowName = (typeof SELF_HOSTED_FONTS_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string;
}

const GOOGLE = /fonts\.(?:googleapis|gstatic)\.com/;

test.describe.serial('self-hosted fonts (Tier B, #709)', () => {
    test.setTimeout(scaledMs(120_000));
    test('the faces and icons load from the system, never from Google', async ({ page }) => {
        const google: string[] = [];
        const fontFiles: string[] = [];
        page.on('request', (request: PlaywrightRequest) => {
            const url = request.url();
            if (GOOGLE.test(url)) google.push(url);
            if (url.includes('/systems/wh40k-rpg/fonts/')) fontFiles.push(new URL(url).pathname);
        });
        await joinOrSkip(page);

        const loaded = await page.evaluate(async () => {
            const families = ['Cinzel', 'IM Fell DW Pica', 'Lusitana', 'Roboto', 'Material Icons'];
            const result: Record<string, number> = {};
            for (const family of families) {
                // eslint-disable-next-line no-await-in-loop -- one family at a time keeps each count its own
                result[family] = (await document.fonts.load(`16px '${family}'`, 'Ag')).length;
            }
            // An icon name set in Material Icons is one ligature glyph, far narrower than its letters.
            const probe = document.createElement('span');
            probe.className = 'material-icons';
            probe.textContent = 'add_circle';
            probe.style.fontSize = '24px';
            const plain = document.createElement('span');
            plain.textContent = 'add_circle';
            plain.style.cssText = 'font: 24px Roboto';
            document.body.append(probe, plain);
            const glyphWidth = probe.getBoundingClientRect().width;
            const textWidth = plain.getBoundingClientRect().width;
            probe.remove();
            plain.remove();
            return { result, glyphWidth, textWidth };
        });

        const missingFaces = Object.entries(loaded.result)
            .filter(([, faces]) => faces === 0)
            .map(([family]) => family);
        const results: FlowResult[] = [
            { name: 'no-google-font-requests', ok: google.length === 0, detail: `Google requests: ${google.slice(0, 3).join(', ')}` },
            {
                name: 'system-faces-load',
                ok: missingFaces.length === 0 && fontFiles.length > 0,
                detail: `no face loaded for ${missingFaces.join(', ')}; system font files fetched: ${fontFiles.join(', ')}`,
            },
            {
                name: 'material-icons-render-as-glyphs',
                ok: loaded.glyphWidth > 0 && loaded.glyphWidth <= 32 && loaded.textWidth > loaded.glyphWidth * 2,
                detail: `icon ${loaded.glyphWidth}px wide, the same text in Roboto ${loaded.textWidth}px`,
            },
        ];
        const fired = new Map(results.map((r) => [r.name, r]));
        const failures: string[] = [];
        for (const flow of SELF_HOSTED_FONTS_FLOWS) {
            const result = fired.get(flow);
            if (result?.ok === true) recordCoverage('self-hosted-fonts.flow', flow);
            else failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
