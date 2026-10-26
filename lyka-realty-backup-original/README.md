# LYKA Realty AI

A React + TypeScript/Vite frontend with a FastAPI + SQLAlchemy backend, SQLite for local development, PostgreSQL for production, and a database-backed property consultant. The supplied inventory is primarily rental listings; the app must not treat missing sale prices as verified sale inventory.

## Run locally on Windows

1. Install Python 3.10+ and Node.js LTS.
2. Install Ollama from https://ollama.com/download/windows, then run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\setup_local_ai.ps1` to check the local service and download `qwen2.5:3b`. Copy `backend/.env.example` to `backend/.env`, set `JWT_SECRET` to a unique random value, and leave `AI_PROVIDER=ollama` for local-first operation. This mode does not require a cloud API key. If you optionally add Gemini/OpenAI keys, they are attempted as fallbacks if Ollama fails, but cloud providers can still impose quotas and rate limits.
3. From the project root, run in PowerShell:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start_lyka.ps1
   ```

4. Open `http://localhost:8000`. API docs are at `http://localhost:8000/docs`.

The startup script installs missing declared dependencies and builds the frontend. The local SQLite database is `backend/lyka_realty.db`. Do not replace it with the old root-level database from earlier copies. Ollama is a separate local application and must be installed and running; the startup script does not download AI models automatically. If every LLM is unavailable while `AI_PROVIDER=ollama`, LYKA uses a limited database-grounded fallback response for core property search instead of failing the request. This fallback is not a replacement for full conversational reasoning.

### Existing local admin account recovery

In the included backend database, the existing admin and employee accounts are inactive. If you are the authorized project owner and need to recover the existing admin, run these commands from PowerShell (after dependencies are installed):

```powershell
cd backend
python activate_existing_admin.py
python reset_account_password.py
```

The first command activates only an existing admin after exact confirmation. The second resets that active account's password interactively. Do not run these commands against a production database unless you have verified the database target and have authorization. Once logged in, use the admin interface to activate the existing employee account.

## Deploy to Render

See [`DEPLOYMENT.md`](DEPLOYMENT.md). Production configuration intentionally requires PostgreSQL, a strong unique JWT secret, and at least one valid AI provider key (both are recommended for failover). Do not deploy `backend/.env`; set secrets in the hosting provider's environment settings.

## Data notes

`dubai_properties.csv` contains rental listings (`Purpose=For Rent`) and no source sale-price column, property-specific photos, amenities, or investment yields. The importer preserves missing values as unknown and does not fabricate those facts. Run the importer once against the intended database after it is created.

## Security notice

The original uploaded archive contained a `backend/.env` file with configured credentials. It has been excluded from this cleaned package. Rotate any API keys and JWT secret that were present in that archive before deployment. See [`SECURITY_NOTICE.md`](SECURITY_NOTICE.md).
