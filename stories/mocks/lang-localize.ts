/**
 * Shared langpack resolver for the Storybook `game.i18n` mocks (#298 follow-up).
 *
 * `getHeaderFields` and other config code call `game.i18n.localize(...)` in TS at
 * render time. The story mocks previously stubbed that as a passthrough (returning
 * the key), which was fine while those labels were literal English — but #298 made
 * the header labels langpack keys, so the passthrough rendered raw keys
 * (`WH40K.OriginPath.Patron`) in story screenshots. This flattens en.json once and
 * resolves keys exactly like production and the `{{localize}}` Handlebars helper in
 * `../template-support.ts`, so TS-side localize callers render real labels.
 */
import enLang from '../../src/lang/en.json';

type LangNode = string | { readonly [key: string]: LangNode };

function flattenLang(node: LangNode, prefix: string, out: Map<string, string>): void {
    if (typeof node === 'string') {
        if (prefix !== '') out.set(prefix, node);
        return;
    }
    for (const [k, v] of Object.entries(node)) {
        flattenLang(v, prefix === '' ? k : `${prefix}.${k}`, out);
    }
}

const LANG_STRINGS = new Map<string, string>();
flattenLang(enLang, '', LANG_STRINGS);

/** Resolve a dotted langpack key to its English string; returns the key unchanged when absent. */
export function localizeKey(key: string): string {
    return LANG_STRINGS.get(key) ?? key;
}
