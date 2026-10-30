import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readDeclaredPacks } from '../../../scripts/lib/pack-manifest.mjs';
import { packLineFlags } from '../../../src/module/utils/line-packs.ts';

/**
 * Node-side compendium lookups for the Tier B specs: find the pack that holds a
 * document by the packs' declared manifest flags (line, category, homebrew), so
 * a spec never spells a book-named pack id. Reads the private content's
 * `_source` tree, which every Tier B run has.
 */

const REPO_ROOT = resolve(__dirname, '../../..');
const PRIVATE_ROOT = resolve(REPO_ROOT, 'src/packs-private');

/** Which packs a lookup searches: a line's book packs of a category (or a sub-grouping of it), or its homebrew ones. */
export interface PackQuery {
    line: string;
    category: string;
    /** Search the line's homebrew packs instead of its book packs. */
    homebrew?: boolean;
}

interface DeclaredPackRef {
    name: string;
    sourceDir: string;
}

function matchingPacks(query: PackQuery): DeclaredPackRef[] {
    return readDeclaredPacks(REPO_ROOT)
        .packs.filter((pack) => {
            const flags = packLineFlags(pack);
            if (flags?.line !== query.line || flags.homebrew !== (query.homebrew === true)) return false;
            return flags.category === query.category || flags.category.startsWith(`${query.category}-`);
        })
        .map((pack) => ({ name: pack.name, sourceDir: join(PRIVATE_ROOT, pack.path.replace(/^packs\//, ''), '_source') }));
}

function sourceFiles(pack: DeclaredPackRef): string[] {
    return existsSync(pack.sourceDir) ? readdirSync(pack.sourceDir).filter((file) => file.endsWith('.json')) : [];
}

/** The id of the pack (without the `wh40k-rpg.` prefix) holding the document `docId`; throws when none does. */
export function packHoldingId(query: PackQuery, docId: string): string {
    const hit = matchingPacks(query).find((pack) => sourceFiles(pack).some((file) => file === `${docId}.json` || file.endsWith(`_${docId}.json`)));
    if (hit === undefined) throw new Error(`no ${query.line} ${query.category} pack holds document ${docId}`);
    return hit.name;
}

/** The id of the pack (without the `wh40k-rpg.` prefix) holding a document named `docName`; throws when none does. */
export function packHoldingName(query: PackQuery, docName: string): string {
    for (const pack of matchingPacks(query)) {
        for (const file of sourceFiles(pack)) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: JSON.parse returns unknown (ts-reset); only `name` is read
            const doc = JSON.parse(readFileSync(join(pack.sourceDir, file), 'utf8')) as { name?: unknown };
            if (doc.name === docName) return pack.name;
        }
    }
    throw new Error(`no ${query.line} ${query.category} pack holds a document named ${docName}`);
}

/** The compendium UUID of document `docId` in whichever of the query's packs holds it. */
export function compendiumUuid(query: PackQuery, docId: string, documentClass = 'Item'): string {
    return `Compendium.wh40k-rpg.${packHoldingId(query, docId)}.${documentClass}.${docId}`;
}
