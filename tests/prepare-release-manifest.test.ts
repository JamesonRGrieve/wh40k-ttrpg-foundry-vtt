import { describe, expect, it } from 'vitest';
import { releaseFields } from '../scripts/prepare-release-manifest.mjs';

const REPO = 'https://github.com/owner/repo';

describe('releaseFields — nightly channel', () => {
    it('appends the run number to the prerelease base, replacing a stale counter', () => {
        expect(releaseFields('0.0.1-alpha.2', { channel: 'nightly', run: '70', repoUrl: REPO }).version).toBe('0.0.1-alpha.70');
        expect(releaseFields('0.0.1-alpha', { channel: 'nightly', run: '3', repoUrl: REPO }).version).toBe('0.0.1-alpha.3');
    });

    it('leaves a plain (non-prerelease) base intact', () => {
        expect(releaseFields('1.0.0', { channel: 'nightly', run: '4', repoUrl: REPO }).version).toBe('1.0.0.4');
    });

    it('points both URLs at the fixed nightly tag, never the latest alias', () => {
        const fields = releaseFields('0.0.1-alpha', { channel: 'nightly', run: '1', repoUrl: REPO });
        expect(fields.manifest).toBe(`${REPO}/releases/download/nightly/system.json`);
        expect(fields.download).toBe(`${REPO}/releases/download/nightly/wh40k-rpg.zip`);
    });
});

describe('releaseFields — release channel', () => {
    it('takes the version from the v<semver> tag', () => {
        expect(releaseFields('1.0.0', { channel: 'release', tag: 'v1.0.0', repoUrl: REPO }).version).toBe('1.0.0');
        expect(releaseFields('1.1.0-rc.1', { channel: 'release', tag: 'v1.1.0-rc.1', repoUrl: REPO }).version).toBe('1.1.0-rc.1');
    });

    it('rejects a tag that disagrees with the committed version', () => {
        expect(() => releaseFields('0.0.1-alpha.2', { channel: 'release', tag: 'v1.0.0', repoUrl: REPO })).toThrow(/does not match/);
    });

    it('publishes the latest-alias manifest and a download pinned to the tag', () => {
        const fields = releaseFields('1.2.3', { channel: 'release', tag: 'v1.2.3', repoUrl: REPO });
        expect(fields.manifest).toBe(`${REPO}/releases/latest/download/system.json`);
        expect(fields.download).toBe(`${REPO}/releases/download/v1.2.3/wh40k-rpg.zip`);
    });

    it('rejects a tag that is not v<semver>', () => {
        expect(() => releaseFields('0.0.1', { channel: 'release', tag: 'nightly', repoUrl: REPO })).toThrow(/v<semver>/);
        expect(() => releaseFields('0.0.1', { channel: 'release', tag: '1.0.0', repoUrl: REPO })).toThrow(/v<semver>/);
        expect(() => releaseFields('0.0.1', { channel: 'release', repoUrl: REPO })).toThrow(/v<semver>/);
    });
});

describe('releaseFields — validation', () => {
    it('requires the repository URL', () => {
        expect(() => releaseFields('0.0.1', { channel: 'nightly', repoUrl: '' })).toThrow(/REPO_URL/);
    });

    it('rejects an unknown channel', () => {
        expect(() => releaseFields('0.0.1', { channel: 'beta', repoUrl: REPO })).toThrow(/unknown CHANNEL/);
    });
});
