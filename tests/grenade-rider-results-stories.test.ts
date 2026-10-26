/**
 * Runs the #623 / #698 grenade rider results card stories' `play` assertions under
 * vitest, so each rider's outcome, provenance rows and what landed — a condition for
 * its rounds, an effect-roll step, the effect prose, or a Rad grenade's rolled Toughness
 * damage — are checked on every test run, not only in the Storybook browser suite.
 */
import { describe } from 'vitest';
import * as resultsCard from '../stories/chat-cards/grenade-rider-results-card.stories.ts';
import { namedStoryPlayTests } from './lib/story-runner.ts';

describe('#698 grenade rider results card stories', () => {
    namedStoryPlayTests(resultsCard, [
        'RadDealsToughnessDamage',
        'RtRadDamagePenalty',
        'PsychotrokeStepsTheEffectRoll',
        'SporeBombPsykerPenalty',
        'PhotonFlashBlinds',
    ]);
});
