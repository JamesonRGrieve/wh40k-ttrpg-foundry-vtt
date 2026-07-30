#!/usr/bin/env node
/**
 * Utility-vs-component conflict audit for the `!important` retirement.
 *
 * scripts/cascade-audit.mjs compares rule-vs-rule in the built stylesheet, but
 * it cannot see that ONE element carries both a legacy component class and
 * inline `tw-*` utilities — the exact case a plugin rule's `!important` is
 * defending. This script closes that gap from the template side: for every
 * element in src/templates that carries one of the audited legacy classes, it
 * reports any co-located utility that sets a contested CSS property.
 *
 * A conflict means dropping `!important` hands that property to the utility.
 * No conflict means the `!important` is inert and safe to remove.
 *
 * Usage:
 *   node scripts/utility-conflict-audit.mjs [--root <dir>] <legacy-class>:<prop>[,<prop>…] …
 *
 * Example (panel-components.js's .wh40k-panel-header block):
 *   node scripts/utility-conflict-audit.mjs \
 *     wh40k-panel-header:display,flex-direction,align-items,width,box-sizing,min-width
 */
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { walkFiles } from './lib/walk.mjs';

/**
 * Tailwind utility-name patterns per CSS property. Only the properties the
 * audited plugin rules actually set are listed — this is a targeted audit, not
 * a general Tailwind-to-CSS map.
 */
const PROP_UTILITIES = {
    'display': [/^tw-(block|inline|inline-block|flex|inline-flex|grid|inline-grid|hidden|table|contents|flow-root|list-item)$/],
    'flex-direction': [/^tw-flex-(row|row-reverse|col|col-reverse)$/],
    'align-items': [/^tw-items-/],
    'justify-content': [/^tw-justify-/],
    'width': [/^tw-w-/],
    'height': [/^tw-h-/],
    'box-sizing': [/^tw-box-(border|content)$/],
    'min-width': [/^tw-min-w-/],
    'min-height': [/^tw-min-h-/],
    'flex': [/^tw-flex-(1|auto|initial|none)$/],
    'flex-shrink': [/^tw-shrink/],
    'flex-grow': [/^tw-grow/],
    'flex-wrap': [/^tw-(flex-wrap|flex-nowrap|flex-wrap-reverse)$/],
    'white-space': [/^tw-whitespace-/],
    'overflow': [/^tw-overflow-/],
    'gap': [/^tw-gap-/],
    'padding': [/^tw-p-/, /^tw-px-/, /^tw-py-/, /^tw-pt-/, /^tw-pr-/, /^tw-pb-/, /^tw-pl-/],
    'position': [/^tw-(static|fixed|absolute|relative|sticky)$/],
    'background': [/^tw-bg-/],
    'color': [/^tw-text-\[?(?!.*(xs|sm|base|lg|xl|\dxl))/],
    'border': [/^tw-border(-|$)/],
    'border-radius': [/^tw-rounded/],
    'font-size': [/^tw-text-(xs|sm|base|lg|xl|\dxl|\[)/],
    'z-index': [/^tw-z-/],
    'transform': [/^tw-translate-/, /^tw-rotate-/, /^tw-scale-/],
    'top': [/^tw-top-/],
    'left': [/^tw-left-/],
    'grid-column': [/^tw-col-/],
    'text-align': [/^tw-text-(left|center|right|justify)$/],
    'text-transform': [/^tw-(uppercase|lowercase|capitalize|normal-case)$/],
    'font-weight': [/^tw-font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/],
    'box-shadow': [/^tw-shadow/],
    'transition': [/^tw-transition/],
    'cursor': [/^tw-cursor-/],
    'margin': [/^tw-m-/, /^tw-mx-/, /^tw-my-/, /^tw-mt-/, /^tw-mr-/, /^tw-mb-/, /^tw-ml-/],
};

// `--root <dir>` retargets the template scan (fixtures, or a subtree) so the
// audit's own behaviour is checkable without editing src/templates.
const argv = process.argv.slice(2);
const rootFlag = argv.indexOf('--root');
const ROOT = rootFlag === -1 ? 'src/templates' : (argv[rootFlag + 1] ?? 'src/templates');
const specs = rootFlag === -1 ? argv : [...argv.slice(0, rootFlag), ...argv.slice(rootFlag + 2)];
const targets = specs.map((spec) => {
    const [cls, props] = spec.split(':');
    return { cls, props: (props ?? '').split(',').filter(Boolean) };
});
if (targets.length === 0) {
    console.error('usage: node scripts/utility-conflict-audit.mjs <legacy-class>:<prop>,<prop> …');
    process.exit(2);
}

/**
 * Reduce a class token to the utility it names, dropping any Tailwind variant
 * prefix (`hover:`, `[&>x]:`) at bracket depth 0 and the `!` important modifier.
 *
 * The `!` matters enormously and used to be missed: `!tw-bg-transparent` never
 * matched `/^tw-bg-/`, so the audit reported "no conflict" for the one kind of
 * utility that ALWAYS wins. Tailwind's important modifier emits real
 * `!important`, which beats an unflagged component rule at any specificity — so
 * a flagged rule that co-locates with one is not safe to unflag, whereas a plain
 * utility only wins when its specificity is at least as high (utilities emit at
 * `.wh40k-rpg .tw-x`, i.e. two classes, so a `.wh40k-rpg.sheet.actor …` rule
 * out-specifies them). Returns the bare utility plus that distinction.
 */
function bare(token) {
    let depth = 0;
    let last = -1;
    for (let i = 0; i < token.length; i++) {
        const ch = token[i];
        if (ch === '[') depth++;
        else if (ch === ']') depth--;
        else if (ch === ':' && depth === 0) last = i;
    }
    const afterVariant = last === -1 ? token : token.slice(last + 1);
    const important = afterVariant.startsWith('!');
    return { name: important ? afterVariant.slice(1) : afterVariant, important };
}

const CLASS_ATTR_RE = /class\s*=\s*"([^"]*)"/g;
let conflicts = 0;
let importantConflicts = 0;
let elements = 0;

