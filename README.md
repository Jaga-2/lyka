# LYKA AI backend

The FastAPI backend uses SQLAlchemy and reads `DATABASE_URL` from the environment.
For PostgreSQL, use `postgresql+psycopg://USER:PASSWORD@HOST:PORT/DATABASE`.
The Psycopg 3 binary driver is included in `requirements.txt`. If `DATABASE_URL`
is not set, the backend uses `backend/lyka_realty.db` (SQLite).

## Local AI without API keys

For local development, install Ollama for Windows and run `ollama pull qwen2.5:3b`. Set `AI_PROVIDER=ollama`, `OLLAMA_BASE_URL=http://127.0.0.1:11434`, and `OLLAMA_MODEL=qwen2.5:3b` in `backend/.env`. This avoids cloud API keys and cloud-provider quota limits. Ollama still needs to be running locally and requires sufficient RAM/disk space. Optional OpenAI/Gemini keys can be used as fallbacks but retain their own usage limits.

## One-command Windows startup

From the project root in the VS Code PowerShell terminal, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start_lyka.ps1
```

The launcher checks the existing SQLite database and local runtimes, builds the
existing Vite frontend, starts `app.main:app`, waits for `/api/health`, then
opens `http://localhost:8000`. Press Ctrl+C in that terminal to stop the server.
It will not create or overwrite the database or stop an unrelated process.
For frontend-only development, run `npm run dev` from `frontend`; Vite proxies
`/api` requests to the local FastAPI server.

## Accounts and roles

Public registration always creates a customer. Only an authenticated admin can
create employee accounts or manage account roles/status. Employee accounts
must be activated through the admin account-management API. The application
does not seed demo personas or accept demo tokens.

If the database contains an existing inactive administrator and no active
administrator, the authorized project owner can run the local recovery utility
from the project root:

```powershell
.\.venv\Scripts\python.exe .\backend\activate_existing_admin.py
```

The utility refuses to run unless the configured database is exactly
`backend\lyka_realty.db`, checks that no active administrator exists, and
verifies that the requested email belongs to an existing inactive admin. Type
`ACTIVATE <exact-admin-email>` when prompted. It changes only that account's
active flag; it preserves the password hash and role and does not create an
account. Do not run it without explicit project-owner authorization. After
recovery, use the normal login and admin account-management workflow to approve
and activate existing employees. If no admin account exists at all, use
`create_admin.py` only with separate explicit authorization to create the
initial privileged account.

For a forgotten password on an existing active account, run this local reset
utility from the project root:

```powershell
.\.venv\Scripts\python.exe .\backend\reset_account_password.py
```

It is restricted to `backend\lyka_realty.db`, accepts only an existing active
account, requires the exact `RESET <email>` confirmation, and prompts for the
new password twice without echoing it. Passwords are hashed using the
application's existing password-hashing service; role and status are
unchanged. An inactive account must first be approved through the normal
account-status recovery/administration process. Do not reset another person's
password without verifying their identity and authorization outside this
utility. Customer, employee, and admin access is enforced by the API as well
as the frontend routes.

To sync the supplied property inventory into the configured database, run from
the `backend` directory:

```powershell
python scripts/import_properties.py
```

Matching listings in the configured database are updated in place, preserving
their IDs and existing site-visit references. Additional source rows are
inserted, and re-running the import does not duplicate listings.

The CSV contains rental listings and does not provide sale prices, photos,
amenities, or investment yields. Those fields are left empty/unknown rather
than inferred. Rows with missing addresses or non-positive rent are skipped.
Configure and start PostgreSQL separately before setting `DATABASE_URL` to a
PostgreSQL connection string. Importing the CSV does not migrate existing
SQLite users, leads, or site visits; keep the SQLite database until those
records have been migrated and their property references verified.

## Local PostgreSQL on Windows

Install PostgreSQL using the official Windows installer (Docker is not
required), then use SQL Shell (`psql`) as the `postgres` administrator to run:

```sql
CREATE ROLE lyka_app LOGIN PASSWORD 'replace-with-a-local-password';
CREATE DATABASE lyka_realty OWNER lyka_app;
```

In PowerShell, from the `backend` directory, configure and test the connection:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://lyka_app:URL_ENCODED_PASSWORD@localhost:5432/lyka_realty"
python -m pip install -r requirements.txt
python -c "from sqlalchemy import text; from app.database import engine; connection = engine.connect(); connection.execute(text('SELECT 1')); print('Database connection OK'); connection.close()"
```

Do not run the property importer against PostgreSQL until any SQLite records
that need to be retained have been migrated and their references checked.

## AI provider configuration

`/api/ai/chat` supports the official OpenAI and Google Gemini Python SDKs.
Select exactly one provider in `backend/.env`; provider failures are returned
as safe errors and never replaced with scripted replies:

```dotenv
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:3b
# Optional cloud fallback: GEMINI_API_KEY=your-Gemini-key
GEMINI_MODEL=gemini-flash-latest
```

For OpenAI, set `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and `OPENAI_MODEL`. For local no-key operation, install Ollama and run `ollama pull qwen2.5:3b`; then set `AI_PROVIDER=ollama`.
Chat keys stay in `backend/.env`; never put them in Vite variables or frontend
source. Restart the backend after changing `.env`. The Windows startup script
checks both SDKs, installs declared missing backend dependencies, and
restarts this project's backend when its configuration or source changes.

Gemini's free tier is limited to selected models and has provider-managed rate
and usage limits; eligibility, model access, and billing requirements depend
on the Google AI Studio project and can change. Check Google's current
[Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) and
[model list](https://ai.google.dev/gemini-api/docs/models) before relying on
free access. The consultant continues to build recommendations only from
matching records in the existing SQLite inventory.

Audio generation remains the existing OpenAI TTS integration and therefore
requires `OPENAI_API_KEY` even when Gemini is selected for chat. Browser
speech recognition remains separate. Tamil browser speech is used only when
a matching Tamil voice is available; the app does not substitute an English
voice for Tamil text.

## Conversation, lead, and visit workflow

Chat messages, structured requirements, selected/shown property IDs, leads,
advisor requests, and confirmed site visits are saved in the configured
database. Existing tables receive additive workflow columns on backend startup.
Lead scores are deterministic; advisor and site-visit requests are not shown as
successes unless their database writes complete. A recorded advisor request
does not mean that a human has already contacted the customer.
