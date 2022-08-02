import { toggleUIExpanded } from '../helpers/config.mjs';

export class AcolyteSheet extends ActorSheet {
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
    return `systems/dark-heresy-2nd/templates/actor/actor-${this.actor.data.type}-sheet.hbs`;
  }

  getData() {
    const context = super.getData();
    context.data = context.data.data;
    context.dh = CONFIG.dh;
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('.roll-characteristic').click(async (ev) => await this._prepareRollCharacteristic(ev));
    html.find('.roll-skill').click(async (ev) => await this._prepareRollSkill(ev));
    html.find('.sheet-control__hide-control').click(async (ev) => await this._sheetControlHideToggle(ev));
    html.find('.item-create').click((ev) => this._onItemCreate(ev));
    html.find('.item-edit').click((ev) => this._onItemEdit(ev));
    html.find('.item-delete').click((ev) => this._onItemDelete(ev));
    html.find('.acolyte-homeWorld').change((ev) => this._onHomeworldChange(ev));
    this._addDragSupportToItems(html);
  }

  _addDragSupportToItems(html) {
    html.find('.table-row').each((i, item) => {
      if (item.dataset && item.dataset.itemId) {
        item.setAttribute('draggable', true);
        item.addEventListener('dragstart', this._onDragStart.bind(this), false);
      }
    });
    html.find('.roll-characteristic').each((i, item) => {
      if (item.dataset && item.dataset.itemId) {
        item.setAttribute('draggable', true);
        item.addEventListener('dragstart', this._onDragStart.bind(this), false);
      }
    });
  }

  async _onDragStart(event) {
    // Create drag data
    const dragData = {
      actorId: this.actor.id,
      sceneId: this.actor.isToken ? canvas.scene?.id : null,
      tokenId: this.actor.isToken ? this.actor.token?.id : null,
      type: '',
      data: {},
    };

    const element = event.currentTarget;
    switch (element.dataset.itemType) {
      case 'characteristic':
        dragData.type = 'Characteristic';
        const characteristic = this.actor.characteristics[element.dataset.itemId];
        dragData.data = {
          name: characteristic.label,
          characteristic: element.dataset.itemId,
        };
        event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
        return;
      case 'skill':
        dragData.type = 'Skill';
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
        return super._onDragStart(event);
    }
  }

  async _prepareRollCharacteristic(event) {
    event.preventDefault();
    console.log('_prepareRollCharacteristic');
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
    let d = Dialog.confirm({
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
      no: () => {},
      defaultYes: false,
    });
  }

  _onItemEdit(event) {
    event.preventDefault();
    const div = $(event.currentTarget);
    let item = this.actor.items.get(div.data('itemId'));
    item.sheet.render(true);
  }

  _onItemDelete(event) {
    event.preventDefault();
    let d = Dialog.confirm({
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

  _onItemCreate(event) {
    event.preventDefault();
    const div = $(event.currentTarget);
    let data = {
      name: `New ${div.data('type').capitalize()}`,
      type: div.data('type'),
    };
    this.actor.createEmbeddedDocuments('Item', [data], { renderSheet: true });
  }
}
