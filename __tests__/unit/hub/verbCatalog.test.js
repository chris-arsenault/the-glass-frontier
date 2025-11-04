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

  test("contested verbs expose contest metadata", () => {
    const catalogPath = path.join(
      __dirname,
      "../../../src/hub/config/defaultVerbCatalog.json"
    );
    const catalog = VerbCatalog.fromFile(catalogPath);
    const sparring = catalog.get("verb.sparringMatch");
    const clash = catalog.get("verb.clashOfWills");

    expect(sparring).toBeDefined();
    expect(sparring.contest).toMatchObject({
      label: "Sparring Match",
      roles: expect.objectContaining({
        initiator: "challenger",
        target: "partner"
      }),
      moderationTags: expect.arrayContaining(["hub-pvp", "consent-required"]),
      sharedComplicationTags: expect.arrayContaining(["hub", "training"])
    });

    expect(clash).toBeDefined();
    expect(clash.contest).toMatchObject({
      label: "Clash of Wills",
      roles: expect.objectContaining({
        initiator: "instigator",
        target: "resistor"
      }),
      moderationTags: expect.arrayContaining(["hub-pvp", "rhetoric"]),
      sharedComplicationTags: expect.arrayContaining(["influence"])
    });
  });

  test("throws on duplicate verb definitions", () => {
    const first = normalizeVerbDefinition({ verbId: "verb.one" });
    const second = normalizeVerbDefinition({ verbId: "verb.one" });
    expect(() => new VerbCatalog([first, second])).toThrow(HubValidationError);
  });
});
