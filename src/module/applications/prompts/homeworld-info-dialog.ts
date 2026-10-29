/**
 * @file HomeworldInfoDialog — GM-only reference card grid of every home-world a
 * game line's packs carry, for use during character creation.
 *
 * A read-only surface: each card shows the home-world's characteristic
 * modifiers, Fate threshold (with the Emperor's Blessing breakpoint), starting
 * wounds, aptitudes and named bonuses. Per Direction #7 every value is read
 * from the line's home-world packs (selected by their declared flags) via
 * {@link readLineHomeworlds}; cards are grouped under each pack's own label, so
 * whatever home-world packs are installed appear without a code change.
 *
 * Built from the shared info-card-dialog factory (#287).
 */

import { readLineHomeworlds, type HomeworldPack } from '../../rules/homeworld-compendium.ts';
import { WH40KSettings } from '../../wh40k-rpg-settings.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import { defineInfoCardDialog } from './define-info-card-dialog.ts';
import { homeworldCardGroups } from './homeworld-cards.ts';

/** One dialog class per line, built on first open. */
const DIALOGS = new Map<string, ApplicationV2Ctor>();

function dialogFor(line: string): ApplicationV2Ctor {
    const existing = DIALOGS.get(line);
    if (existing !== undefined) return existing;
    const dialog = defineInfoCardDialog({
        id: 'homeworld-info-dialog',
        titleKey: 'WH40K.HomeworldInfo.DialogTitle',
        template: 'systems/wh40k-rpg/templates/prompt/homeworld-info-dialog.hbs',
        contextKey: 'groups',
        extraClasses: ['standard-form'],
        // eslint-disable-next-line no-restricted-syntax -- boundary: game.packs is Foundry's CompendiumCollection (untyped document shape); narrowed to the HomeworldPack surface the reader reads
        cards: async () => homeworldCardGroups(await readLineHomeworlds(line, game.packs as unknown as Iterable<HomeworldPack>)),
    });
    DIALOGS.set(line, dialog);
    return dialog;
}

/** Open the reference for `line`'s home-worlds (the world's primary line by default). */
export function openHomeworldInfoDialog(line: string = WH40KSettings.getPrimaryGameSystem()): void {
    const HomeworldInfoDialog = dialogFor(line);
    void new HomeworldInfoDialog().render({ force: true });
}
