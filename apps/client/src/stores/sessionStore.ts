import { create } from "zustand"
import {createJSONStorage, persist} from "zustand/middleware"

import {SessionState} from "../state/sessionState";
import {Envelope} from "../../../lib/dto/Envelope";
import {NarrationEvent} from "../../../lib/dto/NarrationEvent";


function updateState(set, incoming) {
  const e = Envelope.deserialize(incoming);
  e.dtos.forEach((dto) => {
    switch (dto.type) {
      case NarrationEvent.type:
        set((state) => {
          const oldEvents = {...state.narrationEvents}
          const newEvents = Array.from([oldEvents, dto])
          return { narrationEvents: newEvents }
        });
    }
  })
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessionId: "demo-session",
      narrationEvents: [],
      receiveEnvelope: (incoming) => updateState(set, incoming),
    }),
    {
      name: "glass-session",
      storage: createJSONStorage(() => sessionStorage)
    }
  )
)