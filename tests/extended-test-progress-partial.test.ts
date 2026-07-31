/**
 * Contract test between the Extended Test ladder (#59) and the chat partial that
 * renders it.
 *
 * The feature shipped in three disconnected pieces: the roll dialog's Extended
 * Test toggle, `rolls/extended-test-data.ts`, and
 * `chat/partial/extended-test-progress.hbs` — which `simple-roll-chat.hbs`
 * already included but was never given an `extendedTest` context, so it rendered
 * nothing. Toggling "Extended Test" did nothing at all.
 *
 * The subtle half of the fix is that the partial reads `isComplete` / `isFailed`
 * / `remaining`, which are prototype GETTERS on `ExtendedTestData`. The chat
 * pipeline flattens the instance, and getters are not own enumerable properties,
 * so handing the raw instance across renders those branches blank. `toChatContext()`
 * materialises them. This test renders the real partial against the real producer
 * so the two cannot drift apart again.
 */

import Hbs from 'handlebars';
import { describe, expect, it } from 'vitest';
import { ExtendedTestData, type ExtendedTestState } from '../src/module/rolls/extended-test-data.ts';
import partialSrc from '../src/templates/chat/partial/extended-test-progress.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';

initializeStoryHandlebars();

const template = Hbs.compile(partialSrc);

// `ExtendedTestState` is the widest shape the partial is given: `toChatContext()`
// returns it plus the derived flags, and `{ ...ladder }` (the degraded hand-off the
// last case pins) is exactly the own-property subset.
function render(extendedTest: ExtendedTestState): string {
    return template({ extendedTest });
}

describe('extended-test-progress partial', () => {
    it('renders progress for an in-flight ladder', () => {
        const ladder = new ExtendedTestData({ threshold: 10, failureBudget: 3, timePerAttempt: '1 hour' });
        ladder.recordAttempt(4);
        ladder.recordAttempt(0);

        const html = render(ladder.toChatContext());

        expect(html).toContain('Extended Progress');
        // 4 of 10 accumulated, one failure recorded.
        expect(html).toContain('4');
        expect(html).toContain('10');
        expect(html).toContain('Roll again to accumulate more DoS.');
        expect(html).not.toContain('Threshold reached');
        // timePerAttempt is appended to the in-progress hint.
        expect(html).toContain('1 hour');
    });

    it('renders the completion banner once the threshold is reached', () => {
        const ladder = new ExtendedTestData({ threshold: 5 });
        ladder.recordAttempt(5);

        const html = render(ladder.toChatContext());

        expect(html).toContain('Threshold reached');
        expect(html).not.toContain('Roll again to accumulate more DoS.');
    });

    it('loses the completion banner when handed the raw instance instead of toChatContext()', () => {
        // This is the actual failure mode the context method exists to prevent: the
        // chat pipeline flattens own enumerable properties, and `isComplete` is a
        // prototype getter, so a naive hand-off renders a completed test as still
        // in progress. Pinning it here means a "simplification" back to spreading
        // the instance fails loudly instead of silently degrading the card.
        const ladder = new ExtendedTestData({ threshold: 5 });
        ladder.recordAttempt(5);

        const flattened = { ...ladder };
        const html = render(flattened);

        expect(html).not.toContain('Threshold reached');
        expect(render(ladder.toChatContext())).toContain('Threshold reached');
    });
});
