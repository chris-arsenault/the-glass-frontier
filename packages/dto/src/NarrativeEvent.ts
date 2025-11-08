"use strict";

import {BaseDTO, WireRecord} from "./BaseDTO";

type NarrativeEventWire = {
  type: string
  messageId: string
  role: string
  content: string
  speaker: string
  playerId: string
}

class NarrativeEvent extends BaseDTO {
  static typeKey = "narrative.event";
  messageId: string
  role: string
  content: string
  speaker: string
  playerId: string

  constructor(data: NarrativeEventWire) {
    super(NarrativeEvent.typeKey)

    this.role = data.role;
    this.messageId = data.messageId
    this.content = data.content || "";
    this.speaker = data.speaker;
    this.playerId = data.playerId || "";
  }

  serialize(): NarrativeEventWire {
    return {
      type: this.type,
      messageId: this.messageId,
      role: this.role,
      content: this.content,
      speaker: this.speaker,
      playerId: this.playerId
    };
  }

  static deserialize(data: NarrativeEventWire): NarrativeEvent {
    return new NarrativeEvent(data);
  }

  validate() {
    super.validate();

    if (!this.content) {
      throw new Error("NarrationEvent must have content");
    }

    return true;
  }
}

export { NarrativeEvent, NarrativeEventWire };
