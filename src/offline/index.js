"use strict";

const delta = require("./delta/worldDeltaQueue");
const { extractEntities } = require("./entityExtraction/entityExtractor");
const { getDefaultLexicon } = require("./entityExtraction/lexicon");
const publishing = require("./publishing");
const storyConsolidation = require("./storyConsolidation");
const { SessionClosureCoordinator } = require("./sessionClosureCoordinator");
const { ClosureWorkflowOrchestrator } = require("./closureWorkflowOrchestrator");

module.exports = {
  delta,
  entityExtraction: {
    extractEntities,
    getDefaultLexicon
  },
  publishing,
  storyConsolidation,
  closure: {
    SessionClosureCoordinator,
    ClosureWorkflowOrchestrator
  }
};
