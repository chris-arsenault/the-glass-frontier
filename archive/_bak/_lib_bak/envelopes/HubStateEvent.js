"use strict";

import { BaseEnvelope } from "./BaseEnvelope.js";

/**
 * Envelope for hub state updates
 * Corresponds to: hub.stateSnapshot, hub.stateUpdate
 */
class HubStateEvent extends BaseEnvelope {
  constructor(data) {
    super(data.type || "hub.stateUpdate", data, {
      id: data.id,
      markers: data.markers,
      turnSequence: data.turnSequence
    });

    this.hubId = data.hubId || null;
    this.roomId = data.roomId || null;
    this.version = typeof data.version === "number" ? data.version : 0;
    this.state = data.state ? { ...data.state } : {};
    this.contests = this._normalizeContests(data.state?.contests || []);
  }

  _normalizeContests(contests) {
    if (!Array.isArray(contests)) {
      return [];
    }

    return contests.map(contest => {
      const normalized = { ...contest };

      if (contest.outcome && typeof contest.outcome === "object") {
        normalized.outcome = { ...contest.outcome };
      }

      if (Array.isArray(contest.sharedComplications)) {
        normalized.sharedComplications = contest.sharedComplications.map(c => ({ ...c }));
      } else {
        normalized.sharedComplications = [];
      }

      if (Array.isArray(contest.participants)) {
        normalized.participants = contest.participants.map(p => ({
          ...p,
          result: p.result && typeof p.result === "object" ? { ...p.result } : p.result || null
        }));
      } else {
        normalized.participants = [];
      }

      if (Array.isArray(contest.moderationTags)) {
        normalized.moderationTags = [...contest.moderationTags];
      } else {
        normalized.moderationTags = [];
      }

      if (Array.isArray(contest.sharedComplicationTags)) {
        normalized.sharedComplicationTags = [...contest.sharedComplicationTags];
      } else {
        normalized.sharedComplicationTags = [];
      }

      return normalized;
    });
  }

  serialize() {
    const envelope = {
      type: this.type,
      hubId: this.hubId,
      roomId: this.roomId,
      version: this.version,
      state: {
        ...this.state,
        contests: this.contests
      }
    };

    if (this.markers && this.markers.length > 0) {
      envelope.markers = this.markers;
    }

    return envelope;
  }

  static deserialize(data) {
    return new HubStateEvent(data);
  }

  static snapshot(hubId, roomId, state, version) {
    return new HubStateEvent({
      type: "hub.stateSnapshot",
      hubId,
      roomId,
      state,
      version
    });
  }

  validate() {
    super.validate();

    if (!this.hubId) {
      throw new Error("HubStateEvent must have a hubId");
    }

    if (!this.roomId) {
      throw new Error("HubStateEvent must have a roomId");
    }

    return true;
  }
}

export { HubStateEvent };
