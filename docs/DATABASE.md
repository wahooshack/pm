# Database design

## Goal

This schema is designed for the local Kanban MVP and keeps the implementation simple while leaving room for future multi-user growth.

## Design choices

- Use SQLite for a local file-based database.
- Keep the MVP to one board per user.
- Treat the current demo login as a minimal user record while still storing users separately from boards.
- Persist columns and cards in a normalized structure rather than storing the entire board as a JSON blob.

## Tables

### users

Stores user identity for the app. In the current MVP, the login is still hardcoded to the demo account (`user` / `password`), but the database supports future extra accounts.

### boards

Stores each user’s board state. The MVP keeps exactly one board per user, enforced by a unique `user_id`.

### columns

Stores the board’s ordered column set. Each row includes a `position` field so column order is preserved consistently.

### cards

Stores every card, including `column_id`, `title`, `details`, and `position` within the column. This gives us a stable structure for drag-and-drop updates.

## Why this structure

This approach matches the existing frontend model closely:

- A board has columns.
- A column has cards.
- Each card belongs to a single column and has an order value.

It avoids over-engineering while still separating concerns cleanly enough for future API and persistence work.

## Future expansion considerations

The schema is intentionally ready for multiple users and future multi-board scenarios without forcing a redesign now. The main constraint that remains MVP-specific is the single-board-per-user rule.

## Approval gate

Before moving to the backend persistence work, this schema should be reviewed and approved. It aligns with the root requirements and keeps the app simple, local, and SQLite-based.
