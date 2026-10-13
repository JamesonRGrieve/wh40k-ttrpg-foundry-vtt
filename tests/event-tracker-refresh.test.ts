/**
 * Regression guard: the Event Tracker dashboard re-renders when a tracker hook
 * fires (#589). Its refresh gated on `this.isRendered`, a getter Foundry V14's
 * ApplicationV2 does not have (it is `rendered`). The bogus getter was declared
 * in foundry-v14-overrides.d.ts, so the build passed while the gate was always
 * `undefined`: the day bar's next / previous buttons stored the new day but the
 * label and the disabled Previous button never updated, so the GM could not step
 * back. Caught by the managers-extra Tier B day-bar flow.
 *
 * Source scan: the dialog pulls Foundry globals at load.
 */

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const DIALOG = readRepoFile('src/module/applications/dialogs/event-tracker-dialog.ts');
const OVERRIDES = readRepoFile('foundry-v14-overrides.d.ts');

describe('Event Tracker dashboard refresh (#589)', () => {
    it('re-renders on a tracker hook through ApplicationV2#rendered', () => {
        const start = DIALOG.indexOf('#refresh(): void {');
        expect(start).toBeGreaterThanOrEqual(0);
        const body = DIALOG.slice(start, DIALOG.indexOf('\n    }\n', start));
        expect(body).toContain('if (this.rendered) void this.render();');
    });

    it('types `rendered` the way the other mixin-built applications do', () => {
        expect(DIALOG).toContain('declare rendered: boolean;');
    });

    it('does not declare an ApplicationV2#isRendered getter Foundry lacks', () => {
        expect(OVERRIDES).not.toMatch(/\bisRendered\b/u);
    });
});
