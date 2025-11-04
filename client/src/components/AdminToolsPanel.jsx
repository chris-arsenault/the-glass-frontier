import { useState } from "react";
import { AdminVerbCatalogPanel } from "./AdminVerbCatalogPanel.jsx";
import { ModerationDashboard } from "./ModerationDashboard.jsx";

export function AdminToolsPanel() {
  const [activeTab, setActiveTab] = useState("moderation");

  return (
    <div className="admin-tools-panel">
      <div className="admin-tools-tabs" role="tablist" aria-label="Admin tools navigation">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "moderation"}
          className={`admin-tools-tab${activeTab === "moderation" ? " admin-tools-tab-active" : ""}`}
          onClick={() => setActiveTab("moderation")}
          data-testid="admin-tab-moderation"
        >
          Moderation Dashboard
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "catalog"}
          className={`admin-tools-tab${activeTab === "catalog" ? " admin-tools-tab-active" : ""}`}
          onClick={() => setActiveTab("catalog")}
          data-testid="admin-tab-catalog"
        >
          Verb Catalog
        </button>
      </div>
      <div className="admin-tools-content" role="tabpanel">
        {activeTab === "moderation" ? <ModerationDashboard /> : <AdminVerbCatalogPanel />}
      </div>
    </div>
  );
}
