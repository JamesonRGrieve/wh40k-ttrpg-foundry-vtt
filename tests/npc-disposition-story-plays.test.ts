/**
 * Run every NPC Disposition panel story's play under happy-dom (#73): DH2's
 * 0–100 Disposition with its test and Personality, the ladder on DH1, RT, BC,
 * OW and DW, and no panel on IM.
 */
import { describe } from 'vitest';
import * as dispositionPanel from '../stories/actor-panels/npc-disposition-panel.stories.ts';
import { storyPlayTests } from './lib/story-runner.ts';

describe('NPC Disposition panel stories (#73)', () => {
    storyPlayTests(dispositionPanel, [
        'Dh2Indifferent',
        'Dh2ZeroDisposition',
        'Dh2ReadOnly',
        'HomologationDH2',
        'HomologationDH1',
        'HomologationRT',
        'HomologationBC',
        'HomologationOW',
        'HomologationDW',
        'ImHasNone',
    ]);
});
