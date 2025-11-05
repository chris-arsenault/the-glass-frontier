"use strict";

const { main } = require("./reminderRunner");

main(process.argv).catch((error) => {
  console.error(`[tier1-reminders] ${error.message}`);
  process.exitCode = 1;
});
