"use strict";

const { composeSceneFramePrompt } = require("../../prompts");

const sceneFrameNode = {
  id: "scene-frame",
  execute(context) {
    const session = context.session || {};
    const prompt = composeSceneFramePrompt({ session });

    const sceneFrame = {
      prompt,
      location: session.location || null,
      character: session.character || null,
      momentum: session.momentum || null
    };

    const promptPackets = [...(context.promptPackets || []), { type: "scene-frame", prompt }];

    return {
      ...context,
      sceneFrame,
      promptPackets
    };
  }
};

module.exports = {
  sceneFrameNode
};
