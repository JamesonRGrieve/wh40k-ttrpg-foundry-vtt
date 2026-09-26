/** A declared compendium pack (the fields the tooling and tests read). */
export interface DeclaredPack {
    name: string;
    label: string;
    path: string;
    type: string;
    system?: string;
}

/** A `packFolders` tree node. */
export interface PackFolder {
    name: string;
    sorting?: string;
    color?: string;
    /** Absent on a line's top-level folder, which only nests book folders. */
    packs?: string[];
    folders?: PackFolder[];
}

export interface PackManifestFragment {
    packs?: DeclaredPack[];
    packFolders?: PackFolder[];
}

export const PRIVATE_PACK_MANIFEST: string;
export function mergePackManifest<T extends PackManifestFragment>(system: T, fragment: PackManifestFragment | null): T;
export function readPrivatePackManifest(root: string): PackManifestFragment | null;
export function readDeclaredPacks(root: string): { packs: DeclaredPack[]; packFolders: PackFolder[] };
