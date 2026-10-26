/**
 * `WH40K.Skills` is a namespace in the langpack, not a string, so localizing it
 * printed the raw key "WH40K.SKILLS" as a heading (#699): on the NPC template
 * Preview, the NPC quick-create dialog, the stat-block parser and the origin
 * detail dialog. They read `WH40K.Tabs.Skills` ("Skills").
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../src/lang/en.json';

const TEMPLATES = resolve(__dirname, '..', 'src', 'templates');

function templates(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) templates(path, out);
        else if (path.endsWith('.hbs')) out.push(path);
    }
    return out;
}

describe('Skills heading key (#699)', () => {
    it('WH40K.Skills is a namespace, and WH40K.Tabs.Skills is the "Skills" label', () => {
        expect(typeof en.WH40K.Skills).toBe('object');
        expect(en.WH40K.Tabs.Skills).toBe('Skills');
    });

    it('no template localizes the WH40K.Skills namespace', () => {
        const offenders = templates(TEMPLATES).filter((path) => readFileSync(path, 'utf8').includes('localize "WH40K.Skills"'));
        expect(offenders).toEqual([]);
    });
});
