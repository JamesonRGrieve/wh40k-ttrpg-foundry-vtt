import { describe, expect, it } from 'vitest';
import { packMetadata } from '../testing/pack-metadata.ts';
import { indexEntrySourceBook, packLine } from './index-source';

describe('indexEntrySourceBook (#658)', () => {
    const shared = {
        bc: { provenance: 'raw', book: 'BC: Core Rulebook', page: '172' },
        rt: { provenance: 'raw', book: 'RT: Core Rulebook', page: '136' },
    };

    it('reads the per-line shape the packs store, preferring the pack’s own line', () => {
        expect(indexEntrySourceBook(shared, 'rt')).toBe('RT: Core Rulebook');
        expect(indexEntrySourceBook(shared, 'bc')).toBe('BC: Core Rulebook');
    });

    it('falls back to the first line that names a book when the pack’s line has none', () => {
        expect(indexEntrySourceBook(shared, 'hb')).toBe('BC: Core Rulebook');
        expect(indexEntrySourceBook({ dh2: { provenance: 'raw', book: '' }, ow: { book: 'OW: Core Rulebook' } }, 'dh2')).toBe('OW: Core Rulebook');
    });

    it('still reads a flat reference, a legacy custom reference and a plain string', () => {
        expect(indexEntrySourceBook({ book: 'DH2: Core Rulebook', page: '191' }, 'dh2')).toBe('DH2: Core Rulebook');
        expect(indexEntrySourceBook({ book: '', custom: 'Homebrew Codex' }, 'dh2')).toBe('Homebrew Codex');
        expect(indexEntrySourceBook('  Tome of Fate  ', 'bc')).toBe('Tome of Fate');
    });

    it('is empty for an entry without a source (a lean index row)', () => {
        for (const raw of [undefined, null, {}, 7, { rt: null }]) expect(indexEntrySourceBook(raw, 'rt')).toBe('');
    });
});

describe('packLine', () => {
    it("reads the pack's line from its declared flags, homebrew packs included, and '' when it declares none", () => {
        expect(packLine(packMetadata('named-anything', 'rt', 'ammo'))).toBe('rt');
        expect(packLine(packMetadata('brew', 'dh2', 'talents', true))).toBe('dh2');
        expect(packLine({ name: 'rt-looks-like-a-line' })).toBe('');
    });
});
