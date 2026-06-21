---
name: startsentosa
description: Pull latest code from git remote and start the Sentosa CMS dev server locally on http://localhost:3000
triggers:
  - /startsentosa
---

# /startsentosa

Pull the latest changes from `origin/main` then start the Next.js dev server for the Sentosa CMS project.

## Steps

1. **Git pull** — run `git -C "D:\Huy Sentosa" pull origin main` and show a summary of what changed (files changed, insertions, deletions). If already up to date, say so.

2. **Install dependencies** — if `package.json` or `package-lock.json` was among the changed files, run `npm install` inside `D:\Huy Sentosa`. Otherwise skip this step.

3. **Start dev server** — run `npm run dev` inside `D:\Huy Sentosa` in the background. Wait up to 10 seconds for the "Ready" line to appear in output, then report the local URL (`http://localhost:3000`).

4. **Report** — print a short summary: what was pulled, whether deps were reinstalled, and that the server is live at http://localhost:3000.
