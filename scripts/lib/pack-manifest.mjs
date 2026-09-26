/**
 * Where the system's compendium pack declarations live, and how they are merged.
 *
 * The public `src/system.json` declares ONLY the public generic packs built from
 * `src/packs` (none yet). Every pack built from the copyrighted book content — its
 * `packs[]` entries and its `packFolders` tree — is declared in the private content
 * repo (`src/packs-private/system.packs.json`), so the public repository neither
 * ships that content nor advertises it: the book titles, line names and
 * "(gw-copyright)" labels exist only on the private side.
 *
 * The campaign deploy (the only build that compiles `src/packs-private`) merges the
 * fragment into `dist/system.json` beside the merged packs; public builds never see
 * it. Tests and pack tooling read the combined declaration through
 * {@link readDeclaredPacks}.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Repo-relative path of the private pack-declaration fragment. */
export const PRIVATE_PACK_MANIFEST = 'src/packs-private/system.packs.json';

/**
 * Merge a private `{ packs, packFolders }` fragment into a system manifest. Packs
 * are appended by `name` (a public pack of the same name wins); folders are
 * appended after the public ones. Pure — returns a new manifest.
 * @param {{packs?: Array<{name: string}>, packFolders?: Array<object>}} system  The public manifest.
 * @param {{packs?: Array<{name: string}>, packFolders?: Array<object>} | null} fragment  The private fragment.
 */
export function mergePackManifest(system, fragment) {
    if (fragment == null) return { ...system };
    const packs = [...(system.packs ?? [])];
    const names = new Set(packs.map((p) => p.name));
    for (const pack of fragment.packs ?? []) {
        if (!names.has(pack.name)) {
            packs.push(pack);
            names.add(pack.name);
        }
    }
    return { ...system, packs, packFolders: [...(system.packFolders ?? []), ...(fragment.packFolders ?? [])] };
}

/** Read the private fragment, or null when the private content repo is not checked out. */
export function readPrivatePackManifest(root) {
    const file = resolve(root, PRIVATE_PACK_MANIFEST);
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

/**
 * Every declared pack and folder: the public manifest's plus the private
 * fragment's (when checked out).
 * @param {string} root  The repo root.
 */
export function readDeclaredPacks(root) {
    const system = JSON.parse(readFileSync(resolve(root, 'src/system.json'), 'utf8'));
    const merged = mergePackManifest(system, readPrivatePackManifest(root));
    return { packs: merged.packs ?? [], packFolders: merged.packFolders ?? [] };
}
