/**
 * #699 audit: plays the psychic card story with a long power text, whose Effect
 * block shows it whole instead of scrolling it inside a 150px box.
 */
import { describe } from 'vitest';
import * as psychicCard from '../stories/chat-cards/psychic-occult-effects.stories.ts';
import { namedStoryPlayTests } from './lib/story-runner.ts';

describe('the psychic card shows the whole power text (#699 audit)', () => {
    namedStoryPlayTests(psychicCard, ['LongEffectUncapped']);
});
