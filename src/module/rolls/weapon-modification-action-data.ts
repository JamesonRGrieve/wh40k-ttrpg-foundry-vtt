/**
 * @file Fitting and removing a weapon modification personally (#136, DH2 core
 * p. 162; DH1 / RT / OW Weapon Upgrades).
 *
 * Both are skill tests rolled through the actor's own pipeline, so the card
 * shows every modifier (the modification's Availability, the xenos rows) as a
 * sourced row. These actions apply the result: a fitting attaches the
 * modification and uses up the parts, or on the line's printed failure loses
 * the parts and damages the weapon. A removal detaches the modification and
 * returns the parts only on a success. A xenos lore insight covers one attempt,
 * whatever its outcome.
 */

import { SYSTEM_ID } from '../constants.ts';
import { t } from '../i18n/t.ts';
import { damagedWeaponQualities, fittingOutcome, type WeaponModificationEntry, type WeaponModificationRules } from '../rules/weapon-modification.ts';
import { XENOS_REPAIR_INSIGHT_FLAG } from '../rules/xenos-equipment.ts';
import { SimpleSkillData } from './action-data.ts';

/** Title of every chat-card row these actions add. */
const EFFECT_TITLE = 'WH40K.WeaponModification.EffectTitle';

/** The weapon surface these actions read and write. */
export interface ModifiableWeapon {
    readonly name: string;
    readonly system: { readonly modifications: readonly WeaponModificationEntry[]; readonly special: Iterable<string> };
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Item#update accepts an untyped path-keyed payload
    update: (data: Record<string, unknown>) => Promise<unknown>;
}

/** The parts item a fitting uses up. */
export interface ModificationParts {
    readonly name: string;
    readonly system: { readonly quantity: number };
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Item#update accepts an untyped path-keyed payload
    update: (data: Record<string, unknown>) => Promise<unknown>;
    delete: () => Promise<object | undefined>;
}

/** A weapon update this file writes: the insight flag removal, the modification list, the base qualities. */
type WeaponPatch = Record<string, null | readonly WeaponModificationEntry[] | string[]>;

/** The patch that spends the roller's xenos lore insight on the weapon. */
function insightSpentPatch(consumes: boolean): WeaponPatch {
    return consumes ? { [`flags.${SYSTEM_ID}.-=${XENOS_REPAIR_INSIGHT_FLAG}`]: null } : {};
}

/** Use up one set of parts: the last one is deleted, otherwise the stack shrinks by one. */
async function consumeParts(parts: ModificationParts): Promise<void> {
    if (parts.system.quantity > 1) await parts.update({ 'system.quantity': parts.system.quantity - 1 });
    else await parts.delete();
}

/** A Trade (Armourer) test fitting a modification from the actor's parts. */
export class FitModificationActionData extends SimpleSkillData {
    readonly weapon: ModifiableWeapon;
    readonly parts: ModificationParts;
    /** The entry the weapon gains on a success. */
    readonly entry: WeaponModificationEntry;
    readonly rules: WeaponModificationRules;
    /** Whether this attempt spends the roller's xenos lore insight on the weapon. */
    readonly consumesXenosInsight: boolean;

    constructor(
        weapon: ModifiableWeapon,
        parts: ModificationParts,
        entry: WeaponModificationEntry,
        rules: WeaponModificationRules,
        consumesXenosInsight: boolean,
    ) {
        super();
        this.weapon = weapon;
        this.parts = parts;
        this.entry = entry;
        this.rules = rules;
        this.consumesXenosInsight = consumesXenosInsight;
    }

    override async descriptionText(): Promise<void> {
        const outcome = fittingOutcome(this.rules, this.rollData.success, this.rollData.dof);
        const names = { modification: this.entry.name, weapon: this.weapon.name };
        const patch = insightSpentPatch(this.consumesXenosInsight);
        if (outcome.fitted) patch['system.modifications'] = [...this.weapon.system.modifications, this.entry];
        if (outcome.weaponDamaged) patch['system.special'] = damagedWeaponQualities(this.weapon.system.special);
        if (Object.keys(patch).length > 0) await this.weapon.update(patch);
        if (outcome.partsConsumed) await consumeParts(this.parts);

        if (outcome.fitted) {
            this.addEffect(t(EFFECT_TITLE), game.i18n.format('WH40K.WeaponModification.Fitted', names));
            return;
        }
        this.addEffect(
            t(EFFECT_TITLE),
            game.i18n.format(outcome.partsConsumed ? 'WH40K.WeaponModification.FitFailedPartsLost' : 'WH40K.WeaponModification.FitFailed', names),
        );
        if (outcome.weaponDamaged) this.addEffect(t(EFFECT_TITLE), game.i18n.format('WH40K.WeaponModification.WeaponDamaged', names));
    }
}

/** A Tech-Use test removing a fitted modification, recovering its parts on a success. */
export class RemoveModificationActionData extends SimpleSkillData {
    readonly weapon: ModifiableWeapon;
    /** The fitted entry being removed. */
    readonly entry: WeaponModificationEntry;
    /** Returns the parts to the remover; resolves false when their source document is gone. */
    readonly recoverParts: () => Promise<boolean>;
    readonly consumesXenosInsight: boolean;

    constructor(weapon: ModifiableWeapon, entry: WeaponModificationEntry, recoverParts: () => Promise<boolean>, consumesXenosInsight: boolean) {
        super();
        this.weapon = weapon;
        this.entry = entry;
        this.recoverParts = recoverParts;
        this.consumesXenosInsight = consumesXenosInsight;
    }

    override async descriptionText(): Promise<void> {
        const names = { modification: this.entry.name, weapon: this.weapon.name };
        // Success or failure, the modification comes off; only a success keeps the parts.
        const remaining = this.weapon.system.modifications.filter((mod) => mod.uuid !== this.entry.uuid);
        await this.weapon.update({ ...insightSpentPatch(this.consumesXenosInsight), 'system.modifications': remaining });
        if (!this.rollData.success) {
            this.addEffect(t(EFFECT_TITLE), game.i18n.format('WH40K.WeaponModification.RemovedPartsLost', names));
            return;
        }
        const recovered = await this.recoverParts();
        this.addEffect(
            t(EFFECT_TITLE),
            game.i18n.format(recovered ? 'WH40K.WeaponModification.RemovedPartsKept' : 'WH40K.WeaponModification.RemovedPartsMissing', names),
        );
    }
}
