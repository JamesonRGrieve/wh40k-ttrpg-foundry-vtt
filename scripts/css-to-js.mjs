#!/usr/bin/env node
/**
 * One-shot CSS → CSS-in-JS converter.
 *
 * Reads a CSS file and emits a JS module exporting a Tailwind-compatible
 * CSS-in-JS object suitable for `addBase(...)`. Preserves nested `&`
 * selectors, pseudo-elements, and at-rules. Property names stay dashed
 * (`'border-bottom': ...`) so we don't have to maintain a camelCase
 * conversion table — Tailwind's plugin API accepts either form.
 *
 * Usage:
 *   node scripts/css-to-js.mjs <input.css> <output.js> [--name <varName>]
 */

import postcss from 'postcss';
import postcssNested from 'postcss-nested';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const argv = process.argv.slice(2);
if (argv.length < 2) {
    console.error('Usage: css-to-js.mjs <input.css> <output.js> [--name varName]');
    process.exit(2);
}
const [inputPath, outputPath] = argv;
const nameIdx = argv.indexOf('--name');
const varName =
    nameIdx >= 0 ? argv[nameIdx + 1] : basename(inputPath, '.css').replace(/^_/, '').replace(/[-.](\w)/g, (_, c) => c.toUpperCase());

const css = readFileSync(resolve(inputPath), 'utf8');

// Parse with postcss but DON'T resolve nesting — we want to preserve `&`
// references and emit them as JS object keys, the same way Tailwind expects
// them in addBase / addComponents inputs.
const root = postcss.parse(css);

function escapeKey(key) {
    return JSON.stringify(key);
}

function escapeValue(value) {
    return JSON.stringify(String(value));
}

function indent(level) {
    return '    '.repeat(level);
}

function emitNode(node, level) {
    if (node.type === 'rule') {
        const lines = [];
        lines.push(`${indent(level)}${escapeKey(node.selector)}: {`);
        for (const child of node.nodes ?? []) {
            const sub = emitNode(child, level + 1);
            if (sub) lines.push(sub);
        }
        lines.push(`${indent(level)}},`);
        return lines.join('\n');
    }
    if (node.type === 'decl') {
        return `${indent(level)}${escapeKey(node.prop)}: ${escapeValue(node.value)},`;
    }
    if (node.type === 'atrule') {
        const lines = [];
        const selector = `@${node.name} ${node.params}`.trim();
        lines.push(`${indent(level)}${escapeKey(selector)}: {`);
        for (const child of node.nodes ?? []) {
            const sub = emitNode(child, level + 1);
            if (sub) lines.push(sub);
        }
        lines.push(`${indent(level)}},`);
        return lines.join('\n');
    }
    // comments, whitespace, etc. — skip
    return null;
}

const objectLines = [];
for (const node of root.nodes) {
    const out = emitNode(node, 1);
    if (out) objectLines.push(out);
}

const banner = `// Auto-ported from ${inputPath} via scripts/css-to-js.mjs.\n// Registered in tailwind.config.js via addBase so wh40k-* class names emit\n// literally (addComponents would prefix them with 'tw-' per the global\n// 'prefix' config and break consumer templates).\n\nmodule.exports = {\n`;

writeFileSync(
    resolve(outputPath),
    `${banner}${objectLines.join('\n')}\n};\n`,
    'utf8',
);
console.log(`[css-to-js] wrote ${outputPath} (${root.nodes.length} top-level rules)`);
