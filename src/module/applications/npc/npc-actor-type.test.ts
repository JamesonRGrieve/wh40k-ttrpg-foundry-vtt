import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import systemManifest from '../../../system.json';
import { WH40KSettings } from '../../wh40k-rpg-settings.ts';
import { newNpcActorType, npcTypeLine } from './npc-actor-type.ts';

/**
 * Regression (#633, #644): every NPC generator creates a registered NPC type.
 * The template selector, NPC-template sheet, quick-create, batch-create and the
 * stat-block import all created `npcV2`, which Foundry does not register, so the
 * actors were rejected.
 */

afterEach(() => {
    vi.restoreAllMocks();
});

const REGISTERED = Object.keys(systemManifest.documentTypes.Actor);

describe('newNpcActorType', () => {
    it("creates the world's primary line's NPC type", () => {
        vi.spyOn(WH40KSettings, 'getPrimaryGameSystem').mockReturnValue('rt');
        expect(newNpcActorType()).toBe('rt-npc');
    });

    it('keeps the line an imported NPC already names', () => {
        vi.spyOn(WH40KSettings, 'getPrimaryGameSystem').mockReturnValue('dh2');
        expect(newNpcActorType('dh1-npc')).toBe('dh1-npc');
        expect(newNpcActorType('bc-npc')).toBe('bc-npc');
    });

    it('falls back to the primary line for anything that is not a line NPC type', () => {
        vi.spyOn(WH40KSettings, 'getPrimaryGameSystem').mockReturnValue('dh2');
        for (const type of ['npcV2', 'npc', 'dh2-character', 'xx-npc', '']) expect(newNpcActorType(type)).toBe('dh2-npc');
    });

    it('only ever names a registered actor type', () => {
        for (const line of ['dh2', 'dh1', 'rt', 'bc', 'ow', 'dw', 'im'] as const) {
            vi.spyOn(WH40KSettings, 'getPrimaryGameSystem').mockReturnValue(line);
            expect(REGISTERED).toContain(newNpcActorType());
        }
    });
});

describe('npcTypeLine', () => {
    it('reads the line of a line NPC type, null otherwise', () => {
        expect(npcTypeLine('ow-npc')).toBe('ow');
        expect(npcTypeLine('npcV2')).toBeNull();
        expect(npcTypeLine(undefined)).toBeNull();
    });
});

function tsFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return tsFiles(path);
        return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.stories.ts') ? [path] : [];
    });
}

describe('no generator creates the retired npcV2 type', () => {
    it('no application source writes `type: npcV2`', () => {
        const root = resolve(__dirname, '../..');
        const offenders = tsFiles(join(root, 'applications'))
            .filter((file) => /type:\s*'npcV2'/.test(readFileSync(file, 'utf8')))
            .map((file) => relative(root, file));
        expect(offenders).toEqual([]);
    });
});
