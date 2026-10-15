# The Project Management MVP web app

## Business Requirements

This project is building a Project Management App. Key features:
- Users can create an account, sign in, and change their display name and password
- Administrators can list users, disable or re-enable them, grant or remove admin, and reset passwords
- A user can own multiple Kanban boards and switch between them; boards can be created, renamed and deleted
- A board owner can share a board with other users as an editor or a viewer
- Boards have custom columns that can be added, renamed, reordered and deleted when empty
- Cards can be moved with drag and drop, and edited, including due date, priority, labels and assignee
- Cards can be searched and filtered by text, priority, label, assignee and overdue
- There is an AI chat feature in a sidebar; the AI is able to create / edit / move one or more cards, set card fields, and add or remove empty columns

## Limitations

The demo account 'user' / 'password' is seeded as an administrator with a sample board.

This runs locally (in a docker container) and should stay on loopback.

## Technical Decisions

- NextJS frontend
- Python FastAPI backend, including serving the static NextJS site at /
- Everything packaged into a Docker container
- Use "uv" as the package manager for python in the Docker container
- Use OpenRouter for the AI calls. An OPENROUTER_API_KEY is in .env in the project root
- Use `nvidia/nemotron-3-super-120b-a12b:free` as the model
- Use SQLLite local database for the database, creating a new db if it doesn't exist
- Start and Stop server scripts for Mac, PC, Linux in scripts/

## Current implementation

FastAPI serves the Next.js static export and protected JSON API. Accounts use scrypt password hashes and backend-managed expiring sessions. SQLite stores users, boards, members, board-scoped columns and cards, and revision-checked writes; startup migrates existing databases without discarding data. Manual editing, pointer/keyboard movement, filtering, sharing, and server-committed AI updates are implemented. Docker mounts only runtime data and publishes on loopback. See docs/DATABASE.md for the data model and docs/PLAN.md for build status.

## Color Scheme

- Accent Yellow: `#ecad0a` - accent lines, highlights
- Blue Primary: `#209dd7` - links, key sections
- Purple Secondary: `#753991` - submit buttons, important actions
- Dark Navy: `#032147` - main headings
- Gray Text: `#888888` - labels; supporting text on light surfaces uses `#656565` for readable contrast

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever
4. When hitting issues, always identify root cause before trying a fix. Do not guess. Prove with evidence, then fix the root cause.

## Working documentation

All documents for planning and executing this project will be in the docs/ directory.
Please review the docs/PLAN.md document before proceeding.