// Which templates are per-system aware: pure logic behind scripts/lib/scan-theme.mjs.
//
// A template is aware DIRECTLY when its own text carries per-system theming: an
// `<id>:tw-*` variant class or a `themeClassFor` call (#422). It is aware THROUGH A
// PARTIAL when it renders a partial (`{{> path}}` or `{{#> path}}`) that is itself
// aware, directly or through its own partials. Moving a template's theming into a
// shared partial (#695: bare headings onto the item-detail-section panel) keeps the
// template themed, so it must not drop out of the count.
//
// Only literal `systems/wh40k-rpg/templates/…hbs` references are resolved; dynamic
// partials (`{{> (lookup …)}}`) and inline partials name nothing on disk.

const HBS_COMMENT = /\{\{!--[\s\S]*?--\}\}|\{\{![\s\S]*?\}\}/g;
const PARTIAL_REF = /\{\{~?#?>\s*systems\/wh40k-rpg\/templates\/([^\s}]+\.hbs)/g;
const HELPER_PATTERN = /themeClassFor/;

/** The repo-relative template paths a template's source renders as partials. */
export function partialReferences(text) {
    const code = text.replace(HBS_COMMENT, '');
    return [...code.matchAll(PARTIAL_REF)].map((m) => `src/templates/${m[1]}`);
}

/** True when a template's own text carries per-system theming. */
function isDirectlyAware(text, systemIds) {
    const variantPattern = new RegExp(`\\b(${systemIds.join('|')}):tw-`);
    return variantPattern.test(text) || HELPER_PATTERN.test(text);
}

/**
 * Classify every template.
 *
 * @param {Map<string, string>} sources repo-relative template path → source text
 * @param {readonly string[]} systemIds the game-system ids
 * @returns {{ direct: Set<string>, inherited: Set<string> }} templates aware on their
 *   own text, and templates aware only through a partial they render
 */
export function classifyThemeAwareness(sources, systemIds) {
    const direct = new Set();
    const references = new Map();
    for (const [path, text] of sources) {
        if (isDirectlyAware(text, systemIds)) direct.add(path);
        references.set(path, partialReferences(text));
    }

    const aware = new Set(direct);
    let grew = true;
    while (grew) {
        grew = false;
        for (const [path, refs] of references) {
            if (aware.has(path)) continue;
            if (refs.some((ref) => aware.has(ref))) {
                aware.add(path);
                grew = true;
            }
        }
    }

    const inherited = new Set([...aware].filter((path) => !direct.has(path)));
    return { direct, inherited };
}
