/**
 * `game.i18n` stub backed by the real `src/lang/en.json` for unit tests.
 *
 * Tests that assert a localized display string resolve it through the actual
 * langpack, so a missing or renamed key fails the test instead of passing on a
 * passthrough stub. `format` substitutes `{name}` placeholders exactly like
 * Foundry's `game.i18n.format`. Test-only — never referenced by the runtime
 * import graph.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface LangTree {
    [key: string]: string | LangTree;
}

export interface LangStub {
    localize: (key: string) => string;
    format: (key: string, data?: Record<string, string>) => string;
    has: (key: string) => boolean;
}

function flatten(node: LangTree, prefix: string, out: Map<string, string>): void {
    for (const [name, value] of Object.entries(node)) {
        const path = prefix === '' ? name : `${prefix}.${name}`;
        if (typeof value === 'string') out.set(path, value);
        else flatten(value, path, out);
    }
}

let cachedStrings: Map<string, string> | undefined;

function langStrings(): Map<string, string> {
    if (cachedStrings !== undefined) return cachedStrings;
    const tree = JSON.parse(readFileSync(resolve(__dirname, '../../lang/en.json'), 'utf8')) as LangTree;
    const strings = new Map<string, string>();
    flatten(tree, '', strings);
    cachedStrings = strings;
    return strings;
}

/** Build a `game.i18n` stub over the real English langpack. Unknown keys resolve to the key itself, as in Foundry. */
export function buildLangStub(): LangStub {
    const strings = langStrings();
    const localize = (key: string): string => strings.get(key) ?? key;
    return {
        localize,
        has: (key: string): boolean => strings.has(key),
        format: (key: string, data: Record<string, string> = {}): string =>
            localize(key).replace(/\{(\w+)\}/g, (match: string, name: string) => data[name] ?? match),
    };
}
