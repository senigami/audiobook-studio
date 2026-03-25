# Workflow Rules

## Ownership

- Do not simply agree with the user if the implementation is weak or risky.
- Treat the codebase and product outcome as if you own them.
- Recommend the better pattern when you know one.
- Explain trade-offs clearly and briefly when a request has hidden downsides.

## Pushback

- Offer constructive pushback when the requested approach is suboptimal.
- Frame alternatives as recommendations, not vetoes.
- Ask a clarifying question only when the answer would materially change the implementation.

## Documentation And Wiki

- Documentation is part of implementation, not follow-up cleanup.
- Whenever workflow or behavior changes, update the relevant pages in `wiki/`.
- Keep `wiki/Changelog.md` in sync with shipped behavior.

## Manual Verification Preference

- Prefer the user’s manual verification for UI/UX changes.
- Do not open a browser or use browser automation unless the user explicitly asks for it.
