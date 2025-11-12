"use strict";

import path from "path";

const scheduleId = "stage-deploy-tag7-tier1";

/**
 * Reminder configuration for the stage deploy tag 7 Tier 1 acknowledgement follow-ups.
 * Templates mirror docs/reports/stage-deploy-distribution-2025-11-05.md so message
 * content stays consistent between manual and automated execution.
 */
export {
  id: scheduleId,
  icsPath: path.join(
    "artifacts",
    "reminders",
    "stage-deploy-tag7-tier1-reminders-2025-11-05.ics"
  ),
  logPath: path.join(
    "artifacts",
    "reminders",
    "stage-deploy-tag7-tier1-reminders-execution.json"
  ),
  events: [
    {
      uid: "stage-deploy-tier1-reminder-20251105-0900@the-glass-frontier",
      label: "Tier 1 platform summary reminder",
      reminders: [
        {
          channelEnv: "SLACK_CHANNEL_TIER1_PLATFORM",
          fallbackChannel: "#tier1-platform",
          templateId: "tier1Summary"
        }
      ]
    },
    {
      uid: "stage-deploy-tier1-reminder-20251105-0905@the-glass-frontier",
      label: "Channel-specific follow-ups",
      reminders: [
        {
          channelEnv: "SLACK_CHANNEL_OFFLINE_PUBLISHING",
          fallbackChannel: "#offline-publishing",
          templateId: "offlinePublishing"
        },
        {
          channelEnv: "SLACK_CHANNEL_CLIENT_OVERLAYS",
          fallbackChannel: "#client-overlays",
          templateId: "clientOverlays"
        },
        {
          channelEnv: "SLACK_CHANNEL_HUB_CONTESTS",
          fallbackChannel: "#hub-contests",
          templateId: "hubContests"
        }
      ]
    },
    {
      uid: "stage-deploy-tier1-reminder-20251105-1200@the-glass-frontier",
      label: "Escalation checkpoint reminder",
      reminders: [
        {
          channelEnv: "SLACK_CHANNEL_TIER1_PLATFORM",
          fallbackChannel: "#tier1-platform",
          templateId: "escalation"
        }
      ]
    }
  ],
  templates: {
    tier1Summary:
      "Reminder: Stage deploy tag 7 confirmations are pending. Current status — Offline publishing, Client overlay, Hub telemetry: awaiting acknowledgement. Manifest: artifacts/docker/service-image-manifest.json. Summary: docs/reports/stage-deploy-2025-11-05.md. Please drop an ETA or confirmation so we can restart the CI rehearsal shortcut (npm run docker:publish:services + npm run docker:publish:temporal-worker).",
    offlinePublishing:
      "Quick ping to confirm the tag 7 manifest/report are connected to the storage replay run. Manifest: artifacts/docker/service-image-manifest.json. Summary: docs/reports/stage-deploy-2025-11-05.md. Please acknowledge so we can log the handoff and resume CI rehearsal.",
    clientOverlays:
      "Checking in on the tag 7 reruns for npm run run:stage-smoke / npm run run:stage-alerts. Manifest: artifacts/docker/service-image-manifest.json. Summary: docs/reports/stage-deploy-2025-11-05.md. Drop confirmation when the assets are staged.",
    hubContests:
      "Following up on the tag 7 telemetry rehearsal. Manifest: artifacts/docker/service-image-manifest.json. Summary: docs/reports/stage-deploy-2025-11-05.md. Please confirm once npm run monitor:contests is queued.",
    escalation:
      "Escalation checkpoint: Tier 1 confirmations for stage deploy tag 7 remain outstanding. Current log:\\n- Offline publishing — awaiting acknowledgement in #offline-publishing\\n- Client overlay — awaiting acknowledgement in #client-overlays\\n- Hub telemetry — awaiting acknowledgement in #hub-contests\\n\\nRequesting delegate coverage to close out confirmations so we can restart the CI rehearsal shortcut (npm run docker:publish:services + npm run docker:publish:temporal-worker)."
  }
};
