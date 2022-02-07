export class AcolyteSheet extends ActorSheet {

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      template: "systems/dark-heresy-2nd/templates/actor/actor-sheet.hbs",
      width: 1100,
      height: 600,
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
    console.log('click?');
    const displayToggle = $(event.currentTarget);
    $('span:first', displayToggle).toggleClass('active');
    const target = displayToggle.data("toggle");
    $('.' + target).toggle();
  }

}
