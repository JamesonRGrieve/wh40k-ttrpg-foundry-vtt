/**
 * Reachability guard for `src/module/applications/prompts/*` (#516).
 *
 * Twenty-two implemented, unit-tested, template-preloaded dialogs shipped with no
 * way to open them. Nothing failed: each was re-exported by `prompts/_module.ts`,
 * which was re-exported by `applications/_module.ts`, which nothing imported — a
 * barrel pointing at a barrel that nothing entered. Re-exporting a file makes it
 * *look* connected, so both the build and the suite stayed green over a feature a
 * GM could never reach.
 *
 * The issue counted twenty because it took knip's word for it, and knip lists
 * `*.stories.ts` / `*.test.ts` as entry points — so a dialog with a story looks
 * used. `disorder-roll-dialog` and `daemon-weapon-attribute-dialog` were hidden
 * exactly that way; this scan found them because it only counts PRODUCTION
 * importers.
 *
 * This test closes that class of defect. Every prompt module must have a real
 * consumer: either a concrete importer somewhere under `src/module/` outside
 * `applications/prompts/`, or an entry in the `game.wh40k.prompts` launcher map in
 * `hooks-manager.ts`. Add a dialog without wiring it and this fails by name.
 *
 * Source-scan rather than runtime: the alternative is booting Foundry to read
 * `game.wh40k`, and the invariant is about the import graph, which the text
 * already settles. Same shape as `tests/attack-requires-combat.test.ts`.
 */

import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../src/module/testing/repo-file.ts';

const MODULE_ROOT = resolve(__dirname, '..', 'src', 'module');

/**
 * Prompt modules that are deliberately NOT reachable yet, each with the decision
 * that keeps it here. Every entry is a commitment, not a waiver: the list must
 * only ever shrink, which the size assertion below enforces.
 */
const AWAITING_DECISION: ReadonlyMap<string, string> = new Map([]);

/** Every non-test, non-story `.ts` module under `applications/prompts/`. */
function promptModuleNames(): string[] {
    return readdirSync(resolve(MODULE_ROOT, 'applications', 'prompts'))
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.stories.ts'))
        .map((f) => f.replace(/\.ts$/, ''))
        .sort();
}

/** Recursively collect `.ts` sources under `dir`, excluding tests and stories. */
function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...sourceFiles(full));
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.stories.ts')) {
            out.push(full);
        }
    }
    return out;
}

/**
 * Prompt-module basenames referenced by an import in `text`. Matches all three
 * spellings that occur: `applications/prompts/x.ts` (from the module root),
 * `../prompts/x.ts` (from a sibling `applications/` directory), and `./x.ts`
 * (between prompts) — `sibling` selects whether the bare `./` form counts, since
 * only a file inside the prompts directory can use it.
 */
function promptImportsIn(text: string, sibling: boolean): string[] {
    const pattern = sibling ? /(?:(?:\.\.|applications)\/prompts\/|\.\/)([\w-]+)\.ts/g : /(?:\.\.|applications)\/prompts\/([\w-]+)\.ts/g;
    // Group 1 is mandatory in both patterns, so every match carries it.
    return [...text.matchAll(pattern)].map((m) => String(m[1]));
}

/**
 * Prompt modules reachable from production code, as a fixed point.
 *
 * The seed is every prompt named by a module OUTSIDE `applications/prompts/` — a
 * sheet action, an action manager, the `rolls/roll-prompt.ts` port's registration
 * site. Then reachability propagates through sibling imports: a shared base class
 * or a chat-text helper IS reachable once something reachable extends or calls it.
 *
 * A fixed point rather than "has any importer at all" is the whole point. Sibling
 * imports among a cluster of otherwise-unreachable dialogs prove nothing — that is
 * precisely the illusion `prompts/_module.ts` → `applications/_module.ts` created,
 * and a naive importer count would have called all twenty of them connected.
 */
