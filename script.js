const ROUTINE_COLORS = {
  Push: "#6690ff",
  Pull: "#58c97e",
  Legs: "#b585f0",
  Cardio: "#ff9f5a",
  Other: "#8a8a8a",
};

let DATA = null;
let calYear, calMonth; // calMonth is 0-indexed

async function loadData() {
  const res = await fetch("data.json?_=" + Date.now());
  DATA = await res.json();
  render();
}

// Each render step is independent: if one throws (e.g. a CDN chart
// library failed to load), the rest of the dashboard still renders
// instead of the whole page going blank.
function safe(label, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`${label} failed:`, err);
  }
}

function render() {
  safe("header", renderHeader);
  safe("last workout", renderLastWorkout);
  safe("week ring", renderWeekRing);
  safe("PR cards", renderPRs);
  const today = new Date();
  calYear = today.getFullYear();
  calMonth = today.getMonth();
  safe("calendar", renderCalendar);
  safe("insights", renderInsights);
}

function renderHeader() {
  const d = new Date(DATA.generated_at);
  document.getElementById("last-refreshed").textContent =
    "Last refreshed " + d.toLocaleString();
  document.getElementById("sync-time").textContent =
    "Last sync: " + d.toLocaleString();
}

// Simple pictograms per routine type — same family as PR_ICONS below.
// fill: currentColor, so the wrapping element's inline color controls
// the tint (matches that routine's ROUTINE_COLORS entry).
const ROUTINE_ICONS = {
  Push: `<svg viewBox="0 0 48 48"><rect x="10" y="22" width="28" height="5" rx="2"/><rect x="4" y="18" width="6" height="13" rx="2"/><rect x="38" y="18" width="6" height="13" rx="2"/><rect x="12" y="30" width="24" height="6" rx="1"/></svg>`,
  Pull: `<svg viewBox="0 0 48 48"><circle cx="24" cy="8" r="5"/><path d="M14 18l10 6 10-6 3 4-11 7-11-7z"/><rect x="20" y="28" width="8" height="16" rx="2"/></svg>`,
  Legs: `<svg viewBox="0 0 48 48"><circle cx="24" cy="10" r="5"/><path d="M24 16v10l-8 8v10h4v-8l4-4 4 4v8h4V26l-8-8z"/><rect x="6" y="20" width="10" height="4" rx="2"/><rect x="32" y="20" width="10" height="4" rx="2"/></svg>`,
  Cardio: `<svg viewBox="0 0 48 48"><circle cx="30" cy="8" r="5"/><path d="M30 14l-4 8-10 3 1 5 12-4 5-9z"/><path d="M22 26l-8 6 2 12 5-1-1-8 6-4z"/></svg>`,
  Other: `<svg viewBox="0 0 48 48"><rect x="10" y="22" width="28" height="5" rx="2"/><rect x="4" y="18" width="6" height="13" rx="2"/><rect x="38" y="18" width="6" height="13" rx="2"/></svg>`,
};

function renderLastWorkout() {
  const el = document.getElementById("last-workout-body");
  const lw = DATA.last_workout;
  if (!lw) {
    el.innerHTML = '<p class="placeholder">No workouts logged yet.</p>';
    return;
  }
  const routine = lw.routine || "Other";
  const dotColor = ROUTINE_COLORS[routine] || ROUTINE_COLORS.Other;
  const icon = ROUTINE_ICONS[routine] || ROUTINE_ICONS.Other;
  el.innerHTML = `
    <div class="lw-top">
      <div class="lw-routine-icon" style="color:${dotColor}">${icon}</div>
      <div class="lw-name">${escapeHtml(lw.name || "Workout")}</div>
    </div>
    <div class="lw-meta">
      <div><b>${lw.date}</b> · <span class="legend-dot" style="background:${dotColor}"></span>${escapeHtml(routine)}</div>
      <div>${lw.sets} sets · ${Math.round(lw.volume).toLocaleString()} vol · ${lw.duration ?? "?"} min</div>
    </div>
  `;
}

function renderWeekRing() {
  const count = DATA.this_week_count || 0;
  const target = DATA.weekly_target || 5;
  const pct = Math.min(1, count / target);
  const circumference = 2 * Math.PI * 52;
  const offset = circumference * (1 - pct);
  const ring = document.getElementById("ring-fg");
  ring.style.strokeDasharray = circumference;
  ring.style.strokeDashoffset = offset;
  document.getElementById("week-count").textContent = count;
  document.getElementById("week-target").textContent = "/ " + target;
}

