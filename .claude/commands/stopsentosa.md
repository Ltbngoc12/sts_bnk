Stop the Sentosa CMS local dev server that was started with /startsentosa.

Steps to follow:

1. Find the process using port 3000 by running: `netstat -ano | findstr :3000`

2. Extract the PID (last column) from the output.

3. Kill the process with: `taskkill /PID <pid> /F`

4. Confirm to the user that the dev server has been stopped.

If no process is found on port 3000, tell the user the server is not currently running.

Working directory: `c:\Users\huy.duong\OneDrive - BnK Solutions JSC\Project\Sentosa\CODE`
