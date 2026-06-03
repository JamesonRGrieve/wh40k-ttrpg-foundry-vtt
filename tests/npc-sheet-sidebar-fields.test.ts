/**
 * Regression guard (#252): the NPC sidebar header exposes Faction, but the
 * Source / book-reference field lives on the NPC tab's Faction & Allegiance
 * panel — rendered through the `sourceLabel` helper so a structured `source`
 * object never prints `[object Object]` — and is NOT duplicated into the header.
 *
 * Source scan rather than runtime: the NPC sheet class pulls in Foundry globals
 * at module load and cannot instantiate under the unit env, and the contract here
 * is a literal one on the `_getSidebarHeaderFields()` return / the tab template.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(resolve(__dirname, '../src/module/applications/actor/npc-sheet.ts'), 'utf8');
const TAB_NPC = readFileSync(resolve(__dirname, '../src/templates/actor/npc/tab-npc.hbs'), 'utf8');

describe('NPC sidebar header fields (#252)', () => {
    it('defines _getSidebarHeaderFields', () => {
        expect(SRC).toContain('_getSidebarHeaderFields');
    });

    it('exposes the Faction field', () => {
        // `name: 'system.faction'` only appears in the sidebar header field list.
        expect(SRC).toContain("name: 'system.faction'");
    });

    it('does NOT duplicate the Source field into the sidebar header', () => {
        // The Source / book-reference field belongs on the NPC tab, not the header.
        expect(SRC).not.toContain("label: 'Source'");
    });

    it('renders the NPC-tab Source field through the sourceLabel helper', () => {
        // A structured `source` object bound raw printed `[object Object]`; the
        // helper collapses either shape to a display string.
        expect(TAB_NPC).toContain('{{sourceLabel source.source}}');
        expect(TAB_NPC).not.toContain('value="{{source.source}}"');
    });

    it('exposes a Fate field gated to elite/master tiers (#258)', () => {
        // The Fate header field is only pushed for elite/master NPCs.
        expect(SRC).toMatch(/const isFated = npcActor\.system\.type === 'elite' \|\| npcActor\.system\.type === 'master'/);
        expect(SRC).toContain("name: 'system.fate.value'");
        // It is spread conditionally on isFated, not unconditional.
        expect(SRC).toMatch(/isFated\s*\?\s*\[[\s\S]*name: 'system\.fate\.value'/);
    });
});

describe('NPC fate schema (#258)', () => {
    const NPC_SRC = readFileSync(resolve(__dirname, '../src/module/data/actor/npc.ts'), 'utf8');

    it('defines a fate {value,max} schema field', () => {
        expect(NPC_SRC).toMatch(/fate: new SchemaField\(\{/);
        expect(NPC_SRC).toContain('declare fate: { value: number; max: number }');
    });
});
