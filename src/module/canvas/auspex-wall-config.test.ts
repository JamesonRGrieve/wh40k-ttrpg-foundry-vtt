import { describe, expect, it } from 'vitest';
import { buildWallScanFields, WALL_SCAN_SHIELDED_INPUT, WALL_SCAN_THICKNESS_INPUT } from './auspex-wall-config.ts';

const LABELS = { legend: 'Auspex Scans', thickness: 'Thickness (cm)', thicknessHint: 'hint', shielded: 'Blocks scanners', shieldedHint: 'hint' };

describe('wall scan fields (#759)', () => {
    it('writes the thickness and shielding as the wall flags the scan reads', () => {
        const fields = buildWallScanFields(document, LABELS, { thickness: 60, shielded: true });
        expect(WALL_SCAN_THICKNESS_INPUT).toBe('flags.wh40k-rpg.scanThickness');
        expect(WALL_SCAN_SHIELDED_INPUT).toBe('flags.wh40k-rpg.scanShielded');
        expect(fields.querySelector<HTMLInputElement>(`input[name="${WALL_SCAN_THICKNESS_INPUT}"]`)?.value).toBe('60');
        expect(fields.querySelector<HTMLInputElement>(`input[name="${WALL_SCAN_SHIELDED_INPUT}"]`)?.checked).toBe(true);
        expect(fields.querySelector('legend')?.textContent).toBe('Auspex Scans');
    });

    it('a thin wall leaves the thickness blank and the shielding off', () => {
        const fields = buildWallScanFields(document, LABELS, { thickness: null, shielded: false });
        expect(fields.querySelector<HTMLInputElement>(`input[name="${WALL_SCAN_THICKNESS_INPUT}"]`)?.value).toBe('');
        expect(fields.querySelector<HTMLInputElement>(`input[name="${WALL_SCAN_SHIELDED_INPUT}"]`)?.checked).toBe(false);
    });
});
