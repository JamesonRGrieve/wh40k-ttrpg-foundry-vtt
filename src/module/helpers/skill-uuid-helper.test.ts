import { afterEach, describe, expect, it, vi } from 'vitest';
import { packMetadata } from '../testing/pack-metadata.ts';
import { clearSkillUuidCache, findSkillUuid } from './skill-uuid-helper.ts';

interface IndexEntry {
    name: string;
}
interface PackStub {
    metadata: ReturnType<typeof packMetadata>;
    documentName: string;
    index: Map<string, IndexEntry>;
}

/** Install a `game.packs` stub holding the given per-line skill packs, each flagged with its line. */
function stubPacks(packs: Array<{ name: string; line: string; entries: Array<[string, IndexEntry]> }>): void {
    const packObjs: PackStub[] = packs.map((p) => ({
        metadata: packMetadata(p.name, p.line, 'skills'),
        documentName: 'Item',
        index: new Map(p.entries),
    }));
    vi.stubGlobal('game', { packs: packObjs });
}

const TWO_SYSTEM_PACKS = [
    { name: 'dh2-skills', line: 'dh2', entries: [['dh2dodge', { name: 'Dodge' }]] as Array<[string, IndexEntry]> },
    { name: 'rt-skills', line: 'rt', entries: [['rtdodge', { name: 'Dodge' }]] as Array<[string, IndexEntry]> },
];

describe('findSkillUuid per-system pack resolution (#279)', () => {
    afterEach(() => {
        clearSkillUuidCache();
        vi.unstubAllGlobals();
    });

    it('resolves from the dh2 pack for a dh2 actor', () => {
        stubPacks(TWO_SYSTEM_PACKS);
        expect(findSkillUuid('Dodge', null, 'dh2')).toBe('Compendium.wh40k-rpg.dh2-skills.dh2dodge');
    });

    it('resolves from the rt pack for an rt actor — the homologation fix (was hardcoded to dh2)', () => {
        stubPacks(TWO_SYSTEM_PACKS);
        expect(findSkillUuid('Dodge', null, 'rt')).toBe('Compendium.wh40k-rpg.rt-skills.rtdodge');
    });

    it('does not cross-cache same-named skills across systems', () => {
        stubPacks(TWO_SYSTEM_PACKS);
        expect(findSkillUuid('Dodge', null, 'dh2')).toContain('dh2-skills');
        // The dh2 lookup above must not poison the rt lookup (cache key is line-scoped).
        expect(findSkillUuid('Dodge', null, 'rt')).toContain('rt-skills');
    });

    it('selects the pack by its declared line, whatever it is named', () => {
        stubPacks([
            { name: 'rt-looking-name', line: 'dh1', entries: [['dh1dodge', { name: 'Dodge' }]] },
            { name: 'misc', line: 'dw', entries: [['dwdodge', { name: 'Dodge' }]] },
        ]);
        expect(findSkillUuid('Dodge', null, 'dh1')).toBe('Compendium.wh40k-rpg.rt-looking-name.dh1dodge');
        expect(findSkillUuid('Dodge', null, 'dw')).toBe('Compendium.wh40k-rpg.misc.dwdodge');
        expect(findSkillUuid('Dodge', null, 'rt')).toBeNull();
    });
});
