/**
 * @file psyker-unlock — the origin that makes a character a psyker in a line, and
 * where the advancement dialog tells a non-psyker to find it (#680, #681).
 *
 * Which origin it is is DATA: the compendium origin-path document carries
 * `system.grantsPsychicPowers` (DH2's Psyker elite advance, OW's Sanctioned Psyker
 * speciality, BC's Psyker archetype). A character is a psyker when it owns a
 * flagged origin, whatever that origin is called. The line config keeps only the
 * origin-path step, which the locked banner needs: DH2's unlock is an elite advance
 * the dialog itself sells on its elite-advances tab; BC's archetype and OW's
 * speciality are origin-path choices the dialog does not sell. The banner names the
 * flagged document (its name read from the compendium) and the tab or step to find
 * it on.
 */

/** The origin-path step at which a line's characters become psykers (`elite`, `archetype`, `speciality`). */
export interface PsykerUnlock {
    readonly step: string;
}

/** Whether an origin-path item's `system` marks it as the psyker unlock (#681). */
export function grantsPsychicPowers(system: object): boolean {
    return 'grantsPsychicPowers' in system && system.grantsPsychicPowers === true;
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
 * its origin-path step. A line with no unlock, or whose flagged origin is not in
 * any compendium, says only that the character cannot buy them. Pure.
 * @param unlock  The line's unlock step, or null.
 * @param unlockName  The flagged origin's name, read from its compendium document, or null.
 * @param tabs  The tabs the dialog built, so the named tab is one that exists.
 */
export function psykerUnlockHint(
    unlock: PsykerUnlock | null,
    unlockName: string | null,
    tabs: readonly DialogTab[],
    localize: Localize,
    format: Format,
): PsykerUnlockHint {
    if (unlock === null || unlockName === null) {
        return { locked: localize('WH40K.Dialog.Advancement.PsychicLockedNone'), empty: localize('WH40K.Dialog.Advancement.NoPowersNone') };
    }
    const tab = unlock.step === DIALOG_SOLD_STEP ? tabs.find((candidate) => candidate.id === ELITE_TAB_ID) : undefined;
    if (tab !== undefined) {
        const onTab = { advance: unlockName, tab: localize(tab.label) };
        return { locked: format('WH40K.Dialog.Advancement.PsychicLockedTab', onTab), empty: format('WH40K.Dialog.Advancement.NoPowersTab', onTab) };
    }
    const step = localize(`WH40K.OriginPath.${unlock.step.charAt(0).toUpperCase()}${unlock.step.slice(1)}`);
    const onOrigin = { advance: unlockName, step };
    return { locked: format('WH40K.Dialog.Advancement.PsychicLockedOrigin', onOrigin), empty: format('WH40K.Dialog.Advancement.NoPowersOrigin', onOrigin) };
}
