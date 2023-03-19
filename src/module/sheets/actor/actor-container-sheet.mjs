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
    }

    _onDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        game.dh.log('Actor _onDrop', event);

        try {
            const data = JSON.parse(event.dataTransfer.getData('text/plain'));
            if (data.type === 'Item' || data.type === 'item') {
                game.dh.log('Checking if item already exists', data);
                // Check if Item already Exists
                if (this.actor.items.find((i) => i._id === data?.data?._id)) {
                    game.dh.log('Item already exists on Actor -- ignoring');
                    return false;
                } else {
                    return super._onDrop(event);
                }
            }
        } catch (err) {
            game.dh.log('Actor Container | drop error', err);
            return false;
        }
    }

    async _addSpecialistSkill(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        const specialistSkill = div.data('skill');
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
        const div = $(event.currentTarget);
        await this.actor.damageItem(div.data('itemId'));
    }

    async _onItemRoll(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        await this.actor.rollItem(div.data('itemId'));
    }

    async _onItemCreate(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        let data = {
            name: `New ${div.data('type').capitalize()}`,
            type: div.data('type'),
        };
        await this.actor.createEmbeddedDocuments('Item', [data], { renderSheet: true });
    }

    _onItemEdit(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        let item = this.actor.items.get(div.data('itemId'));
        item.sheet.render(true);
    }

    _onItemDelete(event) {
        event.preventDefault();
        Dialog.confirm({
            title: 'Confirm Delete',
            content: '<p>Are you sure you would like to delete this?</p>',
            yes: () => {
                const div = $(event.currentTarget);
                this.actor.deleteEmbeddedDocuments('Item', [div.data('itemId')]);
                div.slideUp(200, () => this.render(false));
            },
            no: () => {},
            defaultYes: false,
        });
    }

    async _onItemVocalize(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        let item = this.actor.items.get(div.data('itemId'));
        await DHBasicActionManager.sendItemVocalizeChat({
            actor: this.actor.name,
            name: item.name,
            type: item.type?.toUpperCase(),
            description: await TextEditor.enrichHTML(item.system.benefit ?? item.system.description, {rollData: {actor: this.actor, item: this, pr: this.actor.psy.rating}}),
        });
    }

    /**
     * Generic Sheet Hide/Show option for all embedded fields
     */
    async _sheetControlHideToggle(event) {
        event.preventDefault();
        const displayToggle = $(event.currentTarget);
        $('span:first', displayToggle).toggleClass('active');
        const target = displayToggle.data('toggle');
        $('.' + target).toggle();
        toggleUIExpanded(target);
    }

    async _onItemDragStart(event) {
        event.stopPropagation();
        game.dh.log('Actor:_onItemDragStart', event);

        const element = event.currentTarget;
        if (!element.dataset?.itemId) {
            game.dh.warn('No Item Id - Cancelling Drag');
            return;
        }

        const itemId = element.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) {
            // Cannot find item on actor? Just let foundry handle it...
            game.dh.log('Default Foundry Handler');
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
        const displayToggle = $(event.currentTarget);
        $('span:first', displayToggle).toggleClass('active');
        const target = displayToggle.data('toggle');
        $('.' + target).toggle();
        toggleUIExpanded(target);
    }


    async _onActorDragStart(event) {
        event.stopPropagation();
        game.dh.log('_onActorDragStart', event);
        const element = event.currentTarget;
        if (!element.dataset?.itemType) {
            game.dh.warn('No Drag Type - Cancelling Drag');
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
                if (element.dataset.speciality) {
                    const speciality = skill.specialities[element.dataset.speciality];
                    name = `${name}: ${speciality.label}`;
                }
                dragData.data = {
                    name,
                    skill: element.dataset.itemId,
                    speciality: element.dataset.speciality,
                };
                event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
                return;
            default:
                // Let default Foundry handler deal with default drag cases.
                game.dh.warn('No handler for drag type: ' + dragType + ' Using default foundry handler.');
                return super._onDragStart(event);
        }
    }

    async _effectDisable(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        const effect = this.actor.effects.get(div.data('effectId'));
        effect.update({disabled: true});
    }

    async _effectEnable(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        const effect = this.actor.effects.get(div.data('effectId'));
        effect.update({disabled: false});
    }

    async _effectDelete(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        const effect = this.actor.effects.get(div.data('effectId'));
        effect.delete();
    }

    async _effectEdit(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        const effect = this.actor.effects.get(div.data('effectId'));
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
