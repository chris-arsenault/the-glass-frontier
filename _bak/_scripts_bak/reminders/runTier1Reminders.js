"use strict";

import { main  } from "./reminderRunner.js";

main(process.argv).catch((error) => {
  console.error(`[tier1-reminders] ${error.message}`);
  process.exitCode = 1;
});
