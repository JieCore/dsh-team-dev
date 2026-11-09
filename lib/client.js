// 本文件由 scripts/build-client.mjs 从 src/client 生成，请勿直接修改。
window.__ModuleLoader__.load({
  id: "dsh-team-dev",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    (function (module, exports, require) {
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.jsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var React3 = __toESM(require("react"), 1);

// src/client/TeamBoard.jsx
var React2 = __toESM(require("react"), 1);
var import_react2 = require("react");

// src/client/api.js
var PREFIX = "/api/dsh-team-dev";
var POLL_INTERVAL_MS = 5e3;
var BACKOFF_MS = [5e3, 15e3, 3e4];
var TASK_STATUSES = ["pending", "in_progress", "completed"];
var ApiError = class extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
};
async function request(path, { signal } = {}) {
  let response;
  try {
    response = await fetch(path, { credentials: "same-origin", cache: "no-store", signal });
  } catch (error) {
    if (error && error.name === "AbortError") throw error;
    throw new ApiError("无法连接本机接口，请确认 dsh-team-dev 已加载。", 0);
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message = data && typeof data.error === "string" ? data.error : `请求失败（HTTP ${response.status}）。`;
    throw new ApiError(message, response.status);
  }
  return data;
}
function fetchTeams({ signal } = {}) {
  return request(`${PREFIX}/teams`, { signal });
}
async function fetchTeam(teamId, { signal } = {}) {
  const id = encodeURIComponent(teamId);
  try {
    return await request(`${PREFIX}/teams/${id}`, { signal });
  } catch (error) {
    if (error && error.name === "AbortError") throw error;
    try {
      return await request(`${PREFIX}/teams?teamId=${id}`, { signal });
    } catch (fallbackError) {
      if (fallbackError && fallbackError.name === "AbortError") throw fallbackError;
      throw error;
    }
  }
}
function teamMatchesSession(team, sessionId) {
  if (!team || !sessionId) return false;
  if (team.teamId === sessionId || team.leadSessionId === sessionId) return true;
  const members = Array.isArray(team.members) ? team.members : [];
  return members.some((member) => Boolean(member) && member.id === sessionId);
}
function pickTeamId(teams, sessionId, lastSelectedId, manual = false) {
  const list = Array.isArray(teams) ? teams : [];
  if (list.length === 0) return null;
  if (!manual) {
    const current = list.find((team) => teamMatchesSession(team, sessionId));
    if (current) return current.teamId;
  }
  if (lastSelectedId && list.some((team) => team.teamId === lastSelectedId)) return lastSelectedId;
  return list[0].teamId;
}
function shortTeamId(teamId) {
  const text = typeof teamId === "string" ? teamId : "";
  return text.length > 8 ? text.slice(0, 8) : text;
}
function taskTotal(taskCounts) {
  if (!taskCounts || typeof taskCounts !== "object") return 0;
  return TASK_STATUSES.reduce((sum, status) => sum + (Number(taskCounts[status]) || 0), 0);
}
function groupTasks(tasks) {
  const groups = { pending: [], in_progress: [], completed: [] };
  const list = Array.isArray(tasks) ? tasks : [];
  for (const task of list) {
    if (!task || task.status === "deleted") continue;
    if (groups[task.status]) groups[task.status].push(task);
  }
  return groups;
}

// src/client/styles.js
var muted = "var(--dsw-text-secondary, rgba(127, 127, 127, 0.95))";
var faint = "var(--dsw-text-tertiary, rgba(127, 127, 127, 0.72))";
var line = "1px solid var(--dsw-border, rgba(127, 127, 127, 0.28))";
var softLine = "1px solid var(--dsw-border-subtle, rgba(127, 127, 127, 0.18))";
var surface = "var(--dsw-surface, rgba(127, 127, 127, 0.07))";
var surfaceStrong = "var(--dsw-surface-strong, rgba(127, 127, 127, 0.13))";
var radius = 8;
var styles = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 12,
    boxSizing: "border-box",
    height: "100%",
    minHeight: 0,
    overflowY: "auto",
    fontSize: 12,
    lineHeight: 1.5,
    color: "inherit"
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    flex: "0 0 auto"
  },
  selectorLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: muted
  },
  select: {
    padding: "4px 6px",
    borderRadius: 6,
    border: line,
    background: surface,
    color: "inherit",
    fontSize: 12,
    maxWidth: 260
  },
  button: {
    padding: "4px 10px",
    borderRadius: 6,
    border: line,
    background: surface,
    color: "inherit",
    fontSize: 12,
    cursor: "pointer"
  },
  buttonDisabled: {
    opacity: 0.55,
    cursor: "default"
  },
  linkButton: {
    padding: 0,
    border: "none",
    background: "transparent",
    color: "inherit",
    fontSize: 12,
    textDecoration: "underline",
    cursor: "pointer"
  },
  updated: {
    marginLeft: "auto",
    color: faint,
    whiteSpace: "nowrap"
  },
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 8px",
    borderRadius: 6,
    border: softLine,
    borderLeft: "3px solid currentColor",
    background: surface,
    flex: "0 0 auto"
  },
  bannerText: {
    flex: "1 1 auto"
  },
  members: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    flex: "0 0 auto"
  },
  filterChip: {
    padding: "2px 8px",
    borderRadius: 999,
    border: softLine,
    background: "transparent",
    color: muted,
    fontSize: 12,
    cursor: "pointer"
  },
  filterChipActive: {
    border: line,
    background: surfaceStrong,
    color: "inherit"
  },
  content: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minHeight: 0
  },
  columns: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    minHeight: 0
  },
  column: {
    flex: "1 1 0",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 8,
    borderRadius: radius,
    border: softLine,
    background: surface
  },
  columnCollapsed: {
    flex: "0 0 auto",
    width: 110
  },
  columnHead: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    paddingBottom: 6,
    borderBottom: softLine
  },
  columnHeadButton: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: 0,
    border: "none",
    background: "transparent",
    color: "inherit",
    fontSize: 12,
    cursor: "pointer",
    textAlign: "left"
  },
  columnTitle: {
    fontWeight: 600,
    whiteSpace: "nowrap"
  },
  count: {
    minWidth: 18,
    padding: "0 5px",
    borderRadius: 999,
    background: surfaceStrong,
    color: muted,
    textAlign: "center",
    fontSize: 11
  },
  chevron: {
    color: faint,
    fontSize: 10
  },
  taskList: {
    display: "flex",
    flexDirection: "column",
    gap: 6
  },
  columnEmpty: {
    padding: "8px 2px",
    color: faint
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 8,
    borderRadius: 6,
    border: softLine,
    background: "var(--dsw-surface-raised, rgba(127, 127, 127, 0.05))"
  },
  cardTitle: {
    fontWeight: 600,
    wordBreak: "break-word"
  },
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4
  },
  ownerChip: {
    padding: "0 6px",
    borderRadius: 999,
    border: softLine,
    background: surface,
    whiteSpace: "nowrap"
  },
  blockedChip: {
    padding: "0 6px",
    borderRadius: 999,
    border: line,
    background: surfaceStrong,
    whiteSpace: "nowrap",
    color: "inherit",
    fontWeight: 600
  },
  metaChip: {
    padding: "0 6px",
    borderRadius: 999,
    color: faint,
    whiteSpace: "nowrap"
  },
  cardActions: {
    alignSelf: "flex-start",
    padding: 0,
    border: "none",
    background: "transparent",
    color: muted,
    fontSize: 11,
    textDecoration: "underline",
    cursor: "pointer"
  },
  details: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    paddingTop: 6,
    borderTop: softLine,
    color: muted
  },
  detailText: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: "inherit"
  },
  detailRow: {
    display: "flex",
    gap: 6,
    alignItems: "baseline",
    flexWrap: "wrap"
  },
  detailLabel: {
    color: faint,
    whiteSpace: "nowrap"
  },
  detailValue: {
    color: "inherit",
    wordBreak: "break-word"
  },
  depRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
    alignItems: "center"
  },
  depChip: {
    padding: "0 5px",
    borderRadius: 4,
    background: surfaceStrong,
    fontSize: 11
  },
  scopeChip: {
    padding: "0 5px",
    borderRadius: 4,
    background: surfaceStrong,
    fontSize: 11,
    wordBreak: "break-all"
  },
  warningText: {
    color: "inherit",
    fontWeight: 600,
    wordBreak: "break-word"
  },
  skeleton: {
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  skeletonTitle: {
    color: muted
  },
  skeletonColumns: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start"
  },
  skeletonColumn: {
    flex: "1 1 0",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 8,
    borderRadius: radius,
    border: softLine,
    background: surface
  },
  skeletonLine: {
    height: 12,
    width: "55%",
    borderRadius: 4,
    background: surfaceStrong
  },
  skeletonCard: {
    height: 44,
    borderRadius: 6,
    background: surfaceStrong
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 8,
    padding: 16,
    borderRadius: radius,
    border: softLine,
    background: surface
  },
  emptyTitle: {
    fontWeight: 600,
    color: "inherit"
  },
  emptyHint: {
    color: muted
  },
  errorPanel: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 8,
    padding: 16,
    borderRadius: radius,
    border: line,
    background: surface
  },
  boundary: {
    padding: 12,
    fontSize: 12,
    color: "inherit"
  },
  /* ---------- v0.2.1 全部团队总览 ---------- */
  topbar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    flex: "0 0 auto"
  },
  viewSwitch: {
    display: "inline-flex",
    gap: 2,
    padding: 2,
    borderRadius: radius,
    border: softLine,
    background: surface
  },
  viewSwitchButton: {
    border: "none",
    background: "transparent",
    color: muted,
    font: "inherit",
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 6,
    cursor: "pointer"
  },
  viewSwitchButtonActive: {
    background: surfaceStrong,
    color: "inherit",
    fontWeight: 600
  },
  overviewRoot: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minHeight: 0
  },
  overviewStats: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 8
  },
  overviewStat: {
    padding: "8px 10px",
    borderRadius: radius,
    border: softLine,
    background: surface
  },
  overviewStatLabel: {
    fontSize: 11,
    color: muted
  },
  overviewStatValue: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: 650,
    color: "inherit"
  },
  overviewToolbar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap"
  },
  overviewSearch: {
    flex: "1 1 140px",
    minWidth: 120,
    padding: "5px 9px",
    borderRadius: 6,
    border: softLine,
    background: surface,
    color: "inherit",
    font: "inherit",
    fontSize: 12
  },
  overviewLegend: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    fontSize: 11,
    color: muted
  },
  overviewLegendDot: {
    display: "inline-block",
    width: 6,
    height: 6,
    borderRadius: 2,
    marginRight: 4
  },
  overviewList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minHeight: 0,
    overflowY: "auto"
  },
  overviewCard: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 10,
    borderRadius: radius,
    border: softLine,
    background: surface
  },
  overviewCardCurrent: {
    border: line,
    background: surfaceStrong
  },
  overviewCardTop: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8
  },
  overviewName: {
    fontSize: 13,
    fontWeight: 650,
    color: "inherit",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  overviewId: {
    marginTop: 2,
    fontSize: 10.5,
    color: faint,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  overviewBadge: {
    marginLeft: "auto",
    flex: "0 0 auto",
    fontSize: 10.5,
    padding: "2px 7px",
    borderRadius: 999,
    border: softLine,
    color: muted
  },
  overviewBadgeActive: {
    color: "#3b82f6",
    borderColor: "rgba(59, 130, 246, 0.45)"
  },
  overviewBadgePending: {
    color: "#d97706",
    borderColor: "rgba(217, 119, 6, 0.45)"
  },
  overviewBadgeDone: {
    color: "#059669",
    borderColor: "rgba(5, 150, 105, 0.45)"
  },
  overviewBadgeCurrent: {
    marginLeft: 6,
    color: muted
  },
  overviewMembers: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    minWidth: 0
  },
  overviewAvatars: {
    display: "inline-flex",
    flex: "0 0 auto"
  },
  overviewAvatar: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    marginLeft: -4,
    border: "1px solid rgba(127, 127, 127, 0.35)",
    background: surfaceStrong,
    color: "inherit",
    fontSize: 9,
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center"
  },
  overviewAvatarFirst: {
    marginLeft: 0
  },
  overviewAvatarMore: {
    fontSize: 9,
    color: muted,
    marginLeft: 4
  },
  overviewMeta: {
    fontSize: 11,
    color: muted,
    marginLeft: "auto",
    flex: "0 0 auto"
  },
  overviewProgressRow: {
    display: "flex",
    alignItems: "center",
    gap: 8
  },
  overviewBar: {
    display: "flex",
    flex: "1 1 auto",
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
    background: "rgba(127, 127, 127, 0.18)"
  },
  overviewBarDone: {
    background: "#059669"
  },
  overviewBarActive: {
    background: "#3b82f6"
  },
  overviewBarPending: {
    background: "rgba(127, 127, 127, 0.45)"
  },
  overviewPercent: {
    flex: "0 0 auto",
    fontSize: 11,
    color: muted,
    fontVariantNumeric: "tabular-nums"
  },
  overviewCounts: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    fontSize: 11,
    color: muted
  },
  overviewOpen: {
    alignSelf: "flex-start",
    border: softLine,
    background: "transparent",
    color: "inherit",
    font: "inherit",
    fontSize: 11.5,
    padding: "3px 9px",
    borderRadius: 6,
    cursor: "pointer"
  },
  overviewEmpty: {
    padding: 14,
    borderRadius: radius,
    border: softLine,
    background: surface,
    color: muted,
    fontSize: 12
  }
};

