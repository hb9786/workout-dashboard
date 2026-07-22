# Setup walkthrough

This turns into a live URL you embed inside Notion. Five steps: get a
Notion API token, put this folder on GitHub, tell GitHub the token as a
secret, turn on GitHub Pages, paste the URL into Notion. ~15 minutes.

## 1. Create a Notion integration (this is your API token)

1. Go to https://www.notion.so/my-integrations and click **+ New integration**.
2. Name it anything (e.g. "Workout Dashboard"), pick your workspace, click **Submit**.
3. On the next screen, copy the **Internal Integration Secret** — it starts
   with `secret_` or `ntn_`. This is `NOTION_TOKEN`. Keep this tab open,
   you'll need to copy it again in step 3.

## 2. Share your 3 databases with the integration

Notion integrations can't see anything until you explicitly share pages
with them (this is a safety feature, not a bug).

For **each** of these three databases — Workouts, Sets, Exercise Library —
open it in Notion, click the `•••` menu in the top right, choose
**Connections**, and add the integration you just created. Do this for
all three or `fetch_data.py` will fail with a 404 on whichever one you
skipped.

## 3. Put this folder on GitHub

If you don't have a GitHub account, make a free one at github.com first.

1. Go to https://github.com/new, name the repo anything (e.g.
   `workout-dashboard`), leave it **Public** (GitHub Pages is free for
   public repos), don't add a README, click **Create repository**.
2. On your own computer, in a terminal, `cd` into this `hevy-dashboard`
   folder and run:

   ```
   git init
   git add .
   git commit -m "Initial dashboard"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```

   (Replace the URL with the one GitHub shows you after creating the repo.)

## 4. Add your Notion token as a GitHub secret

This keeps your token out of the code entirely — it's never visible in
any file, only injected at run time by GitHub Actions.

1. In your new GitHub repo, go to **Settings → Secrets and variables →
   Actions**.
2. Click **New repository secret**.
3. Name: `NOTION_TOKEN`. Value: paste the secret from step 1.
4. Click **Add secret**.

Then trigger the first run manually: go to the **Actions** tab, click
**Refresh dashboard data** on the left, click **Run workflow**. After
it finishes (green checkmark, ~10 seconds), `data.json` in your repo
will have your real numbers instead of the zeroed-out placeholder.

## 5. Turn on GitHub Pages

1. In the repo, go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **Deploy from a
   branch**. Branch: `main`, folder: `/ (root)`. Click **Save**.
3. Wait a minute, then refresh the page — GitHub will show you the live
   URL, something like `https://YOUR-USERNAME.github.io/YOUR-REPO/`.
   Open it to confirm the dashboard renders with your real data.

## 6. Embed it in Notion

1. On your Workout Tracker page in Notion, type `/embed` and press
   Enter.
2. Paste your GitHub Pages URL from step 5.
3. Resize the embed block by dragging its corner so it's tall enough to
   show the whole dashboard.

That's it — the embed will always show whatever's currently at that
URL, and the GitHub Action refreshes it hourly (or on-demand from the
Actions tab, or by changing the `cron` line in
`.github/workflows/refresh.yml` to a different interval).

## If something breaks

- **Actions tab shows a red X**: click into the failed run, expand
  "Fetch latest data from Notion" — the error message names which
  database returned a 404 (almost always step 2, forgetting to share a
  database with the integration).
- **Dashboard loads but says "no data yet"**: the Action hasn't run
  successfully yet, or you haven't triggered it manually after adding
  the secret. Check the Actions tab.
- **Notion embed shows a blank/broken box**: make sure GitHub Pages is
  fully deployed first (open the URL directly in a browser tab — if it
  works there, it'll work as a Notion embed).
