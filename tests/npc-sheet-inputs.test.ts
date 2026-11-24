/**
 * Playtest report (2026-11-24): on the NPC tab, the Faction & Allegiance fields
 * cleared when the GM clicked away, and the Custom Stat Overrides took no input.
 *
 * - The faction inputs read `source.*`, but the sheet's `source` context is the
 *   NPC's source reference string, so they always rendered empty after a save.
 * - Schema rows are live only in edit mode or when their section is in play, and
 *   actor sheets never set `inEditMode`, so every actor schema row was read-only.
 */
import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../src/module/testing/repo-file.ts';

const tab = readRepoFile('src/templates/actor/npc/tab-npc.hbs');
const baseSheet = readRepoFile('src/module/applications/actor/base-actor-sheet.ts');
const vitals = readRepoFile('src/templates/actor/panel/overview-vitals-panel.hbs');

describe('NPC tab inputs hold their values', () => {
    it.each(['subfaction', 'allegiance'])('the %s input shows the stored system.%s', (field) => {
        expect(tab).toContain(`name="system.${field}" value="{{system.${field}}}"`);
    });

    it('no faction input reads the source reference as if it were the system data', () => {
        expect(tab).not.toMatch(/value="\{\{source\.(subfaction|allegiance)\}\}"/);
    });

    it('the Source field formats the structured source for display (#229, #252)', () => {
        expect(tab).toContain('name="system.source" value="{{sourceLabel source.source}}"');
    });
});

describe('actor schema rows are editable on an editable sheet', () => {
    it('every schema section an actor sheet prepares is in play', () => {
        expect(baseSheet).toMatch(/context\['schemaSections'\] = sections\.map\(\(section\) => \(\{ \.\.\.section, inPlay: true \}\)\)/);
    });
});

describe('the Combat tab carries Fatigue for NPCs too (#795)', () => {
    it('the Fatigue pip row is outside the PC-only gate', () => {
        const fatigue = vitals.indexOf('action="setFatigueBolt"');
        const gateBefore = vitals.lastIndexOf('{{#unless isNPC}}', fatigue);
        const closeBefore = vitals.lastIndexOf('{{/unless}}', fatigue);
        expect(fatigue).toBeGreaterThan(-1);
        // Any PC-only gate opened before the Fatigue row is already closed.
        expect(closeBefore).toBeGreaterThan(gateBefore);
    });
});
