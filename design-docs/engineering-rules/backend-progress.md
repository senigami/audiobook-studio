# Backend Progress

Use this file for ETA, progress, and WebSocket state consistency rules.

## Core Rules

- WebSocket progress values must be rounded to exactly 2 decimal places.
- Only broadcast progress updates when the value advances meaningfully, the status changes, or the event carries important new context.
- Queue and progress services own progress math. Do not duplicate ETA or completion logic inside engine wrappers or route handlers.
- Parent-child job behavior should be modeled explicitly rather than inferred from filenames or loose naming conventions.
