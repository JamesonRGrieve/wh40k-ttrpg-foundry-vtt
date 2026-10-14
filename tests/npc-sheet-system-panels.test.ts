/**
 * Regression guard (#628): every Black Crusade NPC sheet crashed with
 * "advances is not iterable". NPCSheet extends CharacterSheet and inherited its
 * per-system panel table, so a BC NPC built the character's Alignment panel,
 * which tallies `system.chaosAdvancements` — a ledger only the character
 * DataModel has. The NPC sheet never renders those panels (they live on the
 * Overview tab NPCs drop), so the table is now a per-class static and NPCSheet
 * declares the one panel its NPC tab renders.
 *
 * The sheet classes need Foundry globals at module load, so the contract is
 * checked at the source level, tied to the templates that consume the panels.
 */
import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const CHARACTER_SHEET = readRepoFile('src/module/applications/actor/character-sheet.ts');
const NPC_SHEET = readRepoFile('src/module/applications/actor/npc-sheet.ts');
const NPC_TAB = readRepoFile('src/templates/actor/npc/tab-npc.hbs');
const NPC_DATA = readRepoFile('src/module/data/actor/npc.ts');

/** The character sheet's BC panel keys, read from its panel table. */
function bcPanelKeys(): string[] {
    const block = /\n {4}bc: \[([\s\S]*?)\n {4}\],/.exec(CHARACTER_SHEET)?.[1] ?? '';
    return [...block.matchAll(/key: '([A-Za-z]+)'/g)].map((m) => m[1]);
}

describe('per-sheet system panels (#628)', () => {
    it('builds the panels from the sheet class, not a module-level table', () => {
        expect(CHARACTER_SHEET).toContain('static SYSTEM_PANELS: SystemPanels = PANEL_BUILDERS;');
        expect(CHARACTER_SHEET).toContain('(this.constructor as typeof CharacterSheet).SYSTEM_PANELS[activeGameSystem]');
        expect(CHARACTER_SHEET).not.toMatch(/of PANEL_BUILDERS\[/);
    });

    it('gives the NPC sheet only the DW vehicle panel its NPC tab renders', () => {
        expect(NPC_SHEET).toContain('static override SYSTEM_PANELS: SystemPanels = { dw: [DW_VEHICLE_PANEL] };');
        expect(NPC_TAB).toContain('vehiclePanel=vehiclePanel');
    });

    it('builds no BC panel for an NPC, whose DataModel has no advancement ledger', () => {
        const keys = bcPanelKeys();
        expect(keys).toContain('alignmentPanel');
        for (const key of keys) expect(NPC_TAB).not.toContain(key);
        expect(NPC_DATA).not.toContain('chaosAdvancements');
    });
});
