import { create } from "zustand"
import {createJSONStorage, persist} from "zustand/middleware"

import {SessionState} from "../state/sessionState";
import {Turn} from "@glass-frontier/dto";


function updateState(set, incoming) {
  const turn: Turn = { ...incoming }
   set((state) => {
    const oldTurns = {...state.turns}
    const newTurns = Array.from([oldTurns, turn])
    return { turns: newTurns }
  });
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessionId: "demo-session",
      turns: [],
      receiveTurn: (incoming) => updateState(set, incoming),
    }),
    {
      name: "glass-session",
      storage: createJSONStorage(() => sessionStorage)
    }
  )
)