// Inline SVG icons per exercise — no external files, so nothing to
// break from a bad URL or missing secret. Swapped out automatically
// for a real Notion Demo Image if pr_images[name] is present.
const PR_ICONS = {
  "Squat": `<svg viewBox="0 0 48 48" class="pr-icon"><circle cx="24" cy="10" r="5"/><path d="M24 16v10l-8 8v10h4v-8l4-4 4 4v8h4V26l-8-8z"/><rect x="6" y="20" width="10" height="4" rx="2"/><rect x="32" y="20" width="10" height="4" rx="2"/></svg>`,
  "Bench Press": `<svg viewBox="0 0 48 48" class="pr-icon"><rect x="10" y="22" width="28" height="5" rx="2"/><rect x="4" y="18" width="6" height="13" rx="2"/><rect x="38" y="18" width="6" height="13" rx="2"/><rect x="12" y="30" width="24" height="6" rx="1"/><rect x="14" y="36" width="4" height="8"/><rect x="30" y="36" width="4" height="8"/></svg>`,
  "Deadlift": `<svg viewBox="0 0 48 48" class="pr-icon"><circle cx="18" cy="10" r="5"/><path d="M18 16l10 4 8-6 3 3-9 8-6-2-4 15h-4l3-16-4-1z"/><rect x="6" y="30" width="10" height="4" rx="2"/><rect x="32" y="30" width="10" height="4" rx="2"/></svg>`,
  "Shoulder Press": `<svg viewBox="0 0 48 48" class="pr-icon"><circle cx="24" cy="8" r="5"/><rect x="21" y="14" width="6" height="14" rx="2"/><rect x="8" y="8" width="6" height="4" rx="2"/><rect x="34" y="8" width="6" height="4" rx="2"/><path d="M21 16l-8-6-3 3 8 7z"/><path d="M27 16l8-6 3 3-8 7z"/><rect x="17" y="28" width="14" height="16" rx="2"/></svg>`,
  "Bicep Curl": `<svg viewBox="0 0 48 48" class="pr-icon"><circle cx="10" cy="18" r="5"/><path d="M10 24v10l10 8h6l4-4-8-6-3-3v-5z"/><rect x="28" y="30" width="14" height="6" rx="3"/></svg>`,
};

function renderPRs() {
  const row = document.getElementById("pr-row");
  row.innerHTML = "";
  const entries = Object.entries(DATA.prs || {});
  const images = DATA.pr_images || {};
  const prevs = DATA.prs_prev || {};
  for (const [name, value] of entries) {
    const card = document.createElement("div");
    card.className = "card pr-card";
    const imgUrl = images[name];
    const media = imgUrl
      ? `<img class="pr-image" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(name)}" onerror="this.parentElement.querySelector('.pr-icon-wrap').style.display='flex'; this.style.display='none';" />
         <div class="pr-icon-wrap" style="display:none">${PR_ICONS[name] || ""}</div>`
      : `<div class="pr-icon-wrap">${PR_ICONS[name] || ""}</div>`;
    const prev = prevs[name];
    let prevLine = "";
    if (value) {
      prevLine = prev
        ? `<div class="pr-prev">was ${prev} kg</div>`
        : `<div class="pr-prev">first recorded PR</div>`;
    }
    card.innerHTML = `
      ${media}
      <div class="pr-name">${escapeHtml(name)}</div>
      <div class="pr-value">${value ? value + " kg" : "—"}</div>
      <div class="pr-unit">${value ? "est. 1RM" : "no data yet"}</div>
      ${prevLine}
    `;
    row.appendChild(card);
  }
}

function workoutsByDate() {
  const map = {};
  for (const w of DATA.workouts || []) {
    if (!map[w.date]) map[w.date] = [];
    map[w.date].push(w);
  }
  return map;
}

function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  const label = document.getElementById("cal-month-label");
  const byDate = workoutsByDate();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  label.textContent = `${monthNames[calMonth]} ${calYear}`;

  grid.innerHTML = "";
  ["S", "M", "T", "W", "T", "F", "S"].forEach((d) => {
    const el = document.createElement("div");
    el.className = "cal-dow";
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement("div");
    el.className = "cal-day empty";
    grid.appendChild(el);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const el = document.createElement("div");
    const workoutsToday = byDate[dateStr];
    el.className = "cal-day" + (workoutsToday ? " has-workout" : "");
    if (workoutsToday && workoutsToday.length) {
      el.style.background = ROUTINE_COLORS[workoutsToday[0].routine] || ROUTINE_COLORS.Other;
      el.title = workoutsToday.map((w) => `${w.name} (${w.routine})`).join(", ");
    }
    el.textContent = day;
    grid.appendChild(el);
  }

  const legend = document.getElementById("calendar-legend");
  legend.innerHTML = Object.entries(ROUTINE_COLORS)
    .map(
      ([name, color]) =>
        `<span><span class="legend-dot" style="background:${color}"></span>${name}</span>`
    )
    .join("");
}

document.getElementById("cal-prev").addEventListener("click", () => {
  calMonth--;
  if (calMonth < 0) {
    calMonth = 11;
    calYear--;
  }
  renderCalendar();
});
document.getElementById("cal-next").addEventListener("click", () => {
  calMonth++;
  if (calMonth > 11) {
    calMonth = 0;
    calYear++;
  }
  renderCalendar();
});

let donutChart = null;
function renderInsights() {
  document.getElementById("total-workouts").textContent = DATA.total_workouts || 0;

  const counts = DATA.routine_counts || {};
  const labels = Object.keys(counts);
  const values = Object.values(counts);
  const colors = labels.map((l) => ROUTINE_COLORS[l] || ROUTINE_COLORS.Other);

  if (typeof Chart === "undefined") {
    console.error("Chart.js didn't load from the CDN — showing text breakdown instead.");
    document.getElementById("donut-chart").style.display = "none";
  } else {
    const ctx = document.getElementById("donut-chart").getContext("2d");
    if (donutChart) donutChart.destroy();
    donutChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }],
      },
      options: {
        plugins: { legend: { display: false } },
        cutout: "70%",
      },
    });
  }

  const total = values.reduce((a, b) => a + b, 0) || 1;
  const legend = document.getElementById("donut-legend");
  legend.innerHTML = labels
    .map((l, i) => {
      const pct = Math.round((values[i] / total) * 100);
      return `<span><span class="legend-dot" style="background:${colors[i]}"></span>${l} — ${values[i]} (${pct}%)</span>`;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

loadData().catch((err) => {
  document.querySelector(".dashboard").innerHTML =
    `<p style="color:#ff8080;padding:40px;">Couldn't load data.json: ${err.message}</p>`;
});