// src/client/Overview.jsx
var React = __toESM(require("react"), 1);
var import_react = require("react");

// src/client/overview.js
var OVERVIEW_FILTERS = ["all", "active", "pending", "done"];
var OVERVIEW_SORTS = ["active", "total", "name"];
function teamCounts(team) {
  const counts = team && team.taskCounts && typeof team.taskCounts === "object" ? team.taskCounts : {};
  const pending = Number(counts.pending) || 0;
  const inProgress = Number(counts.in_progress) || 0;
  const completed = Number(counts.completed) || 0;
  return { pending, in_progress: inProgress, completed, total: pending + inProgress + completed };
}
function teamProgress(team) {
  const counts = teamCounts(team);
  const percent = counts.total > 0 ? Math.round(counts.completed / counts.total * 100) : 0;
  return { completed: counts.completed, total: counts.total, percent };
}
function teamState(team) {
  const counts = teamCounts(team);
  if (counts.in_progress > 0) return "active";
  if (counts.pending > 0) return "pending";
  return "done";
}
function overviewSummary(teams) {
  const list = Array.isArray(teams) ? teams : [];
  let tasks = 0;
  let inProgress = 0;
  let completed = 0;
  for (const team of list) {
    const counts = teamCounts(team);
    tasks += counts.total;
    inProgress += counts.in_progress;
    completed += counts.completed;
  }
  return { teams: list.length, tasks, inProgress, completed };
}
function teamDisplayName(team) {
  const lead = team && typeof team.leadName === "string" && team.leadName.length > 0 ? team.leadName : "lead";
  return `${lead} · ${shortTeamId(team && team.teamId)}`;
}
function memberInitial(member) {
  const name = member && typeof member.name === "string" ? member.name.trim() : "";
  if (name.length === 0) return "?";
  const chars = Array.from(name);
  return chars.length > 1 && /[A-Za-z]/.test(chars[0]) ? chars.slice(0, 1).join("").toUpperCase() : chars[0].toUpperCase();
}
function filterTeams(teams, filter = "all", query = "") {
  const list = Array.isArray(teams) ? teams : [];
  const needle = typeof query === "string" ? query.trim().toLowerCase() : "";
  return list.filter((team) => {
    if (filter !== "all" && teamState(team) !== filter) return false;
    if (needle === "") return true;
    const lead = team && typeof team.leadName === "string" ? team.leadName.toLowerCase() : "";
    const id = team && typeof team.teamId === "string" ? team.teamId.toLowerCase() : "";
    return lead.includes(needle) || id.includes(needle);
  });
}
function sortTeams(teams, sort = "active") {
  const list = Array.isArray(teams) ? teams : [];
  const byId = (left, right) => String(left && left.teamId).localeCompare(String(right && right.teamId));
  const sorted = list.slice();
  sorted.sort((left, right) => {
    let primary = 0;
    if (sort === "total") {
      primary = teamCounts(right).total - teamCounts(left).total;
    } else if (sort === "name") {
      primary = teamDisplayName(left).localeCompare(teamDisplayName(right));
    } else {
      primary = teamCounts(right).in_progress - teamCounts(left).in_progress;
    }
    return primary !== 0 ? primary : byId(left, right);
  });
  return sorted;
}
function overviewTeams(teams, { filter = "all", sort = "active", query = "" } = {}) {
  return sortTeams(filterTeams(teams, filter, query), sort);
}

