import { toggleUIExpanded } from '../../rules/config.mjs';
import { DHBasicActionManager } from '../../actions/basic-action-manager.mjs';
import { prepareCreateSpecialistSkillPrompt } from '../../prompts/simple-prompt.mjs';

/**
 * Shared Actor functions for Actor that contains embedded items
 */
export class ActorContainerSheet extends ActorSheet {
    activateListeners(html) {
        super.activateListeners(html);

        // Everything below here is only needed if the sheet is editable
        if (!this.isEditable) return;
        this.form.ondrop = (ev) => this._onDrop(ev);
        html.find('.sheet-control__hide-control').click(async (ev) => await this._sheetControlHideToggle(ev));
        html.find('.item-roll').click(async (ev) => await this._onItemRoll(ev));
        html.find('.item-damage').click(async (ev) => await this._onItemDamage(ev));
        html.find('.item-create').click(async (ev) => await this._onItemCreate(ev));
        html.find('.item-edit').click((ev) => this._onItemEdit(ev));
        html.find('.item-delete').click((ev) => this._onItemDelete(ev));
        html.find('.item-vocalize').click(async (ev) => await this._onItemVocalize(ev));
        html.find('.item-drag').each((i, item) => {
            if (item.dataset && item.dataset.itemId) {
                item.setAttribute('draggable', true);
                item.addEventListener('dragstart', this._onItemDragStart.bind(this), false);
            }
        });
        html.find('.actor-drag').each((i, item) => {
            if (item.dataset && item.dataset.itemId) {
                item.setAttribute('draggable', true);
                item.addEventListener('dragstart', this._onActorDragStart.bind(this), false);
            }
        });
        html.find('.effect-delete').click(async (ev) => await this._effectDelete(ev));
        html.find('.effect-edit').click(async (ev) => await this._effectEdit(ev));
        html.find('.effect-create').click(async (ev) => await this._effectCreate(ev));
        html.find('.effect-enable').click(async (ev) => await this._effectEnable(ev));
        html.find('.effect-disable').click(async (ev) => await this._effectDisable(ev));

        html.find('.add-skill').click(async (ev) => await this._addSpecialistSkill(ev));
        html.find('.delete-specialization').click(async (ev) => await this._deleteSpecialization(ev));
        html.find('.rt-train-btn').click(async (ev) => await this._toggleTraining(ev));
    }

    /**
     * Handle skill training button clicks.
     * Supports two patterns:
     * 1. data-field/data-value: Simple toggle of a boolean field
     * 2. data-skill/data-level: Level-based training (T/+10/+20)
     */
    async _toggleTraining(event) {
        event.preventDefault();
        const btn = event.currentTarget;
        const field = btn.dataset.field;
        const skillKey = btn.dataset.skill;
        const level = btn.dataset.level ? parseInt(btn.dataset.level) : null;
        const specialty = btn.dataset.specialty ?? btn.dataset.index;

        // Pattern 1: Simple field toggle (used by specialist skills panel)
        if (field) {
            const currentValue = btn.dataset.value === 'true';
            await this.actor.update({ [field]: !currentValue });
            return;
        }

        // Pattern 2: Level-based training (used by standard skills panel)
        if (skillKey && level !== null) {
            const basePath = specialty != null
                ? `system.skills.${skillKey}.entries.${specialty}`
                : `system.skills.${skillKey}`;
            
            // Get current training level
            const skill = specialty != null
                ? this.actor.system.skills?.[skillKey]?.entries?.[specialty]
                : this.actor.system.skills?.[skillKey];
            
            const currentLevel = skill?.plus20 ? 3 : skill?.plus10 ? 2 : skill?.trained ? 1 : 0;
            
            // Toggle logic: if clicking the current level, reduce by 1; otherwise set to clicked level
            const newLevel = (level === currentLevel) ? level - 1 : level;
            
            const updateData = {
                [`${basePath}.trained`]: newLevel >= 1,
                [`${basePath}.plus10`]: newLevel >= 2,
                [`${basePath}.plus20`]: newLevel >= 3,
            };
            
            await this.actor.update(updateData);
        }
    }

    async _deleteSpecialization(event) {
        event.preventDefault();
        const btn = event.currentTarget;
        const skillName = btn.dataset.skill;
        const index = parseInt(btn.dataset.index);
        
        const skill = this.actor.system.skills[skillName];
        if (!skill || !Array.isArray(skill.entries)) return;
        
        const entries = [...skill.entries];
        const deletedName = entries[index]?.name || 'this specialization';
        
        Dialog.confirm({
            title: 'Delete Specialization',
            content: `<p>Delete "${deletedName}"?</p>`,
            yes: async () => {
                entries.splice(index, 1);
                await this.actor.update({ [`system.skills.${skillName}.entries`]: entries });
            },
            no: () => {},
            defaultYes: false
        });
    }

    _onDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        game.rt.log('Actor _onDrop', event);

