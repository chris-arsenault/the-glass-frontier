'use strict'

import {BaseDTO, WireRecord} from "./BaseDTO";
import { dtoTypeMap } from "./typeMap"

class Envelope {
  dtos: BaseDTO[] = [];

  queue(o: BaseDTO): void {
    this.dtos.push(o);
  }

  serialize():  Record<string, WireRecord[]> {
    let envelope: Record<string, WireRecord[]> = {}
    this.dtos.forEach((dto: BaseDTO) => {
      if (!envelope[dto.type]) {
        envelope[dto.type] = []
      }
      envelope[dto.type].push(dto.serialize())
    })
    return envelope;
  }

  static deserialize(resBody:  Record<string, WireRecord[]>): Envelope {
    let e = new Envelope();
    for (const key in resBody) {
      const t = dtoTypeMap[key];
      resBody[key].forEach((r: WireRecord) => {
        e.queue(t.deserialize(r))
      })
    }
    return e;
  }
}

export { Envelope }