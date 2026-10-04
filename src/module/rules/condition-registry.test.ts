import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { conditionPackFixture } from '../testing/condition-catalog.ts';
import {
    activeConditionMechanics,
    buildConditionCatalog,
    captureCoreDeadStatus,
    conditionEffectData,
    conditionPickerRows,
    conditionStatusEffects,
    MODE_ADD,
    modifiersToEffectChanges,
    packLine,
    registerConditionStatusEffects,
    resolveCondition,
    setConditionCatalog,
} from './condition-registry.ts';

/**
 * The condition catalog is content-agnostic plumbing over the condition pack
 * documents (Direction #7): these tests feed it pack-shaped index rows and assert
 * that names, art, changes and mechanics come from the DATA, resolved for the
 * bearer's game line.
 */

beforeEach(() => {
    setConditionCatalog(buildConditionCatalog(conditionPackFixture()));
});

afterEach(() => {
    setConditionCatalog(new Map());
});

describe('packLine', () => {
    it('reads the game line from the pack name prefix', () => {
        expect(packLine('dh2-core-items-conditions')).toBe('dh2');
        expect(packLine('rt-core-items-conditions')).toBe('rt');
        expect(packLine('hb-dh2-items-conditions')).toBeNull();
    });
});

describe('buildConditionCatalog', () => {
    it('keys every condition document by its identifier, collecting each pack copy', () => {
        const catalog = buildConditionCatalog(conditionPackFixture());
        expect(catalog.get('prone')?.sources.map((s) => s.line)).toEqual(['dh2', 'rt']);
        expect(catalog.get('on-fire')?.sources.map((s) => s.line)).toEqual(['dh2', 'rt', 'im']);
    });

    it('ignores non-condition rows and rows with no identifier', () => {
        const catalog = buildConditionCatalog([
            {
                packName: 'dh2-core-items-talents',
                rows: [
                    { type: 'talent', name: 'Ambidextrous', system: { identifier: 'ambidextrous' } },
                    { type: 'condition', name: 'Nameless', system: { identifier: '' } },
                ],
            },
        ]);
        expect(catalog.size).toBe(0);
    });
});

describe('resolveCondition — per-line copy and per-line containers', () => {
    it("picks the bearer's own line copy (IM names on-fire 'Ablaze')", () => {
        expect(resolveCondition('on-fire', 'im')?.name).toBe('Ablaze');
        expect(resolveCondition('on-fire', 'dh2')?.name).toBe('Fire');
    });

    it('falls back to another line copy when the bearer line has none', () => {
        // Grappled is authored on the RT pack only.
        expect(resolveCondition('grappled', 'dh2')?.name).toBe('Grappled');
    });

    it('returns null for an unknown id', () => {
        expect(resolveCondition('inspired', 'dh2')).toBeNull();
    });
});

describe('modifiersToEffectChanges', () => {
    it('maps short and full characteristic keys, skills and combat stats to their change keys', () => {
        expect(
            modifiersToEffectChanges({
                characteristics: { ws: -10, ballisticSkill: -5, Ag: 0, unknownStat: -10 },
                skills: { dodge: -20 },
                combat: { defense: -20, attack: 0 },
            }),
        ).toEqual([
            { key: 'system.characteristics.weaponSkill.modifier', mode: MODE_ADD, value: -10 },
            { key: 'system.characteristics.ballisticSkill.modifier', mode: MODE_ADD, value: -5 },
            { key: 'system.skills.dodge.bonus', mode: MODE_ADD, value: -20 },
            { key: 'system.combat.defense', mode: MODE_ADD, value: -20 },
        ]);
    });

    it('returns no changes for a missing / malformed block', () => {
        expect(modifiersToEffectChanges(undefined)).toEqual([]);
        expect(modifiersToEffectChanges('not-a-block')).toEqual([]);
    });
});