        try {
            const data = JSON.parse(event.dataTransfer.getData('text/plain'));
            if (data.type === 'Item' || data.type === 'item') {
                game.rt.log('Checking if item already exists', data);
                // Check if Item already Exists
                if (this.actor.items.find((i) => i._id === data?.data?._id)) {
                    game.rt.log('Item already exists on Actor -- ignoring');
                    return false;
                } else {
                    return super._onDrop(event);
                }
            }
        } catch (err) {
            game.rt.log('Actor Container | drop error', err);
            return false;
        }
    }

    async _addSpecialistSkill(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const specialistSkill = element.dataset.skill;
        const skill = this.actor.system.skills[specialistSkill];
        if(!skill) {
            ui.notifications.warn(`Skill not specified -- unexpected error.`);
            return;
        }
        await prepareCreateSpecialistSkillPrompt({
            actor: this.actor,
            skill: skill,
            skillName: specialistSkill
        });
    }

    async _onItemDamage(event) {
        event.preventDefault();
        const element = event.currentTarget;
        await this.actor.damageItem(element.dataset.itemId);
    }

    async _onItemRoll(event) {
        event.preventDefault();
        const element = event.currentTarget;
        await this.actor.rollItem(element.dataset.itemId);
    }

    async _onItemCreate(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const itemType = element.dataset.type;
        let data = {
            name: `New ${itemType.charAt(0).toUpperCase() + itemType.slice(1)}`,
            type: itemType,
        };
        await this.actor.createEmbeddedDocuments('Item', [data], { renderSheet: true });
    }

    _onItemEdit(event) {
        event.preventDefault();
        const element = event.currentTarget;
        let item = this.actor.items.get(element.dataset.itemId);
        item.sheet.render(true);
    }

    _onItemDelete(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const itemId = element.dataset.itemId;
        Dialog.confirm({
            title: 'Confirm Delete',
            content: '<p>Are you sure you would like to delete this?</p>',
            yes: () => {
                this.actor.deleteEmbeddedDocuments('Item', [itemId]);
                this.render(false);
            },
            no: () => {},
            defaultYes: false,
        });
    }

    async _onItemVocalize(event) {
        event.preventDefault();
        const element = event.currentTarget;
        let item = this.actor.items.get(element.dataset.itemId);
        await DHBasicActionManager.sendItemVocalizeChat({
            actor: this.actor.name,
            name: item.name,
            type: item.type?.toUpperCase(),
            description: await TextEditor.enrichHTML(item.system.benefit ?? item.system.description, {rollData: {actor: this.actor, item: this, pr: this.actor.psy.rating}}),
        });
    }

    async _onItemDragStart(event) {
        event.stopPropagation();
        game.rt.log('Actor:_onItemDragStart', event);

        const element = event.currentTarget;
        if (!element.dataset?.itemId) {
            game.rt.warn('No Item Id - Cancelling Drag');
            return;
        }

        const itemId = element.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) {
            // Cannot find item on actor? Just let foundry handle it...
            game.rt.log('Default Foundry Handler');
            return super._onDragStart(event);
        }

        // Create drag data
        const dragData = {
            actorId: this.actor.id,
            uuid: this.actor.uuid,
            actorName: this.actor.name,
            sceneId: this.actor.isToken ? canvas.scene?.id : null,
            tokenId: this.actor.isToken ? this.actor.token?.id : null,
            type: 'Item',
            data: item,
        };
        event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
    }

    async _sheetControlHideToggle(event) {
        event.preventDefault();
        const target = event.currentTarget.dataset.toggle;
        if (!target) return;

        // Get current expanded state from actor flags
        const expanded = this.actor.getFlag('rogue-trader', 'ui.expanded') || [];
        const isCurrentlyExpanded = expanded.includes(target);

        // Toggle the state
        let newExpanded;
        if (isCurrentlyExpanded) {
            newExpanded = expanded.filter(name => name !== target);
        } else {
            newExpanded = [...expanded, target];
        }

        // Update actor flags - this will trigger a re-render
        await this.actor.setFlag('rogue-trader', 'ui.expanded', newExpanded);
    }


    async _onActorDragStart(event) {
        event.stopPropagation();
        game.rt.log('_onActorDragStart', event);
        const element = event.currentTarget;
        if (!element.dataset?.itemType) {
            game.rt.warn('No Drag Type - Cancelling Drag');
            return;
        }

        // Create drag data
        const dragType = element.dataset.itemType;
        const dragData = {
            actorId: this.actor.id,
            uuid: this.actor.uuid,
            actorName: this.actor.name,
            sceneId: this.actor.isToken ? canvas.scene?.id : null,
            tokenId: this.actor.isToken ? this.actor.token?.id : null,
            type: dragType,
            data: {},
        };

        switch (dragType) {
            case 'characteristic':
                const characteristic = this.actor.characteristics[element.dataset.itemId];
                dragData.data = {
                    name: characteristic.label,
                    characteristic: element.dataset.itemId,
                };
                event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
                return;
            case 'skill':
                const skill = this.actor.skills[element.dataset.itemId];
                let name = skill.label;
                if (element.dataset.specialty && Array.isArray(skill.entries)) {
                    const speciality = skill.entries[element.dataset.specialty];
                    if (speciality) {
                        name = `${name}: ${speciality.name ?? speciality.label ?? element.dataset.specialty}`;
                    }
                }
                dragData.data = {
                    name,
                    skill: element.dataset.itemId,
                    speciality: element.dataset.specialty,
                };
                event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
                return;
            default:
                // Let default Foundry handler deal with default drag cases.
                game.rt.warn('No handler for drag type: ' + dragType + ' Using default foundry handler.');
                return super._onDragStart(event);
        }
    }

    async _effectDisable(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const effect = this.actor.effects.get(element.dataset.effectId);
        effect.update({disabled: true});
    }

    async _effectEnable(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const effect = this.actor.effects.get(element.dataset.effectId);
        effect.update({disabled: false});
    }

    async _effectDelete(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const effect = this.actor.effects.get(element.dataset.effectId);
        effect.delete();
    }

    async _effectEdit(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const effect = this.actor.effects.get(element.dataset.effectId);
        effect.sheet.render(true);
    }

    async _effectCreate(event) {
        event.preventDefault();
        return this.actor.createEmbeddedDocuments('ActiveEffect', [{
            label: 'New Effect',
            icon: 'icons/svg/aura.svg',
            origin: this.actor.uuid,
            disabled: true
        }], { renderSheet: true })
    }

}
