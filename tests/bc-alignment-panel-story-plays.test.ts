/**
 * #699 audit: plays the BC alignment panel's pending-flip story, whose warning
 * names the god by its langpack label ("Khorne"), not the raw alignment id.
 */
import { describe } from 'vitest';
import * as alignmentPanel from '../src/templates/actor/panel/bc-alignment-panel.stories.ts';
import { namedStoryPlayTests } from './lib/story-runner.ts';

describe('BC alignment panel names the god it would flip to (#699 audit)', () => {
    namedStoryPlayTests(alignmentPanel, ['PendingFlip']);
});
