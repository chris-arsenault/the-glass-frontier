import {log, toSnakeCase} from "@glass-frontier/utils";
import {GraphContext} from "@glass-frontier/gm-api/types";
import {ChronicleBeat} from "@glass-frontier/dto";

export function createUpdatedBeats(context: GraphContext): ChronicleBeat[] {
  const {  beatTracker } = context;
  const now = Date.now();
  if (!beatTracker) {
    return context.chronicleState.chronicle.beats;
  }

  const working = structuredClone(context.chronicleState.chronicle.beats);
  if (beatTracker.newBeat) {
    const newId = toSnakeCase(beatTracker.newBeat.title)
    const slug = `beat_${newId}_${context.turnId.slice(0, 8)}`;
    const existingBeat = working.find(f => f.id === newId);
    if (existingBeat) {
      log("warn", `Found existing beat for new beat ${existingBeat.id}`);
    } else {
      working.push({
        id: toSnakeCase(beatTracker.newBeat.title),
        slug,
        title: beatTracker.newBeat.title,
        description: beatTracker.newBeat.description,
        status: "in_progress",
        createdAt: now,
        updatedAt: now,
      },)
    }
  }

  beatTracker.updates.forEach(b => {
    const upd: number = working.findIndex((u) => u.id  === b.beatId);
    if (upd === -1) {
      log("warn", `Got update for non-existent beat ${b.beatId}`);
      return;
    }
    working[upd].updatedAt = now;
    working[upd].status =  b.status ?? working[upd].status;
    working[upd].description = b.description ?? working[upd].description;
  })

  return working;
}