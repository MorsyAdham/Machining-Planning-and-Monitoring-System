# Repository Guidelines

## Project Structure & Module Organization
This repository is a static single-page dashboard. Keep changes scoped to the root files unless you are intentionally working on the archived version in `v1/`.

- `index.html` contains the application shell, modal markup, toolbar controls, and script/style includes.
- `app.js` holds client state, scheduling logic, Supabase reads and writes, upload handling, rendering, and event listeners.
- `styles.css` defines theme tokens, layout, component styling, and responsive behavior.
- `favicon.svg` stores the app icon.
- `v1/` is a legacy snapshot for reference; do not update it during normal feature work.

## Build, Test, and Development Commands
There is no build step or package manifest in the current repo. Run the app from a local static server so browser module imports work correctly.

- `python -m http.server 8000` starts a simple local server from the repo root.
- `npx serve .` is an alternative static server if Node.js is available.

Open `http://localhost:8000` after starting the server. The app depends on the Supabase configuration embedded in `app.js`.

## Coding Style & Naming Conventions
Match the existing code style exactly.

- Use 4-space indentation in HTML, CSS, and JavaScript.
- Keep JavaScript functions and variables in `camelCase`.
- Keep configuration constants in uppercase, for example `DEFAULT_SETTINGS`.
- Preserve the numbered section blocks in `app.js` and the token-driven structure in `styles.css`.
- Prefer descriptive DOM ids and class names such as `part-modal-save` or `gantt-filter-machine`.

## Testing Guidelines
Automated tests are not set up yet; verification is manual.

- Smoke test app load, connection status, machine create/edit/delete, parts upload, part editing, scheduling rebuild, filters, and theme toggle.
- When changing scheduling logic, confirm dates, shift preference ordering, and vehicle allocation rules still behave correctly.
- Record the manual scenarios you exercised in the pull request.

## Commit & Pull Request Guidelines
Use short, imperative commit messages such as `Refine gantt filtering` or `Fix part modal validation`. Keep each commit focused on one behavior change.

Pull requests should include a brief summary, affected files, any Supabase table or data assumptions, and screenshots for visible UI changes. Highlight manual test coverage and note any behavior that was intentionally preserved for compatibility.

## Security & Configuration Tips
`app.js` currently contains Supabase connection values. Do not replace credentials, rename tables, or alter persistence behavior without confirming the downstream impact first.
