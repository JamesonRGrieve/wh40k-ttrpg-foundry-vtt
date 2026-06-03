/**
 * Regression guard (#252): the NPC sidebar header must expose both the Faction
 * and the Source / book-reference fields. Source previously lived only on the
 * NPC tab, so it read as "missing" on the sheet.
 *
 * Source scan rather than runtime: the NPC sheet class pulls in Foundry globals
 * at module load and cannot instantiate under the unit env, and the contract here
 * is a literal one on the `_getSidebarHeaderFields()` return.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(resolve(__dirname, '../src/module/applications/actor/npc-sheet.ts'), 'utf8');

describe('NPC sidebar header fields (#252)', () => {
    it('defines _getSidebarHeaderFields', () => {
        expect(SRC).toContain('_getSidebarHeaderFields');
    });

    it('exposes the Faction field', () => {
        // `name: 'system.faction'` only appears in the sidebar header field list.
        expect(SRC).toContain("name: 'system.faction'");
    });

    it('exposes the Source / book-reference field (the previously-missing one)', () => {
        expect(SRC).toContain("name: 'system.source'");
    });
});
