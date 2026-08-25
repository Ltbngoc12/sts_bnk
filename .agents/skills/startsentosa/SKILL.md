---
name: startsentosa
description: "Triggers when the user types /startsentosa or asks to pull the latest version of the Sentosa project from Git."
---

# Start Sentosa Skill

This skill automates pulling the latest version of the Sentosa project from Git and updating the project workspace.

## Steps to Execute

1. **Pull Latest Code:**
   - Execute `git pull` in the workspace directory.
   - If there are merge conflicts, notify the user immediately and do not proceed automatically.

2. **Verify Dependencies:**
   - Check if `package.json` or `package-lock.json` has changed.
   - If changed, run `npm install` to update the dependencies.

3. **Start Local Development Server:**
   - Run `npm run dev` to launch the local server.

4. **Provide Status:**
   - Report the status of the git pull, dependency installation, and local development server status to the user.
