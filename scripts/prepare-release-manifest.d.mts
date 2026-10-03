/** Options selecting the publish channel and where its assets live. */
export interface ReleaseFieldOptions {
    channel: string;
    run?: string;
    tag?: string;
    repoUrl: string;
}

/** The manifest fields a channel publishes. */
export interface ReleaseFields {
    version: string;
    manifest: string;
    download: string;
}

export function releaseFields(committedVersion: string, opts: ReleaseFieldOptions): ReleaseFields;
