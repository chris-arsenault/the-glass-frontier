import { useCallback, useEffect, useMemo, useState } from "react";
import { useSessionContext } from "../context/SessionContext.jsx";

const EMPTY_STATE = {
  verbs: [],
  versionStamp: null
};

const DEFAULT_DEFINITION = {
  verbId: "verb.custom",
  label: "Custom Verb",
  description: "Describe the new hub action.",
  parameters: [],
  safetyTags: [],
  rateLimit: {
    burst: 5,
    perSeconds: 10,
    scope: "actor"
  },
  narrative: {
    escalation: "auto"
  }
};

export function AdminVerbCatalogPanel() {
  const { isAdmin, adminHubId, adminUser, hubCatalog, setHubCatalog } = useSessionContext();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formVerbId, setFormVerbId] = useState("verb.custom");
  const [formStatus, setFormStatus] = useState("draft");
  const [formAuditRef, setFormAuditRef] = useState("");
  const [formDefinition, setFormDefinition] = useState(
    JSON.stringify(DEFAULT_DEFINITION, null, 2)
  );
  const [editingVerbId, setEditingVerbId] = useState(null);

  const hubId = adminHubId || "global";

  const catalog = hubCatalog || EMPTY_STATE;

  const hasVerbs = Array.isArray(catalog.verbs) && catalog.verbs.length > 0;

  const fetchHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      "X-Admin-User": adminUser
    }),
    [adminUser]
  );

  const loadCatalog = useCallback(async () => {
    if (!isAdmin) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/admin/hubs/${encodeURIComponent(hubId)}/verbs`, {
        headers: fetchHeaders
      });
      if (!response.ok) {
        throw new Error(`Failed to load catalog (${response.status})`);
      }
      const data = await response.json();
      setHubCatalog(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fetchHeaders, hubId, isAdmin, setHubCatalog]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    loadCatalog();
  }, [isAdmin, loadCatalog]);

  useEffect(() => {
    if (!isAdmin || typeof window === "undefined" || typeof window.EventSource !== "function") {
      return undefined;
    }

    const url = `/admin/hubs/${encodeURIComponent(hubId)}/catalog/stream?adminUser=${encodeURIComponent(
      adminUser
    )}`;
    const source = new EventSource(url);

    const handleSync = (event) => {
      try {
        const payload = JSON.parse(event.data);
        setHubCatalog(payload);
      } catch (err) {
        setError(`Stream error: ${err.message}`);
      }
    };

    const handleUpdated = (event) => {
      try {
        const payload = JSON.parse(event.data);
        setHubCatalog((current) => {
          if (!current) {
            return current;
          }
          if (hubId && payload.hubId && payload.hubId !== (hubId === "global" ? null : hubId)) {
            return current;
          }
          return {
            ...current,
            versionStamp: payload.versionStamp,
            verbs: Array.isArray(payload.verbs) ? payload.verbs : current.verbs
          };
        });
      } catch (err) {
        setError(`Stream update error: ${err.message}`);
      }
    };

    source.addEventListener("catalog.sync", handleSync);
    source.addEventListener("catalog.updated", handleUpdated);
    source.onerror = () => {
      setError("Catalog stream disconnected.");
    };

    return () => {
      source.removeEventListener("catalog.sync", handleSync);
      source.removeEventListener("catalog.updated", handleUpdated);
      source.close();
    };
  }, [adminUser, hubId, isAdmin, setHubCatalog]);

  const handleSelectVerb = useCallback((verb) => {
    setEditingVerbId(verb.verbId);
    setFormVerbId(verb.verbId);
    setFormStatus(verb.status || "draft");
    setFormAuditRef(verb.auditRef || "");
    setFormDefinition(JSON.stringify(verb.definition, null, 2));
  }, []);

  const resetForm = useCallback(() => {
    setEditingVerbId(null);
    setFormVerbId("verb.custom");
    setFormStatus("draft");
    setFormAuditRef("");
    setFormDefinition(JSON.stringify(DEFAULT_DEFINITION, null, 2));
  }, []);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      setError(null);

      let parsed;
      try {
        parsed = JSON.parse(formDefinition);
      } catch (err) {
        setError(`Definition must be valid JSON (${err.message})`);
        return;
      }

      if (!parsed.verbId) {
        parsed.verbId = formVerbId;
      }

      try {
        const mode = editingVerbId ? "PUT" : "POST";
        const targetVerbId = editingVerbId || formVerbId;
        const endpoint = editingVerbId
          ? `/admin/hubs/${encodeURIComponent(hubId)}/verbs/${encodeURIComponent(targetVerbId)}`
          : `/admin/hubs/${encodeURIComponent(hubId)}/verbs`;

        const response = await fetch(endpoint, {
          method: mode,
          headers: fetchHeaders,
          body: JSON.stringify({
            definition: parsed,
            status: formStatus,
            auditRef: formAuditRef || null,
            moderationTags: parsed.moderationTags || []
          })
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || `Request failed (${response.status})`);
        }

        const data = await response.json();
        setHubCatalog(data);
        resetForm();
      } catch (err) {
        setError(err.message);
      }
    },
    [editingVerbId, fetchHeaders, formAuditRef, formDefinition, formStatus, formVerbId, hubId, resetForm, setHubCatalog]
  );

  const withVerbAction = useCallback(
    async (verbId, action) => {
      setError(null);
      try {
        const response = await fetch(
          `/admin/hubs/${encodeURIComponent(hubId)}/verbs/${encodeURIComponent(verbId)}/${action}`,
          {
            method: "POST",
            headers: fetchHeaders,
            body: JSON.stringify({ auditRef: `${action}-${Date.now()}` })
          }
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || `Failed to ${action} verb`);
        }

        const data = await response.json();
        setHubCatalog(data);
      } catch (err) {
        setError(err.message);
      }
    },
    [fetchHeaders, hubId, setHubCatalog]
  );

  const handlePublish = useCallback((verbId) => withVerbAction(verbId, "publish"), [withVerbAction]);
  const handleDeprecate = useCallback(
    (verbId) => withVerbAction(verbId, "deprecate"),
    [withVerbAction]
  );

  if (!isAdmin) {
    return null;
  }

  return (
    <section className="overlay-card overlay-admin" aria-labelledby="admin-verb-catalog-heading">
      <header className="overlay-card-header">
        <div>
          <h2 id="admin-verb-catalog-heading">Hub Verb Catalog</h2>
          <p className="overlay-subheading">Hub: {hubId}</p>
        </div>
        <div className="overlay-meta-group">
          <span className="overlay-meta">Version {catalog.versionStamp || "n/a"}</span>
          <button type="button" className="overlay-button" onClick={loadCatalog} disabled={loading}>
            {loading ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </header>
      {error ? (
        <p className="overlay-alert" role="alert">
          {error}
        </p>
      ) : null}
      <div className="overlay-table-container">
        {hasVerbs ? (
          <table className="overlay-table" aria-label="Verb catalog">
            <thead>
              <tr>
                <th scope="col">Verb</th>
                <th scope="col">Status</th>
                <th scope="col">Version</th>
                <th scope="col">Updated</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {catalog.verbs.map((verb) => (
                <tr key={`${verb.verbId}:${verb.version}`}>
                  <td>
                    <button
                      type="button"
                      className="overlay-link-button"
                      onClick={() => handleSelectVerb(verb)}
                    >
                      {verb.verbId}
                    </button>
                  </td>
                  <td>{verb.status}</td>
                  <td>{verb.version}</td>
                  <td>{verb.updatedAt ? new Date(verb.updatedAt).toLocaleString() : "—"}</td>
                  <td className="overlay-table-actions">
                    <button type="button" onClick={() => handlePublish(verb.verbId)}>
                      Publish
                    </button>
                    <button type="button" onClick={() => handleDeprecate(verb.verbId)}>
                      Deprecate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="overlay-muted">No verbs registered for this hub.</p>
        )}
      </div>
      <form className="overlay-form" onSubmit={handleSubmit}>
        <fieldset>
          <legend>{editingVerbId ? `Edit ${editingVerbId}` : "Create Verb"}</legend>
          <label className="overlay-form-label">
            Verb ID
            <input
              type="text"
              value={formVerbId}
              onChange={(event) => setFormVerbId(event.target.value)}
              required
            />
          </label>
          <label className="overlay-form-label">
            Status
            <select value={formStatus} onChange={(event) => setFormStatus(event.target.value)}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
            </select>
          </label>
          <label className="overlay-form-label">
            Audit Reference
            <input
              type="text"
              value={formAuditRef}
              onChange={(event) => setFormAuditRef(event.target.value)}
              placeholder="Change ticket or ADR reference"
            />
          </label>
          <label className="overlay-form-label">
            Definition (JSON)
            <textarea
              value={formDefinition}
              onChange={(event) => setFormDefinition(event.target.value)}
              rows={10}
              spellCheck="false"
            />
          </label>
        </fieldset>
        <div className="overlay-form-actions">
          <button type="submit">{editingVerbId ? "Save Version" : "Create Verb"}</button>
          <button type="button" onClick={resetForm}>
            Reset
          </button>
        </div>
      </form>
    </section>
  );
}
