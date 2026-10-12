/**
 * Portrait journal link (#590): link precedence (explicit actor flag, then the
 * Event Tracker resolver, then nothing), viewer visibility, the portrait drop
 * validation, and the open path's ownership checks.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ACTOR_JOURNAL_LINK_FLAG,
    actorJournalLinkSource,
    compendiumCollectionId,
    type DropData,
    applyPortraitJournalDrop,
    clearActorJournalLink,
    hasExplicitJournalLink,
    isJournalLinkUuid,
    type JournalLinkWritableActor,
    openActorJournal,
    isLookedUpJournalVisible,
    journalLinkFromDropData,
    type JournalLinkedActor,
    openJournalLink,
    planPortraitJournalDrop,
    portraitJournalLink,
    resolveActorJournalLink,
    visibleActorJournalLink,
} from './actor-journal-link.ts';
import type { JournalRef } from './event-graph.ts';
import { EventTracker } from './event-tracker.ts';

const ENTRY = 'JournalEntry.aaaaaaaaaaaaaaaa';
const OTHER_ENTRY = 'JournalEntry.bbbbbbbbbbbbbbbb';
const NAMED_ENTRY = 'JournalEntry.cccccccccccccccc';
const PAGE = 'JournalEntry.aaaaaaaaaaaaaaaa.JournalEntryPage.pppppppppppppppp';
const PACK_ENTRY = 'Compendium.wh40k-rpg.lore.JournalEntry.dddddddddddddddd';

function actor(name: string, journalLink?: string): JournalLinkedActor {
    return { name, flags: { 'wh40k-rpg': journalLink === undefined ? {} : { [ACTOR_JOURNAL_LINK_FLAG]: journalLink } } };
}

describe('isJournalLinkUuid', () => {
    it.each([ENTRY, PAGE, PACK_ENTRY, `${PACK_ENTRY}.JournalEntryPage.pppppppppppppppp`])('accepts %s', (uuid) => {
        expect(isJournalLinkUuid(uuid)).toBe(true);
    });

    it.each(['', 'Actor.aaaaaaaaaaaaaaaa', 'JournalEntry.short', 'Item.aaaaaaaaaaaaaaaa.JournalEntry.aaaaaaaaaaaaaaaa', `${ENTRY} `, null, undefined])(
        'rejects %s',
        (value) => {
            expect(isJournalLinkUuid(value)).toBe(false);
        },
    );
});

describe('resolveActorJournalLink precedence', () => {
    const resolver = vi.fn((ref: JournalRef) => (ref.name === 'Garrick Varo' ? NAMED_ENTRY : null));

    beforeEach(() => {
        resolver.mockClear();
    });

    it('the explicit flag wins over the resolver, which is not consulted', () => {
        expect(resolveActorJournalLink({ name: 'Garrick Varo', explicitLink: OTHER_ENTRY }, resolver)).toBe(OTHER_ENTRY);
        expect(resolver).not.toHaveBeenCalled();
    });

    it('with no explicit flag, asks the resolver as a character reference', () => {
        expect(resolveActorJournalLink({ name: 'Garrick Varo', explicitLink: undefined }, resolver)).toBe(NAMED_ENTRY);
        expect(resolver).toHaveBeenCalledWith({ kind: 'character', name: 'Garrick Varo' });
    });

    it('an invalid explicit flag is ignored in favour of the resolver', () => {
        expect(resolveActorJournalLink({ name: 'Garrick Varo', explicitLink: 'Actor.aaaaaaaaaaaaaaaa' }, resolver)).toBe(NAMED_ENTRY);
    });

    it('resolves to nothing when neither answers', () => {
        expect(resolveActorJournalLink({ name: 'Nobody', explicitLink: undefined }, resolver)).toBeNull();
    });

    it('drops a link the viewer may not see', () => {
        expect(visibleActorJournalLink({ name: 'x', explicitLink: ENTRY }, resolver, () => false)).toBeNull();
        expect(visibleActorJournalLink({ name: 'x', explicitLink: ENTRY }, resolver, () => true)).toBe(ENTRY);
    });
});

describe('journal visibility', () => {
    it('reads a loaded document through its own visible flag', () => {
        expect(isLookedUpJournalVisible({ visible: true }, null)).toBe(true);
        expect(isLookedUpJournalVisible({ visible: false }, true)).toBe(false);
    });

    it('reads an unloaded compendium index entry through its pack', () => {
        expect(isLookedUpJournalVisible({ name: 'Index entry' }, true)).toBe(true);
        expect(isLookedUpJournalVisible({ name: 'Index entry' }, false)).toBe(false);
        expect(isLookedUpJournalVisible({ name: 'Index entry' }, null)).toBe(false);
    });

    it('a missing document is never visible', () => {
        expect(isLookedUpJournalVisible(null, true)).toBe(false);
    });

    it('extracts the compendium collection id', () => {
        expect(compendiumCollectionId(PACK_ENTRY)).toBe('wh40k-rpg.lore');
        expect(compendiumCollectionId(ENTRY)).toBeNull();
    });
});

describe('portrait drop validation', () => {
    it('accepts a JournalEntry and a JournalEntryPage', () => {
        expect(journalLinkFromDropData({ type: 'JournalEntry', uuid: ENTRY })).toBe(ENTRY);
        expect(journalLinkFromDropData({ type: 'JournalEntryPage', uuid: PAGE })).toBe(PAGE);
    });

    it('rejects a type / UUID mismatch', () => {
        expect(journalLinkFromDropData({ type: 'JournalEntry', uuid: PAGE })).toBeNull();
        expect(journalLinkFromDropData({ type: 'JournalEntryPage', uuid: ENTRY })).toBeNull();
    });

    it.each<DropData>([
        null,
        'JournalEntry',
        [ENTRY],
        { type: 'Item', uuid: 'Item.aaaaaaaaaaaaaaaa' },
        { type: 'JournalEntry' },
        { uuid: ENTRY },
        { type: 'JournalEntry', uuid: 7 },
    ])('rejects non-journal drop data %s', (data) => {
        expect(journalLinkFromDropData(data)).toBeNull();
    });

    it('links for an owner', () => {
        expect(planPortraitJournalDrop({ type: 'JournalEntry', uuid: ENTRY }, true)).toEqual({ kind: 'link', uuid: ENTRY });
    });

    it('denies a non-owner', () => {
        expect(planPortraitJournalDrop({ type: 'JournalEntry', uuid: ENTRY }, false)).toEqual({ kind: 'denied' });
    });

    it('passes a non-journal drop through to the normal drop path', () => {
        expect(planPortraitJournalDrop({ type: 'Item', uuid: 'Item.aaaaaaaaaaaaaaaa' }, true)).toEqual({ kind: 'pass' });
        expect(planPortraitJournalDrop({ type: 'Item', uuid: 'Item.aaaaaaaaaaaaaaaa' }, false)).toEqual({ kind: 'pass' });
    });
});

describe('actor flag reading', () => {
    it('reads the raw explicit flag and reports whether it is a valid link', () => {
        expect(actorJournalLinkSource(actor('Vex', ENTRY))).toEqual({ name: 'Vex', explicitLink: ENTRY });
        expect(hasExplicitJournalLink(actor('Vex', ENTRY))).toBe(true);
        expect(hasExplicitJournalLink(actor('Vex', 'nonsense'))).toBe(false);
        expect(hasExplicitJournalLink(actor('Vex'))).toBe(false);
    });
});

interface WorldJournal {
    name: string;
    uuid: string;
    visible: boolean;
    flags: Record<string, never>;
}

/** Stub the world: the journal collection, the current user, and a sync UUID lookup over the journals. */
function stubWorld(journals: WorldJournal[], isGM: boolean): void {
    vi.stubGlobal('game', { journal: journals, user: { isGM }, packs: new Map() });
    vi.stubGlobal('fromUuidSync', (uuid: string) => journals.find((j) => j.uuid === uuid) ?? null);
}

