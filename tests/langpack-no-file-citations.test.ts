/**
 * Player-facing strings never cite the extracted-text files the rules were read
 * from (a "<file>.md" reference): a player sees no file name. The freeze
 * screenshot audit caught one on the Right Stuff dialog.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');

/** The langpack: nested objects of strings. */
interface LangNode {
    [key: string]: string | LangNode;
}

function strings(node: LangNode, path: string, out: Array<[string, string]>): Array<[string, string]> {
    for (const [key, value] of Object.entries(node)) {
        const keyPath = path === '' ? key : `${path}.${key}`;
        if (typeof value === 'string') out.push([keyPath, value]);
        else strings(value, keyPath, out);
    }
    return out;
}

describe('langpack', () => {
    it('cites no source file (*.md) in a player-facing string', () => {
        const langpack = JSON.parse(readFileSync(join(ROOT, 'src/lang/en.json'), 'utf8')) as LangNode;
        const citing = strings(langpack, '', [])
            .filter(([, text]) => /\b[\w-]+\.md\b/u.test(text))
            .map(([key]) => key);
        expect(citing).toEqual([]);
    });
});
