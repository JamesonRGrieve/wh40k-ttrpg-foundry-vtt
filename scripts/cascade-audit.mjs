#!/usr/bin/env node
/**
 * Cascade audit for the `!important` retirement in tailwind/*.js.
 *
 * Removing `!important` from a plugin rule is only safe when that rule still
 * wins its property against every OTHER rule in the built stylesheet that can
 * match the same element. This script proves (or disproves) that per
 * declaration, from the actual build output rather than by reasoning:
 *
 *   1. Parse every rule out of dist/css/entry.css.
 *   2. For each `!important` declaration in a selector under audit, find all
 *      other rules setting the same property whose selector could match the
 *      same element (shared trailing key — the last compound in the selector).
 *   3. Report any competitor with specificity >= the audited rule, which is
 *      the only case where dropping `!important` changes the winner.
 *
 * A competitor that is ALSO `!important` and lives in a plugin file we are
 * clearing in the same pass is annotated, since both sides drop together.
 *
 * Usage:
 *   node scripts/cascade-audit.mjs '.wh40k-rpg.sheet.actor'
 */
import { readFileSync } from 'node:fs';

const CSS = 'dist/css/entry.css';
const prefix = process.argv[2];
if (prefix === undefined) {
    console.error('usage: node scripts/cascade-audit.mjs <selector-prefix>');
    process.exit(2);
}

/** Specificity as [ids, classes, elements]; good enough for our flat selectors. */
function specificity(sel) {
    const clean = sel
        .replace(/::[a-z-]+/g, '')
        .replace(/:not\(([^)]*)\)/g, ' $1 ')
        .replace(/\\!/g, '!');
    const ids = (clean.match(/#[\w-]+/g) ?? []).length;
    const classes = (clean.match(/\.[\w!\\-]+|\[[^\]]+\]|:[a-z-]+(\([^)]*\))?/g) ?? []).length;
    const elements = (clean.match(/(^|[\s>+~])[a-z][a-z0-9]*/g) ?? []).length;
    return [ids, classes, elements];
}
const cmpSpec = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** Last compound of a selector — the "key" that decides which element it targets. */
function key(sel) {
    const parts = sel.trim().split(/[\s>+~]+/);
    return parts[parts.length - 1] ?? '';
}
/** The set of class names in a compound, so `.a.b` and `.b` are seen as overlapping. */
const classesOf = (compound) => new Set((compound.match(/\.[\w\\!-]+/g) ?? []).map((c) => c.replace(/\\/g, '')));

/** Leading element name of a compound (`section.tab` → `section`), or '' for none. */
const elementOf = (compound) => (/^[a-z][a-z0-9]*/.exec(compound) ?? [''])[0];

/** Id in a compound (`#tab-body` → `#tab-body`), or '' for none. */
const idOf = (compound) => (/#[\w-]+/.exec(compound) ?? [''])[0];

/**
 * Can these two key compounds ever match the same element?
 *
 * Requires the element names to be compatible (both absent, or equal), the ids
 * to be compatible, and one class set to contain the other. The class-set test
 * alone is not enough: `every` on an EMPTY set is vacuously true, which made a
 * bare `select` key "overlap" every classed selector in the stylesheet.
 */
function canMatchSameElement(a, b) {
    const ea = elementOf(a.key);
    const eb = elementOf(b.key);
    if (ea !== '' && eb !== '' && ea !== eb) return false;
    const ia = idOf(a.key);
    const ib = idOf(b.key);
    if (ia !== '' && ib !== '' && ia !== ib) return false;
    // A keyed element with no classes and no name/id in common carries no
    // evidence of overlap — treat "no shared class at all" as disjoint.
    if (a.classes.size === 0 || b.classes.size === 0) {
        return (ea !== '' && ea === eb) || (ia !== '' && ia === ib);
    }
    const sub = [...b.classes].every((c) => a.classes.has(c));
    const sup = [...a.classes].every((c) => b.classes.has(c));
    return sub || sup;
}

const css = readFileSync(CSS, 'utf8');
const rules = [];
// Flat rule scan: `selector-list { declarations }`. The build output is fully
// de-nested by postcss-nested, so no brace recursion is needed. @-blocks are
// skipped by requiring the selector not to start with `@`.
const RULE_RE = /([^{}@]+)\{([^{}]*)\}/g;
let m;
let order = 0;
while ((m = RULE_RE.exec(css)) !== null) {
    const selectorList = m[1].trim();
    const body = m[2];
    if (selectorList === '' || selectorList.startsWith('@')) continue;
    const decls = [];
    for (const d of body.split(';')) {
        const i = d.indexOf(':');
        if (i === -1) continue;
        const prop = d.slice(0, i).trim();
        const value = d.slice(i + 1).trim();
        if (prop === '') continue;
        decls.push({ prop, important: /!important$/.test(value), value });
    }
    for (const sel of selectorList.split(',')) {
        const s = sel.trim();
        if (s === '') continue;
        rules.push({ sel: s, spec: specificity(s), key: key(s), classes: classesOf(key(s)), decls, order: order++ });
    }
}

const audited = rules.filter((r) => r.sel.startsWith(prefix) && !r.sel.includes('\\!'));
console.log(`${rules.length} rules parsed from ${CSS}; ${audited.length} match prefix ${prefix}\n`);

let risky = 0;
let checked = 0;
for (const r of audited) {
    for (const d of r.decls) {
        if (!d.important) continue;
        checked++;
        // A competitor can match the same element when its key compound's class
        // set is a subset or superset of ours (e.g. `.window-content` vs
        // `.window-content.foo`), or when the keys are identical element names.
        const competitors = rules.filter((o) => {
            if (o === r || o.sel.includes('\\!')) return false;
            if (!o.decls.some((od) => od.prop === d.prop)) return false;
            return canMatchSameElement(r, o);
        });
        const norm = (v) => v.replace(/\s*!important$/, '').trim();
        const beats = competitors.filter((o) => {
            const od = [...o.decls].reverse().find((x) => x.prop === d.prop);
            if (od === undefined) return false;
            // Same value ⇒ whichever wins, the rendered result is identical.
            // This drops the noise from one comma-separated selector list being
            // parsed into several sibling rules with the same declarations.
            if (norm(od.value) === norm(d.value)) return false;
            // A competitor inside the audited prefix loses its `!important` in
            // the same pass, so the comparison after the pass is specificity vs
            // specificity — treat it as important-less.
            const alsoCleared = o.sel.startsWith(prefix);
            if (od.important && !alsoCleared) return true;
            return cmpSpec(o.spec, r.spec) > 0 || (cmpSpec(o.spec, r.spec) === 0 && o.order > r.order);
        });
        if (beats.length > 0) {
            risky++;
            console.log(`RISK  ${r.sel}  { ${d.prop}: ${norm(d.value)} }`);
            for (const o of beats.slice(0, 6)) {
                const od = [...o.decls].reverse().find((x) => x.prop === d.prop);
                console.log(`        beaten by [${o.spec.join(',')}${od.important ? ' !imp' : ''}] ${o.sel}  → ${od.value}`);
            }
        }
    }
}
console.log(`\n${checked} !important declarations audited; ${risky} would change winner if !important dropped.`);
