import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HUD_LAYER_Z_INDEX, pinToHudLayer } from './hud-layer.ts';

/**
 * Regression (#639): the In-Universe Time widget (and the Scene Environment
 * widget beside it) stacked with the sheets and rose above them on every render
 * and click, covering sheets opened near the top-left and catching their clicks.
 */
describe('pinToHudLayer', () => {
    it("puts the element on Foundry's UI layer, below every window", () => {
        const el = document.createElement('aside');
        el.style.zIndex = '105';
        pinToHudLayer(el);
        expect(el.style.zIndex).toBe(HUD_LAYER_Z_INDEX);
        expect(HUD_LAYER_Z_INDEX).toBe('var(--z-index-ui)');
    });

    it('both HUD widgets pin themselves instead of rising to the front', () => {
        for (const file of ['world-time-widget.ts', 'scene-environment-widget.ts']) {
            const source = readFileSync(resolve(__dirname, file), 'utf8');
            expect(source).toMatch(/\n {4}bringToFront\(\): void \{\s*pinToHudLayer\(this\.element\);\s*\}/);
        }
    });
});
