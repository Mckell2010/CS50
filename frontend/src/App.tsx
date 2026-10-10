import { useState, useEffect, useMemo, useCallback } from "react";
import {
  GitBranch,
  Users,
  Building2,
  Target,
  Wallet,
  Search,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  Upload,
  Plus,
  Focus,
  MapPin,
  BriefcaseBusiness,
  LockKeyhole,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  History,
  SlidersHorizontal,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  X,
  Download,
  Settings2,
  Info,
  Leaf,
  LogIn,
} from "lucide-react";
import OrgChart, { colorFor } from "./OrgChart";
import ImportPanel, { downloadWorkbook } from "./ImportPanel";
import Editor from "./Editor";
import ModelPage from "./ModelPage";
import CompanyAllocationView from "./CompanyAllocation";
import {
  api,
  money,
  initials,
  type Organization,
  type Session,
  type Person,
  type Unit,
  type RecordData,
} from "./types";

const today = () => new Date().toISOString().slice(0, 10);
const uid = (prefix: string) => prefix + "-" + crypto.randomUUID().slice(0, 8);
const remembered = () => {
  try {
    return JSON.parse(localStorage.getItem("divergent-view") || "{}");
  } catch {
    return {};
  }
};
export default function App() {
  const [session, setSession] = useState<Session | null>(null),
    [data, setData] = useState<Organization | null>(null),
    [error, setError] = useState(""),
    [page, setPage] = useState("organization"),
    [view, setView] = useState<"people" | "units">(
      remembered().view || "people",
    ),
    [selected, setSelected] = useState(remembered().selected || "001"),
    [expanded, setExpanded] = useState<Set<string>>(
      new Set(remembered().expanded || []),
    ),
    [overlay, setOverlay] = useState(remembered().overlay || "headcount"),
    [query, setQuery] = useState(""),
    [focus, setFocus] = useState(""),
    [searchTarget, setSearchTarget] = useState(""),
    [searchNonce, setSearchNonce] = useState(0),
    [showPanel, setShowPanel] = useState(true),
    [importOpen, setImportOpen] = useState(false),
    [editor, setEditor] = useState<{
      sheet: string;
      record: RecordData;
    } | null>(null),
    [audit, setAudit] = useState<RecordData[] | null>(null),
    [settingsOpen, setSettingsOpen] = useState(false),
    [asOf, setAsOf] = useState(today()),
    [currency, setCurrency] = useState("USD"),
    [loading, setLoading] = useState(true),
    [toast, setToast] = useState("");
  const [comp, setComp] = useState<RecordData[] | null>(null),
    [rootChoice, setRootChoice] = useState("");
  const notify = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(""), 4000);
  };
  const reload = useCallback(async () => {
    try {
      const s = await api("/session");
      setSession(s);
      const d = await api(
        `/organization?as_of=${s.role === "owner" ? today() : asOf}&currency=${s.role === "owner" ? "USD" : currency}`,
      );
      setData(d);
      setError("");
      setRootChoice(d.rootEmployee);
      setLoading(false);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }, [asOf, currency]);
  useEffect(() => {
    reload();
  }, [reload]);
  useEffect(() => {
    localStorage.setItem(
      "divergent-view",
      JSON.stringify({ view, selected, expanded: [...expanded], overlay }),
    );
  }, [view, selected, expanded, overlay]);
  useEffect(() => {
    if (!data) return;
    const rows = view === "people" ? data.employees : data.units;
    const key = view === "people" ? "EmployeeID" : "OrgUnitID";
    if (!rows.some((r) => r[key] === selected)) {
      setSelected("");
      if (selected)
        notify("The previous selection is no longer available in this scope.");
    }
  }, [data, view]);
  useEffect(() => {
    setComp(null);
  }, [selected, session?.role]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setImportOpen(false);
        setEditor(null);
        setAudit(null);
        setSettingsOpen(false);
        setQuery("");
      }
      if (e.key === "Tab") {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return;
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ),
        ).filter((el) => el.getClientRects().length > 0);
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (!dialog.contains(document.activeElement)) {
          e.preventDefault();
          first?.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (!(importOpen || editor || audit || settingsOpen)) return;
    const previous = document.activeElement as HTMLElement;
    const timer = setTimeout(
      () =>
        document.querySelector<HTMLElement>('[role="dialog"] button')?.focus(),
      30,
    );
    return () => {
      clearTimeout(timer);
      previous?.focus();
    };
  }, [importOpen, editor, audit, settingsOpen]);
  const switchRole = async (role: string) => {
    try {
      await api("/dev-session", {
        method: "POST",
        body: JSON.stringify({ role }),
      });
      setFocus("");
      setQuery("");
      setSelected("");
      setAudit(null);
      setEditor(null);
      setImportOpen(false);
      if (role === "owner") {
        setAsOf(today());
        setCurrency("USD");
      }
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const unitFor = (id: string) => data?.units.find((u) => u.OrgUnitID === id);
  const rootUnit = data?.units.find((u) => !u.ParentOrgUnitID)?.OrgUnitID || "";
  const person = data?.employees.find((e) => e.EmployeeID === selected);
  const unit = data?.units.find(
    (u) => u.OrgUnitID === (view === "people" ? person?.OrgUnitID : selected),
  );
  const selectedRecord = view === "people" ? person : unit;
  const metric = view === "people" ? person?.metrics : unit?.metrics.total;
  const directCount =
    view === "people" ? person?.directReports : unit?.metrics.direct.headcount;
  const selectedObjectives =
    data?.objectives.filter((o) => o.OrgUnitID === unit?.OrgUnitID) || [];
  const results = useMemo(() => {
    if (!data || query.trim().length < 1) return [];
    const q = query.toLowerCase();
    return (view === "people" ? data.employees : data.units)
      .filter((r) =>
        (view === "people"
          ? `${r.Name} ${r.JobTitle} ${unitFor(r.OrgUnitID)?.OrgUnitName}`
          : `${r.OrgUnitName} ${r.UnitType}`
        )
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 8);
  }, [query, data, view]);
  const searchSelect = (id: string) => {
    setFocus("");
    setSearchTarget(id);
    setSearchNonce((n) => n + 1);
    setQuery("");
    setShowPanel(true);
  };
  const changeView = (v: "people" | "units") => {
    setView(v);
    setFocus("");
    setSelected(
      v === "units"
        ? unit?.OrgUnitID || data?.units[0]?.OrgUnitID || ""
        : data?.rootEmployee || "",
    );
    setExpanded(new Set());
    setQuery("");
  };
  const saved = () => {
    reload();
    notify("Planning change saved");
  };
  const editBudget = (u: Unit) =>
    setEditor({
      sheet: "Budgets",
      record: u.metrics.budget || {
        BudgetID: uid("budget"),
        OrgUnitID: u.OrgUnitID,
        BudgetYear: asOf.slice(0, 4),
        Currency: currency,
        ApprovedEnvelope: "0",
        DirectAllocation: "0",
      },
    });
  const newObjective = (unitId?: string) =>
    setEditor({
      sheet: "Objectives",
      record: {
        ObjectiveID: uid("objective"),
        OrgUnitID: unitId || session?.unit || rootUnit,
        OwnerEmployeeID:
          unitFor(unitId || session?.unit || rootUnit)?.OwnerEmployeeID || "",
        ParentObjectiveID: "",
        ObjectiveText: "",
        PeriodStart: asOf.slice(0, 4) + "-01-01",
        PeriodEnd: asOf.slice(0, 4) + "-12-31",
        Status: "not-started",
      },
    });
  const newUnit = () =>
    setEditor({
      sheet: "OrganizationalUnits",
      record: {
        OrgUnitID: uid("unit"),
        OrgUnitName: "",
        ParentOrgUnitID: unit?.OrgUnitID || session?.unit || rootUnit,
        UnitType: "subdepartment",
        OwnerEmployeeID: "",
      },
    });
  const newKR = (obj: RecordData) =>
    setEditor({
      sheet: "KeyResults",
      record: {
        KeyResultID: uid("kr"),
        ObjectiveID: obj.ObjectiveID,
        OwnerEmployeeID: obj.OwnerEmployeeID,
        MetricName: "",
        Unit: "",
        Baseline: "0",
        CurrentValue: "0",
        TargetValue: "100",
        Direction: "increase",
        LastUpdated: today(),
      },
    });
  const loadAudit = async () => {
    try {
      setAudit(await api("/audit"));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const objectiveCard = (o: RecordData, compact = false) => (
    <article
      className={`objective-card ${compact ? "compact" : ""}`}
      key={o.ObjectiveID}
    >
      <div className="objective-top">
        <span className="unit-label">
          {unitFor(o.OrgUnitID)?.OrgUnitName || "Company alignment · read only"}
        </span>
        <span className={`status-pill ${o.Status}`}>
          {o.Status.replaceAll("-", " ")}
        </span>
      </div>
      <h3>{o.ObjectiveText}</h3>
      <div className="objective-meta">
        <span>
          {data?.employees.find((e) => e.EmployeeID === o.OwnerEmployeeID)
            ?.Name || "Owner outside scope"}
        </span>
        <span>
          {o.PeriodStart} → {o.PeriodEnd}
        </span>
      </div>
      {o.ParentObjectiveID && (
        <div className="objective-alignment">
          <GitBranch size={13} />
          <span>
            Contributes to:{" "}
            {
              data?.objectives.find(
                (p) => p.ObjectiveID === o.ParentObjectiveID,
              )?.ObjectiveText
            }
          </span>
        </div>
      )}
      <div className="key-results">
        {data?.keyResults
          .filter((k) => k.ObjectiveID === o.ObjectiveID)
          .map((k) => (
            <div key={k.KeyResultID} className="kr">
              <div className="kr-title">
                <strong>{k.MetricName}</strong>
                {session?.canEdit && (
                  <button
                    onClick={() =>
                      setEditor({ sheet: "KeyResults", record: k })
                    }
                  >
                    Update
                  </button>
                )}
              </div>
              <div className="progress-track">
                <span
                  style={{
                    width: `${Math.max(0, Math.min(100, k.progress || 0))}%`,
                  }}
                />
              </div>
              <div className="kr-value">
                <span>
                  {k.CurrentValue || "—"} / {k.TargetValue || "—"} {k.Unit} ·{" "}
                  {k.Direction === "decrease" ? "↓" : "↑"} from{" "}
                  {k.Baseline || "—"}
                </span>
                <strong>
                  {k.progress == null ? "Not scored" : `${k.progress}%`}
                </strong>
              </div>
              {k.reason && <small>{k.reason}</small>}
              {k.stale && (
                <small className="stale">
                  Update is missing or older than 30 days
                </small>
              )}
            </div>
          ))}
      </div>
      {session?.canEdit && !o.readOnly && (
        <div className="objective-actions">
          <button onClick={() => setEditor({ sheet: "Objectives", record: o })}>
            Edit objective
          </button>
          <button onClick={() => newKR(o)}>
            <Plus size={13} />
            Key result
          </button>
        </div>
      )}
    </article>
  );
  if (!data || !session)
    return (
      <div className="loading-screen">
        <div className="brand-icon">
          <GitBranch />
        </div>
        <h1>Divergent</h1>
        <p>{loading ? "Preparing your organization…" : error}</p>
        {!loading && (
          <>
            <button className="primary" onClick={() => reload()}>
              Try again
            </button>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  const { signIn } = await import("./auth");
                  await signIn();
                  reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <LogIn size={15} />
              Company sign-in
            </button>
          </>
        )}
      </div>
    );
  const roots = data.units.filter((u) => !u.ParentOrgUnitID);
  const companyEnvelope =
    session.role === "viewer" ||
    !roots.length ||
    roots.some((u) => !u.metrics.budget)
      ? null
      : roots.reduce((sum, u) => sum + (u.metrics.envelope || 0), 0);
  const summary = data.summary;
  const title =
    page === "model"
      ? "Tune your organization."
      : page === "organization"
        ? "A clearer view of your organization."
        : page === "budgets"
          ? "Resources, with a sense of direction."
          : "Big ambitions. Shared progress.";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("organization");
          }}
        >
          <span className="brand-icon">
            <GitBranch size={22} />
          </span>
          <span>
            DIVERGENT<small>ORGANIZATION EXPLORER</small>
          </span>
        </a>
        <div className="workspace-switch">
          <div className="workspace-avatar">D</div>
          <div>
            <strong>Divergent</strong>
            <span>
              {data.synthetic ? "Sample workspace" : "Organization workspace"}
            </span>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          <button
            className={page === "organization" ? "active" : ""}
            onClick={() => setPage("organization")}
          >
            <GitBranch size={18} />
            Organization
            <span className="nav-indicator" />
          </button>
          <button
            className={page === "budgets" ? "active" : ""}
            onClick={() => setPage("budgets")}
          >
            <Wallet size={18} />
            Payroll & budgets
          </button>
          <button
            className={page === "objectives" ? "active" : ""}
            onClick={() => setPage("objectives")}
          >
            <Target size={18} />
            Objectives & KRs
            <span className="nav-count">{data.objectives.length}</span>
          </button>
        </nav>
        <div className="nav-caption tools-caption">MANAGE</div>
        <nav>
          {session.canImport && (
            <button onClick={() => setImportOpen(true)}>
              <Upload size={18} />
              Data & imports
            </button>
          )}
          {session.canViewCompensation && (
            <button onClick={loadAudit}>
              <History size={18} />
              Activity history
            </button>
          )}
          {session.canImport && (
            <button onClick={() => setSettingsOpen(true)}>
              <Settings2 size={18} />
              Workspace settings
            </button>
          )}
        </nav>
        {session.canViewCompensation && (
          <button
            className={`model-nav ${page === "model" ? "active" : ""}`}
            onClick={() => setPage("model")}
          >
            <SlidersHorizontal size={17} />
            Model settings
          </button>
        )}
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="live-dot" />
            <span>
              {data.synthetic ? "A space to explore" : "Connected perspectives"}
            </span>
            <p>
              {data.synthetic
                ? "All relationships, pay, and plans shown are synthetic sample data."
                : "People, purpose, and resources. All in one place."}
            </p>
          </div>
          <div className="user-block">
            <div className="user-avatar">
              {session.role.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <strong>
                {session.role === "owner"
                  ? "Engineering owner"
                  : session.role === "finance"
                    ? "Finance workspace"
                    : session.role === "admin"
                      ? "Workspace admin"
                      : "Organization viewer"}
              </strong>
              <small>
                {session.development
                  ? "Development authentication"
                  : "Company authentication"}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace
            <ChevronRight size={12} />
            <strong>
              {page === "model"
                ? "Model settings"
                : page === "organization"
                  ? "Organization"
                  : page === "budgets"
                    ? "Payroll & budgets"
                    : "Objectives & KRs"}
            </strong>
          </div>
          <div className="topbar-right">
            {session.development && (
              <label className="demo-role">
                <span className="demo-label">DEMO ROLE</span>
                <select
                  aria-label="Development role"
                  value={session.role}
                  onChange={(e) => switchRole(e.target.value)}
                >
                  <option value="admin">Administrator</option>
                  <option value="finance">Executive / Finance</option>
                  <option value="owner">Engineering owner</option>
                  <option value="viewer">Viewer</option>
                </select>
              </label>
            )}
            <button
              className="icon-button"
              onClick={reload}
              aria-label="Refresh organization"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {data.synthetic
                  ? "SYNTHETIC SAMPLE ORGANIZATION"
                  : summary.scope.toUpperCase()}
                <span className="heading-dot" />
                PEOPLE WITH PURPOSE
              </div>
              <h1>{title}</h1>
              <p>
                {page === "model"
                  ? "Review people, reporting lines, company assignments, and informational overhead."
                  : page === "organization"
                    ? "Explore the people, teams, and connections moving us forward."
                    : page === "budgets"
                      ? "Align annual resources with the teams doing the work."
                      : "Connect company priorities to meaningful, measurable outcomes."}
              </p>
            </div>
            {session.canImport && (
              <button
                className="primary import-top"
                onClick={() => setImportOpen(true)}
              >
                <Upload size={16} />
                Import workbook
              </button>
            )}
          </div>
          {data.demoNotes?.length ? (
            <details className="notice">
              <summary>
                Workbook assumptions and review notes ({data.demoNotes.length})
              </summary>
              <ul>
                {data.demoNotes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {error && (
            <div className="notice error" role="alert">
              <AlertTriangle size={17} />
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={15} />
              </button>
            </div>
          )}
          <div className="scope-line">
            <span>
              <span className="live-dot" />
              Scope: <strong>{summary.scope}</strong>
            </span>
            <div>
              <label>
                As of{" "}
                <input
                  aria-label="Metrics effective date"
                  type="date"
                  disabled={session.role === "owner"}
                  value={asOf}
                  onChange={(e) => e.target.value && setAsOf(e.target.value)}
                />
              </label>
              <select
                aria-label="Currency"
                disabled={session.role === "owner"}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {[
                  "USD",
                  "EUR",
                  "GBP",
                  "CAD",
                  "JPY",
                  "AUD",
                  "CHF",
                  "CNY",
                  "INR",
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <section className="stats-grid">
            <div className="stat-card">
              <span>
                Total people
                <Users size={16} />
              </span>
              <strong>
                {summary.headcount}
                <small>
                  {summary.fte.toLocaleString()} known FTE
                  {summary.missingFTE ? ` · ${summary.missingFTE} unknown` : ""}
                </small>
              </strong>
              <p>
                <span className="stat-dot" />
                Active in selected scope
              </p>
            </div>
            <div className="stat-card">
              <span>
                Organizational units
                <Building2 size={16} />
              </span>
              <strong>
                {data.units.length}
                <small>
                  {data.units.filter((u) => u.UnitType === "department").length}{" "}
                  departments
                </small>
              </strong>
              <p>
                Connected across{" "}
                {data.units.filter((u) => u.UnitType === "group").length}{" "}
                department groups
              </p>
            </div>
            <div className="stat-card">
              <span>
                Annualized payroll run rate
                <Wallet size={16} />
              </span>
              <strong className={summary.restricted ? "restricted-stat" : ""}>
                {summary.restricted ? (
                  <>
                    <LockKeyhole size={21} />
                    Restricted
                  </>
                ) : summary.missingPay === summary.headcount &&
                  summary.headcount > 0 ? (
                  "Not supplied"
                ) : (
                  money(summary.payroll, currency, true)
                )}
              </strong>
              <p>
                {summary.restricted
                  ? "Compensation access is role-based"
                  : summary.complete
                    ? "Annual amounts at contracted FTE"
                    : `Incomplete · ${summary.missingPay || 0} missing pay, ${summary.otherCurrency || 0} other currency`}
              </p>
            </div>
            <div className="stat-card">
              <span>
                Company & unit objectives
                <Target size={16} />
              </span>
              <strong>
                {data.objectives.length}
                <small className="green-text">
                  {
                    data.objectives.filter((o) => o.Status === "on-track")
                      .length
                  }{" "}
                  on track
                </small>
              </strong>
              <p>Health is owner-reported</p>
            </div>
          </section>
          {page === "model" && (
            <ModelPage
              data={data}
              session={session}
              onEdit={(sheet, record) => setEditor({ sheet, record })}
              onSaved={reload}
            />
          )}
          {page === "organization" && (
            <section className="organization-board">
              <div className="board-toolbar">
                <div className="view-tabs">
                  <button
                    className={view === "people" ? "active" : ""}
                    onClick={() => changeView("people")}
                  >
                    <Users size={16} />
                    People
                  </button>
                  <button
                    className={view === "units" ? "active" : ""}
                    onClick={() => changeView("units")}
                  >
                    <Building2 size={16} />
                    Organizational units
                  </button>
                </div>
                <div className="board-tools">
                  <div className="search-box">
                    <Search size={15} />
                    <input
                      placeholder={
                        view === "people"
                          ? "Find a person, title, or team…"
                          : "Find an organizational unit…"
                      }
                      aria-label="Search organization"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query && (
                      <button
                        aria-label="Clear search"
                        onClick={() => setQuery("")}
                      >
                        <X size={13} />
                      </button>
                    )}
                    {query && (
                      <div className="search-results" role="listbox">
                        {results.length ? (
                          results.map((r) => (
                            <button
                              role="option"
                              key={
                                view === "people" ? r.EmployeeID : r.OrgUnitID
                              }
                              onClick={() =>
                                searchSelect(
                                  view === "people"
                                    ? r.EmployeeID
                                    : r.OrgUnitID,
                                )
                              }
                            >
                              <span className="mini-avatar">
                                {initials(
                                  view === "people" ? r.Name : r.OrgUnitName,
                                )}
                              </span>
                              <span>
                                <strong>
                                  {view === "people" ? r.Name : r.OrgUnitName}
                                </strong>
                                <small>
                                  {view === "people" ? r.JobTitle : r.UnitType}
                                </small>
                              </span>
                              <ArrowUpRight size={14} />
                            </button>
                          ))
                        ) : (
                          <p>No matching people or units</p>
                        )}
                      </div>
                    )}
                  </div>
                  <label className="overlay-picker">
                    <SlidersHorizontal size={14} />
                    <select
                      aria-label="Card metric overlay"
                      value={overlay}
                      onChange={(e) => setOverlay(e.target.value)}
                    >
                      <option value="headcount">Headcount</option>
                      <option value="payroll">Payroll</option>
                      <option value="okrs">Objectives</option>
                    </select>
                  </label>
                  <button
                    className="icon-button"
                    aria-label={showPanel ? "Hide details" : "Show details"}
                    onClick={() => setShowPanel((p) => !p)}
                  >
                    {showPanel ? (
                      <PanelRightClose size={17} />
                    ) : (
                      <PanelRightOpen size={17} />
                    )}
                  </button>
                </div>
              </div>
              <div className={`board-body ${showPanel ? "with-panel" : ""}`}>
                <OrgChart
                  data={data}
                  view={view}
                  selected={selected}
                  onSelect={(id) => {
                    setSelected(id);
                    setShowPanel(true);
                  }}
                  overlay={overlay}
                  focus={focus}
                  searchTarget={searchTarget}
                  searchNonce={searchNonce}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  onClearFocus={() => setFocus("")}
                />
                {showPanel && (
                  <aside className="detail-panel">
                    {selectedRecord ? (
                      <>
                        <div className="detail-topline">
                          <span>
                            {view === "people"
                              ? "PERSON OVERVIEW"
                              : "UNIT OVERVIEW"}
                          </span>
                          <button
                            className="icon-button"
                            onClick={() => setShowPanel(false)}
                            aria-label="Close details"
                          >
                            <X size={15} />
                          </button>
                        </div>
                        <div className="profile">
                          <div
                            className="profile-avatar"
                            style={
                              {
                                "--node-accent": colorFor(
                                  unit?.OrgUnitID || "",
                                  data,
                                ),
                              } as React.CSSProperties
                            }
                          >
                            {view === "people" ? (
                              initials(person!.Name)
                            ) : (
                              <Building2 size={27} />
                            )}
                            <i />
                          </div>
                          <h2>
                            {view === "people"
                              ? person!.Name
                              : unit!.OrgUnitName}
                          </h2>
                          <p>
                            {view === "people"
                              ? person!.JobTitle
                              : `${unit!.Tier !== undefined && unit!.Tier !== "" ? `Tier ${unit!.Tier} · ` : ""}${unit!.UnitType}`}
                          </p>
                          <span className="profile-unit">
                            <i
                              style={{
                                background: colorFor(
                                  unit?.OrgUnitID || "",
                                  data,
                                ),
                              }}
                            />
                            {unit?.OrgUnitName}
                          </span>
                        </div>
                        <div className="profile-facts">
                          {view === "people" ? (
                            <>
                              <span>
                                <MapPin size={14} />
                                {person!.Location || "Location not provided"}
                              </span>
                              <span>
                                <BriefcaseBusiness size={14} />
                                {person!.EmploymentType ||
                                  "Employment type not provided"}{" "}
                                · {person!.FTE} FTE
                              </span>
                            </>
                          ) : (
                            <>
                              <span>
                                <Users size={14} />
                                Owner:{" "}
                                {data.employees.find(
                                  (e) => e.EmployeeID === unit!.OwnerEmployeeID,
                                )?.Name || "Unassigned / outside scope"}
                              </span>
                              {unit!.DepartmentCode && (
                                <span>
                                  Department code: {unit!.DepartmentCode}
                                </span>
                              )}
                              <span>
                                <CheckCircle2 size={14} />
                                {unit!.source === "app"
                                  ? "App-managed"
                                  : "Excel-managed"}{" "}
                                unit
                              </span>
                            </>
                          )}
                        </div>
                        <button
                          className="focus-button"
                          onClick={() => setFocus(selected)}
                        >
                          <Focus size={15} />
                          Focus on this{" "}
                          {view === "people" ? "organization" : "unit"}
                          <ArrowUpRight size={14} />
                        </button>
                        <div className="detail-section">
                          <h3>
                            {view === "people"
                              ? "Reporting scope"
                              : "Organizational scope"}
                            <Users size={14} />
                          </h3>
                          <div className="detail-metrics">
                            <div>
                              <strong>{directCount || 0}</strong>
                              <span>
                                {view === "people"
                                  ? "Direct reports"
                                  : "Direct employees"}
                              </span>
                            </div>
                            <div>
                              <strong>{metric?.headcount || 0}</strong>
                              <span>
                                {view === "people"
                                  ? "Including leader"
                                  : "Including child units"}
                              </span>
                            </div>
                          </div>
                          {view === "people" && (
                            <p className="fine-print">
                              {person!.downstreamReports} downstream reports ·{" "}
                              {metric?.fte} FTE in subtree
                            </p>
                          )}
                        </div>
                        {view === "people" && person!.companyAllocation && (
                          <section
                            className="detail-section"
                            aria-label="Company allocation"
                          >
                            <h3>
                              {person!.companyAllocation.mode === "calculated"
                                ? "Calculated team allocation"
                                : "Contributor company allocation"}
                            </h3>
                            <CompanyAllocationView
                              allocation={person!.companyAllocation}
                            />
                            {person!.companyAllocation.canEdit && (
                              <button
                                className="secondary allocation-edit"
                                onClick={() =>
                                  setEditor({
                                    sheet: "CompanyAllocations",
                                    record: {
                                      EmployeeID: person!.EmployeeID,
                                      DivergentPercent:
                                        person!.companyAllocation
                                          .divergentPercent ?? "",
                                    },
                                  })
                                }
                              >
                                {person!.companyAllocation.status ===
                                "unassigned"
                                  ? "Set company allocation"
                                  : "Edit company allocation"}
                              </button>
                            )}
                          </section>
                        )}
                        <div className="detail-section">
                          <h3>
                            Annualized payroll run rate
                            <Wallet size={14} />
                          </h3>
                          {metric?.restricted ? (
                            <div className="restricted-box">
                              <LockKeyhole size={16} />
                              <p>This subtotal is restricted by your role.</p>
                            </div>
                          ) : (
                            <>
                              <strong className="detail-money">
                                {money(metric?.payroll, currency)}
                              </strong>
                              <p className="fine-print">
                                {metric?.complete
                                  ? "Complete compensation data"
                                  : `Incomplete: ${metric?.missingPay || 0} missing compensation, ${metric?.otherCurrency || 0} other currency`}
                                .{" "}
                                {view === "people"
                                  ? "Reporting subtree"
                                  : "Unit and descendants"}{" "}
                                · {asOf}
                              </p>
                            </>
                          )}
                          {view === "people" && session.canViewCompensation && (
                            <button
                              className="text-button"
                              onClick={async () => {
                                try {
                                  setComp(
                                    await api(
                                      `/people/${person!.EmployeeID}/compensation`,
                                    ),
                                  );
                                } catch (e) {
                                  setError((e as Error).message);
                                }
                              }}
                            >
                              View individual compensation
                              <ChevronRight size={14} />
                            </button>
                          )}
                          {comp && (
                            <div className="comp-history">
                              {comp.length ? (
                                comp.map((c) => (
                                  <p key={c.EffectiveFrom}>
                                    <strong>
                                      {money(
                                        Number(c.AnnualBasePay) +
                                          Number(c.AnnualTargetBonus) +
                                          Number(c.AnnualEmployerCosts),
                                        c.Currency,
                                      )}
                                    </strong>
                                    <small>
                                      Base{" "}
                                      {money(
                                        Number(c.AnnualBasePay),
                                        c.Currency,
                                      )}{" "}
                                      + bonus{" "}
                                      {money(
                                        Number(c.AnnualTargetBonus),
                                        c.Currency,
                                      )}{" "}
                                      + employer costs{" "}
                                      {money(
                                        Number(c.AnnualEmployerCosts),
                                        c.Currency,
                                      )}
                                      <br />
                                      {c.EffectiveFrom} –{" "}
                                      {c.EffectiveTo || "ongoing"}
                                    </small>
                                  </p>
                                ))
                              ) : (
                                <p>Compensation unknown.</p>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="detail-section">
                          <h3>
                            Linked unit
                            <Building2 size={14} />
                          </h3>
                          <button
                            className="linked-unit"
                            onClick={() => {
                              setView("units");
                              setSelected(unit!.OrgUnitID);
                              searchSelect(unit!.OrgUnitID);
                            }}
                          >
                            <span>
                              {unit?.OrgUnitName}
                              <small>
                                Budget and objectives follow unit scope
                              </small>
                            </span>
                            <ArrowUpRight size={17} />
                          </button>
                          {view === "units" && session.canEdit && (
                            <div className="inline-actions">
                              <button
                                onClick={() =>
                                  setEditor({
                                    sheet: "OrganizationalUnits",
                                    record: unit!,
                                  })
                                }
                              >
                                Edit unit
                              </button>
                              <button onClick={newUnit}>
                                <Plus size={12} />
                                Subdepartment
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="detail-section">
                          <h3>
                            Unit objectives
                            <span className="badge">
                              {selectedObjectives.length}
                            </span>
                          </h3>
                          {selectedObjectives.length ? (
                            selectedObjectives.map((o) => (
                              <button
                                key={o.ObjectiveID}
                                className="mini-objective"
                                onClick={() => setPage("objectives")}
                              >
                                <Target size={15} />
                                <span>
                                  {o.ObjectiveText}
                                  <small className={`health-text ${o.Status}`}>
                                    {o.Status.replaceAll("-", " ")}
                                  </small>
                                </span>
                              </button>
                            ))
                          ) : (
                            <p className="fine-print">
                              No objectives for this unit yet.
                            </p>
                          )}
                          {session.canEdit && (
                            <button
                              className="text-button"
                              onClick={() => newObjective(unit?.OrgUnitID)}
                            >
                              <Plus size={13} />
                              Add objective
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="empty-state">
                        <GitBranch size={30} />
                        <h3>Every connection has a story</h3>
                        <p>
                          Select a person or unit to explore their scope,
                          resources, and objectives.
                        </p>
                        {session.canEdit && view === "units" && (
                          <button className="secondary" onClick={newUnit}>
                            <Plus size={14} />
                            Add unit
                          </button>
                        )}
                      </div>
                    )}
                  </aside>
                )}
              </div>
              <footer className="board-footer">
                <span>
                  <Info size={13} />
                  {view === "people"
                    ? "Reporting relationships"
                    : "Organizational ownership"}{" "}
                  ·{" "}
                  {view === "people"
                    ? "A reporting subtree can differ from an owned unit."
                    : "Budgets and objectives follow units, independently of reporting lines."}
                </span>
                <span>Version {data.version}</span>
              </footer>
            </section>
          )}
          {page === "budgets" && (
            <section className="planning-page">
              <div className="section-heading">
                <div>
                  <h2>Annual resources by organizational unit</h2>
                  <p>
                    {asOf.slice(0, 4)} calendar year · {currency} · envelopes
                    include descendants
                  </p>
                </div>
                {session.canViewCompensation && (
                  <button
                    className="secondary"
                    onClick={() =>
                      downloadWorkbook("export").catch((e) =>
                        setError(e.message),
                      )
                    }
                  >
                    <Download size={15} />
                    Export workbook
                  </button>
                )}
              </div>
              {session.role === "viewer" ? (
                <div className="empty-state">
                  <LockKeyhole size={32} />
                  <h3>Budget access is restricted</h3>
                  <p>
                    Your viewer role can explore people and permitted
                    objectives.
                  </p>
                </div>
              ) : (
                <>
                  <div className="budget-intro">
                    <div>
                      <span>
                        {session.role === "owner"
                          ? "Assigned envelope"
                          : "Root envelopes — no double counting"}
                      </span>
                      <strong>
                        {companyEnvelope == null
                          ? "Not fully budgeted"
                          : money(companyEnvelope, currency)}
                      </strong>
                    </div>
                    <p>
                      Run-rate headroom compares annualized payroll with an
                      approved envelope. It is not remaining cash spend. Missing
                      compensation makes the comparison incomplete.
                    </p>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Organizational unit</th>
                          <th>People</th>
                          <th>Payroll run rate</th>
                          <th>Envelope</th>
                          <th>Run-rate headroom</th>
                          <th>Unallocated</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {data.units.map((u) => (
                          <tr key={u.OrgUnitID}>
                            <td>
                              <strong>{u.OrgUnitName}</strong>
                              <small>
                                {u.UnitType} · {u.metrics.direct.headcount}{" "}
                                directly assigned
                              </small>
                            </td>
                            <td>{u.metrics.total.headcount}</td>
                            <td>
                              {money(u.metrics.total.payroll, currency)}
                              {!u.metrics.total.restricted &&
                                !u.metrics.total.complete && (
                                  <small className="stale">
                                    Incomplete compensation
                                  </small>
                                )}
                            </td>
                            <td>
                              {u.metrics.budget ? (
                                money(u.metrics.envelope, currency)
                              ) : (
                                <span className="muted">Not budgeted</span>
                              )}
                            </td>
                            <td
                              className={
                                (u.metrics.headroom || 0) < 0 ? "negative" : ""
                              }
                            >
                              {u.metrics.headroom == null
                                ? "—"
                                : money(u.metrics.headroom, currency)}
                              {u.metrics.headroom != null &&
                                !u.metrics.total.complete && (
                                  <small>Provisional — incomplete pay</small>
                                )}
                            </td>
                            <td
                              className={
                                (u.metrics.unallocated || 0) < 0
                                  ? "negative"
                                  : ""
                              }
                            >
                              {u.metrics.unallocated == null
                                ? "—"
                                : money(u.metrics.unallocated, currency)}
                              {(u.metrics.unallocated || 0) < 0 && (
                                <small>Over-allocated</small>
                              )}
                              {!!u.metrics.missingChildBudgets && (
                                <small>
                                  {u.metrics.missingChildBudgets} child budgets
                                  missing
                                </small>
                              )}
                            </td>
                            <td>
                              {session.canEdit && (
                                <button
                                  className="table-edit"
                                  onClick={() => editBudget(u)}
                                >
                                  {u.metrics.budget ? "Allocate" : "Set budget"}
                                  <ChevronRight size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="budget-formula">
                    <Info size={17} />
                    <p>
                      Unallocated = envelope − direct allocation − immediate
                      child envelopes. Owners see one fixed current scope
                      payroll aggregate for groups of 5 or more; nested payroll
                      subtotals are restricted to prevent subtraction-based
                      disclosure.
                    </p>
                  </div>
                  <div className="allocation-grid">
                    {data.units
                      .filter((u) => u.metrics.budget)
                      .map((u) => (
                        <div className="allocation-card" key={u.OrgUnitID}>
                          <strong>{u.OrgUnitName}</strong>
                          <dl>
                            <dt>Reserved for direct employees</dt>
                            <dd>
                              {money(u.metrics.directAllocation, currency)}
                            </dd>
                            <dt>Child envelopes</dt>
                            <dd>{money(u.metrics.childEnvelopes, currency)}</dd>
                            <dt>Direct payroll</dt>
                            <dd>{money(u.metrics.direct.payroll, currency)}</dd>
                            <dt>Direct run-rate headroom</dt>
                            <dd>
                              {u.metrics.directHeadroom == null
                                ? "Restricted"
                                : money(u.metrics.directHeadroom, currency)}
                            </dd>
                          </dl>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </section>
          )}
          {page === "objectives" && (
            <section className="planning-page">
              <div className="section-heading">
                <div>
                  <h2>Shared direction. Measurable outcomes.</h2>
                  <p>
                    Individual metrics keep their own units. Objective health is
                    set by its owner.
                  </p>
                </div>
                {session.canEdit && (
                  <button className="primary" onClick={() => newObjective()}>
                    <Plus size={16} />
                    New objective
                  </button>
                )}
              </div>
              <div className="objectives-grid">
                {data.objectives.map((o) => objectiveCard(o))}
              </div>
              {!data.objectives.length && (
                <div className="empty-state">
                  <Target size={34} />
                  <h3>Make your priorities visible</h3>
                  <p>
                    Add a company or unit objective, then define measurable key
                    results.
                  </p>
                </div>
              )}
            </section>
          )}
          <div className="page-footnote">
            <Leaf size={13} />
            <span>
              {data.synthetic
                ? "Synthetic data for exploration. No real compensation or organizational relationships are implied."
                : "Built for thoughtful organizational planning."}
            </span>
          </div>
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}
      {importOpen && (
        <ImportPanel
          onClose={() => setImportOpen(false)}
          onImported={() => {
            reload();
            notify("Workbook imported");
          }}
        />
      )}
      {editor && (
        <Editor
          {...editor}
          data={data}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      )}
      {audit && (
        <div className="modal-backdrop" onClick={() => setAudit(null)}>
          <section
            className="import-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Activity history"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow">ACCOUNTABILITY BY DESIGN</span>
                <h2>Activity history</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setAudit(null)}
                aria-label="Close activity"
              >
                <X />
              </button>
            </header>
            <div className="modal-body">
              {audit.map((a) => (
                <div className="audit-row" key={a.id}>
                  <span className="audit-icon">
                    <History size={16} />
                  </span>
                  <div>
                    <strong>{a.action.replaceAll("-", " ")}</strong>
                    <p>
                      {a.actor} · {new Date(a.at).toLocaleString()} · Version{" "}
                      {a.version}
                    </p>
                    <details>
                      <summary>Change details</summary>
                      <pre>{JSON.stringify(a.details, null, 2)}</pre>
                    </details>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <section
            className="editor-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Workspace settings"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h2>Workspace settings</h2>
              <button
                className="icon-button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
              >
                <X />
              </button>
            </header>
            <div className="modal-body">
              <label>
                Configured CEO / root
                <select
                  value={rootChoice}
                  onChange={(e) => setRootChoice(e.target.value)}
                >
                  {data.employees
                    .filter((e) => !e.ManagerID)
                    .map((e) => (
                      <option key={e.EmployeeID} value={e.EmployeeID}>
                        {e.Name}
                      </option>
                    ))}
                </select>
              </label>
              <p className="notice">
                Additional roots remain visible and are flagged during import.
                The configured CEO is ordered first, using a permanent employee
                ID.
              </p>
              <p className="fine-print">
                This {data.synthetic ? "sample" : "organization"} database keeps
                its data classification. Start production with an empty database
                and sample seeding disabled.
              </p>
              <button
                className="primary"
                onClick={async () => {
                  try {
                    await api("/settings", {
                      method: "PUT",
                      body: JSON.stringify({
                        rootEmployee: rootChoice,
                        synthetic: data.synthetic,
                        version: data.version,
                      }),
                    });
                    setSettingsOpen(false);
                    reload();
                    notify("Workspace settings saved");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Save settings
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
