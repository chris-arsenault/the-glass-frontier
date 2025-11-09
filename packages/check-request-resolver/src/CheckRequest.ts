import {Attribute, ATTRIBUTE_TIER_MODIFIER, Character, RiskLevel, SKILL_TIER_MODIFIER} from "./mechanics";
import {randomUUID} from "node:crypto";

interface CheckRequestInput {
  flags: string[];
  attribute: Attribute;
  skill: string;
  character: Character;
  sessionId: string;
  riskLevel: RiskLevel;
}

class CheckRequest {
  flags: string[];
  momentum: number;
  modifier: number;
  sessionId: string;
  checkId: string;
  riskLevel: RiskLevel;

  constructor(req: CheckRequestInput) {
    this.flags = req.flags;
    this.sessionId = req.sessionId;
    this.momentum = req.character.momentum;
    this.riskLevel = req.riskLevel;
    this.checkId = randomUUID();
    this.modifier = this.computeModifier(req);
  }

  computeModifier(req: CheckRequestInput): number {
    const skillModifier = SKILL_TIER_MODIFIER[req.character.skills[req.skill]];
    const attributeModifier = ATTRIBUTE_TIER_MODIFIER[req.character.attributes[req.attribute]];
    return skillModifier + attributeModifier + req.character.momentum;
  }
}

export { CheckRequest, CheckRequestInput }