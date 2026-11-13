/**
 * Guard (#708): `pnpm preload:drift` fails on a reference to a template that
 * does not exist. The bundle registers every file under src/templates, so a
 * missing file is the one way a partial or a sheet's template can still fail
 * to resolve at runtime. Runs the gate against small fixture trees.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const GATE = resolve(__dirname, '../scripts/preload-drift.mjs');
const dirs: string[] = [];

/** A fixture repo holding `files` (path → content); returns the gate's exit code and output. */
function runGate(files: Record<string, string>): { code: number; output: string } {
    const root = mkdtempSync(join(tmpdir(), 'wh40k-drift-'));
    dirs.push(root);
    for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), content);
    }
    try {
        return { code: 0, output: execFileSync(process.execPath, [GATE], { cwd: root, encoding: 'utf8', stdio: 'pipe' }) };
    } catch (err) {
        const failed = err as { status: number; stderr: string };
        return { code: failed.status, output: failed.stderr };
    }
}

afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('preload:drift — every template reference resolves to a file (#708)', () => {
    const ROW = 'src/templates/actor/row.hbs';

    it('passes when each partial and TypeScript template path names a file, in either spelling', () => {
        const { code } = runGate({
            [ROW]: '<li></li>',
            'src/templates/actor/sheet.hbs': '{{> systems/wh40k-rpg/templates/actor/row.hbs}}{{> "systems/wh40k-rpg/templates/actor/row"}}',
            'src/module/sheet.ts': "export const PARTS = { body: { template: 'systems/wh40k-rpg/templates/actor/sheet.hbs' } };",
        });
        expect(code).toBe(0);
    });

    it('fails on a partial whose template does not exist', () => {
        const { code, output } = runGate({ [ROW]: '{{> systems/wh40k-rpg/templates/actor/missing}}' });
        expect(code).toBe(1);
        expect(output).toContain('systems/wh40k-rpg/templates/actor/missing');
    });

    it('fails on a TypeScript template path that does not exist', () => {
        const { code, output } = runGate({ [ROW]: '', 'src/module/roll.ts': "const T = 'systems/wh40k-rpg/templates/chat/gone.hbs';" });
        expect(code).toBe(1);
        expect(output).toContain('src/module/roll.ts:1');
    });
});
