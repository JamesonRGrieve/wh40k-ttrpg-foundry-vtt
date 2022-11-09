import { RateOfFireModel } from './rate-of-fire-model.mjs';


export class AttackModel {

  constructor(data) {
    this.range = data.range;
    this.attackType = data.attackType;
    this.attackBonus = Number(data.attackBonus);
    this.rateOfFire = new RateOfFireModel(data.rateOfFire);
  }

}
