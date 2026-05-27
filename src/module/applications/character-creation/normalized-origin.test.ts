import { describe, expect, it } from 'vitest';
import { normalizeOrigin } from './normalized-origin.ts';

describe('normalizeOrigin officialLines', () => {
    it('lists lines with raw provenance from the raw _source map (preferred over flattened system)', () => {
        const doc = {
            name: 'Lasgun Origin',
            type: 'originPath',
            // prepared system is flattened to the active line only
            system: { source: { dh2: { provenance: 'homebrew' } } },
            // raw per-line map retains every line's provenance
            _source: {
                system: {
                    source: {
                        dh1: { provenance: 'raw' },
                        dh2: { provenance: 'homebrew' },
                        rt: { provenance: 'raw' },
                    },
                },
            },
        };
        expect(normalizeOrigin(doc).officialLines.sort()).toEqual(['dh1', 'rt']);
    });

    it('falls back to system.source when there is no _source (index entries hold the stored map)', () => {
        const doc = { name: 'X', type: 'originPath', system: { source: { dh2: { provenance: 'raw' } } } };
        expect(normalizeOrigin(doc).officialLines).toEqual(['dh2']);
    });

    it('returns empty when no line is official (pure homebrew)', () => {
        const doc = { name: 'X', type: 'originPath', system: { source: { dh2: { provenance: 'homebrew' } } } };
        expect(normalizeOrigin(doc).officialLines).toEqual([]);
    });

    it('ignores non-line keys in the source map', () => {
        const doc = { name: 'X', type: 'originPath', system: { source: { provenance: 'raw', book: 'Core' } } };
        expect(normalizeOrigin(doc).officialLines).toEqual([]);
    });
});
