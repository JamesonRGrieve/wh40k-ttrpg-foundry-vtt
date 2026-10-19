/**
 * Run every Dark Pact story's play function under happy-dom (#84): the pact
 * item sheet and the Dark Pacts panel, across all six lines. The plays assert
 * the pact names render through `uuidNameCache`, the Boons and Banes and their
 * mechanics show, and the GM's add controls dispatch the right actions.
 */
import { describe } from 'vitest';
import * as pactSheet from '../src/module/applications/item/dark-pact-sheet.stories.ts';
import * as pactPanel from '../stories/actor-panels/dark-pact-panel.stories.ts';
import { storyPlayTests } from './lib/story-runner.ts';

const SIX_LINES = ['HomologationDH2', 'HomologationDH1', 'HomologationRT', 'HomologationBC', 'HomologationOW', 'HomologationDW'];

describe('Dark Pact item sheet stories (#84)', () => {
    storyPlayTests(pactSheet, ['PactOfMight', 'PactOfKnowledge', 'EmptyPact', 'EditMode', ...SIX_LINES]);
});

describe('Dark Pacts panel stories (#84)', () => {
    storyPlayTests(pactPanel, ['SinglePact', 'MultiPactMixed', 'PaymentLapsedEnemy', 'AddPact', 'HiddenFromPlayer', 'UnresolvedPact', ...SIX_LINES]);
});
