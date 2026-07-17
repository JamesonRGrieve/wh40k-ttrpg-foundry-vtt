import { describe, expect, it } from 'vitest';
import { applySystemDataset } from './apply-system-dataset.ts';

describe('applySystemDataset (#462)', () => {
    it('stamps data-wh40k-system when a system resolves', () => {
        const el = document.createElement('div');
        applySystemDataset(el, 'dh2');
        expect(el.dataset['wh40kSystem']).toBe('dh2');
    });

    it('is a no-op for undefined/empty (a system-agnostic app keeps its base colour)', () => {
        const el = document.createElement('div');
        applySystemDataset(el, undefined);
        expect(el.dataset['wh40kSystem']).toBeUndefined();
        applySystemDataset(el, '');
        expect(el.dataset['wh40kSystem']).toBeUndefined();
    });
});
