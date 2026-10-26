# LYKA Realty AI — audit and correction log

## What was inspected

- FastAPI routers, SQLAlchemy models, AI service, auth service, database setup, property importer, account recovery scripts, and existing backend tests.
- React/Vite pages, API client, auth context, voice assistant component, package manifest, and Vite configuration.
- The supplied CSV and all SQLite database copies.
- Windows startup script and deployment/environment configuration.

## Verified data findings

- `backend/lyka_realty.db` is the current working database copy: 73,727 properties, 4 users, 10 leads, 10 conversations, 58 messages, and 5 site visits at audit time.
- All 73,727 properties in that database are marked `For Rent`; sale prices and investment yields are unknown/null. The CSV has 73,742 rental rows and does not contain a sale-price column.
- The separate root-level database in the uploaded ZIP was stale and contained 15,000 `For Sale` rows with generated-looking sale values. That stale root database has been excluded from this cleaned package to avoid accidental use.
- The current working database has an inactive admin and an inactive employee. No passwords were changed. The local owner-authorized recovery instructions are in `README.md`.
- Repeated address/key values exist in the source inventory. They have not been blindly deduplicated because repeated rows may represent separate scraped listings.
- The source data has no verified property-specific images, amenities, sale prices, or investment yields. The application should treat these as unavailable unless sourced independently.

## Corrections made

1. Replaced wildcard CORS with the explicit configured `CORS_ORIGINS` setting.
2. Added production startup validation: production requires a unique JWT secret of at least 32 characters, PostgreSQL, an explicit non-wildcard CORS configuration, and at least one AI provider key. Chat can fall back between Gemini and OpenAI when both keys are configured.
3. Enabled SQLite foreign-key enforcement and a five-second busy timeout for local development connections.
4. Corrected the AI instruction for Tanglish so it requests Latin-script Tanglish rather than Tamil script.
5. Added a Render blueprint for separate FastAPI, React static, and managed PostgreSQL services.
6. Added deployment, security, and audit instructions; excluded the secret `.env`, virtual environment, node_modules, build output, and stale root database from this package.
7. Added tests for production configuration validation.

## Validation performed

- Python compilation check passed for backend app, importer, and tests.
- New production-configuration tests passed: 5/5.
- Render blueprint YAML parsed successfully.
- SQLite structural integrity check passed for the working database.

## Validation not completed

- The full pre-existing backend suite was not run because this audit environment does not have all declared SDK/native dependencies installed and network access was unavailable to install them.
- The React production build was not run because `node_modules` was intentionally excluded and package installation could not reach the registry in this environment.
- No live Gemini/OpenAI request, browser microphone test, or deployed-host test was performed.

This package is deployment-configured, but it should not be described as fully production-verified until the remaining live build, provider, browser voice, database import, and role-based acceptance tests pass.


11. Added Gemini/OpenAI chat failover: the preferred provider is attempted first, then the other configured provider if the first fails. Both keys remain server-side; failover is unavailable unless both keys are configured.

## Local-first AI update (2026-10-12)

- Added Ollama as a local chat provider, configured via `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, and `OLLAMA_TIMEOUT_SECONDS`.
- Changed the example local configuration to prefer `AI_PROVIDER=ollama`, with optional Gemini/OpenAI fallback when those keys are deliberately supplied.
- Added a database-grounded response fallback for core property search/details/site-visit/agent-intent responses when local Ollama and optional cloud providers are unavailable. This fallback is deliberately limited and does not claim a request was saved or an agent assigned.
- Added `setup_local_ai.ps1` to verify Ollama is running and download `qwen2.5:3b`. It does not install Ollama automatically.
- Important: Render deployment still uses a cloud provider because a hosted Render service cannot reach Ollama running on the user's PC.
