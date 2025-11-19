import {GraphContext} from "../types";
import {isNonEmptyString, log} from "@glass-frontier/utils";
import {Character, Chronicle, LocationPlan } from "@glass-frontier/dto";
import { LocationGraphStore, WorldStateStore} from "@glass-frontier/persistence";
import {createUpdatedBeats} from "./beatUpdater";
import {createLocationPlan} from "./locationUpdater";
import {createUpdatedInventory} from "./inventoryUpdater";
import {createUpdatedCharacter} from "./characterUpdater";


export class WorldUpdater {
  #worldStateStore: WorldStateStore;
  #locationGraphStore: LocationGraphStore;

  constructor(options: {worldStateStore: WorldStateStore, locationGraphStore: LocationGraphStore}) {
    this.#worldStateStore = options.worldStateStore;
    this.#locationGraphStore = options.locationGraphStore;
  }

  async update(context: GraphContext): Promise<GraphContext> {
    if (context.failure) {
      return;
    }

    context = this.#updateCharacter(context);
    context = this.#updateInventory(context);
    context = this.#updateBeats(context);
    const locationPlan = await createLocationPlan(context);

    await this.#saveCharacter(context.chronicleState.character);
    await this.#saveChronicle(context.chronicleState.chronicle);
    context = await this.#saveLocation(context, locationPlan);
    console.log(context)

    return context;
  }

  #updateCharacter(context: GraphContext): GraphContext {
    log("info", "Updating Character");
    if (!context.inventoryDelta || context.inventoryDelta?.ops.length == 0) {
      return context;
    }

    const updatedCharacter = createUpdatedCharacter(context);
    return {
      ...context,
      chronicleState: {
        ...context.chronicleState,
        character: updatedCharacter
      }
    }
  }

  #updateInventory(context: GraphContext): GraphContext {
    log("info", "Updating Inventory");
    if (!context.inventoryDelta || context.inventoryDelta?.ops.length == 0) {
      return context;
    }

    const newInventory = createUpdatedInventory(context);
    return {
      ...context,
      chronicleState: {
        ...context.chronicleState,
        character: {
          ...context.chronicleState.character,
          inventory: newInventory,
        },
      }
    }
  }

  #updateBeats(context: GraphContext): GraphContext {
    log("info", "Updating Beats");
    const newBeats = createUpdatedBeats(context);

    return {
      ...context,
      chronicleState: {
        ...context.chronicleState,
        chronicle: {
          ...context.chronicleState.chronicle,
          beats: newBeats
        }
      }
    }
  }

  async #saveCharacter(character: Character): Promise<void> {
    try {
      await this.#worldStateStore.upsertCharacter(character);
    } catch (error) {
      log("error", "Error in saving character", error);
    }
  }

  async #saveChronicle(chronicle: Chronicle): Promise<void> {
    try {
      await this.#worldStateStore.upsertChronicle(chronicle);
    } catch (error) {
      log("error", "Error in saving chronicle", error);
    }
  }

  async #saveLocation(context: GraphContext, plan: LocationPlan): Promise<GraphContext> {
    const characterId = context.chronicleState.character?.id;
    const locationId = context.chronicleState.chronicle.locationId;
    if (!isNonEmptyString(characterId) || !isNonEmptyString(locationId)) {
      return;
    }
    try {
      await this.#locationGraphStore.applyPlan({
        characterId,
        locationId,
        plan,
      });
      const summary = await this.#locationGraphStore.summarizeCharacterLocation({
        characterId,
        locationId,
      });

      if (!summary) {
        return context;
      }

      return {
      ...context,
        chronicleState: {
        ...context.chronicleState,
          location: summary
        }
      }
    } catch (error) {
      log("error", "Error in saving location", error);
    }
  }
}