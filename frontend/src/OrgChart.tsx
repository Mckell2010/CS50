import { memo, useMemo, useEffect, useState, useCallback } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  useReactFlow,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import {
  ChevronDown,
  ChevronUp,
  Users,
  Building2,
  Maximize,
  Layers,
  Minimize2,
  Focus,
  LockKeyhole,
  ArrowUpRight,
  BriefcaseBusiness,
} from "lucide-react";
import type { Organization, Person, Unit, RecordData } from "./types";
import { initials, money } from "./types";
import "@xyflow/react/dist/style.css";
import CompanyAllocationView from "./CompanyAllocation";
import {
  cardColors,
  automaticColorTier,
  tierName,
  unitTier,
  type CardColor,
} from "./orgColors";

type CardData = {
  item: RecordData;
  unit: boolean;
  title: string;
  subtitle: string;
  color: string;
  background: string;
  colorCategory: string;
  colorLabel: string;
  selected: boolean;
  expanded: boolean;
  count: number;
  metric: string;
  onExpand: () => void;
  onSelect: () => void;
};
const OrgCard = memo(({ data }: NodeProps<Node<CardData>>) => {
  const d = data;
  const vacant = !d.unit && d.item.EmploymentStatus === "vacant";
  return (
    <div
      className={`org-node ${d.selected ? "selected" : ""} ${vacant ? "open-role-node" : ""}`}
      data-color-category={d.colorCategory}
      title={d.colorLabel}
      style={
        {
          "--node-accent": d.color,
          "--node-background": d.background,
          height: d.unit ? 132 : 164,
        } as React.CSSProperties
      }
    >
      <Handle type="target" position={Position.Top} />
      <button
        className="node-main"
        onClick={d.onSelect}
        aria-label={`Select ${d.title}`}
      >
        <div className={`avatar ${d.unit ? "unit-avatar" : ""}`}>
          {d.unit ? (
            <Building2 size={20} />
          ) : vacant ? (
            <BriefcaseBusiness size={20} />
          ) : (
            initials(d.title)
          )}
        </div>
        <div className="node-text">
          <strong>{d.title}</strong>
          <span>{d.subtitle}</span>
          <small>
            <i />
            {d.unit
              ? `${d.item.Tier !== undefined && d.item.Tier !== "" ? `Tier ${d.item.Tier} · ` : ""}${d.item.UnitType}`
              : d.item.unitName}
          </small>
        </div>
        <ArrowUpRight className="node-open" size={15} />
      </button>
      {!d.unit && ["vacant", "draft"].includes(d.item.EmploymentStatus) ? (
        <div className="company-allocation compact">
          <span className="allocation-label">
            {d.item.EmploymentStatus === "vacant"
              ? "OPEN ROLE · Unfilled position"
              : "Draft · employment details needed"}
          </span>
        </div>
      ) : (
        !d.unit &&
        d.item.companyAllocation && (
          <CompanyAllocationView
            allocation={d.item.companyAllocation}
            compact
          />
        )
      )}
      <div className="node-footer">
        <span>
          <Users size={12} />
          {d.metric}
        </span>
        {d.count > 0 ? (
          <button
            className="expand-button nodrag"
            onClick={(e) => {
              e.stopPropagation();
              d.onExpand();
            }}
            aria-label={`${d.expanded ? "Collapse" : "Expand"} ${d.title}`}
          >
            {d.count}{" "}
            {d.expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        ) : (
          <span className="leaf-dot">—</span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});
const nodeTypes = { org: OrgCard };
export const groupColors: Record<string, string> = {
  eng: "#363e46",
  ops: "#687078",
  growth: "#888e94",
  corporate: "#141719",
  company: "#141719",
};
export function colorFor(unit: string, data: Organization): string {
  let u = data.units.find((u) => u.OrgUnitID === unit);
  const seen = new Set();
  while (
    u?.ParentOrgUnitID &&
    u.UnitType !== "group" &&
    !seen.has(u.OrgUnitID)
  ) {
    seen.add(u.OrgUnitID);
    u = data.units.find((x) => x.OrgUnitID === u!.ParentOrgUnitID);
  }
  const id = u?.OrgUnitID || unit;
  const palette = ["#363e46", "#687078", "#888e94", "#50575e", "#a0a6ab"];
  const hash = [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return groupColors[id] || palette[hash % palette.length];
}

export type ChartProps = {
  data: Organization;
  view: "people" | "units";
  selected: string;
  onSelect: (id: string) => void;
  overlay: string;
  colorTier: string;
  focus: string;
  searchTarget: string;
  searchNonce: number;
  expanded: Set<string>;
  setExpanded: (set: Set<string>) => void;
  onClearFocus: () => void;
};
function ChartInner({
  data,
  view,
  selected,
  onSelect,
  overlay,
  colorTier,
  focus,
  searchTarget,
  searchNonce,
  expanded,
  setExpanded,
  onClearFocus,
}: ChartProps) {
  const unit = view === "units";
  const records: RecordData[] = unit ? data.units : data.employees;
  const idField = unit ? "OrgUnitID" : "EmployeeID";
  const parentField = unit ? "ParentOrgUnitID" : "ManagerID";
  const titleField = unit ? "OrgUnitName" : "Name";
  const { fitView, setCenter, getNode } = useReactFlow();
  const [fitNonce, setFitNonce] = useState(0);
  const byId = useMemo(
    () => new Map(records.map((r) => [r[idField], r])),
    [records, idField],
  );
  const children = useMemo(() => {
    const m = new Map<string, string[]>();
    records.forEach((r) =>
      m.set(r[parentField] || "", [
        ...(m.get(r[parentField] || "") || []),
        r[idField],
      ]),
    );
    return m;
  }, [records, idField, parentField]);
  const roots = useMemo(
    () =>
      focus && byId.has(focus)
        ? [focus]
        : records
            .filter((r) => !r[parentField] || !byId.has(r[parentField]))
            .map((r) => r[idField])
            .sort((a, b) =>
              a === data.rootEmployee
                ? -1
                : b === data.rootEmployee
                  ? 1
                  : a.localeCompare(b),
            ),
    [records, byId, focus, parentField, idField, data.rootEmployee],
  );
  const visible = useMemo(() => {
    const ids = new Set<string>();
    const pending = [...roots];
    while (pending.length) {
      const id = pending.pop()!;
      if (ids.has(id)) continue;
      ids.add(id);
      if (expanded.has(id)) pending.push(...(children.get(id) || []));
    }
    return ids;
  }, [roots, children, expanded]);
  const effectiveTier = useMemo(() => {
    if (
      colorTier !== "auto" &&
      Number.isInteger(Number(colorTier)) &&
      Number(colorTier) >= 0
    )
      return Number(colorTier);
    if (unit)
      return Math.max(
        0,
        ...[...visible].map((id) => unitTier(byId.get(id) as Unit) || 0),
      );
    return automaticColorTier(
      records.map((r) => ({ id: r[idField], parent: r[parentField] })),
      visible,
      data.units,
    );
  }, [
    colorTier,
    unit,
    visible,
    byId,
    records,
    idField,
    parentField,
    data.units,
  ]);
  const colors = useMemo(
    () => cardColors(data.units, effectiveTier),
    [data.units, effectiveTier],
  );
  const legend = useMemo(() => {
    const categories = new Map<string, CardColor>();
    visible.forEach((id) => {
      const color = colors.get(byId.get(id)?.OrgUnitID);
      if (color) categories.set(color.id, color);
    });
    return [...categories.values()].sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [visible, colors, byId]);
  const colorDescription = (color: CardColor) =>
    `${color.label}${color.fallback && color.tier !== undefined ? ` · ${tierName(color.tier)} fallback; no ${tierName(effectiveTier).toLowerCase()} assigned` : ""}`;
  const toggle = useCallback(
    (id: string) => {
      const next = new Set(expanded);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setExpanded(next);
      onSelect(id);
    },
    [expanded, setExpanded, onSelect],
  );
  const { nodes, edges } = useMemo(() => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: "TB",
      nodesep: 30,
      ranksep: 62,
      marginx: 35,
      marginy: 30,
    });
    g.setDefaultEdgeLabel(() => ({}));
    const ns: Node<CardData>[] = [];
    const es: Edge[] = [];
    visible.forEach((id) => {
      const r = byId.get(id);
      if (!r) return;
      g.setNode(id, { width: 260, height: unit ? 132 : 164 });
      const metric = unit ? r.metrics.total : r.metrics;
      const objectiveCount = data.objectives.filter(
        (o) => o.OrgUnitID === r.OrgUnitID,
      ).length;
      const label =
        overlay === "payroll"
          ? money(metric.payroll, data.currency, true) + " run rate"
          : overlay === "okrs"
            ? `${objectiveCount} unit objectives`
            : `${metric.headcount} ${metric.headcount === 1 ? "person" : "people"}${unit ? " in unit" : " in subtree"}`;
      ns.push({
        id,
        type: "org",
        position: { x: 0, y: 0 },
        data: {
          item: {
            ...r,
            unitName: data.units.find((u) => u.OrgUnitID === r.OrgUnitID)
              ?.OrgUnitName,
          },
          unit,
          title: r[titleField],
          subtitle: unit
            ? data.employees.find((e) => e.EmployeeID === r.OwnerEmployeeID)
                ?.Name || r.DepartmentOwner || "Owner unassigned"
            : r.JobTitle,
          color: colors.get(r.OrgUnitID)?.accent || "#686868",
          background: colors.get(r.OrgUnitID)?.background || "#eeeeec",
          colorCategory: colors.get(r.OrgUnitID)?.id || "unmapped",
          colorLabel: `Background: ${colors.get(r.OrgUnitID) ? colorDescription(colors.get(r.OrgUnitID)!) : "No assignment at this tier"}`,

          selected: selected === id,
          expanded: expanded.has(id),
          count: children.get(id)?.length || 0,
          metric: label,
          onExpand: () => toggle(id),
          onSelect: () => {
            onSelect(id);
            if (children.get(id)?.length && !expanded.has(id)) {
              const n = new Set(expanded);
              n.add(id);
              setExpanded(n);
            }
          },
        },
      });
      if (visible.has(r[parentField]) && id !== focus) {
        g.setEdge(r[parentField], id);
        es.push({
          id: `${r[parentField]}-${id}`,
          source: r[parentField],
          target: id,
          type: "smoothstep",
          style: {
            stroke: "#aeb2b5",
            strokeWidth: 1.4,
            strokeDasharray: r.hiddenVacantManager ? "6 4" : undefined,
          },
          label: r.hiddenVacantManager ? "via open role" : undefined,
        });
      }
    });
    dagre.layout(g);
    ns.forEach((n) => {
      const p = g.node(n.id);
      n.position = { x: p.x - 130, y: p.y - (unit ? 66 : 82) };
    });
    return { nodes: ns, edges: es };
  }, [
    visible,
    byId,
    unit,
    data,
    selected,
    overlay,
    colors,
    effectiveTier,
    expanded,
    children,
    focus,
    parentField,
    titleField,
    toggle,
    onSelect,
    setExpanded,
  ]);
  useEffect(() => {
    const t = setTimeout(
      () => fitView({ padding: 0.25, duration: 350, maxZoom: 1 }),
      80,
    );
    return () => clearTimeout(t);
  }, [view, focus, fitNonce, fitView]);
  useEffect(() => {
    if (!searchTarget || !byId.has(searchTarget)) return;
    const next = new Set(expanded);
    let cur = byId.get(searchTarget)?.[parentField];
    const seen = new Set();
    while (cur && byId.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      next.add(cur);
      cur = byId.get(cur)?.[parentField];
    }
    setExpanded(next);
    onSelect(searchTarget);
    const t = setTimeout(() => {
      const n = getNode(searchTarget);
      if (n)
        setCenter(n.position.x + 130, n.position.y + (unit ? 66 : 82), {
          zoom: 1,
          duration: 500,
        });
    }, 160);
    return () => clearTimeout(t);
  }, [searchNonce]);
  useEffect(() => {
    if (!selected) return;
    const t = setTimeout(() => {
      const n = getNode(selected);
      if (n)
        setCenter(n.position.x + 130, n.position.y + (unit ? 66 : 82), {
          zoom: 1,
          duration: 300,
        });
    }, 100);
    return () => clearTimeout(t);
  }, [nodes.length]);
  const nextLayer = () => {
    const n = new Set(expanded);
    visible.forEach((id) => {
      if (children.has(id)) n.add(id);
    });
    setExpanded(n);
    setFitNonce((n) => n + 1);
  };
  return (
    <div className="chart-shell">
      <div className="chart-actions">
        <button onClick={nextLayer}>
          <Layers size={15} />
          Expand next layer
        </button>
        <button
          onClick={() => {
            setExpanded(new Set());
            setFitNonce((n) => n + 1);
          }}
        >
          <Minimize2 size={15} />
          Collapse all
        </button>
        <button
          onClick={() => setFitNonce((n) => n + 1)}
          aria-label="Fit chart to view"
        >
          <Maximize size={15} />
          <span>Fit view</span>
        </button>
      </div>
      {focus && (
        <div className="focus-badge">
          <Focus size={13} />
          Focused on {byId.get(focus)?.[titleField]}
          <button onClick={onClearFocus}>Show all</button>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        minZoom={0.25}
        maxZoom={1.5}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        proOptions={{ hideAttribution: false }}
        onlyRenderVisibleElements
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#d8d8d8"
        />
        <Controls showInteractive={false} />
      </ReactFlow>
      <div
        className="chart-legend tier-color-legend"
        aria-label="Card background legend"
      >
        <strong>
          {colorTier === "auto" ? "Auto · " : ""}Tier {effectiveTier} ·{" "}
          {tierName(effectiveTier)}
        </strong>
        <div className="tier-color-swatches">
          {legend.map((color) => (
            <span key={color.id} title={colorDescription(color)}>
              <i
                style={{
                  background: color.background,
                  borderColor: color.accent,
                }}
              />
              {color.label}
              {color.fallback ? " (fallback)" : ""}
            </span>
          ))}
        </div>
        <small>
          Backgrounds follow unit assignments. Split bars show company
          allocation.
        </small>
      </div>
      <div className="chart-count">
        {visible.size} of {records.length} {unit ? "units" : "people"} visible ·
        Totals include collapsed branches
      </div>
      {!records.length && (
        <div className="chart-empty">
          <Building2 size={34} />
          <h3>Your organization starts here</h3>
          <p>Import a workbook to build your first organization chart.</p>
        </div>
      )}
    </div>
  );
}
export default function OrgChart(props: ChartProps) {
  return (
    <ReactFlowProvider>
      <ChartInner {...props} />
    </ReactFlowProvider>
  );
}