function reachablePrompts(): Set<string> {
    const promptDir = `${resolve(MODULE_ROOT, 'applications', 'prompts')}/`;
    const siblingImports = new Map<string, string[]>();
    const reachable = new Set<string>();

    for (const file of sourceFiles(MODULE_ROOT)) {
        const relative = file.slice(file.indexOf('src/module'));
        const text = readRepoFile(relative);
        if (file.startsWith(promptDir)) {
            siblingImports.set(relative.replace(/^.*\/([\w-]+)\.ts$/, '$1'), promptImportsIn(text, true));
        } else {
            for (const name of promptImportsIn(text, false)) reachable.add(name);
        }
    }

    // Propagate: anything a reachable prompt imports is reachable too.
    let grew = true;
    while (grew) {
        grew = false;
        for (const [owner, imports] of siblingImports) {
            if (!reachable.has(owner)) continue;
            for (const name of imports) {
                if (!reachable.has(name)) {
                    reachable.add(name);
                    grew = true;
                }
            }
        }
    }
    return reachable;
}

/** Basenames wired into the `game.wh40k.prompts` launcher map in `hooks-manager.ts`. */
function launcherWired(): Set<string> {
    const hooks = readRepoFile('src/module/hooks-manager.ts');
    const wired = new Set<string>();
    const block = /prompts:\s*\{([^}]*)\}/.exec(hooks)?.[1];
    if (block === undefined) return wired;
    // Openers are named `openXxxDialog` or `promptXxx` depending on whether they
    // resolve immediately or await the dialog.
    for (const match of block.matchAll(/\b(?:open|prompt)\w+/g)) {
        // Map the imported symbol back to the module it came from.
        const source = new RegExp(`import \\{ ${match[0]} \\} from '\\./applications/prompts/([\\w-]+)\\.ts'`).exec(hooks)?.[1];
        if (source !== undefined) wired.add(source);
    }
    return wired;
}

describe('every prompt dialog is reachable', () => {
    const modules = promptModuleNames();
    const reachable = new Set([...reachablePrompts(), ...launcherWired()]);

    it('finds the prompt directory (a zero-length scan would pass vacuously)', () => {
        expect(modules.length).toBeGreaterThan(20);
    });

    it('wires the fourteen GM launchers into game.wh40k.prompts', () => {
        expect([...launcherWired()].sort()).toEqual([
            'beyond-homeworld-info-dialog',
            'cybernetics-install-dialog',
            'daemon-weapon-attribute-dialog',
            'daemonhost-binding-dialog',
            'disorder-roll-dialog',
            'fear-test-dialog',
            'medicae-mechadendrite-dialog',
            'mutant-background-dialog',
            'mutation-roll-dialog',
            'radical-services-dialog',
            'sister-of-battle-dialog',
            'warp-travel-dialog',
            'within-homeworld-info-dialog',
            'without-homeworld-info-dialog',
        ]);
    });

    it('leaves no prompt module without either a concrete importer or a launcher entry', () => {
        const unreachable = modules.filter((m) => !reachable.has(m) && !AWAITING_DECISION.has(m));
        expect(unreachable).toEqual([]);
    });

    it('keeps the awaiting-decision list honest — no entry that is already reachable', () => {
        const stale = [...AWAITING_DECISION.keys()].filter((m) => reachable.has(m));
        expect(stale).toEqual([]);
    });

    it('keeps the awaiting-decision list honest — no entry for a module that no longer exists', () => {
        const missing = [...AWAITING_DECISION.keys()].filter((m) => !modules.includes(m));
        expect(missing).toEqual([]);
    });

    it('ratchets the awaiting-decision list down, never up', () => {
        // Was 20 unreachable prompt modules when #516 was filed. Lower this bound
        // with the change that wires or removes an entry; never raise it.
        expect(AWAITING_DECISION.size).toBeLessThanOrEqual(0);
    });
});