// src/client/Overview.jsx
function stateBadgeStyle(state) {
  if (state === "active") return { ...styles.overviewBadge, ...styles.overviewBadgeActive };
  if (state === "pending") return { ...styles.overviewBadge, ...styles.overviewBadgePending };
  return { ...styles.overviewBadge, ...styles.overviewBadgeDone };
}
function segmentWidth(value, total) {
  if (total <= 0) return "0%";
  return `${Math.round(value / total * 1e3) / 10}%`;
}
function StatCard({ label, value }) {
  return /* @__PURE__ */ React.createElement("div", { style: styles.overviewStat }, /* @__PURE__ */ React.createElement("div", { style: styles.overviewStatLabel }, label), /* @__PURE__ */ React.createElement("div", { style: styles.overviewStatValue }, value));
}
function TeamCard({ team, current, t, onOpenTeam }) {
  const counts = teamCounts(team);
  const progress = teamProgress(team);
  const state = teamState(team);
  const members = Array.isArray(team.members) ? team.members : [];
  const shown = members.slice(0, 5);
  const cardStyle = current ? { ...styles.overviewCard, ...styles.overviewCardCurrent } : styles.overviewCard;
  return /* @__PURE__ */ React.createElement("div", { style: cardStyle }, /* @__PURE__ */ React.createElement("div", { style: styles.overviewCardTop }, /* @__PURE__ */ React.createElement("div", { style: { minWidth: 0, flex: "1 1 auto" } }, /* @__PURE__ */ React.createElement("div", { style: styles.overviewName }, teamDisplayName(team)), /* @__PURE__ */ React.createElement("div", { style: styles.overviewId, title: String(team.teamId ?? "") }, String(team.teamId ?? ""))), current ? /* @__PURE__ */ React.createElement("span", { style: styles.overviewBadge }, t("overview.current")) : null, /* @__PURE__ */ React.createElement("span", { style: stateBadgeStyle(state) }, t(`overview.status.${state}`))), /* @__PURE__ */ React.createElement("div", { style: styles.overviewMembers }, /* @__PURE__ */ React.createElement("span", { style: styles.overviewAvatars }, shown.map((member, index) => /* @__PURE__ */ React.createElement(
    "span",
    {
      key: String(member && member.id !== void 0 ? member.id : index),
      style: index === 0 ? { ...styles.overviewAvatar, ...styles.overviewAvatarFirst } : styles.overviewAvatar,
      title: member && member.name ? member.name : t("member.unknown")
    },
    memberInitial(member)
  ))), members.length > shown.length ? /* @__PURE__ */ React.createElement("span", { style: styles.overviewAvatarMore }, `+${members.length - shown.length}`) : null, /* @__PURE__ */ React.createElement("span", { style: styles.overviewMeta }, `${members.length}${t("overview.members")} · ${counts.total}${t("overview.tasks")}`)), /* @__PURE__ */ React.createElement("div", { style: styles.overviewProgressRow }, /* @__PURE__ */ React.createElement("div", { style: styles.overviewBar }, /* @__PURE__ */ React.createElement("span", { style: { ...styles.overviewBarDone, width: segmentWidth(progress.completed, counts.total) } }), /* @__PURE__ */ React.createElement("span", { style: { ...styles.overviewBarActive, width: segmentWidth(counts.in_progress, counts.total) } }), /* @__PURE__ */ React.createElement("span", { style: { ...styles.overviewBarPending, flex: "1 1 auto" } })), /* @__PURE__ */ React.createElement("span", { style: styles.overviewPercent }, `${progress.completed}/${progress.total} · ${progress.percent}%`)), /* @__PURE__ */ React.createElement("div", { style: styles.overviewCounts }, /* @__PURE__ */ React.createElement("span", null, `${t("column.pending")} ${counts.pending}`), /* @__PURE__ */ React.createElement("span", null, `${t("column.inProgress")} ${counts.in_progress}`), /* @__PURE__ */ React.createElement("span", null, `${t("column.completed")} ${counts.completed}`), /* @__PURE__ */ React.createElement("button", { type: "button", style: { ...styles.overviewOpen, marginLeft: "auto" }, onClick: () => onOpenTeam(team.teamId) }, `${t("overview.open")} →`)));
}
function Overview({ teams, sessionId, t, loading, degraded, onOpenTeam }) {
  const [sort, setSort] = (0, import_react.useState)("active");
  const [filter, setFilter] = (0, import_react.useState)("all");
  const [query, setQuery] = (0, import_react.useState)("");
  const list = Array.isArray(teams) ? teams : [];
  const summary = (0, import_react.useMemo)(() => overviewSummary(list), [list]);
  const visible = (0, import_react.useMemo)(() => overviewTeams(list, { filter, sort, query }), [list, filter, sort, query]);
  if (loading) {
    return /* @__PURE__ */ React.createElement("div", { style: styles.overviewRoot }, /* @__PURE__ */ React.createElement("div", { style: styles.overviewEmpty }, t("loading")));
  }
  if (degraded) {
    return /* @__PURE__ */ React.createElement("div", { style: styles.overviewRoot }, /* @__PURE__ */ React.createElement("div", { style: styles.overviewEmpty }, t("overview.degraded")));
  }
  return /* @__PURE__ */ React.createElement("div", { style: styles.overviewRoot }, /* @__PURE__ */ React.createElement("div", { style: styles.overviewStats }, /* @__PURE__ */ React.createElement(StatCard, { label: t("overview.stats.teams"), value: summary.teams }), /* @__PURE__ */ React.createElement(StatCard, { label: t("overview.stats.tasks"), value: summary.tasks }), /* @__PURE__ */ React.createElement(StatCard, { label: t("overview.stats.active"), value: summary.inProgress }), /* @__PURE__ */ React.createElement(StatCard, { label: t("overview.stats.done"), value: summary.completed })), /* @__PURE__ */ React.createElement("div", { style: styles.overviewToolbar }, /* @__PURE__ */ React.createElement("select", { style: styles.select, value: sort, onChange: (event) => setSort(event.target.value), "aria-label": t("overview.progress") }, OVERVIEW_SORTS.map((value) => /* @__PURE__ */ React.createElement("option", { key: value, value }, t(`overview.sort.${value}`)))), /* @__PURE__ */ React.createElement("select", { style: styles.select, value: filter, onChange: (event) => setFilter(event.target.value) }, OVERVIEW_FILTERS.map((value) => /* @__PURE__ */ React.createElement("option", { key: value, value }, t(`overview.filter.${value}`)))), /* @__PURE__ */ React.createElement(
    "input",
    {
      style: styles.overviewSearch,
      type: "search",
      value: query,
      placeholder: t("overview.search"),
      onChange: (event) => setQuery(event.target.value)
    }
  )), /* @__PURE__ */ React.createElement("div", { style: styles.overviewList }, list.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: styles.overviewEmpty }, t("overview.empty")) : visible.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: styles.overviewEmpty }, t("overview.empty")) : visible.map((team) => /* @__PURE__ */ React.createElement(
    TeamCard,
    {
      key: String(team.teamId),
      team,
      current: teamMatchesSession(team, sessionId),
      t,
      onOpenTeam
    }
  ))));
}

