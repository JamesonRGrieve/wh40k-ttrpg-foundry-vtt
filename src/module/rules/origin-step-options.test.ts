import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { walkFiles } from '../../../scripts/lib/walk.mjs';
import enLang from '../../lang/en.json';
import { SystemConfigRegistry } from '../config/game-systems/index.ts';
import type { GameSystemId } from '../config/game-systems/types.ts';
import { HAS_PRIVATE_CONTENT } from '../testing/private-content.ts';
import { originGrantFieldFlags, originSheetLine, originSheetLineContext, originStepOptions } from './origin-step-options.ts';
import { originStepLabelKey } from './origin-steps.ts';

/**
 * The origin-path sheet's step select and grant fields (#687). The select hard-coded
 * Rogue Trader's steps, so every other line's origin opened on "Home World" and a
 * save wrote `homeWorld` over its real step.
 */

const LINES: readonly GameSystemId[] = ['bc', 'dh1', 'dh2', 'dw', 'im', 'ow', 'rt'];
const label = (step: string): string => `label:${step}`;

/** The private packs' top-level folder per line, for origins that store no `gameSystem`. */
const LINE_FOLDERS: Readonly<Partial<Record<string, GameSystemId>>> = {
    'black-crusade': 'bc',
    'dark-heresy-1': 'dh1',
    'dark-heresy-2': 'dh2',
    'deathwatch': 'dw',
    'imperium-maledictum': 'im',
    'only-war': 'ow',
    'rogue-trader': 'rt',
};

interface OriginDoc {
    type?: string;
    system?: { step?: string | null; gameSystem?: string | null };
}

/** A langpack branch: nested branches down to string leaves. */
interface LangNode {
    [key: string]: LangNode | string | undefined;
}

/** Langpack lookup of a dotted key. */
function hasLangKey(key: string): boolean {
    let node: LangNode | string | undefined = enLang;
    for (const part of key.split('.')) {
        node = typeof node === 'object' ? node[part] : undefined;
    }
    return typeof node === 'string';
}

/** Every `system.step` the private packs' origin documents carry, per line. */
function packStepsByLine(): Map<GameSystemId, Set<string>> {
    const root = resolve(__dirname, '..', '..', 'packs-private');
    const byLine = new Map<GameSystemId, Set<string>>();
    for (const file of walkFiles(root, { ext: '.json' })) {
        let doc: OriginDoc;
        try {
            doc = JSON.parse(readFileSync(file, 'utf8')) as OriginDoc;
        } catch {
            continue;
        }
        const step = doc.system?.step;
        if (doc.type !== 'originPath' || typeof step !== 'string' || step === '') continue;
        const folder = file.slice(root.length + 1).split('/')[0] ?? '';
        const stored = doc.system?.gameSystem;
        const line = typeof stored === 'string' && stored !== '' ? (stored as GameSystemId) : LINE_FOLDERS[folder];
        if (line === undefined) continue;
        const steps = byLine.get(line) ?? new Set<string>();
        steps.add(step);
        byLine.set(line, steps);
    }
    return byLine;
}

describe('originStepOptions', () => {
    it("offers the line's steps in order, the stored one selected", () => {
        expect(originStepOptions(['race', 'archetype', 'pride'], 'archetype', label)).toEqual([
            { value: 'race', label: 'label:race', selected: false },
            { value: 'archetype', label: 'label:archetype', selected: true },
            { value: 'pride', label: 'label:pride', selected: false },
        ]);
    });

    it('keeps a stored step the line does not declare, selected, so a save never rewrites it', () => {
        const options = originStepOptions(['homeWorld', 'background'], 'lureOfTheVoid', label);
        expect(options.map((option) => option.value)).toEqual(['homeWorld', 'background', 'lureOfTheVoid']);
        expect(options.filter((option) => option.selected).map((option) => option.value)).toEqual(['lureOfTheVoid']);
    });

    it('adds nothing for an empty stored step', () => {
        expect(originStepOptions(['chapter'], '', label).map((option) => option.value)).toEqual(['chapter']);
    });
});

describe('originSheetLine (#690)', () => {
    it("an RT character's DH2-canonical Void Born renders for RT: RT's steps, Fate, no Emperor's Blessing", () => {
        const line = originSheetLine({ type: 'rt-character', system: { gameSystem: 'rt' } }, 'dh2');
        expect(line).toBe('rt');
        const { stepOptions, grantFields } = originSheetLineContext(line, 'homeWorld', label);
        expect(stepOptions.map((option) => option.value)).toEqual(SystemConfigRegistry.get('rt').getOriginPathStepKeys());
        expect(stepOptions.find((option) => option.selected)?.value).toBe('homeWorld');
        expect(grantFields).toEqual({ fateThreshold: true, blessedByEmperor: false });
    });

    it('follows the owner by its actor type, as the variant resolver does', () => {
        expect(originSheetLine({ type: 'bc-npc' }, 'dh2')).toBe('bc');
        expect(originSheetLine({ type: 'character', system: { gameSystem: 'ow' } }, 'dh2')).toBe('ow');
    });

    it('an unowned origin uses its own line', () => {
        expect(originSheetLine(null, 'dh2')).toBe('dh2');
        expect(originSheetLineContext('dh2', 'homeWorld', label).grantFields).toEqual({ fateThreshold: true, blessedByEmperor: true });
    });
});

describe('originGrantFieldFlags', () => {
    it('flags only the declared fields', () => {
        expect(originGrantFieldFlags(['fateThreshold'])).toEqual({ fateThreshold: true, blessedByEmperor: false });
        expect(originGrantFieldFlags([])).toEqual({ fateThreshold: false, blessedByEmperor: false });
    });

    it('Black Crusade declares neither Fate nor the Emperor; DH2 declares both', () => {
        expect(SystemConfigRegistry.get('bc').getOriginStepConfig().grantFields).toEqual([]);
        expect(SystemConfigRegistry.get('dh2').getOriginStepConfig().grantFields).toEqual(['fateThreshold', 'blessedByEmperor']);
    });
});

describe.each(LINES)('%s origin steps', (line) => {
    it('labels every declared step from the langpack', () => {
        const missing = SystemConfigRegistry.get(line)
            .getOriginPathStepKeys()
            .filter((step) => !hasLangKey(originStepLabelKey(step)));
        expect(missing).toEqual([]);
    });

    it.skipIf(!HAS_PRIVATE_CONTENT || !existsSync(resolve(__dirname, '..', '..', 'packs-private')))("offers every step that occurs in the line's packs", () => {
        const declared = new Set(SystemConfigRegistry.get(line).getOriginPathStepKeys());
        const used = [...(packStepsByLine().get(line) ?? [])];
        expect(used.filter((step) => !declared.has(step))).toEqual([]);
    });
});
