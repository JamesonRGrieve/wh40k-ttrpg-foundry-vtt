/**
 * Run the OW Battlefield panel stories under happy-dom (content#32): conferred
 * medals show by name with their Squad Bonus, and the Add Award control appears
 * only on an editable sheet and dispatches the compendium picker.
 */
import { describe } from 'vitest';
import * as medalSheet from '../src/module/applications/item/medal-sheet.stories.ts';
import * as battlefieldPanel from '../src/templates/actor/panel/ow-battlefield-panel.stories.ts';
import { storyPlayTests } from './lib/story-runner.ts';

describe('OW Battlefield panel stories (content#32)', () => {
    storyPlayTests(battlefieldPanel, ['ReadyNoAwards', 'CooldownWithAwards', 'ReadyMultiAwards', 'ConferredMedals', 'ConferredMedalsReadOnly']);
});

describe('Medal sheet stories (content#32)', () => {
    storyPlayTests(medalSheet, ['ReadOnly', 'EditMode']);
});
