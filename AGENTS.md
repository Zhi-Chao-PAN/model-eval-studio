# Project credential safety

- Keep API keys, session secrets, database credentials and authentication exports out of source, fixtures, commits, logs and browser bundles. Use local ignored environment files or the existing protected user settings.
- Do not copy recovery bundles, old `.git` directories or raw incident evidence into this repository.
- Install the repository hooks with `pnpm security:install-hooks`. Run `pnpm security:scan` before pushing; never bypass these checks to publish credentials or tainted history.
- Use `pnpm test:security` to verify the standalone MiniMax helper offline. Running `scripts/test-ai.js` directly makes a real billable model request and requires an explicitly configured local environment variable.
- The application keeps its existing per-user AI configuration and encryption. Do not replace production secrets or modify live databases as part of ordinary local testing.
- After the 2026-11-10 history cleanup, base work on clean remote refs. Reapply necessary local patches after scanning; do not merge old history back in.
