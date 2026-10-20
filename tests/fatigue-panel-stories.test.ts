/**
 * Runs the fatigue panel stories' `play` assertions under Vitest: the warning and
 * rules card state each line model's effect (halving, flat −10, condition), so a
 * DH2 NPC no longer reads "−10 to all Tests" (#248 follow-up).
 */
import { describe } from 'vitest';
import * as fatiguePanel from '../src/templates/actor/panel/fatigue-panel.stories.ts';
import { storyPlayTests } from './lib/story-runner.ts';

describe('fatigue panel stories', () => {
    storyPlayTests(fatiguePanel, ['HalvingDH2Npc', 'FlatRT', 'ConditionIM']);
});
