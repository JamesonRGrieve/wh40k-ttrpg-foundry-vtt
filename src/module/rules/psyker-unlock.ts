/**
 * @file psyker-unlock — the origin-path item that makes a character a psyker in
 * a line, and where the advancement dialog tells a non-psyker to find it (#680).
 *
 * The unlock differs by line: DH2's is the 'Psyker' elite advance, which the
 * advancement dialog itself offers on its elite-advances tab; BC's 'Psyker'
 * archetype and OW's 'Sanctioned Psyker' speciality are origin-path choices,
 * which the dialog does not sell. The Psychic Powers tab's locked banner and its
 * empty state name whichever applies: the dialog tab that carries the unlock, by
 * that tab's own label, or else the origin-path step.
 */

/** The origin-path item a line's psykers own: its step (`elite`, `archetype`, `speciality`) and name. */
export interface PsykerUnlock {
    readonly step: string;
    readonly name: string;
}

/** The origin-path step whose items the advancement dialog sells, on its elite-advances tab. */
const DIALOG_SOLD_STEP = 'elite';

/** The advancement dialog tab that lists the elite advances. */
const ELITE_TAB_ID = 'traits';

/** A tab as the advancement dialog builds it: its id and its label's langpack key. */
interface DialogTab {
    readonly id: string;
    readonly label: string;
}

/** The locked banner's and the empty state's text. */
export interface PsykerUnlockHint {
    locked: string;
    empty: string;
}

type Localize = (key: string) => string;
type Format = (key: string, data: Record<string, string>) => string;

/**
 * The text that tells a non-psyker how to unlock psychic powers. An unlock the
 * dialog sells names the tab it is on, by that tab's label; any other unlock names
 * its origin-path step. A line with no unlock says only that the character cannot
 * buy them. Pure.
 * @param unlock  The line's unlock, or null.
 * @param tabs  The tabs the dialog built, so the named tab is one that exists.
 */
export function psykerUnlockHint(unlock: PsykerUnlock | null, tabs: readonly DialogTab[], localize: Localize, format: Format): PsykerUnlockHint {
    if (unlock === null) {
        return { locked: localize('WH40K.Dialog.Advancement.PsychicLockedNone'), empty: localize('WH40K.Dialog.Advancement.NoPowersNone') };
    }
    const tab = unlock.step === DIALOG_SOLD_STEP ? tabs.find((candidate) => candidate.id === ELITE_TAB_ID) : undefined;
    if (tab !== undefined) {
        const onTab = { advance: unlock.name, tab: localize(tab.label) };
        return { locked: format('WH40K.Dialog.Advancement.PsychicLockedTab', onTab), empty: format('WH40K.Dialog.Advancement.NoPowersTab', onTab) };
    }
    const step = localize(`WH40K.OriginPath.${unlock.step.charAt(0).toUpperCase()}${unlock.step.slice(1)}`);
    const onOrigin = { advance: unlock.name, step };
    return { locked: format('WH40K.Dialog.Advancement.PsychicLockedOrigin', onOrigin), empty: format('WH40K.Dialog.Advancement.NoPowersOrigin', onOrigin) };
}
