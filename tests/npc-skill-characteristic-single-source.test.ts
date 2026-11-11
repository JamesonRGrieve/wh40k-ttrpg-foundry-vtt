/**
 * One resolution decides which characteristic a skill row rolls against (#725).
 *
 * Six places each held a copy of the chain (own value, then catalog, then a
 * default) and two of them a hard-coded skill table. They disagreed on a blank
 * stored value: an NPC's Dodge was labelled Perception and rolled on Agility, and
 * a favourite skill's label came from a table that ignored the stored value.
 *
 * The sheet and the stat-block reader need Foundry globals at module load, so
 * their side of the contract is checked at the source level. The behaviour is
 * covered where it runs: `skill-definitions.test.ts`, `skill-key-helper.test.ts`,
 * `npc-skill-characteristic.test.ts` and `threat-calculator.test.ts`.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SKILL_DEFINITIONS } from '../src/module/data/shared/skill-definitions.ts';
import { readRepoFile } from './lib/repo-file.ts';

const ROOT = resolve(__dirname, '..');
const APPLICATIONS = resolve(ROOT, 'src', 'module', 'applications');

const NPC_DATA = readRepoFile('src/module/data/actor/npc.ts');
const NPC_SHEET = readRepoFile('src/module/applications/actor/npc-sheet.ts');
const THREAT_CALCULATOR = readRepoFile('src/module/applications/npc/threat-calculator.ts');
const STAT_BLOCK_PARSER = readRepoFile('src/module/applications/npc/stat-block-parser.ts');
const SKILL_KEY_HELPER = readRepoFile('src/module/helpers/skill-key-helper.ts');

function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) sourceFiles(path, out);
        else if (path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.endsWith('.stories.ts')) out.push(path);
    }
    return out;
}

/** Full characteristic keys, as a skill table's values would name them. */
const CHARACTERISTIC_KEYS = ['weaponSkill', 'ballisticSkill', 'strength', 'toughness', 'agility', 'intelligence', 'perception', 'willpower', 'fellowship'];

/**
 * `<skill key>: '<characteristic key>'` — one row of a hand-kept skill table.
 * Only catalog skill keys count, so `primaryStats: [...]`, a characteristic's own
 * label map or a `name: 'dodge'` literal never matches.
 */
const TABLE_ROW = new RegExp(`\\b(?:${Object.keys(SKILL_DEFINITIONS).join('|')}):\\s*'(?:${CHARACTERISTIC_KEYS.join('|')})'`, 'gu');

describe('skill characteristic: one resolution (#725)', () => {
    it('no application module keeps a skill-to-characteristic table', () => {
        const offenders = sourceFiles(APPLICATIONS)
            .map((path) => ({ path: relative(ROOT, path), rows: readRepoFile(relative(ROOT, path)).match(TABLE_ROW) ?? [] }))
            .filter(({ rows }) => rows.length > 0)
            .map(({ path, rows }) => `${path}: ${rows.length} rows`);
        expect(offenders).toEqual([]);
    });

    it('the table-row pattern recognises the tables that were removed', () => {
        expect("dodge: 'agility',\n parry: 'weaponSkill',".match(TABLE_ROW)).toHaveLength(2);
        expect("primaryStats: ['agility'], name: 'dodge', characteristic: 'agility'".match(TABLE_ROW)).toBeNull();
    });

    it('the NPC model reads the shared resolver through one method', () => {
        expect(NPC_DATA).toMatch(
            /skillRowCharacteristic\(skillKey: string, entry\?: NPCV2SkillEntry\): string \{\s*return resolveSkillCharacteristic\(skillKey, entry\?\.characteristic, this\.trainedSkills\[skillKey\]\?\.characteristic\);/u,
        );
        expect(NPC_DATA).toContain('this.getCharacteristic(this.skillRowCharacteristic(skillKey, entry))');
        expect(NPC_DATA).toContain('this.getCharacteristic(this.skillRowCharacteristic(skillName))');
        expect(NPC_DATA).toContain('characteristic: this.skillRowCharacteristic(key),');
        expect(NPC_DATA).toContain('characteristic: this.skillRowCharacteristic(key, entry),');
        expect(NPC_DATA).toContain('characteristic: resolveSkillCharacteristic(name, characteristic),');
    });

    it('the NPC model keeps no map or fallback of its own', () => {
        expect(NPC_DATA).not.toContain('SKILL_CHARACTERISTIC_MAP');
        expect(NPC_DATA).not.toMatch(/characteristic[^\n]*(?:\?\?|\|\|) 'Per'/u);
        expect(NPC_DATA).not.toMatch(/(?:\?\?|\|\|) 'perception'/u);
    });

    it("the NPC sheet writes a skill row with the model's resolution", () => {
        expect(NPC_SHEET.match(/this\.npcActor\.system\.skillRowCharacteristic\(skillKey\)/gu)).toHaveLength(2);
        expect(NPC_SHEET).not.toContain('resolveSkillChar');
        expect(NPC_SHEET).not.toContain('charMap');
        expect(NPC_SHEET).not.toMatch(/(?:\?\?|\|\|) '(?:perception|intelligence)'/u);
    });

    it('the NPC sheet labels a standard skill row with the characteristic its target was computed on', () => {
        expect(NPC_SHEET).toContain('characteristic: actor.system.skillRowCharacteristicShort(entry.key),');
        // The catalog's short code beside a target read off the stored characteristic.
        expect(NPC_SHEET).not.toContain('characteristic: entry.char,');
        expect(NPC_DATA).toMatch(
            /skillRowCharacteristicShort\(skillKey: string, entry\?: NPCV2SkillEntry\): string \{\s*const key = this\.skillRowCharacteristic\(skillKey, entry\);\s*const short = this\.getCharacteristic\(key\)\?\.short;/u,
        );
    });

    it('no sheet keeps a part preparer nothing calls', () => {
        // The NPC sheet has no overview part: its preparer built favourite-skill
        // labels from a 21-row table, and the base one it overrode had no caller.
        expect(NPC_SHEET).not.toContain('_prepareOverviewContext');
        expect(readRepoFile('src/module/applications/actor/character-sheet.ts')).not.toContain('_prepareOverviewContext');
    });

    it('the generator and the stat-block reader ask the shared helper', () => {
        expect(THREAT_CALCULATOR).toContain('characteristic: SkillKeyHelper.resolveCharacteristic(skillName),');
        expect(THREAT_CALCULATOR).not.toContain('charMap');
        expect(STAT_BLOCK_PARSER).toContain('characteristic: SkillKeyHelper.resolveCharacteristic(baseKey, characteristic),');
    });

    it('the helper holds no fallback of its own', () => {
        expect(SKILL_KEY_HELPER).toMatch(
            /static resolveCharacteristic\(skillKey: string, \.\.\.own: Array<string \| null \| undefined>\): string \{\s*return resolveSkillCharacteristic\(skillKey, \.\.\.own\);/u,
        );
    });
});