describe('portraitJournalLink (runtime, over the Event Tracker resolver)', () => {
    afterEach(() => {
        EventTracker.registerJournalLinkResolver(null);
        vi.unstubAllGlobals();
    });

    const journals: WorldJournal[] = [
        { name: 'Garrick Varo', uuid: NAMED_ENTRY, visible: true, flags: {} },
        { name: 'Explicit Dossier', uuid: OTHER_ENTRY, visible: true, flags: {} },
        { name: 'Secret Dossier', uuid: ENTRY, visible: false, flags: {} },
    ];

    it('explicit flag over registered resolver over name lookup', () => {
        stubWorld(journals, false);
        EventTracker.registerJournalLinkResolver((ref) => (ref.name === 'Garrick Varo' ? OTHER_ENTRY : null));
        expect(portraitJournalLink(actor('Garrick Varo', NAMED_ENTRY))).toBe(NAMED_ENTRY);
        expect(portraitJournalLink(actor('Garrick Varo'))).toBe(OTHER_ENTRY);
        EventTracker.registerJournalLinkResolver(null);
        expect(portraitJournalLink(actor('Garrick Varo'))).toBe(NAMED_ENTRY);
        expect(portraitJournalLink(actor('Unknown Hiver'))).toBeNull();
    });

    it('hides a GM-only entry from a player but shows it to the GM', () => {
        stubWorld(journals, false);
        expect(portraitJournalLink(actor('Anyone', ENTRY))).toBeNull();
        stubWorld(journals, true);
        expect(portraitJournalLink(actor('Anyone', ENTRY))).toBe(ENTRY);
    });
});

