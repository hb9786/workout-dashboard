"""
Pulls your real workout data straight from Hevy's own public API
(requires Hevy Pro) and writes everything the dashboard needs into
data.json. Optionally also pulls exercise "Demo Image" pictures from
your Notion Exercise Library, if you've set NOTION_TOKEN too.

This is meant to be run by the GitHub Actions workflow in
.github/workflows/refresh.yml on a schedule, but you can also run it
locally to test:

    export HEVY_API_KEY=your_key_here
    python3 fetch_data.py

It never invents data — every number here is computed from your real
Hevy rows (weight/reps -> Epley 1RM, real start/end times, etc). If a
computation can't be done (e.g. no workouts logged yet, or you never
uploaded a Demo Image for an exercise), the corresponding field is just
0 / null / omitted rather than a fake value.

Units: Hevy's API returns weight in kilograms (weight_kg). The
dashboard displays PRs in kg to match — if you'd rather see lbs,
multiply by 2.20462 in the epley_1rm() call below.
"""

import os
import json
import datetime
import urllib.request as req
import urllib.error

HEVY_API_KEY = os.environ["HEVY_API_KEY"]
HEVY_BASE = "https://api.hevyapp.com/v1"

# Optional: only used to pull exercise Demo Images from Notion, since
# Hevy's API doesn't expose exercise images. Leave NOTION_TOKEN unset
# and this whole step is skipped gracefully (cards just show no image).
NOTION_TOKEN = os.environ.get("NOTION_TOKEN")
NOTION_VERSION = "2022-06-28"
EXERCISE_DB = "5fbe9b2e-ce3f-4664-a33f-b0ee9758e350"

# Label shown on the dashboard -> exact exercise title as it appears in
# Hevy (and in your Notion Exercise Library, since that was originally
# populated from the same Hevy export). Edit the right-hand side if
# your naming differs.
TARGET_EXERCISES = {
    "Squat": "Squat (Barbell)",
    "Bench Press": "Bench Press (Barbell)",
    "Deadlift": "Deadlift (Barbell)",
    "Shoulder Press": "Shoulder Press (Machine Plates)",
    "Bicep Curl": "Bicep Curl (Cable)",
}

WEEKLY_TARGET = 5


def hevy_get(path, page_size=10):
    """Page through a Hevy API endpoint using its {page, page_count} shape."""
    results_key = None
    items = []
    page = 1
    while True:
        url = f"{HEVY_BASE}{path}?page={page}&pageSize={page_size}"
        request = req.Request(
            url,
            headers={"api-key": HEVY_API_KEY, "Accept": "application/json"},
            method="GET",
        )
        try:
            with req.urlopen(request) as resp:
                data = json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body_text = e.read().decode()
            raise RuntimeError(
                f"Hevy API error {e.code} on {path} (page {page}): {body_text}\n"
                "Common cause: HEVY_API_KEY is wrong, or your Hevy account "
                "isn't on the Pro plan (the API requires Pro)."
            )
        if results_key is None:
            # Whichever key isn't "page"/"page_count" holds the list.
            results_key = next(
                k for k in data if k not in ("page", "page_count")
            )
        batch = data.get(results_key, [])
        items.extend(batch)
        page_count = data.get("page_count", page)
        if page >= page_count or not batch:
            break
        page += 1
    return items


def epley_1rm(weight_kg, reps):
    if not weight_kg or not reps:
        return 0
    return round(weight_kg * (1 + reps / 30), 1)


def classify_routine(title):
    t = (title or "").lower()
    if "push" in t:
        return "Push"
    if "pull" in t:
        return "Pull"
    if "leg" in t:
        return "Legs"
    if "cardio" in t or "run" in t or "hiit" in t:
        return "Cardio"
    return "Other"


