import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSkillUuidCache, findSkillUuid } from './skill-uuid-helper.ts';

interface IndexEntry {
    name: string;
}
interface PackStub {
    metadata: { name: string; id: string };
    documentName: string;
    index: Map<string, IndexEntry>;
}

/** Install a `game.packs` stub holding the given per-system skill packs. */
function stubPacks(packs: Array<{ name: string; entries: Array<[string, IndexEntry]> }>): void {
    const packObjs: PackStub[] = packs.map((p) => ({
        metadata: { name: p.name, id: `wh40k-rpg.${p.name}` },
        documentName: 'Item',
        index: new Map(p.entries),
    }));
    vi.stubGlobal('game', { packs: { find: (fn: (p: PackStub) => boolean) => packObjs.find(fn) } });
}

const TWO_SYSTEM_PACKS = [
    { name: 'dh2-core-items-skills', entries: [['dh2dodge', { name: 'Dodge' }]] as Array<[string, IndexEntry]> },
    { name: 'rt-core-items-skills', entries: [['rtdodge', { name: 'Dodge' }]] as Array<[string, IndexEntry]> },
];

describe('findSkillUuid per-system pack resolution (#279)', () => {
    afterEach(() => {
        clearSkillUuidCache();
        vi.unstubAllGlobals();
    });

    it('resolves from the dh2 pack for a dh2 actor', () => {
        stubPacks(TWO_SYSTEM_PACKS);
        expect(findSkillUuid('Dodge', null, 'dh2')).toBe('Compendium.wh40k-rpg.dh2-core-items-skills.dh2dodge');
    });

    it('resolves from the rt pack for an rt actor — the homologation fix (was hardcoded to dh2)', () => {
        stubPacks(TWO_SYSTEM_PACKS);
        expect(findSkillUuid('Dodge', null, 'rt')).toBe('Compendium.wh40k-rpg.rt-core-items-skills.rtdodge');
    });

    it('does not cross-cache same-named skills across systems', () => {
        stubPacks(TWO_SYSTEM_PACKS);
        expect(findSkillUuid('Dodge', null, 'dh2')).toContain('dh2-core-items-skills');
        // The dh2 lookup above must not poison the rt lookup (cache key is pack-scoped).
        expect(findSkillUuid('Dodge', null, 'rt')).toContain('rt-core-items-skills');
    });

    it('defaults to the dh1 pack prefix for dh1, and passes other ids through unchanged', () => {
        stubPacks([
            { name: 'dh1-core-items-skills', entries: [['dh1dodge', { name: 'Dodge' }]] },
            { name: 'dw-core-items-skills', entries: [['dwdodge', { name: 'Dodge' }]] },
        ]);
        expect(findSkillUuid('Dodge', null, 'dh1')).toContain('dh1-core-items-skills');
        expect(findSkillUuid('Dodge', null, 'dw')).toContain('dw-core-items-skills');
    });
});
