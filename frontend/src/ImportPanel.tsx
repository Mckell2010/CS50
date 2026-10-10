import { useState, useEffect, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  Download,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  X,
  History,
  RefreshCw,
  Link2,
  ChevronDown,
  Check,
} from "lucide-react";
import { api, type RecordData } from "./types";
export async function downloadWorkbook(kind: string) {
  const { accessToken } = await import("./auth");
  const token = await accessToken();
  const r = await fetch("/api/workbooks/" + kind, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) throw new Error("Download not authorized");
  const blob = await r.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `divergent-${kind}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export default function ImportPanel({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [mode, setMode] = useState("incremental"),
    [preview, setPreview] = useState<RecordData | null>(null),
    [mapping, setMapping] = useState<Record<string, Record<string, string>>>(
      {},
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(""),
    [ack, setAck] = useState(false),
    [confirmDeactivate, setConfirmDeactivate] = useState(false),
    [confirmConflicts, setConfirmConflicts] = useState(false),
    [history, setHistory] = useState<RecordData[]>([]),
    [integration, setIntegration] = useState<RecordData | null>(null),
    [tab, setTab] = useState("upload");
  const input = useRef<HTMLInputElement>(null);
  const loadHistory = () =>
    api("/imports")
      .then(setHistory)
      .catch((e) => setError(e.message));
  useEffect(() => {
    loadHistory();
    api("/integration")
      .then(setIntegration)
      .catch((e) => setError(e.message));
  }, []);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setDone("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const resetPreview = () => {
    setPreview(null);
    setAck(false);
    setConfirmDeactivate(false);
    setConfirmConflicts(false);
  };
  const choose = (f: File) => {
    setFile(f);
    setMapping({});
    resetPreview();
    setError("");
  };
  const analyze = () =>
    run(async () => {
      if (!file) return;
      const body = new FormData();
      body.append("file", file);
      body.append("mode", mode);
      body.append("mapping", JSON.stringify(mapping));
      setPreview(await api("/imports/preview", { method: "POST", body }));
      setAck(false);
      setConfirmDeactivate(false);
      setConfirmConflicts(false);
    });
  const commit = () =>
    run(async () => {
      const r = await api(`/imports/${preview!.id}/commit`, {
        method: "POST",
        body: JSON.stringify({
          acknowledgeWarnings: ack,
          confirmDeactivations: confirmDeactivate,
          confirmConflicts,
        }),
      });
      setDone(`Import complete. ${r.changes} changes saved atomically.`);
      setPreview(null);
      setFile(null);
      loadHistory();
      onImported();
    });
  const restore = (id: string) =>
    run(async () => {
      setPreview(
        await api(`/imports/${id}/restore-preview`, { method: "POST" }),
      );
      setTab("upload");
      setFile(null);
      setAck(false);
      setConfirmConflicts(false);
    });
  const counts: Record<string, number> = {};
  preview?.changes.forEach(
    (c: RecordData) => (counts[c.kind] = (counts[c.kind] || 0) + 1),
  );
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">YOUR SOURCE OF TRUTH</span>
            <h2 id="import-title">Bring your organization to life</h2>
            <p>One workbook. A connected view of your people and plans.</p>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close import"
          >
            <X />
          </button>
        </header>
        <div className="modal-tabs">
          <button
            className={tab === "upload" ? "active" : ""}
            onClick={() => setTab("upload")}
          >
            <Upload size={15} />
            Import workbook
          </button>
          <button
            className={tab === "history" ? "active" : ""}
            onClick={() => setTab("history")}
          >
            <History size={15} />
            Import history
          </button>
          <button
            className={tab === "integration" ? "active" : ""}
            onClick={() => setTab("integration")}
          >
            <Link2 size={15} />
            SharePoint
          </button>
        </div>
        <div className="modal-body">
          {error && (
            <div className="notice error" role="alert">
              <AlertTriangle size={18} />
              {error}
            </div>
          )}
          {done && (
            <div className="notice success" role="status">
              <CheckCircle2 size={18} />
              {done}
            </div>
          )}
          {tab === "upload" && (
            <>
              <div className="download-cards">
                <button onClick={() => run(() => downloadWorkbook("template"))}>
                  <FileSpreadsheet size={23} />
                  <span>
                    <strong>Start with our template</strong>
                    <small>Six sheets, ready for your data</small>
                  </span>
                  <Download size={16} />
                </button>
                <button onClick={() => run(() => downloadWorkbook("sample"))}>
                  <FileSpreadsheet size={23} />
                  <span>
                    <strong>Explore a sample workbook</strong>
                    <small>30 people · clearly synthetic data</small>
                  </span>
                  <Download size={16} />
                </button>
              </div>
              <div
                className="dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files[0]) choose(e.dataTransfer.files[0]);
                }}
              >
                <div className="upload-mark">
                  <Upload size={26} />
                </div>
                <h3>{file ? file.name : "Drop your Excel workbook here"}</h3>
                <p>
                  .xlsx only · maximum 10 MB · your active data stays safe until
                  you confirm
                </p>
                <button
                  className="secondary"
                  onClick={() => input.current?.click()}
                >
                  Choose workbook
                </button>
                <input
                  ref={input}
                  type="file"
                  accept=".xlsx"
                  aria-label="Choose Excel workbook"
                  onChange={(e) =>
                    e.target.files?.[0] && choose(e.target.files[0])
                  }
                  hidden
                />
              </div>
              <div className="import-options">
                <label>
                  Import policy
                  <select
                    value={mode}
                    onChange={(e) => {
                      setMode(e.target.value);
                      resetPreview();
                    }}
                  >
                    <option value="incremental">
                      Incremental — preserve omitted employees
                    </option>
                    <option value="snapshot">
                      Full snapshot — review missing employees for deactivation
                    </option>
                  </select>
                </label>
                <button
                  className="primary"
                  disabled={!file || busy}
                  onClick={analyze}
                >
                  {busy
                    ? "Checking workbook…"
                    : preview
                      ? "Recheck mapping"
                      : "Preview changes"}
                  <ArrowRight size={16} />
                </button>
              </div>
              <p className="fine-print">
                Excel manages employee records. App-owned units, allocations,
                and OKRs are preserved. Annual pay is already adjusted for
                contracted FTE.
              </p>
              {preview && (
                <div className="preview-section">
                  <div className="section-heading">
                    <h3>Review before importing</h3>
                    <span className="badge">{preview.filename}</span>
                  </div>
                  <div className="preview-counts">
                    {["addition", "update", "deactivation"].map((k) => (
                      <div key={k}>
                        <strong>{counts[k] || 0}</strong>
                        <span>{k}s</span>
                      </div>
                    ))}
                    <div>
                      <strong>
                        {
                          preview.changes.filter(
                            (c: RecordData) => c.reportingChange,
                          ).length
                        }
                      </strong>
                      <span>reporting changes</span>
                    </div>
                    <div>
                      <strong>
                        {
                          preview.changes.filter((c: RecordData) => c.unitMove)
                            .length
                        }
                      </strong>
                      <span>unit moves</span>
                    </div>
                  </div>
                  <details className="mapping">
                    <summary>
                      Map workbook columns <ChevronDown size={14} />
                    </summary>
                    <p>
                      Choose an existing header for each field, then recheck the
                      workbook.
                    </p>
                    {Object.entries(preview.headers).map(([sheet, headers]) => (
                      <fieldset key={sheet}>
                        <legend>{sheet}</legend>
                        <div className="mapping-grid">
                          {preview.columns[sheet].map((field: string) => (
                            <label key={field}>
                              {field}
                              <select
                                value={
                                  mapping[sheet]?.[field] ||
                                  ((headers as string[]).includes(field) &&
                                    field) ||
                                  ""
                                }
                                onChange={(e) => {
                                  setMapping((m) => ({
                                    ...m,
                                    [sheet]: {
                                      ...m[sheet],
                                      [field]: e.target.value,
                                    },
                                  }));
                                  setPreview((p) =>
                                    p ? { ...p, mappingChanged: true } : p,
                                  );
                                }}
                              >
                                <option value="">Unmapped</option>
                                {(headers as string[]).map((h, i) => (
                                  <option key={i} value={h}>
                                    {h}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ))}
                  </details>
                  {preview.errors.length > 0 && (
                    <div className="validation-errors">
                      <h4>{preview.errors.length} validation issues</h4>
                      {preview.errors
                        .slice(0, 30)
                        .map((e: RecordData, i: number) => (
                          <p key={i}>
                            <strong>
                              {e.sheet} · row {e.row || "—"} · {e.field}
                            </strong>
                            {e.message}
                          </p>
                        ))}
                    </div>
                  )}
                  {preview.changes.length > 0 && (
                    <details>
                      <summary>
                        Show change details ({preview.changes.length})
                      </summary>
                      <div className="change-list">
                        {preview.changes
                          .slice(0, 100)
                          .map((c: RecordData, i: number) => (
                            <p key={i}>
                              {c.sheet} / {c.id}{" "}
                              <span className="badge">{c.kind}</span>{" "}
                              {c.reportingChange ? "Reporting change " : ""}
                              {c.unitMove ? "Unit move" : ""}
                            </p>
                          ))}
                      </div>
                    </details>
                  )}
                  {preview.warnings.length > 0 && (
                    <div className="notice warning">
                      <div>
                        {preview.warnings.map((w: string) => (
                          <p key={w}>{w}</p>
                        ))}
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={ack}
                            onChange={(e) => setAck(e.target.checked)}
                          />
                          I reviewed these warnings, including any additional
                          roots.
                        </label>
                      </div>
                    </div>
                  )}
                  {preview.conflicts.length > 0 && (
                    <div className="notice warning">
                      <div>
                        <strong>
                          {preview.conflicts.length} app-owned records conflict
                          with workbook values.
                        </strong>
                        <p>
                          These workbook changes will be skipped. Resolve
                          differences in the planning editor; ownership stays
                          with the app.
                        </p>
                        <details>
                          <summary>Review conflicts</summary>
                          {preview.conflicts.map((c: RecordData, i: number) => (
                            <p key={i}>
                              {c.sheet} / {c.id}: {c.message}
                            </p>
                          ))}
                        </details>
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={confirmConflicts}
                            onChange={(e) =>
                              setConfirmConflicts(e.target.checked)
                            }
                          />
                          Preserve app-owned records and skip these conflicting
                          rows.
                        </label>
                      </div>
                    </div>
                  )}
                  {counts.deactivation > 0 && (
                    <label className="checkbox notice warning">
                      <input
                        type="checkbox"
                        checked={confirmDeactivate}
                        onChange={(e) => setConfirmDeactivate(e.target.checked)}
                      />
                      Confirm deactivation of {counts.deactivation} employees
                      missing from this full snapshot.
                    </label>
                  )}
                  <div className="preview-footer">
                    <span>
                      <CheckCircle2 size={15} />
                      All changes apply together, or none do.
                    </span>
                    <button
                      className="primary"
                      onClick={commit}
                      disabled={
                        busy ||
                        preview.mappingChanged ||
                        preview.errors.length > 0 ||
                        (preview.warnings.length > 0 && !ack) ||
                        (preview.conflicts.length > 0 && !confirmConflicts) ||
                        (counts.deactivation > 0 && !confirmDeactivate)
                      }
                    >
                      <Check size={16} />
                      Confirm import
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {tab === "history" && (
            <div className="history-list">
              <h3>A traceable history of every import</h3>
              <p>
                Restoring creates a new incremental preview. Current app-owned
                plans are preserved.
              </p>
              {history.length === 0 ? (
                <div className="empty-state">
                  <History />
                  <h3>No workbook imports yet</h3>
                  <p>
                    Your sample dataset is ready to explore. Completed imports
                    will appear here.
                  </p>
                </div>
              ) : (
                history.map((h) => (
                  <div className="history-row" key={h.id}>
                    <FileSpreadsheet size={22} />
                    <div>
                      <strong>{h.filename}</strong>
                      <small>
                        {new Date(h.at).toLocaleString()} · {h.summary.changes}{" "}
                        changes
                      </small>
                    </div>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => restore(h.id)}
                    >
                      Preview restore
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
          {tab === "integration" && (
            <div className="integration-panel">
              <div className="integration-icon">
                <Link2 size={30} />
              </div>
              <h3>Connect your shared workbook</h3>
              <p>
                Refresh from SharePoint or OneDrive through Microsoft Graph.
                Changed workbooks enter the same validation and administrator
                review flow.
              </p>
              <span
                className={`status-pill ${integration?.configured ? "on-track" : "not-started"}`}
              >
                {integration?.configured ? "Configured" : "Not configured"}
              </span>
              <dl>
                <dt>Refresh policy</dt>
                <dd>Review every changed workbook before applying it</dd>
                <dt>Polling interval</dt>
                <dd>{integration?.pollSeconds || 300} seconds</dd>
                <dt>Source workbook</dt>
                <dd>{integration?.status?.sourceFile || "Not selected"}</dd>
                <dt>Last checked</dt>
                <dd>
                  {integration?.status?.lastChecked
                    ? new Date(integration.status.lastChecked).toLocaleString()
                    : "Never"}
                </dd>
                <dt>Last successful refresh</dt>
                <dd>
                  {integration?.status?.lastSuccessfulRefresh
                    ? new Date(
                        integration.status.lastSuccessfulRefresh,
                      ).toLocaleString()
                    : "Never"}
                </dd>
                <dt>State</dt>
                <dd>
                  {integration?.status?.state || "Awaiting configuration"}
                </dd>
              </dl>
              {integration?.status?.error && (
                <p className="notice error">{integration.status.error}</p>
              )}
              {integration?.configured ? (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api("/integration/refresh", { method: "POST" });
                      setIntegration(await api("/integration"));
                    })
                  }
                >
                  <RefreshCw size={16} />
                  Check for changes
                </button>
              ) : (
                <p className="notice">
                  IT setup is documented in <code>docs/deployment.md</code>. No
                  connection is simulated.
                </p>
              )}
              {integration?.status?.previewId && (
                <button
                  className="secondary"
                  onClick={() =>
                    run(async () => {
                      setPreview(
                        await api(
                          `/imports/${integration.status.previewId}/preview`,
                        ),
                      );
                      setTab("upload");
                    })
                  }
                >
                  Review pending workbook
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