def fetch_notion_demo_images():
    """Best-effort: pull exercise Demo Image URLs from Notion. Returns
    {exercise_name: image_url}. Returns {} if NOTION_TOKEN isn't set or
    anything goes wrong — images are a nice-to-have, not required."""
    if not NOTION_TOKEN:
        return {}
    try:
        images = {}
        cursor = None
        while True:
            body = {"page_size": 100}
            if cursor:
                body["start_cursor"] = cursor
            request = req.Request(
                f"https://api.notion.com/v1/databases/{EXERCISE_DB}/query",
                data=json.dumps(body).encode(),
                headers={
                    "Authorization": f"Bearer {NOTION_TOKEN}",
                    "Notion-Version": NOTION_VERSION,
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with req.urlopen(request) as resp:
                data = json.loads(resp.read())
            for page in data["results"]:
                title_arr = page["properties"].get("Name", {}).get("title", [])
                name = title_arr[0]["plain_text"] if title_arr else None
                files = page["properties"].get("Demo Image", {}).get("files", [])
                url = None
                if files:
                    f = files[0]
                    url = f.get("external", {}).get("url") or f.get("file", {}).get("url")
                if name and url:
                    images[name] = url
            if not data.get("has_more"):
                break
            cursor = data["next_cursor"]
        return images
    except Exception as e:
        print(f"Notion demo image fetch skipped (non-fatal): {e}")
        return {}


def main():
    print("Fetching workout count...")
    count_resp = req.Request(
        f"{HEVY_BASE}/workouts/count",
        headers={"api-key": HEVY_API_KEY, "Accept": "application/json"},
    )
    with req.urlopen(count_resp) as resp:
        total_workouts = json.loads(resp.read()).get("workout_count", 0)
    print(f"  {total_workouts} workouts (per Hevy)")

    print("Fetching all workouts (this can take a minute)...")
    workouts = hevy_get("/workouts", page_size=10)
    print(f"  fetched {len(workouts)} workouts")

    print("Fetching exercise templates to find target exercises...")
    templates = hevy_get("/exercise_templates", page_size=100)
    template_id_by_title = {t["title"]: t["id"] for t in templates}

    target_ids = {}
    for label, exact_name in TARGET_EXERCISES.items():
        tid = template_id_by_title.get(exact_name)
        if not tid:
            print(f"  WARNING: couldn't find exercise template named '{exact_name}' "
                  f"for '{label}' — check TARGET_EXERCISES in this script.")
        target_ids[label] = tid

    pr_history = {label: [] for label in TARGET_EXERCISES}
    dated = []
    routine_counts = {}

    for w in workouts:
        start = w.get("start_time")
        end = w.get("end_time")
        title = w.get("title")
        if not start:
            continue

        duration_min = None
        if start and end:
            try:
                s = datetime.datetime.fromisoformat(start.replace("Z", "+00:00"))
                e = datetime.datetime.fromisoformat(end.replace("Z", "+00:00"))
                duration_min = round((e - s).total_seconds() / 60)
            except ValueError:
                pass

        total_sets = 0
        total_volume = 0
        for ex in w.get("exercises", []):
            ex_tid = ex.get("exercise_template_id")
            for s in ex.get("sets", []):
                total_sets += 1
                weight = s.get("weight_kg") or 0
                reps = s.get("reps") or 0
                total_volume += weight * reps
                for label, target_tid in target_ids.items():
                    if target_tid and ex_tid == target_tid:
                        val = epley_1rm(weight, reps)
                        if val:
                            pr_history[label].append(val)

        routine = classify_routine(title)
        routine_counts[routine] = routine_counts.get(routine, 0) + 1

        date_str = start[:10]
        dated.append(
            {
                "date": date_str,
                "name": title,
                "routine": routine,
                "duration": duration_min,
                "sets": total_sets,
                "volume": round(total_volume),
            }
        )

    dated.sort(key=lambda w: w["date"], reverse=True)
    last_workout = None
    if dated:
        lw = dated[0]
        last_workout = {
            "name": lw["name"],
            "date": lw["date"],
            "routine": lw["routine"],
            "duration": lw["duration"],
            "sets": lw["sets"],
            "volume": lw["volume"],
        }

    today = datetime.date.today()
    start_of_week = today - datetime.timedelta(days=today.weekday())
    end_of_week = start_of_week + datetime.timedelta(days=6)
    this_week_count = sum(
        1
        for w in dated
        if start_of_week.isoformat() <= w["date"] <= end_of_week.isoformat()
    )

    print("Fetching exercise demo images from Notion (optional)...")
    demo_images = fetch_notion_demo_images()
    pr_images = {
        label: demo_images.get(exact_name)
        for label, exact_name in TARGET_EXERCISES.items()
    }

    # prs = your all-time best (current PR). prs_prev = the best you had
    # logged before that, i.e. what the current PR beat. None means this
    # is the only value on record (no prior PR to compare against).
    prs = {}
    prs_prev = {}
    for label, vals in pr_history.items():
        if vals:
            best = max(vals)
            prs[label] = best
            lower = [v for v in vals if v < best]
            prs_prev[label] = max(lower) if lower else None
        else:
            prs[label] = 0
            prs_prev[label] = None

    output = {
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "weekly_target": WEEKLY_TARGET,
        "total_workouts": total_workouts or len(workouts),
        "last_workout": last_workout,
        "this_week_count": this_week_count,
        "routine_counts": routine_counts,
        "prs": prs,
        "prs_prev": prs_prev,
        "pr_images": pr_images,
        "workouts": [
            {"date": w["date"], "name": w["name"], "routine": w["routine"]}
            for w in dated
        ],
    }

    with open("data.json", "w") as f:
        json.dump(output, f, indent=2)
    print("Wrote data.json")


if __name__ == "__main__":
    main()
