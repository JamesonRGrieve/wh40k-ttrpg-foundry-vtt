/**
 * Guard (#696): every cybernetic type and body location resolves to a langpack
 * string. The header badge and Type field showed the raw
 * `WH40K.CyberneticType.Replacement`: the label was built from a key path with no
 * langpack entries, while the Type select read the real keys.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../lang/en.json';
import {
    CYBERNETIC_LOCATION_LABEL_KEYS,
    CYBERNETIC_LOCATIONS,
    CYBERNETIC_TYPE_LABEL_KEYS,
    CYBERNETIC_TYPES,
    cyberneticLocationLabelKey,
    cyberneticTypeLabelKey,
} from './cybernetic-labels.ts';

const ROOT = resolve(__dirname, '../../../..');

/** The langpack's shape: nested groups of strings. */
interface LangTree {
    [key: string]: string | LangTree | undefined;
}
const LANG: LangTree = en;

/** The langpack string at a dotted key, or undefined. */
function langString(key: string): string | undefined {
    let node: string | LangTree | undefined = LANG;
    for (const part of key.split('.')) {
        if (node === undefined || typeof node === 'string') return undefined;
        node = node[part];
    }
    return typeof node === 'string' ? node : undefined;
}

describe('cybernetic labels resolve to langpack strings (#696)', () => {
    it('every cybernetic type has a key that resolves to a non-empty string', () => {
        const unresolved = CYBERNETIC_TYPES.filter((type) => {
            const key = cyberneticTypeLabelKey(type);
            return key === undefined || (langString(key) ?? '') === '';
        });
        expect(unresolved).toEqual([]);
        expect(Object.keys(CYBERNETIC_TYPE_LABEL_KEYS).sort()).toEqual([...CYBERNETIC_TYPES].sort());
    });

    it('every body location has a key that resolves to a non-empty string', () => {
        const unresolved = CYBERNETIC_LOCATIONS.filter((location) => {
            const key = cyberneticLocationLabelKey(location);
            return key === undefined || (langString(key) ?? '') === '';
        });
        expect(unresolved).toEqual([]);
        expect(Object.keys(CYBERNETIC_LOCATION_LABEL_KEYS).sort()).toEqual([...CYBERNETIC_LOCATIONS].sort());
    });

    it('a value outside the vocabulary has no key', () => {
        expect(cyberneticTypeLabelKey('warp-engine')).toBeUndefined();
        expect(cyberneticLocationLabelKey('tail')).toBeUndefined();
    });

    it('the sheet Type select labels each type with the same key the badge uses', () => {
        const sheet = readFileSync(resolve(ROOT, 'src/templates/item/item-cybernetic-sheet.hbs'), 'utf8');
        const select = /<select name="system\.type"[\s\S]*?<\/select>/u.exec(sheet)?.[0] ?? '';
        const options = Object.fromEntries([...select.matchAll(/<option value="([^"]+)">\{\{localize "([^"]+)"\}\}<\/option>/gu)].map((m) => [m[1], m[2]]));
        expect(options).toEqual(CYBERNETIC_TYPE_LABEL_KEYS);
    });

    it('the data model reads its type and location choices from the shared vocabulary', () => {
        const model = readFileSync(resolve(ROOT, 'src/module/data/item/cybernetic.ts'), 'utf8');
        expect(model).toContain('choices: [...CYBERNETIC_TYPES]');
        expect(model).toContain('choices: [...CYBERNETIC_LOCATIONS]');
        expect(model).not.toContain('WH40K.CyberneticType.');
    });
});
