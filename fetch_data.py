"""
Pulls your real Workouts / Sets / Exercise Library data straight from the
Notion API (no MCP, no third-party SDK — just Python's built-in urllib so
this script has zero dependencies) and writes everything the dashboard
needs into data.json.

This is meant to be run by the GitHub Actions workflow in
.github/workflows/refresh.yml on a schedule, but you can also run it
locally to test:

    export NOTION_TOKEN=secret_xxx
    python3 fetch_data.py

It never invents data — every number here is computed from your real
Notion rows. If a computation can't be done (e.g. no workouts logged
yet), the corresponding field is just 0 / null rather than a fake value.
"""

import os
import json
import datetime
import urllib.request as req
import urllib.error

NOTION_TOKEN = os.environ["NOTION_TOKEN"]
NOTION_VERSION = "2022-06-28"

# These are the real database IDs for this workspace's
# Workouts / Sets / Exercise Library databases.
WORKOUTS_DB = "6088df7c-44c6-4c5c-9492-96266bc61756"
SETS_DB = "6398cd7d-a0d0-4c13-abbe-fb80697c75db"
EXERCISE_DB = "5fbe9b2e-ce3f-4664-a33f-b0ee9758e350"

# Label shown on the dashboard -> exact exercise name in your
# Exercise Library. Edit the right-hand side if your naming differs.
TARGET_EXERCISES = {
    "Squat": "Squat (Barbell)",
    "Bench Press": "Bench Press (Barbell)",
    "Deadlift": "Deadlift (Barbell)",
    "Shoulder Press": "Shoulder Press (Machine Plates)",
    "Bicep Curl": "Bicep Curl (Cable)",
}

# How many workouts/week counts as "on track" for the progress ring.
WEEKLY_TARGET = 5


def notion_query(database_id):
    """Page through every row of a Notion database via the public API."""
    results = []
    cursor = None
    while True:
        body = {"page_size": 100}
        if cursor:
            body["start_cursor"] = cursor
        request = req.Request(
            f"https://api.notion.com/v1/databases/{database_id}/query",
            data=json.dumps(body).encode(),
            headers={
                "Authorization": f"Bearer {NOTION_TOKEN}",
                "Notion-Version": NOTION_VERSION,
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with req.urlopen(request) as resp:
                data = json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body_text = e.read().decode()
            raise RuntimeError(
                f"Notion API error {e.code} querying {database_id}: {body_text}\n"
                "Common cause: this integration hasn't been shared with the "
                "database yet — see SETUP.md step 2."
            )
        results.extend(data["results"])
        if not data.get("has_more"):
            break
        cursor = data["next_cursor"]
    return results


def get_prop(page, name, kind):
    prop = page["properties"].get(name)
    if not prop:
        return None
    if kind == "title":
        arr = prop.get("title", [])
        return arr[0]["plain_text"] if arr else None
    if kind == "number":
        return prop.get("number")
    if kind == "date":
        d = prop.get("date")
        return d["start"] if d else None
    if kind == "select":
        s = prop.get("select")
        return s["name"] if s else None
    if kind == "relation":
        return [r["id"] for r in prop.get("relation", [])]
    return None


def epley_1rm(weight, reps):
    """Standard Epley estimated-1RM formula: weight * (1 + reps/30)."""
    if not weight or not reps:
        return 0
    return round(weight * (1 + reps / 30), 1)


def main():
    print("Fetching Workouts...")
    workouts = notion_query(WORKOUTS_DB)
    print(f"  {len(workouts)} workouts")

    print("Fetching Sets...")
    raw_sets = notion_query(SETS_DB)
    print(f"  {len(raw_sets)} sets")

    print("Fetching Exercise Library...")
    exercises = notion_query(EXERCISE_DB)
    print(f"  {len(exercises)} exercises")

    exercise_name_by_id = {e["id"]: get_prop(e, "Name", "title") for e in exercises}

    workout_list = []
    for w in workouts:
        workout_list.append(
            {
                "id": w["id"],
                "name": get_prop(w, "Name", "title"),
                "date": get_prop(w, "Date", "date"),
                "duration": get_prop(w, "Duration", "number"),
                "routine": get_prop(w, "Routine", "select"),
            }
        )

    set_list = []
    for s in raw_sets:
        exercise_ids = get_prop(s, "Exercise", "relation") or []
        workout_ids = get_prop(s, "Workout", "relation") or []
        set_list.append(
            {
                "weight": get_prop(s, "Weight", "number"),
                "reps": get_prop(s, "Reps", "number"),
                "exercise_name": exercise_name_by_id.get(exercise_ids[0])
                if exercise_ids
                else None,
                "workout_id": workout_ids[0] if workout_ids else None,
            }
        )

    # --- PRs for the 5 headline exercises (real max Epley 1RM, not a guess) ---
    prs = {}
    for label, exact_name in TARGET_EXERCISES.items():
        best = 0
        for s in set_list:
            if s["exercise_name"] == exact_name:
                best = max(best, epley_1rm(s["weight"], s["reps"]))
        prs[label] = best

    # --- Per-workout aggregates, computed from real linked Sets rows ---
    sets_per_workout = {}
    volume_per_workout = {}
    for s in set_list:
        wid = s["workout_id"]
        if not wid:
            continue
        sets_per_workout[wid] = sets_per_workout.get(wid, 0) + 1
        volume_per_workout[wid] = volume_per_workout.get(wid, 0) + (
            (s["weight"] or 0) * (s["reps"] or 0)
        )

    dated = [w for w in workout_list if w["date"]]
    dated.sort(key=lambda w: w["date"], reverse=True)

    last_workout = None
    if dated:
        lw = dated[0]
        last_workout = {
            "name": lw["name"],
            "date": lw["date"][:10],
            "routine": lw["routine"],
            "duration": lw["duration"],
            "sets": sets_per_workout.get(lw["id"], 0),
            "volume": round(volume_per_workout.get(lw["id"], 0)),
        }

    today = datetime.date.today()
    start_of_week = today - datetime.timedelta(days=today.weekday())
    end_of_week = start_of_week + datetime.timedelta(days=6)
    this_week_count = sum(
        1
        for w in dated
        if start_of_week.isoformat() <= w["date"][:10] <= end_of_week.isoformat()
    )

    routine_counts = {}
    for w in workout_list:
        r = w["routine"] or "Other"
        routine_counts[r] = routine_counts.get(r, 0) + 1

    output = {
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "weekly_target": WEEKLY_TARGET,
        "total_workouts": len(workout_list),
        "last_workout": last_workout,
        "this_week_count": this_week_count,
        "routine_counts": routine_counts,
        "prs": prs,
        # Full date/name/routine list so the calendar can navigate to ANY
        # month client-side without needing another data pull.
        "workouts": [
            {
                "date": w["date"][:10],
                "name": w["name"],
                "routine": w["routine"] or "Other",
            }
            for w in workout_list
            if w["date"]
        ],
    }

    with open("data.json", "w") as f:
        json.dump(output, f, indent=2)
    print("Wrote data.json")


if __name__ == "__main__":
    main()
