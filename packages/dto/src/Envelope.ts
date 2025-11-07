'use strict'

import {BaseDTO} from "./BaseDTO";
import {NarrationEvent} from "./NarrationEvent";

const dtoTypeMap = {
  "narration.event": NarrationEvent,
}

class Envelope {
  dtos: BaseDTO[] = [];

  queue(o: BaseDTO): void {
    this.dtos.push(o);
  }
  serialize(): string {
    let envelope = {}
    this.dtos.forEach((dto: BaseDTO) => {
      if (!envelope[dto.type]) {
        envelope[dto.type] = []
      }
      envelope[dto.type].push(dto.serialize())
    })
    return JSON.stringify(envelope)
  }
  static deserialize(resBody: string): Envelope {
    let e = new Envelope();
    const j = JSON.parse(resBody);
    for (const key in j) {
      const t = dtoTypeMap[key];
      j[key].forEach(str => {
        e.queue(t.serialize(str))
      })
    }
    return e;
  }
}

export { Envelope }