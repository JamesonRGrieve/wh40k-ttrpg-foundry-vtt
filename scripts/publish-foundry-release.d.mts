/** The stamped system.json fields the Package Release API body reads. */
export interface ReleaseManifestFields {
    id: string;
    version: string;
    compatibility?: { minimum?: string | number; verified?: string | number; maximum?: string | number };
}

/** The Package Release API request body. */
export interface FoundryReleaseBody {
    id: string;
    'dry-run': boolean;
    release: {
        version: string;
        manifest: string;
        notes: string;
        compatibility: { minimum?: string; verified?: string; maximum?: string };
    };
}

export const RELEASE_API: string;

export function foundryReleaseBody(manifest: ReleaseManifestFields, opts: { repoUrl: string; tag: string; dryRun: boolean }): FoundryReleaseBody;
