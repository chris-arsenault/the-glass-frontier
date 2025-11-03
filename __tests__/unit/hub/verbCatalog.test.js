"use strict";

const path = require("path");
const { VerbCatalog, normalizeVerbDefinition } = require("../../../src/hub/verbCatalog");
const { HubValidationError } = require("../../../src/hub/commandErrors");

describe("VerbCatalog", () => {
  test("loads default catalog and exposes verbs", () => {
    const catalogPath = path.join(
      __dirname,
      "../../../src/hub/config/defaultVerbCatalog.json"
    );
    const catalog = VerbCatalog.fromFile(catalogPath);
    const say = catalog.get("verb.say");
    expect(say).toBeDefined();
    expect(say.parameters[0]).toMatchObject({ name: "message", required: true });
    expect(catalog.get("verb.invokeRelic").capabilities).toHaveLength(1);
  });

  test("throws on duplicate verb definitions", () => {
    const first = normalizeVerbDefinition({ verbId: "verb.one" });
    const second = normalizeVerbDefinition({ verbId: "verb.one" });
    expect(() => new VerbCatalog([first, second])).toThrow(HubValidationError);
  });
});
