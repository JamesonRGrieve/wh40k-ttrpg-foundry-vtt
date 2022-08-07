import { RateOfFireModel } from './rate_of_fire_model.mjs';


export class AttackModel {

  constructor(data) {
    this.range = data.range;
    this.attackType = data.attackType;
    this.attackBonus = Number(data.attackBonus);
    this.rateOfFire = new RateOfFireModel(data.rateOfFire);
  }

}
