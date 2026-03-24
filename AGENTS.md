# Repository Guidelines

## Project Structure & Module Organization
This repository is a static single-page dashboard. Keep routine changes in the root files unless you are intentionally working on the legacy snapshot in `v1/`.

- `index.html`: app shell, toolbar, modal markup, and script/style includes
- `app.js`: client state, scheduling logic, Supabase reads/writes, uploads, rendering, and event listeners
- `styles.css`: theme tokens, layout, components, and responsive rules
- `favicon.svg`: app icon
- `database.sql`: reference schema and data setup notes

There is no dedicated test directory or build output folder in the current project.

## Build, Test, and Development Commands
There is no package-based build step. Run the app from a local static server from the repo root:

- `python -m http.server 8000`: starts a simple local server
- `npx serve .`: alternative local static server if Node.js is available

Open `http://localhost:8000` after starting the server. The app uses the Supabase configuration embedded in `app.js`.

## Coding Style & Naming Conventions
Match the existing style exactly:

- Use 4-space indentation in HTML, CSS, and JavaScript
- Use `camelCase` for functions and variables
- Use uppercase names for configuration constants such as `DEFAULT_SETTINGS`
- Preserve the numbered section blocks in `app.js`
- Keep descriptive DOM ids and class names such as `part-modal-save` or `gantt-filter-machine`

No formatter or lint config is checked in, so keep edits consistent and minimal.

## Testing Guidelines
Automated tests are not set up. Verify changes manually in the browser.

Smoke test app load, Supabase connection status, machine create/edit/delete, parts upload, part editing, schedule rebuild, filters, and theme toggle. When changing scheduling behavior, confirm dates, shift preference ordering, and vehicle allocation still behave correctly.

## Commit & Pull Request Guidelines
Git history uses short, direct commit subjects such as `fixed popup view`. Prefer concise, imperative messages focused on one change, for example `Refine gantt filtering`.

Pull requests should include a short summary, affected files, any Supabase or data assumptions, screenshots for visible UI changes, and the manual scenarios you tested.

## Security & Configuration Tips
`app.js` contains Supabase connection values. Do not rename tables, rotate credentials, or change persistence behavior without confirming downstream impact first.
