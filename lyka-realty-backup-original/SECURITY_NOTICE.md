# Security notice

The original uploaded archive included `backend/.env` with configured `OPENAI_API_KEY`, `GEMINI_API_KEY`, `JWT_SECRET`, and `DATABASE_URL` values. This cleaned project does not include that file or its contents.

**Before deploying, rotate both provider API keys and the JWT secret.** Treat the original values as exposed because they were included in an uploaded archive. If the database URL contains a password, rotate that database password too.

Keep real secrets only in your local untracked `backend/.env` or the deployment platform's secret environment settings. Never paste them into chat, screenshots, source code, public issues, or Git history.
