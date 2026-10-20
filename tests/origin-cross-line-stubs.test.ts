/**
 * Guard: an origin-path reference stub never hands a line another line's content
 * (content#36).
 *
 * BC's Psyker and Heretek archetypes were whole-file stubs to DH2's Psyker elite
 * advance and DH2's Heretek background, so the BC pack served DH2 documents to BC
 * characters: wrong step, wrong grants, gameSystem dh2. A stray `source.bc` on the
 * DH2 documents hid it.
 *
 * Stubbing one canonical document into several lines' packs is the homologation
 * model (packs/CLAUDE.md), so a cross-line stub is not wrong in itself. What makes
 * it legitimate is that the canonical document carries the stub line's own
 * branch: a `system.source.<line>` entry with a provenance, which is what the
 * variant resolver keys that line's data on. A stub whose target has no such
 * branch gives the line a document authored only for another line.
 *
 * KNOWN_DEBT lists the stubs that break the rule today, outside this fix. It may
 * only shrink: an entry that no longer breaks the rule fails the suite until it is
 * removed.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HAS_PRIVATE_CONTENT } from '../src/module/testing/private-content.ts';

const ROOT = resolve(__dirname, '../src/packs-private');

/** The line each group directory holds. */
const LINE_OF_GROUP: ReadonlyMap<string, string> = new Map([
    ['black-crusade', 'bc'],
    ['dark-heresy-1', 'dh1'],
    ['dark-heresy-2', 'dh2'],
    ['deathwatch', 'dw'],
    ['only-war', 'ow'],
    ['rogue-trader', 'rt'],
    ['imperium-maledictum', 'im'],
]);

/**
 * Cross-line origin stubs whose target has no branch for the stub's line, found
 * while fixing content#36: RT's Void Born is DH2's Voidborn, which carries no
 * `source.rt`.
 */
const KNOWN_DEBT: readonly string[] = ['rogue-trader/rt-core-origins-homeworlds/_source/void-born_YwBPZ0s6JNPnHNI5.json'];

interface PackDoc {
    reference?: string;
    system?: { source?: Record<string, { provenance?: string } | undefined> };
}

function readDoc(path: string): PackDoc {
    return JSON.parse(readFileSync(path, 'utf8')) as PackDoc;
}

/** A stub's target: `packs/…` is rooted at the private content, anything else is relative to the stub. */
function targetOf(reference: string, from: string): string {
    return reference.startsWith('packs/') ? resolve(ROOT, reference.slice('packs/'.length)) : resolve(from, '..', reference);
}

interface CrossLineStub {
    /** The stub, relative to the private content root. */
    stub: string;
    line: string;
    /** Whether the resolved document carries the stub line's own branch. */
    hasLineBranch: boolean;
}

/** Every origin-path stub whose resolved document lives in another line's group directory. */
function crossLineOriginStubs(): CrossLineStub[] {
    const found: CrossLineStub[] = [];
    for (const group of readdirSync(ROOT, { withFileTypes: true })) {
        const line = LINE_OF_GROUP.get(group.name);
        if (!group.isDirectory() || line === undefined) continue;
        for (const pack of readdirSync(resolve(ROOT, group.name), { withFileTypes: true })) {
            if (!pack.isDirectory() || !pack.name.includes('-origins-')) continue;
            const sourceDir = resolve(ROOT, group.name, pack.name, '_source');
            let files: string[];
            try {
                files = readdirSync(sourceDir).filter((name) => name.endsWith('.json'));
            } catch {
                continue;
            }
            for (const file of files) {
                const stubPath = resolve(sourceDir, file);
                let reference = readDoc(stubPath).reference;
                if (reference === undefined) continue;
                let targetPath = stubPath;
                let doc: PackDoc = {};
                while (reference !== undefined) {
                    targetPath = targetOf(reference, targetPath);
                    doc = readDoc(targetPath);
                    reference = doc.reference;
                }
                const targetGroup = relative(ROOT, targetPath).split('/')[0];
                if (targetGroup === group.name) continue;
                const branch = doc.system?.source?.[line];
                found.push({ stub: relative(ROOT, stubPath), line, hasLineBranch: typeof branch?.provenance === 'string' });
            }
        }
    }
    return found;
}

describe.skipIf(!HAS_PRIVATE_CONTENT)('origin-path stubs never hand a line another line’s content (content#36)', () => {
    const stubs = crossLineOriginStubs();

    it('every cross-line origin stub resolves to a document that carries its line’s branch', () => {
        const offenders = stubs.filter((s) => !s.hasLineBranch && !KNOWN_DEBT.includes(s.stub)).map((s) => s.stub);
        expect(offenders).toEqual([]);
    });

    it('the known debt only shrinks: every listed stub still breaks the rule', () => {
        const stillBroken = new Set(stubs.filter((s) => !s.hasLineBranch).map((s) => s.stub));
        expect(KNOWN_DEBT.filter((stub) => !stillBroken.has(stub))).toEqual([]);
    });

    it('BC’s Psyker and Heretek archetypes are BC documents, not stubs', () => {
        const read = ['psyker_c22473691d53c7e1.json', 'heretek_e8311fe5e803731c.json'].map((file) => {
            const doc = readDoc(resolve(ROOT, 'black-crusade/bc-core-origins-archetypes/_source', file)) as PackDoc & {
                system?: { step?: string; gameSystem?: string };
            };
            return { file, isStub: doc.reference !== undefined, step: doc.system?.step, gameSystem: doc.system?.gameSystem };
        });
        expect(read).toEqual([
            { file: 'psyker_c22473691d53c7e1.json', isStub: false, step: 'archetype', gameSystem: 'bc' },
            { file: 'heretek_e8311fe5e803731c.json', isStub: false, step: 'archetype', gameSystem: 'bc' },
        ]);
    });
});
