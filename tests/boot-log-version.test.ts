/**
 * Regression (#721): the boot log names the version the system is actually running.
 *
 * `HooksManager.init` logged a version typed into the source, which every release
 * left behind, so a console capture named the wrong build. It now reads
 * `game.system.version`, which Foundry fills from the installed manifest.
 *
 * Source-scan test: `hooks-manager.ts` is the composition root and imports the
 * whole system, so it cannot be loaded without a live Foundry.
 */

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const SRC = readRepoFile('src/module/hooks-manager.ts');

/** Every line of the source that writes the boot banner. */
const bannerLines = SRC.split('\n').filter((line) => line.includes('Loading WH40K RPG System'));

describe('boot log version (#721)', () => {
    it('logs the banner once', () => {
        expect(bannerLines).toHaveLength(1);
    });

    it('reads the version from the installed system', () => {
        expect(bannerLines[0]).toMatch(/v\$\{game\.system\.version\}/);
    });

    it('types no version number into the banner', () => {
        expect(bannerLines[0]).not.toMatch(/System v\d/);
    });
});
