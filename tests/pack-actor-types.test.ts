/**
 * Regression guard (#296): every compendium pack whose name follows the actor
 * atomization taxonomy (`<line>-<book>-actors-<category>`) must be declared in
 * `system.json` with `type: "Actor"`. Five named-NPC / bestiary packs (DH1 core,
 * DH1 ascension, DW xenos) were declared `type: "Item"` — so Foundry filed them
 * under the Item compendium sidebar (or failed to surface them as actors), which
 * read in-world as "only the bestiary is available". The pack documents are
 * genuine Actor docs (`npc` / `dw-npc` with `system.characteristics`), so the
 * declaration was simply wrong.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface PackDecl {
    name: string;
    type: string;
}
interface SystemJson {
    packs: PackDecl[];
}

const system = JSON.parse(readFileSync(resolve(__dirname, '../src/system.json'), 'utf8')) as SystemJson;

describe('system.json actor-pack types (#296)', () => {
    const actorPacks = system.packs.filter((p) => p.name.includes('-actors-'));

    it('declares actor packs (the taxonomy exists)', () => {
        expect(actorPacks.length).toBeGreaterThan(0);
    });

    it('types every -actors- pack as "Actor" (not "Item")', () => {
        const misTyped = actorPacks.filter((p) => p.type !== 'Actor').map((p) => `${p.name} -> ${p.type}`);
        expect(misTyped).toEqual([]);
    });
});
