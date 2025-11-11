"use strict";

import { classifySentiment, inferTone  } from "../../../_src_bak/utils/sentiment.js";

describe("sentiment utilities", () => {
  test("classifies sentiment based on keyword heuristics", () => {
    expect(classifySentiment("This rematch is hype, let's go!")).toBe("positive");
    expect(classifySentiment("Annoying cooldown, this is rough")).toBe("negative");
    expect(classifySentiment("The duel fizzled, maybe later")).toBe("neutral");
  });

  test("infers tone buckets from text cues", () => {
    expect(inferTone("We charge forward and strike hard")).toBe("aggressive");
    expect(inferTone("Let's parley and negotiate terms")).toBe("diplomatic");
    expect(inferTone("We slip quietly into the base")).toBe("stealth");
    expect(inferTone("That was hilarious, joking aside")).toBe("playful");
    expect(inferTone("We regroup near the hub entrance")).toBe("narrative");
  });
});