for (const file of walkFiles(ROOT, { ext: '.hbs' })) {
    const src = readFileSync(file, 'utf8');
    CLASS_ATTR_RE.lastIndex = 0;
    let m;
    while ((m = CLASS_ATTR_RE.exec(src)) !== null) {
        const value = m[1];
        const tokens = value
            .replace(/\{\{[^}]*\}\}/g, ' ')
            .split(/\s+/)
            .filter(Boolean);
        for (const target of targets) {
            if (!tokens.includes(target.cls)) continue;
            elements++;
            const hits = [];
            const importantHits = [];
            for (const prop of target.props) {
                const pats = PROP_UTILITIES[prop];
                if (pats === undefined) {
                    console.error(`unknown property in audit spec: ${prop}`);
                    process.exit(2);
                }
                for (const t of tokens) {
                    const b = bare(t);
                    if (!pats.some((p) => p.test(b.name))) continue;
                    if (b.important) {
                        importantHits.push(`${prop}←${t}`);
                    } else {
                        hits.push(`${prop}←${t}`);
                    }
                }
            }
            const line = src.slice(0, m.index).split('\n').length;
            if (importantHits.length > 0) {
                conflicts++;
                importantConflicts++;
                // An important-modifier utility outranks the plugin rule the
                // moment its flag is dropped, at any specificity. Removing the
                // flag WILL change rendering unless the utility goes too.
                console.log(`WINS-ANY ${relative(process.cwd(), file)}:${line}  [${target.cls}]  ${importantHits.join(' ')}`);
            }
            if (hits.length > 0) {
                conflicts++;
                console.log(`CONFLICT ${relative(process.cwd(), file)}:${line}  [${target.cls}]  ${hits.join(' ')}`);
            }
        }
    }
}
console.log(`\n${elements} elements carry an audited class; ${conflicts} co-locate a contested utility.`);
console.log(`${importantConflicts} of those are WINS-ANY: an important-modifier utility that beats the rule at ANY specificity once its flag is dropped.`);
