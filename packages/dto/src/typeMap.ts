import {NarrativeEvent} from "./NarrativeEvent";

const dtoTypeMap: Record<string, any> = {
  [NarrativeEvent.typeKey]: NarrativeEvent,
}

export { dtoTypeMap }