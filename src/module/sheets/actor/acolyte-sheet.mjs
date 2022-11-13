import { toggleUIExpanded } from '../../rules/config.mjs';
import { ActorContainerSheet } from './actor-container-sheet.mjs';
import { DHBasicActionManager } from '../../actions/basic-action-manager.mjs';

export class AcolyteSheet extends ActorContainerSheet {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            template: 'systems/dark-heresy-2nd/templates/actor/actor-sheet.hbs',
            width: 1000,
            height: 750,
            resizable: true,
            tabs: [{ navSelector: '.dh-navigation', contentSelector: '.dh-body', initial: 'main' }],
        });
    }

    get template() {
        return `systems/dark-heresy-2nd/templates/actor/actor-${this.actor.type}-sheet.hbs`;
    }

    getData() {
        const context = super.getData();
        context.dh = CONFIG.dh;
        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find('.roll-characteristic').click(async (ev) => await this._prepareRollCharacteristic(ev));
        html.find('.roll-skill').click(async (ev) => await this._prepareRollSkill(ev));
        html.find('.acolyte-homeWorld').change((ev) => this._onHomeworldChange(ev));
        html.find('.bonus-vocalize').click(async (ev) => await this._onBonusVocalize(ev));
        html.find('.actor-drag').each((i, item) => {
            if (item.dataset && item.dataset.itemId) {
                item.setAttribute('draggable', true);
                item.addEventListener('dragstart', this._onActorDragStart.bind(this), false);
            }
        });
    }

    async _onBonusVocalize(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        let bonus = this.actor.backgroundEffects.abilities.find(a => a.name === div.data('bonusName'));
        if(bonus) {
            await DHBasicActionManager.sendItemVocalizeChat({
                actor: this.actor.name,
                name: bonus.name,
                type: bonus.source,
                description: bonus.benefit
            });
        }
    }

    async _onActorDragStart(event) {
        event.stopPropagation();
        console.log('_onActorDragStart', event)
        const element = event.currentTarget;
        if (!element.dataset?.itemType) {
            console.warn('No Drag Type - Cancelling Drag');
            return;
        }

        // Create drag data
        const dragType = element.dataset.itemType;
        const dragData = {
            actorId: this.actor.id,
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
                console.warn('No handler for drag type: ' + dragType + ' Using default foundry handler.');
                return super._onDragStart(event);
        }
    }

    async _prepareRollCharacteristic(event) {
        event.preventDefault();
        const characteristicName = $(event.currentTarget).data('characteristic');
        await this.actor.rollCharacteristic(characteristicName);
    }

    async _prepareRollSkill(event) {
        event.preventDefault();
        const skillName = $(event.currentTarget).data('skill');
        const specialtyName = $(event.currentTarget).data('specialty');
        await this.actor.rollSkill(skillName, specialtyName);
    }

    async _sheetControlHideToggle(event) {
        event.preventDefault();
        const displayToggle = $(event.currentTarget);
        $('span:first', displayToggle).toggleClass('active');
        const target = displayToggle.data('toggle');
        $('.' + target).toggle();
        toggleUIExpanded(target);
    }

    _onHomeworldChange(event) {
        event.preventDefault();
        Dialog.confirm({
            title: 'Roll Characteristics?',
            content: '<p>Would you like to roll Wounds and Fate for this homeworld?</p>',
            yes: async () => {
                // Roll Wounds
                let woundRoll = new Roll(this.actor.backgroundEffects.homeworld.wounds);
                await woundRoll.evaluate({ async: true });
                this.actor.wounds.max = woundRoll.total;

                // Roll Fate
                let fateRoll = new Roll('1d10');
                await fateRoll.evaluate({ async: true });
                this.actor.fate.max =
                    parseInt(this.actor.backgroundEffects.homeworld.fate_threshold) +
                    (fateRoll.total >= this.actor.backgroundEffects.homeworld.emperors_blessing ? 1 : 0);
                this.render(true);
            },
            no: () => {
            },
            defaultYes: false,
        });
    }
}
