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

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const SRC = readRepoFile('src/module/applications/actor/npc-sheet.ts');
const TAB_NPC = readRepoFile('src/templates/actor/npc/tab-npc.hbs');

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

    it('does NOT put Fate in the sidebar header — it belongs on the Combat tab (#258)', () => {
        // The Fate control was wrongly added to the header; it must be removed.
        expect(SRC).not.toContain("name: 'system.fate.value'");
        expect(SRC).not.toContain("label: 'Fate'");
    });

    it('gates the Combat-tab Fate control to elite/master NPCs via npcFateHidden (#258)', () => {
        // The sheet sets npcFateHidden = true for NPCs that are neither elite nor
        // master; PCs never set it (undefined → control renders).
        expect(SRC).toMatch(/npcTier === 'elite' \|\| npcTier === 'master'/);
        expect(SRC).toContain("context['npcFateHidden'] = !(");
    });

    it('the combat panel renders Fate only when npcFateHidden is falsy (#258)', () => {
        const COMBAT = readRepoFile('src/templates/actor/panel/combat-station-panel.hbs');
        expect(COMBAT).toContain('{{#unless npcFateHidden}}');
        // The fate block (its data-field bindings) sits inside the guard.
        expect(COMBAT).toMatch(/\{\{#unless npcFateHidden\}\}[\s\S]*data-field="system\.fate\.value"[\s\S]*\{\{\/unless\}\}/);
    });
});

describe('NPC fate schema (#258)', () => {
    const NPC_SRC = readRepoFile('src/module/data/actor/npc.ts');

    it('defines a fate {value,max} schema field', () => {
        expect(NPC_SRC).toMatch(/fate: new SchemaField\(\{/);
        expect(NPC_SRC).toContain('declare fate: { value: number; max: number }');
    });
});
