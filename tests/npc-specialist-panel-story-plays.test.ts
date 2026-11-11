/**
 * Run the Specialist Skills panel story's play under happy-dom (#725): an NPC's
 * stored specialisation rows render with their own targets and rank pips, and
 * each row's roll button carries the stored position the roll reads back.
 */
import { describe } from 'vitest';
import * as specialistPanel from '../src/templates/actor/panel/skills-specialist-panel.stories.ts';
import { storyPlayTests } from './lib/story-runner.ts';

describe('Specialist Skills panel stories (#725)', () => {
    storyPlayTests(specialistPanel, ['NpcSpecialisationRows']);
});