// src/client/TeamBoard.jsx
var COLUMNS = [
  { status: "pending", labelKey: "column.pending" },
  { status: "in_progress", labelKey: "column.inProgress" },
  { status: "completed", labelKey: "column.completed" }
];
var INITIAL_SNAPSHOT = {
  status: "loading",
  teams: [],
  degraded: false,
  reason: null,
  teamId: null,
  team: null,
  error: null,
  updatedAt: null,
  refreshing: false
};
function formatTime(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleTimeString();
  } catch {
    return "";
  }
}
function describeError(error, t) {
  if (error instanceof ApiError && error.status === 404) return t("error.teamGone");
  return t("error.load");
}
function teamOptionLabel(team, t) {
  const lead = team.leadName || "lead";
  const memberCount = Array.isArray(team.members) ? team.members.length : Number(team.memberCount) || 0;
  const total = taskTotal(team.taskCounts);
  return `${lead} · ${shortTeamId(team.teamId)} · ${memberCount}${t("unit.member")} · ${total}${t("unit.task")}`;
}
function memberMeta(member, t) {
  const role = member.role === "lead" ? t("member.lead") : member.role || "";
  const parts = [role, member.status, member.model].filter((part) => typeof part === "string" && part.length > 0);
  return parts.join(" · ");
}
function warningText(warnings) {
  return warnings.map((item) => typeof item === "string" ? item : String(item)).join("；");
}
function TaskCard({ task, t, expanded, onToggle }) {
  const blockedBy = Array.isArray(task.blockedBy) ? task.blockedBy.filter(Boolean) : [];
  const writeScopes = Array.isArray(task.writeScopes) ? task.writeScopes : [];
  const warnings = Array.isArray(task.writeScopeWarnings) ? task.writeScopeWarnings : [];
  const owner = task.ownerName || t("task.unassigned");
  return /* @__PURE__ */ React2.createElement("div", { style: styles.card }, /* @__PURE__ */ React2.createElement("div", { style: styles.cardTitle }, task.subject || t("task.untitled")), /* @__PURE__ */ React2.createElement("div", { style: styles.chipRow }, /* @__PURE__ */ React2.createElement("span", { style: styles.ownerChip }, owner), task.ready === false ? /* @__PURE__ */ React2.createElement("span", { style: styles.blockedChip }, `${t("task.blocked")}（${blockedBy.length}）`) : null, /* @__PURE__ */ React2.createElement("span", { style: styles.metaChip }, `${t("task.revision")} ${String(task.revision ?? 0)}`), warnings.length > 0 ? /* @__PURE__ */ React2.createElement("span", { style: styles.blockedChip }, t("task.warnings")) : null), blockedBy.length > 0 ? /* @__PURE__ */ React2.createElement("div", { style: styles.depRow }, /* @__PURE__ */ React2.createElement("span", { style: styles.detailLabel }, t("task.blockedBy")), blockedBy.map((id) => /* @__PURE__ */ React2.createElement("code", { key: String(id), style: styles.depChip }, shortTeamId(String(id))))) : null, expanded ? /* @__PURE__ */ React2.createElement("div", { style: styles.details }, task.description ? /* @__PURE__ */ React2.createElement("div", { style: styles.detailText }, task.description) : null, /* @__PURE__ */ React2.createElement("div", { style: styles.detailRow }, /* @__PURE__ */ React2.createElement("span", { style: styles.detailLabel }, t("task.writeScopes")), /* @__PURE__ */ React2.createElement("span", { style: styles.detailValue }, writeScopes.length === 0 ? t("task.none") : writeScopes.map((scope) => /* @__PURE__ */ React2.createElement("code", { key: scope, style: styles.scopeChip }, scope)))), warnings.length > 0 ? /* @__PURE__ */ React2.createElement("div", { style: styles.warningText }, `${t("task.warnings")}：${warningText(warnings)}`) : null) : null, /* @__PURE__ */ React2.createElement("button", { type: "button", style: styles.cardActions, onClick: onToggle }, expanded ? t("task.collapse") : t("task.details")));
}
function TeamBoard(props) {
  const t = props.t;
  const sessionId = props.sessionId;
  const [snapshot, setSnapshot] = (0, import_react2.useState)(INITIAL_SNAPSHOT);
  const [view, setView] = (0, import_react2.useState)("session");
  const [completedOpen, setCompletedOpen] = (0, import_react2.useState)(false);
  const [memberFilter, setMemberFilter] = (0, import_react2.useState)(null);
  const [expandedTaskId, setExpandedTaskId] = (0, import_react2.useState)(null);
  const translateRef = (0, import_react2.useRef)(t);
  translateRef.current = t;
  const manualRef = (0, import_react2.useRef)(false);
  const selectedRef = (0, import_react2.useRef)(null);
  const refreshRef = (0, import_react2.useRef)(() => {
  });
  const { status, teams, degraded, teamId, team, error, updatedAt, refreshing } = snapshot;
  const activeTeam = team;
  (0, import_react2.useEffect)(() => {
    let disposed = false;
    let timer = null;
    let controller = null;
    let failures = 0;
    let generation = 0;
    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const abortInFlight = () => {
      if (controller) {
        controller.abort();
        controller = null;
      }
    };
    const schedule = (delay) => {
      if (disposed) return;
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        void refresh("poll");
      }, delay);
    };
    async function refresh(mode) {
      if (disposed) return;
      const mine = ++generation;
      abortInFlight();
      controller = new AbortController();
      const { signal } = controller;
      if (mode === "manual") setSnapshot((prev) => ({ ...prev, refreshing: true }));
      let nextDelay = POLL_INTERVAL_MS;
      try {
        const teamsPayload = await fetchTeams({ signal });
        if (disposed || mine !== generation) return;
        const nextTeams = Array.isArray(teamsPayload && teamsPayload.teams) ? teamsPayload.teams : [];
        const degradedNow = Boolean(teamsPayload && teamsPayload.degraded === true);
        const reason = teamsPayload && typeof teamsPayload.reason === "string" ? teamsPayload.reason : null;
        const keepManual = manualRef.current && selectedRef.current !== null && nextTeams.some((item) => item.teamId === selectedRef.current);
        const nextTeamId = pickTeamId(nextTeams, sessionId, selectedRef.current, keepManual);
        manualRef.current = keepManual;
        selectedRef.current = nextTeamId;
        let nextTeam = null;
        let missingTeam = false;
        if (nextTeamId !== null) {
          try {
            const detailPayload = await fetchTeam(nextTeamId, { signal });
            if (disposed || mine !== generation) return;
            nextTeam = detailPayload && detailPayload.team ? detailPayload.team : null;
          } catch (detailError) {
            if (detailError && detailError.name === "AbortError") throw detailError;
            if (detailError instanceof ApiError && detailError.status === 404) {
              missingTeam = true;
              const fallbackId = nextTeams.length > 0 ? nextTeams[0].teamId : null;
              manualRef.current = false;
              selectedRef.current = fallbackId;
              if (fallbackId !== null) {
                const retryPayload = await fetchTeam(fallbackId, { signal });
                if (disposed || mine !== generation) return;
                nextTeam = retryPayload && retryPayload.team ? retryPayload.team : null;
              }
            } else {
              throw detailError;
            }
          }
        }
        failures = 0;
        setSnapshot({
          status: "ready",
          teams: nextTeams,
          degraded: degradedNow,
          reason,
          teamId: nextTeamId,
          team: nextTeam,
          error: missingTeam ? { kind: "not-found" } : null,
          updatedAt: Date.now(),
          refreshing: false
        });
      } catch (requestError) {
        if (disposed || requestError && requestError.name === "AbortError") return;
        failures += 1;
        nextDelay = BACKOFF_MS[Math.min(failures - 1, BACKOFF_MS.length - 1)];
        const message = describeError(requestError, translateRef.current);
        setSnapshot((prev) => ({
          ...prev,
          status: prev.team ? "ready" : "error",
          error: { kind: "request", message },
          refreshing: false
        }));
      } finally {
        if (!disposed && mine === generation) {
          controller = null;
          const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
          if (!hidden) schedule(nextDelay);
        }
      }
    }
    const onVisibilityChange = () => {
      if (disposed) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        clearTimer();
        abortInFlight();
      } else {
        clearTimer();
        void refresh("visible");
      }
    };
    manualRef.current = false;
    selectedRef.current = null;
    setSnapshot(INITIAL_SNAPSHOT);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibilityChange);
    refreshRef.current = () => {
      clearTimer();
      void refresh("manual");
    };
    void refresh("initial");
    return () => {
      disposed = true;
      clearTimer();
      abortInFlight();
      refreshRef.current = () => {
      };
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [sessionId]);
  (0, import_react2.useEffect)(() => {
    setExpandedTaskId(null);
    setMemberFilter(null);
  }, [teamId]);
  const groups = (0, import_react2.useMemo)(() => groupTasks(activeTeam ? activeTeam.tasks : []), [activeTeam]);
  const filteredGroups = (0, import_react2.useMemo)(() => {
    if (memberFilter === null) return groups;
    const result = {};
    for (const columnStatus of Object.keys(groups)) {
      result[columnStatus] = groups[columnStatus].filter((task) => task.ownerName === memberFilter);
    }
    return result;
  }, [groups, memberFilter]);
  const members = (0, import_react2.useMemo)(() => {
    const list = activeTeam && Array.isArray(activeTeam.members) ? activeTeam.members.slice() : [];
    list.sort((left, right) => {
      const lead = Number(right.role === "lead") - Number(left.role === "lead");
      if (lead !== 0) return lead;
      const byName = String(left.name ?? "").localeCompare(String(right.name ?? ""));
      return byName !== 0 ? byName : String(left.id ?? "").localeCompare(String(right.id ?? ""));
    });
    return list;
  }, [activeTeam]);
  const handleRefresh = () => {
    refreshRef.current();
  };
  const handleOpenTeam = (nextTeamId) => {
    if (!nextTeamId) return;
    manualRef.current = true;
    selectedRef.current = nextTeamId;
    setView("session");
    handleRefresh();
  };
  const handleSelectTeam = (event) => {
    const nextTeamId = event.target.value;
    if (!nextTeamId) return;
    manualRef.current = true;
    selectedRef.current = nextTeamId;
    handleRefresh();
  };
  const errorMessage = error && error.kind === "request" ? error.message : null;
  const teamGone = Boolean(error && error.kind === "not-found");
  const skeleton = /* @__PURE__ */ React2.createElement("div", { style: styles.skeleton }, /* @__PURE__ */ React2.createElement("div", { style: styles.skeletonTitle }, t("loading")), /* @__PURE__ */ React2.createElement("div", { style: styles.skeletonColumns }, COLUMNS.map((column) => /* @__PURE__ */ React2.createElement("div", { key: column.status, style: styles.skeletonColumn }, /* @__PURE__ */ React2.createElement("div", { style: styles.skeletonLine }), /* @__PURE__ */ React2.createElement("div", { style: styles.skeletonCard }), /* @__PURE__ */ React2.createElement("div", { style: styles.skeletonCard })))));
  const emptyState = /* @__PURE__ */ React2.createElement("div", { style: styles.empty }, /* @__PURE__ */ React2.createElement("div", { style: styles.emptyTitle }, degraded ? t("empty.degraded") : t("empty.teams")), /* @__PURE__ */ React2.createElement("button", { type: "button", style: styles.button, onClick: handleRefresh }, t("refresh")));
  const errorState = (message) => /* @__PURE__ */ React2.createElement("div", { style: styles.errorPanel }, /* @__PURE__ */ React2.createElement("div", { style: styles.emptyTitle }, message), /* @__PURE__ */ React2.createElement("button", { type: "button", style: styles.button, onClick: handleRefresh }, t("retry")));
  const board = activeTeam ? /* @__PURE__ */ React2.createElement("div", { style: styles.content }, members.length > 0 ? /* @__PURE__ */ React2.createElement("div", { style: styles.members }, /* @__PURE__ */ React2.createElement(
    "button",
    {
      type: "button",
      style: memberFilter === null ? { ...styles.filterChip, ...styles.filterChipActive } : styles.filterChip,
      onClick: () => setMemberFilter(null)
    },
    t("filter.all")
  ), members.map((member) => {
    const label = member.name || t("member.unknown");
    const active = memberFilter !== null && memberFilter === member.name;
    return /* @__PURE__ */ React2.createElement(
      "button",
      {
        key: String(member.id),
        type: "button",
        title: memberMeta(member, t),
        style: active ? { ...styles.filterChip, ...styles.filterChipActive } : styles.filterChip,
        onClick: () => {
          if (!member.name) return;
          setMemberFilter((prev) => prev === member.name ? null : member.name);
        }
      },
      member.role === "lead" ? `${label} · ${t("member.lead")}` : label
    );
  })) : null, /* @__PURE__ */ React2.createElement("div", { style: styles.columns }, COLUMNS.map((column) => {
    const tasks = filteredGroups[column.status] || [];
    const collapsed = column.status === "completed" && !completedOpen;
    const columnStyle = collapsed ? { ...styles.column, ...styles.columnCollapsed } : styles.column;
    return /* @__PURE__ */ React2.createElement("section", { key: column.status, style: columnStyle }, column.status === "completed" ? /* @__PURE__ */ React2.createElement(
      "button",
      {
        type: "button",
        style: styles.columnHeadButton,
        onClick: () => setCompletedOpen((open) => !open)
      },
      /* @__PURE__ */ React2.createElement("span", { style: styles.columnTitle }, t(column.labelKey)),
      /* @__PURE__ */ React2.createElement("span", { style: styles.count }, tasks.length),
      /* @__PURE__ */ React2.createElement("span", { style: styles.chevron }, completedOpen ? "▾" : "▸")
    ) : /* @__PURE__ */ React2.createElement("div", { style: styles.columnHead }, /* @__PURE__ */ React2.createElement("span", { style: styles.columnTitle }, t(column.labelKey)), /* @__PURE__ */ React2.createElement("span", { style: styles.count }, tasks.length)), collapsed ? null : /* @__PURE__ */ React2.createElement("div", { style: styles.taskList }, tasks.length === 0 ? /* @__PURE__ */ React2.createElement("div", { style: styles.columnEmpty }, t("tasks.none")) : tasks.map((task) => /* @__PURE__ */ React2.createElement(
      TaskCard,
      {
        key: String(task.id),
        task,
        t,
        expanded: expandedTaskId === task.id,
        onToggle: () => setExpandedTaskId((prev) => prev === task.id ? null : task.id)
      }
    ))));
  }))) : null;
  let content = skeleton;
  if (status !== "loading" && errorMessage && !activeTeam) content = errorState(errorMessage);
  else if (status !== "loading" && !activeTeam && teams.length === 0) content = emptyState;
  else if (status !== "loading" && !activeTeam) content = errorState(t("error.load"));
  else if (activeTeam) content = board;
  return /* @__PURE__ */ React2.createElement("div", { style: styles.root }, /* @__PURE__ */ React2.createElement("div", { style: styles.topbar }, /* @__PURE__ */ React2.createElement("div", { style: styles.viewSwitch }, /* @__PURE__ */ React2.createElement(
    "button",
    {
      type: "button",
      style: view === "session" ? { ...styles.viewSwitchButton, ...styles.viewSwitchButtonActive } : styles.viewSwitchButton,
      onClick: () => setView("session")
    },
    t("view.session")
  ), /* @__PURE__ */ React2.createElement(
    "button",
    {
      type: "button",
      style: view === "all" ? { ...styles.viewSwitchButton, ...styles.viewSwitchButtonActive } : styles.viewSwitchButton,
      onClick: () => setView("all")
    },
    t("view.all")
  )), /* @__PURE__ */ React2.createElement(
    "button",
    {
      type: "button",
      style: refreshing ? { ...styles.button, ...styles.buttonDisabled } : styles.button,
      disabled: refreshing,
      onClick: handleRefresh
    },
    refreshing ? t("refresh.running") : t("refresh")
  ), updatedAt ? /* @__PURE__ */ React2.createElement("span", { style: styles.updated }, `${t("updated")}${formatTime(updatedAt)}`) : null), view === "all" ? /* @__PURE__ */ React2.createElement(
    Overview,
    {
      teams,
      sessionId,
      t,
      loading: status === "loading",
      degraded,
      onOpenTeam: handleOpenTeam
    }
  ) : /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { style: styles.toolbar }, /* @__PURE__ */ React2.createElement("label", { style: styles.selectorLabel }, t("team.selector"), /* @__PURE__ */ React2.createElement("select", { style: styles.select, value: teamId || "", onChange: handleSelectTeam }, teams.length === 0 ? /* @__PURE__ */ React2.createElement("option", { value: "" }, t("team.none")) : null, teams.map((item) => /* @__PURE__ */ React2.createElement("option", { key: item.teamId, value: item.teamId }, teamOptionLabel(item, t)))))), errorMessage && activeTeam ? /* @__PURE__ */ React2.createElement("div", { style: styles.banner }, /* @__PURE__ */ React2.createElement("span", { style: styles.bannerText }, errorMessage), /* @__PURE__ */ React2.createElement("button", { type: "button", style: styles.linkButton, onClick: handleRefresh }, t("retry"))) : null, teamGone ? /* @__PURE__ */ React2.createElement("div", { style: styles.banner }, /* @__PURE__ */ React2.createElement("span", { style: styles.bannerText }, t("error.teamGone"))) : null, content));
}

