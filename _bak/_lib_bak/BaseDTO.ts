"use strict";

import {NarrativeEventWire} from "./NarrativeEvent";
import {CheckResultWire} from "./CheckResult";

abstract class BaseDTO {
  type: string = "";

  protected constructor(type: string) {
    this.type = type
  }

  abstract serialize(): WireRecord;

  static deserialize(data: WireRecord) {
    throw new Error("Use subclass deserialize.")
  }

  validate() {
    if (!this.type) {
      throw new Error("Envelope must have a type");
    }
    return true;
  }
}

type WireRecord = NarrativeEventWire | CheckResultWire;

export { BaseDTO, WireRecord };
