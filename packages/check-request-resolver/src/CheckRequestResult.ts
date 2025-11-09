import {DiceRoller} from "./DiceRoller";
import {OutcomeTier} from "./mechanics";
import {CheckRequest} from "./CheckRequest";

class CheckRequestResult {
  sessionId: string = "";
  checkId: string = "";
  totalModifier: number = 0;
  advantage: boolean = false;
  disadvantage: boolean = false;
  dieSum: number = 0;
  margin: number = 0;
  outcomeTier: OutcomeTier = "stall";
  newMomentum: number = 0;
  initialized: boolean = false;

  constructor() {
  }

  static fromCheck(request: CheckRequest, roller: DiceRoller, margin: number, outcomeTier: OutcomeTier, newMomentum: number): CheckRequestResult {
    let r = new CheckRequestResult();
    r.sessionId =  request.sessionId;
    r.checkId = request.checkId;
    r.totalModifier = roller.modifier;
    r.advantage = roller.advantage;
    r.disadvantage = roller.disadvantage
    r.dieSum = roller.result;
    r.margin = margin;
    r.outcomeTier = outcomeTier;
    r.newMomentum = newMomentum
    r.initialized = true;
    return r;
  }

  static fromWire(  sessionId: string,  checkId: string,  totalModifier: number,  advantage: boolean,  disadvantage: boolean,  dieSum: number,  margin: number,  outcomeTier: OutcomeTier,  newMomentum: number): CheckRequestResult {
    let r = new CheckRequestResult();
    r.sessionId =  sessionId;
    r.checkId = checkId;
    r.totalModifier = totalModifier;
    r.advantage = advantage;
    r.disadvantage = disadvantage
    r.dieSum = dieSum;
    r.margin = margin;
    r.outcomeTier = outcomeTier;
    r.newMomentum = newMomentum;
    r.initialized = true;
    return r;
  }

  serialize(): Record<string, any> {
    return {
      sessionId: this.sessionId,
      checkId: this.checkId,
      totalModifier: this.totalModifier,
      advantage: this.advantage,
      disadvantage: this.disadvantage,
      dieSum: this.dieSum,
      margin: this.margin,
      outcomeTier: this.outcomeTier,
      newMomentum: this.newMomentum,
    }
  }
}
export { CheckRequestResult }