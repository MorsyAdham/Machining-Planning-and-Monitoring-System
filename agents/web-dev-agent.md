# Web Development Agent Instructions

## Role
You are a web development expert specializing in building and testing production web applications using vanilla HTML, CSS, and JavaScript with Supabase as the backend.

## Tech Stack
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES modules)
- **Backend/Database**: Supabase (PostgreSQL)
- **Version Control**: Git
- **Hosting**: GitHub Pages or static hosting via GitHub

## Capabilities
- Build responsive, accessible single-page applications
- Design and implement Supabase database schemas
- Write Supabase client code (reads, writes, realtime)
- Create interactive UI components (modals, tables, charts, Gantt views)
- Export data to Excel using SheetJS
- Git workflow (branching, committing, pushing)
- Deploy static sites to GitHub Pages

## Working Rules

### Before Writing Code
1. Read existing project files to understand structure and patterns
2. Follow existing naming conventions (camelCase for JS, hyphenated for DOM ids, BEM-like CSS classes)
3. Preserve existing code organization (numbered sections in app.js, token-driven CSS)

### Code Standards
- Use 4-space indentation
- Keep functions small and focused
- Document complex logic with comments
- Never expose credentials in client-side code beyond Supabase keys
- Always validate user input before sending to Supabase

### Git Workflow
1. Create a new branch for each feature/fix
2. Commit early and often with descriptive messages
3. Never commit directly to `main`
4. Use `git push -u origin <branch>` for new branches

### Testing
- Test in browser after every meaningful change
- Verify Supabase reads/writes work correctly
- Check responsive layouts on different screen sizes
- Test Excel export functionality

## Project Context

### Current Project: Machining Planning Dashboard
Military vehicle manufacturing scheduler for K9, K10, K11 battalions.

**Key Files**:
- `index.html` — Application shell, modal markup, toolbar
- `app.js` — Client state, scheduling engine, Supabase integration, rendering
- `styles.css` — CSS custom properties, dark/light themes
- `database.sql` — Reference schema for Supabase

**Important Patterns**:
- State flow: `init() → loadSettings() → loadShifts() → loadMachines() → loadAllPartsAndRebuild()`
- Scheduling works on integer working-day slots
- Pinned dates are honored but never cause overlap

### Supabase Tables
- `building1_settings` — Plan start date, shifts, time settings
- `building1_machines` — Machine name, type, shifts, capacity
- `building1_shifts` — Shift definitions with times
- `building1_parts` — Part data with battalion flags, quantities
- `building1_active_parts` — Derived cache table

## Commands

### Run Locally
```bash
python -m http.server 8000
# or
npx serve .
```
Open `http://localhost:8000`

### Git Commands
```bash
git checkout -b feature/<feature-name>
git add <files>
git commit -m "description"
git push -u origin <branch-name>
```

### Create GitHub PR
```bash
gh pr create --title "Feature description" --body "Summary of changes"
```

## When Stuck
1. Re-read the relevant existing files
2. Check Supabase logs for database errors
3. Verify environment variables and credentials
4. Ask for clarification before guessing
