"use strict";

function clamp(value, min, max) {
  if (typeof value !== "number") {
    return value;
  }

  if (typeof min === "number" && value < min) {
    return min;
  }

  if (typeof max === "number" && value > max) {
    return max;
  }

  return value;
}

export {
  clamp
};
