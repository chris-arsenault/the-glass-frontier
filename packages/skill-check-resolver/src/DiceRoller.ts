import type { SkillCheckRequest } from '@glass-frontier/dto';
import { randomInt } from 'node:crypto';

export type AdvantageMode = 'advantage' | 'keepDrop';

class DiceRoller {
  numDice = 2;
  dieSize = 6;
  mode: AdvantageMode = 'advantage';
  extraDice = 1;
  advantage: boolean;
  disadvantage: boolean;

  flags: string[];
  momentum: number;

  result: number;

  constructor(request: SkillCheckRequest) {
    this.flags = request.flags;
    this.momentum = request.character.momentum.current;
    this.advantage = this.shouldApplyAdvantage() && !this.shouldApplyDisadvantage();
    this.disadvantage = !this.shouldApplyAdvantage() && this.shouldApplyDisadvantage();
    this.result = -Infinity;
  }

  rollDice(extraDice = 0): number[] {
    return Array.from({ length: this.numDice + extraDice }, () => randomInt(1, this.dieSize + 1));
  }

  sum(dice: number[], modifier: number): number {
    return dice.reduce((a, b) => a + b, modifier);
  }

  computeResult(modifier: number): number {
    if (this.advantage) {
      if (this.mode === 'keepDrop') {
        const rolls = this.rollDice(this.extraDice);
        const sorted = [...rolls].sort((a, b) => b - a);
        const kept = sorted.slice(0, this.extraDice);
        this.result = this.sum(kept, modifier);
      } else {
        const first = this.sum(this.rollDice(), modifier);
        const second = this.sum(this.rollDice(), modifier);
        this.result = Math.max(first, second);
      }
    } else if (this.disadvantage) {
      if (this.mode === 'keepDrop') {
        const rolls = this.rollDice(this.extraDice);
        const sorted = [...rolls].sort((a, b) => b - a).reverse();
        const kept = sorted.slice(0, this.extraDice);
        this.result = this.sum(kept, modifier);
      } else {
        const first = this.sum(this.rollDice(), modifier);
        const second = this.sum(this.rollDice(), modifier);
        this.result = Math.min(first, second);
      }
    } else {
      this.result = this.sum(this.rollDice(), modifier);
    }

    return this.result;
  }

  shouldApplyAdvantage(): boolean {
    const creativeSpark = this.flags.includes('creative-spark') || this.flags.includes('advantage');
    return creativeSpark || this.momentum >= 2;
  }

  shouldApplyDisadvantage(): boolean {
    const reckless = this.flags.includes('disadvantage');
    return reckless || this.momentum <= -2;
  }
}

export { DiceRoller };
