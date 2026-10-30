import { describe, expect, it } from 'vitest';
import { contentRefName, documentRefName, isDocumentUuid } from './content-ref-name';

describe('documentRefName (#699)', () => {
    const lookup = (uuid: string): string => (uuid === 'Compendium.wh40k-rpg.ow-medals.Item.OWcMedalWingSk01' ? 'Winged Skull' : '[broken link]');

    it('names a medal UUID by its document', () => {
        expect(documentRefName('Compendium.wh40k-rpg.ow-medals.Item.OWcMedalWingSk01', lookup, 'Unknown award')).toBe('Winged Skull');
    });

    it('never prints a stored slug: anything not a UUID reads as the unknown label', () => {
        expect(documentRefName('award-cadian-valour', lookup, 'Unknown award')).toBe('Unknown award');
        expect(documentRefName('', lookup, 'Unknown award')).toBe('Unknown award');
    });
});

describe('contentRefName', () => {
    const names: Record<string, string> = { 'Compendium.wh40k-rpg.ow-regimental-drawbacks.Item.70dcc1a74d10b5dc': 'Doomed' };
    const lookup = (uuid: string): string => names[uuid] ?? '[broken link]';

    it('names a compendium or world document by its UUID', () => {
        expect(contentRefName('Compendium.wh40k-rpg.ow-regimental-drawbacks.Item.70dcc1a74d10b5dc', lookup)).toBe('Doomed');
        expect(isDocumentUuid('Actor.abc123')).toBe(true);
        expect(isDocumentUuid('Item.abc123.Item.def')).toBe(true);
    });

    it('shows a value that is not a UUID as stored', () => {
        expect(contentRefName('Trooper Vellis', lookup)).toBe('Trooper Vellis');
        expect(contentRefName('short-rations', lookup)).toBe('short-rations');
        expect(isDocumentUuid('Compendium.')).toBe(false);
        expect(isDocumentUuid('Compendium.x y')).toBe(false);
    });
});
