import { useEffect } from "react";
import type { PromptTemplateId } from "@glass-frontier/dto";
import { useShallow } from "zustand/react/shallow";
import { useUiStore } from "../stores/uiStore";
import { useTemplateStore } from "../stores/templateStore";
import { useChronicleStore } from "../stores/chronicleStore";

export function TemplateDrawer() {
  const isOpen = useUiStore((state) => state.isTemplateDrawerOpen);
  const close = useUiStore((state) => state.closeTemplateDrawer);
  const loginId = useChronicleStore((state) => state.loginId);
  const {
    summaries,
    selectedTemplateId,
    detail,
    draft,
    isLoading,
    isSaving,
    isDirty,
    error,
    loadSummaries,
    selectTemplate,
    updateDraft,
    saveTemplate,
    revertTemplate,
    reset
  } = useTemplateStore(
    useShallow((state) => ({
      summaries: state.summaries,
      selectedTemplateId: state.selectedTemplateId,
      detail: state.detail,
      draft: state.draft,
      isLoading: state.isLoading,
      isSaving: state.isSaving,
      isDirty: state.isDirty,
      error: state.error,
      loadSummaries: state.loadSummaries,
      selectTemplate: state.selectTemplate,
      updateDraft: state.updateDraft,
      saveTemplate: state.saveTemplate,
      revertTemplate: state.revertTemplate,
      reset: state.reset
    }))
  );

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        close();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [isOpen, close]);

  useEffect(() => {
    if (isOpen && loginId) {
      void loadSummaries(loginId);
    }
    if (!isOpen) {
      reset();
    }
  }, [isOpen, loginId, loadSummaries, reset]);

  const handleSelect = (nodeId: PromptTemplateId) => {
    if (loginId) {
      void selectTemplate(nodeId, loginId);
    }
  };

  const handleSave = () => {
    if (loginId) {
      void saveTemplate(loginId).then(() => loadSummaries(loginId));
    }
  };

  const handleRevert = () => {
    if (loginId) {
      void revertTemplate(loginId).then(() => loadSummaries(loginId));
    }
  };

  const templateList = Object.values(summaries).sort((a, b) => a.label.localeCompare(b.label));
  const activeSource = detail?.activeSource === "player" ? "Player Override" : "System Default";

  return (
    <>
      <div
        className={`template-drawer-backdrop ${isOpen ? "open" : ""}`}
        onClick={close}
        aria-hidden="true"
      />
      <div className={`template-drawer ${isOpen ? "open" : ""}`} aria-hidden={!isOpen}>
        <button type="button" className="template-drawer-close" onClick={close} aria-label="Close template editor">
          ×
        </button>
        <div className="template-drawer-layout">
          <aside className="template-list">
            <header className="template-list-header">
              <p className="template-list-title">Prompt Templates</p>
              <p className="template-list-subtitle">Customize the narrative rules per node.</p>
            </header>
            <div className="template-list-body" role="tablist" aria-label="Templates">
              {isLoading && templateList.length === 0 ? <p className="template-empty">Loading templates…</p> : null}
              {!isLoading && templateList.length === 0 ? (
                <p className="template-empty">No templates available.</p>
              ) : null}
              {templateList.map((entry) => (
                <button
                  key={entry.nodeId}
                  type="button"
                  className={`template-list-item${selectedTemplateId === entry.nodeId ? " active" : ""}`}
                  onClick={() => handleSelect(entry.nodeId)}
                >
                  <span className="template-list-label">{entry.label}</span>
                  <span className="template-list-meta">{entry.activeSource === "player" ? "Override" : "Default"}</span>
                </button>
              ))}
            </div>
            <div className="template-note">Variant library support is coming soon; overrides currently track a single custom copy.</div>
          </aside>
          <section className="template-editor">
            {detail ? (
              <>
                <header className="template-editor-header">
                  <div>
                    <h2 className="template-editor-title">{detail.label}</h2>
                    <p className="template-editor-description">{detail.description}</p>
                  </div>
                  <div className="template-editor-status">
                    <span className={`template-badge ${detail.activeSource === "player" ? "badge-override" : ""}`}>{activeSource}</span>
                    <span className="template-updated">Updated {new Date(detail.updatedAt).toLocaleString()}</span>
                  </div>
                </header>
                <label className="template-editor-label" htmlFor="template-rules">
                  Rules & Description Block
                </label>
                <textarea
                  id="template-rules"
                  className="template-editor-textarea"
                  value={draft}
                  onChange={(event) => updateDraft(event.target.value)}
                  disabled={isSaving}
                  rows={18}
                />
                {error ? <p className="template-error">{error}</p> : null}
                <div className="template-editor-actions">
                  <button
                    type="button"
                    className="template-button secondary"
                    onClick={handleRevert}
                    disabled={isSaving || (!isDirty && detail.activeSource === "official")}
                  >
                    Revert to Default
                  </button>
                  <button
                    type="button"
                    className="template-button primary"
                    onClick={handleSave}
                    disabled={!isDirty || isSaving}
                  >
                    {isSaving ? "Saving…" : "Save Custom Template"}
                  </button>
                </div>
              </>
            ) : (
              <div className="template-placeholder">
                {isLoading ? <p>Loading template details…</p> : <p>Select a template to edit its rules.</p>}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
