/**
 * Run every Vehicle Traits panel story's play function under happy-dom
 * (content#28): each test row lists the trait modifiers it takes, the Trait
 * Rules panel lists the movement / terrain / deployment rules, a test button
 * dispatches `rollVehicleTest` with its category, and the panel renders the
 * same under all six lines. The craft sheet's Default story composes the
 * panels into the Overview tab.
 */
import { describe } from 'vitest';
import * as craftSheet from '../src/module/applications/actor/craft-sheet.stories.ts';
import * as panel from '../src/templates/actor/panel/vehicle-traits-panel.stories.ts';
import { storyPlayTests } from './lib/story-runner.ts';

describe('Vehicle Traits panel stories (content#28)', () => {
    storyPlayTests(panel, ['Chimera', 'Skimmer', 'NoTraits', 'AllSystems']);
});

describe('Craft sheet composes the Vehicle Traits panels (content#28)', () => {
    storyPlayTests({ default: craftSheet.default, Default: craftSheet.Default }, ['Default']);
});