// src/client/index.jsx
var NS = "dsh-team-dev";
var BOARD_ID = "dsh-team-dev";
var inject = ["slots", "locale", "sidebarRightTabs"];
var zh = {
  "tab.title": "团队看板",
  "tab.description": "查看当前团队的任务看板、成员与阻塞状态（只读）。",
  "team.selector": "团队",
  "team.none": "暂无团队",
  "unit.member": "人",
  "unit.task": "项",
  refresh: "刷新",
  "refresh.running": "刷新中…",
  updated: "最后更新 ",
  retry: "重试",
  loading: "正在加载团队看板…",
  degraded: "此部署未启用 Agent Teams（agentTeams 服务不可用）。",
  "empty.teams": "当前没有团队；用 team-dev / team-boot 技能开团后这里会出现。",
  "empty.degraded": "此部署未启用 Agent Teams（agentTeams 服务不可用）。",
  "error.load": "看板数据加载失败，请稍后重试。",
  "error.teamGone": "该团队已不存在，已自动切换到第一个团队。",
  "error.boundary": "看板渲染异常",
  "filter.all": "全部成员",
  "member.lead": "Lead",
  "member.unknown": "未命名成员",
  "column.pending": "待处理",
  "column.inProgress": "进行中",
  "column.completed": "已完成",
  "tasks.none": "暂无任务",
  "task.untitled": "（无标题）",
  "task.unassigned": "未分配",
  "task.blocked": "阻塞",
  "task.revision": "版本",
  "task.details": "详情",
  "task.collapse": "收起",
  "task.blockedBy": "依赖",
  "task.writeScopes": "写入范围",
  "task.warnings": "范围冲突",
  "task.none": "无",
  "view.session": "当前会话",
  "view.all": "全部团队",
  "overview.stats.teams": "在线团队",
  "overview.stats.tasks": "任务总数",
  "overview.stats.active": "进行中",
  "overview.stats.done": "已完成",
  "overview.sort.active": "按进行中",
  "overview.sort.total": "按任务数",
  "overview.sort.name": "按名称",
  "overview.filter.all": "全部状态",
  "overview.filter.active": "进行中",
  "overview.filter.pending": "待开始",
  "overview.filter.done": "已完成",
  "overview.search": "搜索 Lead / 会话 ID…",
  "overview.current": "当前会话",
  "overview.members": "名成员",
  "overview.tasks": "项任务",
  "overview.open": "查看看板",
  "overview.progress": "完成度",
  "overview.status.active": "进行中",
  "overview.status.pending": "待开始",
  "overview.status.done": "已完成",
  "overview.empty": "当前没有在线团队；用 team-dev / team-boot 开团后这里会出现。",
  "overview.degraded": "此部署未启用 Agent Teams（agentTeams 服务不可用）。"
};
var en = {
  "tab.title": "Team board",
  "tab.description": "Read-only view of the current team: tasks, members, and blockers.",
  "team.selector": "Team",
  "team.none": "No teams",
  "unit.member": " members",
  "unit.task": " tasks",
  refresh: "Refresh",
  "refresh.running": "Refreshing…",
  updated: "Updated ",
  retry: "Retry",
  loading: "Loading team board…",
  degraded: "Agent Teams is not enabled in this deployment (agentTeams service unavailable).",
  "empty.teams": "No teams yet. Start one with the team-dev / team-boot skill and it will show up here.",
  "empty.degraded": "Agent Teams is not enabled in this deployment (agentTeams service unavailable).",
  "error.load": "Failed to load the board. Please try again later.",
  "error.teamGone": "That team no longer exists; switched to the first team.",
  "error.boundary": "The board failed to render",
  "filter.all": "All members",
  "member.lead": "Lead",
  "member.unknown": "Unnamed member",
  "column.pending": "Pending",
  "column.inProgress": "In progress",
  "column.completed": "Completed",
  "tasks.none": "No tasks",
  "task.untitled": "(untitled)",
  "task.unassigned": "Unassigned",
  "task.blocked": "Blocked",
  "task.revision": "rev",
  "task.details": "Details",
  "task.collapse": "Collapse",
  "task.blockedBy": "Blocked by",
  "task.writeScopes": "Write scopes",
  "task.warnings": "Write-scope warnings",
  "task.none": "none",
  "view.session": "Current session",
  "view.all": "All teams",
  "overview.stats.teams": "Online teams",
  "overview.stats.tasks": "Tasks",
  "overview.stats.active": "In progress",
  "overview.stats.done": "Completed",
  "overview.sort.active": "By in-progress",
  "overview.sort.total": "By task count",
  "overview.sort.name": "By name",
  "overview.filter.all": "All states",
  "overview.filter.active": "In progress",
  "overview.filter.pending": "Not started",
  "overview.filter.done": "Completed",
  "overview.search": "Search lead / session id…",
  "overview.current": "Current",
  "overview.members": " members",
  "overview.tasks": " tasks",
  "overview.open": "Open board",
  "overview.progress": "Progress",
  "overview.status.active": "In progress",
  "overview.status.pending": "Not started",
  "overview.status.done": "Completed",
  "overview.empty": "No online teams yet. Start one with the team-dev / team-boot skill and it will show up here.",
  "overview.degraded": "Agent Teams is not enabled in this deployment (agentTeams service unavailable)."
};
var BoardBoundary = class extends React3.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const translate = typeof this.props.t === "function" ? this.props.t : null;
    return /* @__PURE__ */ React3.createElement("div", { style: styles.boundary }, translate ? translate("error.boundary") : "看板渲染异常");
  }
};
function TeamBoardBody(props) {
  return /* @__PURE__ */ React3.createElement(BoardBoundary, { t: props.t }, /* @__PURE__ */ React3.createElement(TeamBoard, { ...props }));
}
function apply(ctx) {
  const t = ctx.locale.bind(NS);
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-team-dev: dictionaries");
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: BOARD_ID,
    kind: "team-board",
    title: () => t("tab.title"),
    guide: [
      {
        order: 500,
        title: () => t("tab.title"),
        description: () => t("tab.description")
      }
    ]
  }), "dsh-team-dev: board tab type");
  ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
    name: "sidebar.right.pane.tab",
    key: BOARD_ID,
    locale: NS
  }, TeamBoardBody)), "dsh-team-dev: board tab body");
}

    })(module, exports, require);
    return module.exports;
  }
});
