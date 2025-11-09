import {RandomUUIDOptions} from "node:crypto";
import { randomInt } from "node:crypto";
import {CheckRequest} from "./CheckRequest";

export type AdvantageMode =
  | "advantage"
  | "keepDrop"

class DiceRoller {
  numDice: number = 2;
  dieSize: number = 6;
  mode: AdvantageMode = "advantage";
  extraDice: number = 1;
  advantage: boolean;
  disadvantage: boolean;

  flags: string[];
  momentum: number;
  modifier: number;

  result: number;

  constructor(request: CheckRequest) {
    this.flags = request.flags;
    this.momentum = request.momentum;
    this.modifier = request.modifier;
    this.advantage = this.shouldApplyAdvantage() && !this.shouldApplyDisadvantage();
    this.disadvantage = !this.shouldApplyAdvantage() && this.shouldApplyDisadvantage();
    this.result = -Infinity;
  }

  rollDice(extraDice: number = 0): number[] {
     return Array.from({ length: this.numDice + extraDice }, () => randomInt(1, this.dieSize + 1));
  }

  sum(dice: number[]): number {
    return dice.reduce((a, b) => a + b, this.modifier)
  }

  computeResult(): number {
    if (this.advantage) {
      if (this.mode === "keepDrop") {
        const rolls = this.rollDice(this.extraDice);
        const sorted = [...rolls].sort((a, b) => b - a);
        const kept = sorted.slice(0, this.extraDice);
        this.result = this.sum(kept);
      } else {
        const first = this.sum(this.rollDice());
        const second = this.sum(this.rollDice());
        this.result = Math.max(first, second)
      }
    } else if (this.disadvantage) {
      if (this.mode === "keepDrop") {
        const rolls = this.rollDice(this.extraDice);
        const sorted = [...rolls].sort((a, b) => b - a).reverse();
        const kept = sorted.slice(0, this.extraDice);
        this.result = this.sum(kept);
      } else {
        const first = this.sum(this.rollDice());
        const second = this.sum(this.rollDice());
        this.result = Math.min(first, second)
      }
    } else {
      this.result = this.sum(this.rollDice())
    }

    return this.result;
  }

  shouldApplyAdvantage() {
    const creativeSpark = this.flags.includes("creative-spark") || this.flags.includes("advantage");
    return creativeSpark || this.momentum >= 2;
  }

  shouldApplyDisadvantage() {
    const reckless = this.flags.includes("disadvantage");
    return reckless || this.momentum <= -2;
  }
}

export { DiceRoller }



