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

function render() {
  renderHeader();
  renderLastWorkout();
  renderWeekRing();
  renderPRs();
  const today = new Date();
  calYear = today.getFullYear();
  calMonth = today.getMonth();
  renderCalendar();
  renderInsights();
}

function renderHeader() {
  const d = new Date(DATA.generated_at);
  document.getElementById("last-refreshed").textContent =
    "Last refreshed " + d.toLocaleString();
  document.getElementById("sync-time").textContent =
    "Last sync: " + d.toLocaleString();
}

function renderLastWorkout() {
  const el = document.getElementById("last-workout-body");
  const lw = DATA.last_workout;
  if (!lw) {
    el.innerHTML = '<p class="placeholder">No workouts logged yet.</p>';
    return;
  }
  el.innerHTML = `
    <div class="lw-name">${escapeHtml(lw.name || "Workout")}</div>
    <div class="lw-meta">
      <div><b>${lw.date}</b> · ${escapeHtml(lw.routine || "Other")}</div>
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

function renderPRs() {
  const row = document.getElementById("pr-row");
  row.innerHTML = "";
  const entries = Object.entries(DATA.prs || {});
  for (const [name, value] of entries) {
    const card = document.createElement("div");
    card.className = "card pr-card";
    card.innerHTML = `
      <div class="pr-name">${escapeHtml(name)}</div>
      <div class="pr-value">${value || "—"}</div>
      <div class="pr-unit">${value ? "est. 1RM" : "no data yet"}</div>
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
