/**
 * @file SkillSheet - ApplicationV2 sheet for skill items (compendium skills)
 */

import type BaseItemSheet from './base-item-sheet.ts';
import defineSimpleItemSheet from './define-simple-item-sheet.ts';

/**
 * Narrow the document.system shape we touch in the sheet actions to the
 * subset of `SkillData` actually used here. Avoids pulling the full
 * DataModel type into the sheet (which would round-trip through fvtt-types
 * mixin chains) while keeping every access typed.
 */
interface SkillSheetItemSystem {
    specialUses: Array<{ name: string; description: string; modifier: number; difficulty: string }>;
    toChatSpecialUse: (index: number) => Promise<void>;
}

interface SkillRollOptions {
    modifier: number;
    difficulty: string;
    specialUseName: string;
}

interface SkillSheetActor {
    rollSkill?: (skillName: string, specialityName?: string | number, options?: SkillRollOptions) => Promise<void>;
}

type SkillSheetItem = BaseItemSheet['item'] & { system: SkillSheetItemSystem; actor: SkillSheetActor | null };

/**
 * Resolve the `data-index` attribute on the action target into a numeric
 * index, returning null if the attribute is missing or malformed.
 */
function readIndex(target: HTMLElement): number | null {
    const raw = target.dataset['index'];
    if (raw === undefined || raw === '') return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

function getSkillSheetItem(sheet: BaseItemSheet): SkillSheetItem {
    return sheet.item as SkillSheetItem;
}

/* -------------------------------------------- */
/*  Actions                                     */
/* -------------------------------------------- */

async function specialUseAdd(this: BaseItemSheet): Promise<void> {
    const system = getSkillSheetItem(this).system;
    const existing = Array.isArray(system.specialUses) ? system.specialUses : [];
    const next = [...existing.map((entry) => ({ ...entry })), { name: '', description: '', modifier: 0, difficulty: '' }];
    await this.item.update({ 'system.specialUses': next });
}

async function specialUseDelete(this: BaseItemSheet, _event: Event, target: HTMLElement): Promise<void> {
    const index = readIndex(target);
    if (index === null) return;
    const system = getSkillSheetItem(this).system;
    const existing = Array.isArray(system.specialUses) ? system.specialUses : [];
    if (index < 0 || index >= existing.length) return;
    const next = existing.filter((_, i) => i !== index).map((entry) => ({ ...entry }));
    await this.item.update({ 'system.specialUses': next });
}

async function specialUseChat(this: BaseItemSheet, _event: Event, target: HTMLElement): Promise<void> {
    const index = readIndex(target);
    if (index === null) return;
    const system = getSkillSheetItem(this).system;
    await system.toChatSpecialUse(index);
}

async function specialUseRoll(this: BaseItemSheet, _event: Event, target: HTMLElement): Promise<void> {
    const index = readIndex(target);
    if (index === null) return;
    const item = getSkillSheetItem(this);
    const system = item.system;
    const entry = system.specialUses[index];

    // Always post the entry to chat so the GM and players see what's being rolled.
    await system.toChatSpecialUse(index);

    // If the skill is actor-owned, also open the unified skill-roll dialog
    // (it surfaces the modifier / difficulty for confirmation).
    const actor = item.actor;
    if (actor?.rollSkill) {
        const skillName = this.item.name;
        await actor.rollSkill(skillName, undefined, {
            modifier: entry.modifier,
            difficulty: entry.difficulty,
            specialUseName: entry.name,
        });
    }
}

/**
 * Sheet for skill items (used in compendiums).
 * Redesigned with Imperial Gothic theme and comprehensive layout.
 *
 * Note: this sheet has no tabs — its template renders a single body region.
 * The non-default scrollable selector reflects that template's structure.
 */
const SkillSheet = defineSimpleItemSheet({
    className: 'SkillSheet',
    classes: ['wh40k-rpg', 'sheet', 'item', 'skill'],
    template: 'systems/wh40k-rpg/templates/item/item-skill-sheet.hbs',
    width: 600,
    height: 700,
    partOverrides: {
        scrollable: ['.wh40k-item-body'],
    },
    actions: {
        specialUseAdd,
        specialUseDelete,
        specialUseChat,
        specialUseRoll,
    },
});

export default SkillSheet;