describe('conditionEffectData — the applied effect comes from the document', () => {
    it('Prone (DH2): WS −10 and −20 to Evasion (defense)', () => {
        const data = conditionEffectData('prone', 'dh2');
        expect(data?.name).toBe('Prone');
        expect(data?.img).toBe('icons/svg/falling.svg');
        expect(data?.statuses).toEqual(['prone']);
        expect(data?.changes).toEqual([
            { key: 'system.characteristics.weaponSkill.modifier', mode: MODE_ADD, value: -10 },
            { key: 'system.combat.defense', mode: MODE_ADD, value: -20 },
        ]);
    });

    it('Prone (RT): WS −10 and −20 to Dodge — the same status id, the RT line payload', () => {
        expect(conditionEffectData('prone', 'rt')?.changes).toEqual([
            { key: 'system.characteristics.weaponSkill.modifier', mode: MODE_ADD, value: -10 },
            { key: 'system.skills.dodge.bonus', mode: MODE_ADD, value: -20 },
        ]);
    });

    it('Stunned carries NO bearer modifiers (others get +20 to hit instead)', () => {
        expect(conditionEffectData('stunned', 'dh2')?.changes).toEqual([]);
    });

    it('Blinded is WS −30 only: BS is an auto-fail, not a modifier', () => {
        expect(conditionEffectData('blinded', 'dh2')?.changes).toEqual([{ key: 'system.characteristics.weaponSkill.modifier', mode: MODE_ADD, value: -30 }]);
    });

    it('Fatigued: no flat modifier in DH2 (halving is rules/fatigue.ts), −10 to all in RT', () => {
        expect(conditionEffectData('fatigued', 'dh2')?.changes).toEqual([]);
        const rt = conditionEffectData('fatigued', 'rt')?.changes ?? [];
        expect(rt).toHaveLength(9);
        expect(rt.every((change) => change.value === -10)).toBe(true);
        expect(rt.map((change) => change.key)).toContain('system.characteristics.fellowship.modifier');
    });

    it('stamps the nature flag and merges per-application flags and overrides', () => {
        const data = conditionEffectData('pinned', 'dh2', { name: 'Pinned (suppressed)', flags: { 'wh40k-rpg': { criticalConditionId: 'pinned' } } });
        expect(data?.name).toBe('Pinned (suppressed)');
        expect(data?.flags).toEqual({ 'wh40k-rpg': { nature: 'harmful', criticalConditionId: 'pinned' } });
    });

    it('returns null for an id no condition document declares (no hard-coded fallbacks)', () => {
        for (const id of ['inspired', 'blessed', 'manacled', 'burning']) expect(conditionEffectData(id, 'dh2')).toBeNull();
    });

    it("builds Foundry core's `dead` marker with no stat changes", () => {
        captureCoreDeadStatus([
            { id: 'sleep', name: 'EFFECT.StatusAsleep', img: 'icons/svg/sleep.svg' },
            { id: 'dead', name: 'EFFECT.StatusDead', img: 'icons/svg/skull.svg' },
        ]);
        const dead = conditionEffectData('dead', 'dh2');
        expect(dead?.img).toBe('icons/svg/skull.svg');
        expect(dead?.changes).toEqual([]);
        expect(dead?.statuses).toEqual(['dead']);
    });
});

describe('status-effect rows', () => {
    it('lists core dead plus one row per catalog condition, named and illustrated from the documents', () => {
        captureCoreDeadStatus([{ id: 'dead', name: 'EFFECT.StatusDead', img: 'icons/svg/skull.svg' }]);
        const rows = conditionStatusEffects('dh2');
        expect(rows[0]).toEqual({ id: 'dead', name: 'EFFECT.StatusDead', img: 'icons/svg/skull.svg' });
        expect(rows).toContainEqual({ id: 'prone', name: 'Prone', img: 'icons/svg/falling.svg' });
        expect(rows.map((r) => r.id)).not.toContain('inspired');
    });

    it('registers in place, so an id-keyed proxy target stays in sync', () => {
        const target = [{ id: 'stale', name: 'Stale', img: '' }];
        registerConditionStatusEffects(target, 'dh2');
        expect(target.map((r) => r.id)).not.toContain('stale');
        expect(target.map((r) => r.id)).toContain('stunned');
    });

    it('picker rows carry the nature the document declares', () => {
        expect(conditionPickerRows('rt').find((r) => r.id === 'concealed')).toEqual({
            id: 'concealed',
            name: 'Concealed',
            img: 'icons/svg/mystery-man.svg',
            nature: 'harmful',
        });
    });
});

describe('activeConditionMechanics', () => {
    it("reads the bearer's status ids against the catalog, resolved for its line", () => {
        const mechanics = activeConditionMechanics({ system: { gameSystem: 'rt' }, statuses: new Set(['grappled', 'not-a-condition']), items: [] });
        expect(mechanics.map((m) => m.identifier)).toEqual(['grappled']);
        expect(mechanics[0]?.actionLimit).toBe('grappleOnly');
    });

    it('includes owned condition items and de-duplicates a condition carried both ways', () => {
        const ownedProne = {
            type: 'condition',
            name: 'Prone (item)',
            system: { identifier: 'prone', targeted: [{ attack: 'melee', value: 99, exceptRange: '', label: '' }] },
        };
        const ownedOther = { type: 'condition', name: 'Toxic', system: { identifier: 'toxic', actionLimit: 'halfActionOnly' } };
        const weapon = { type: 'weapon', name: 'Lasgun', system: {} };
        const mechanics = activeConditionMechanics({ system: { gameSystem: 'dh2' }, statuses: new Set(['prone']), items: [ownedProne, ownedOther, weapon] });
        expect(mechanics.map((m) => m.identifier)).toEqual(['prone', 'toxic']);
        // The status copy wins (first occurrence): the catalog's +10, not the item's +99.
        expect(mechanics[0]?.targeted[0]?.value).toBe(10);
        expect(mechanics[1]?.actionLimit).toBe('halfActionOnly');
    });

    it('is empty for a missing bearer', () => {
        expect(activeConditionMechanics(null)).toEqual([]);
    });
});
