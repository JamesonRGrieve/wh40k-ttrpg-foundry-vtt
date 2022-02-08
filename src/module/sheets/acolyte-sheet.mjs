import {toggleUIExpanded} from "../helpers/config.mjs";

export class AcolyteSheet extends ActorSheet {

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      template: "systems/dark-heresy-2nd/templates/actor/actor-sheet.hbs",
      width: 1000,
      height: 750,
      resizable: true,
      tabs: [{ navSelector: ".dh-navigation", contentSelector: ".dh-body", initial: "main" }]
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
    html.find('.roll-characteristic').click(async ev => await this._prepareRollCharacteristic(ev));
    html.find('.sheet-control__hide-control').click(async ev => await this._sheetControlHideToggle(ev));
    html.find('.item-edit').click(ev => this._onItemEdit(ev));
  }

  async _prepareRollCharacteristic(event) {
    event.preventDefault();
    const characteristicName = $(event.currentTarget).data("characteristic");
    const characteristic = this.actor.characteristics[characteristicName];
    // const rollData = {
    //   name: characteristic.label,
    //   baseTarget: characteristic.total,
    //   modifier: 0
    // };
    // await prepareCommonRoll(rollData);
  }

  async _sheetControlHideToggle(event) {
    event.preventDefault();
    const displayToggle = $(event.currentTarget);
    $('span:first', displayToggle).toggleClass('active');
    const target = displayToggle.data("toggle");
    $('.' + target).toggle();
    toggleUIExpanded(target)
  }

  _onItemEdit(event) {
    event.preventDefault();
    const div = $(event.currentTarget);
    let item = this.actor.items.get(div.data("itemId"));
    item.sheet.render(true);
  }

}
