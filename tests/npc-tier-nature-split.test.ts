/**
 * Regression guard (#257): the overloaded NPC `type` field is split into the
 * orthogonal `tier` (RAW magnitude) and `nature` (creature kind) axes, `role` is
 * dropped, and config is reconciled to the schema.
 *
 * splitNpcType lives in a Foundry-free module so it is unit-tested directly; the
 * schema / migration / sheet / config wiring is asserted by source scan (the
 * NPC DataModel + sheet pull Foundry globals at load).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The pure splitNpcType / vocabulary behaviour is unit-tested co-located at
// src/module/data/actor/npc-type-axes.test.ts; this file asserts the wiring.

const read = (p: string): string => readFileSync(resolve(__dirname, '..', p), 'utf8');
const NPC = read('src/module/data/actor/npc.ts');
const SHEET = read('src/module/applications/actor/npc-sheet.ts');
const CONFIG_SRC = read('src/module/config.ts');

describe('NPC schema split (#257 — source contract)', () => {
    it('declares tier + nature schema fields, not type/role', () => {
        expect(NPC).toMatch(/tier: new StringField\(\{[\s\S]*?choices: \['troop', 'elite', 'master', 'horde'\]/);
        expect(NPC).toMatch(/nature: new StringField\(\{[\s\S]*?choices: \['none', 'swarm', 'creature', 'daemon', 'xenos'\]/);
        expect(NPC).not.toMatch(/role: new StringField/);
        expect(NPC).not.toMatch(/^\s*type: new StringField/m);
    });

    it('migrates a legacy single type onto the axes and drops role', () => {
        expect(NPC).toContain('#migrateTypeRole');
        expect(NPC).toContain('NPCData.#migrateTypeRole(source)');
        expect(NPC).toContain("delete source['role']");
    });

    it('keeps back-compat read-only type/role getters', () => {
        expect(NPC).toMatch(/get type\(\)[\s\S]*?this\.nature !== 'none' \? this\.nature : this\.tier/);
        expect(NPC).toMatch(/get role\(\)/);
    });
});

describe('NPC sheet + config reconcile (#257 — source contract)', () => {
    it('exposes Tier + Nature header selects, not Role', () => {
        expect(SHEET).toContain("name: 'system.tier'");
        expect(SHEET).toContain("name: 'system.nature'");
        expect(SHEET).not.toContain("name: 'system.role'");
    });

    it('reconciles config npcTypes to the tier schema (horde, not legendary)', () => {
        expect(CONFIG_SRC).toContain("horde: { label: 'WH40K.NPCType.Horde' }");
        expect(CONFIG_SRC).not.toContain('legendary: {');
    });
});
