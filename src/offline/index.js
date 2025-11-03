"use strict";

const delta = require("./delta/worldDeltaQueue");
const { extractEntities } = require("./entityExtraction/entityExtractor");
const { getDefaultLexicon } = require("./entityExtraction/lexicon");
const publishing = require("./publishing");

module.exports = {
  delta,
  entityExtraction: {
    extractEntities,
    getDefaultLexicon
  },
  publishing
};