describe('openJournalLink', () => {
    type Render = (options: object) => Promise<void>;
    /** Stands in for Foundry's ApplicationV2 (every V14 journal sheet is one). */
    class StubApplicationV2 {
        constructor(readonly render: Render) {}
    }
    class StubJournalEntry {
        constructor(readonly visible: boolean, readonly sheet: object | null) {}
    }
    class StubJournalEntryPage {
        constructor(readonly id: string, readonly visible: boolean, readonly parent: StubJournalEntry) {}
    }

    const warn = vi.fn();

    beforeEach(() => {
        warn.mockClear();
        vi.stubGlobal('foundry', {
            documents: { JournalEntry: StubJournalEntry, JournalEntryPage: StubJournalEntryPage },
            applications: { api: { ApplicationV2: StubApplicationV2 } },
        });
        vi.stubGlobal('ui', { notifications: { warn } });
        vi.stubGlobal('game', { i18n: { localize: (key: string) => key, format: (key: string) => key } });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('opens a visible entry', async () => {
        const render = vi.fn(async () => Promise.resolve());
        vi.stubGlobal('fromUuid', async () => Promise.resolve(new StubJournalEntry(true, new StubApplicationV2(render))));
        await openJournalLink(ENTRY);
        expect(render).toHaveBeenCalledWith({ force: true });
        expect(warn).not.toHaveBeenCalled();
    });

    it('opens a page inside its entry, at that page', async () => {
        const render = vi.fn(async () => Promise.resolve());
        const entry = new StubJournalEntry(true, new StubApplicationV2(render));
        vi.stubGlobal('fromUuid', async () => Promise.resolve(new StubJournalEntryPage('pppppppppppppppp', true, entry)));
        await openJournalLink(PAGE);
        expect(render).toHaveBeenCalledWith({ force: true, pageId: 'pppppppppppppppp' });
    });

    it('warns when the journal has no V2 sheet', async () => {
        const render = vi.fn(async () => Promise.resolve());
        vi.stubGlobal('fromUuid', async () => Promise.resolve(new StubJournalEntry(true, { render })));
        await openJournalLink(ENTRY);
        expect(render).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith('WH40K.Portrait.Journal.NotFound');
    });

    it('refuses a page the user may not view', async () => {
        const render = vi.fn(async () => Promise.resolve());
        const entry = new StubJournalEntry(true, new StubApplicationV2(render));
        vi.stubGlobal('fromUuid', async () => Promise.resolve(new StubJournalEntryPage('pppppppppppppppp', false, entry)));
        await openJournalLink(PAGE);
        expect(render).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith('WH40K.Portrait.Journal.NoPermission');
    });

    it('refuses an entry the user may not view', async () => {
        const render = vi.fn(async () => Promise.resolve());
        vi.stubGlobal('fromUuid', async () => Promise.resolve(new StubJournalEntry(false, new StubApplicationV2(render))));
        await openJournalLink(ENTRY);
        expect(render).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith('WH40K.Portrait.Journal.NoPermission');
    });

    it('warns when the entry is gone', async () => {
        vi.stubGlobal('fromUuid', async () => Promise.resolve(null));
        await openJournalLink(ENTRY);
        expect(warn).toHaveBeenCalledWith('WH40K.Portrait.Journal.NotFound');
    });

    it('openActorJournal warns, without a lookup, when the actor resolves to nothing', async () => {
        const lookup = vi.fn(async () => Promise.resolve(null));
        vi.stubGlobal('fromUuid', lookup);
        vi.stubGlobal('game', { journal: [], user: { isGM: true }, packs: new Map(), i18n: { localize: (key: string) => key } });
        await openActorJournal(actor('Nobody'));
        expect(lookup).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith('WH40K.Portrait.Journal.NotFound');
    });
});

describe('portrait drop and clear (actor writes)', () => {
    const info = vi.fn();
    const warn = vi.fn();

    function writableActor(
        isOwner: boolean,
        journalLink?: string,
    ): JournalLinkWritableActor & { setFlag: ReturnType<typeof vi.fn>; unsetFlag: ReturnType<typeof vi.fn> } {
        return {
            ...actor('Garrick Varo', journalLink),
            isOwner,
            setFlag: vi.fn(async () => Promise.resolve({})),
            unsetFlag: vi.fn(async () => Promise.resolve({})),
        };
    }

    beforeEach(() => {
        info.mockClear();
        warn.mockClear();
        vi.stubGlobal('ui', { notifications: { info, warn } });
        vi.stubGlobal('game', { i18n: { localize: (key: string) => key, format: (key: string) => key } });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('an owner dropping a journal sets the explicit link', async () => {
        const target = writableActor(true);
        await expect(applyPortraitJournalDrop(target, { type: 'JournalEntry', uuid: ENTRY })).resolves.toBe(true);
        expect(target.setFlag).toHaveBeenCalledWith('wh40k-rpg', ACTOR_JOURNAL_LINK_FLAG, ENTRY);
        expect(info).toHaveBeenCalledWith('WH40K.Portrait.Journal.Linked');
    });

    it('a non-owner dropping a journal is refused without a write', async () => {
        const target = writableActor(false);
        await expect(applyPortraitJournalDrop(target, { type: 'JournalEntry', uuid: ENTRY })).resolves.toBe(true);
        expect(target.setFlag).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith('WH40K.Portrait.Journal.OwnerOnly');
    });

    it('a non-journal drop is left to the sheet', async () => {
        const target = writableActor(true);
        await expect(applyPortraitJournalDrop(target, { type: 'Item', uuid: 'Item.aaaaaaaaaaaaaaaa' })).resolves.toBe(false);
        expect(target.setFlag).not.toHaveBeenCalled();
    });

    it('an owner clears the explicit link; a non-owner cannot', async () => {
        const owner = writableActor(true, ENTRY);
        await clearActorJournalLink(owner);
        expect(owner.unsetFlag).toHaveBeenCalledWith('wh40k-rpg', ACTOR_JOURNAL_LINK_FLAG);
        const stranger = writableActor(false, ENTRY);
        await clearActorJournalLink(stranger);
        expect(stranger.unsetFlag).not.toHaveBeenCalled();
    });
});
