"use strict";

function narrativeWeaverNode(context) {
  const { intent, session, checkRequest } = context;

  const narration = buildNarration(intent, session, checkRequest);

  return {
    ...context,
    narrativeEvent: {
      type: "session.message",
      sessionId: session.sessionId,
      role: "gm",
      content: narration,
      markers: createMarkers(intent, checkRequest, session)
    }
  };
}

function buildNarration(intent, session, checkRequest) {
  const base = [
    `The relay hall hums as ${session.character.name} advances.`,
    describeIntent(intent)
  ];

  if (checkRequest) {
    base.push(
      `A ${checkRequest.data.move} check is required (${checkRequest.data.difficulty}, ${checkRequest.data.ability}).`
    );
  }


  if (typeof session?.momentum?.current === "number") {
    base.push(`Momentum currently rests at ${session.momentum.current}.`);
  }

  return base.join(" ");
}

function describeIntent(intent) {
  if (!intent) {
    return "Silence hangs in the air, awaiting the next move.";
  }

  switch (intent.inferredTone) {
    case "aggressive":
      return "You brace for confrontation, sparks flickering against your cloak.";
    case "stealth":
      return "You melt into shifting shadows, searching for unseen paths.";
    case "diplomatic":
      return "Words weigh heavier than weapons as you extend an open palm.";
    default:
      return "Your intentions ripple outward, inviting the frontier to answer.";
  }
}

function createMarkers(intent, checkRequest, session) {
  const markers = [
    {
      type: "session.marker",
      marker: "narrative-beat",
      tone: intent?.inferredTone || "neutral"
    }
  ];

  if (checkRequest) {
    markers.push({
      type: "session.marker",
      marker: "check-requested",
      move: checkRequest.data.move,
      ability: checkRequest.data.ability
    });

    if (typeof checkRequest.data.momentum === "number") {
      markers.push({
        type: "session.marker",
        marker: "momentum-snapshot",
        value: checkRequest.data.momentum
      });
    }
  }

  if (typeof session?.momentum?.current === "number") {
    markers.push({
      type: "session.marker",
      marker: "momentum-state",
      value: session.momentum.current
    });
  }

  return markers;
}

module.exports = {
  narrativeWeaverNode
};
