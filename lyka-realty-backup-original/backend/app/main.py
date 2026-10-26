from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pathlib import Path
from sqlalchemy import inspect, text
from fastapi.responses import FileResponse, JSONResponse

from .database import engine, Base
from .config import settings, validate_runtime_settings
from .routers import auth, properties, ai, visits, crm, telephony

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


def ensure_conversation_workflow_columns():
    additions = {
        "users": {"is_active": "BOOLEAN NOT NULL DEFAULT TRUE"},
        "properties": {"is_active": "BOOLEAN NOT NULL DEFAULT TRUE"},
        "conversations": {"context_json": "TEXT"},
        "leads": {
            "budget_min": "FLOAT",
            "budget_max": "FLOAT",
            "preferred_location": "VARCHAR(255)",
            "property_type": "VARCHAR(100)",
            "furnished": "INTEGER",
            "interested_property_id": "INTEGER",
            "site_visit_id": "INTEGER",
            "preferred_language": "VARCHAR(20)",
            "assigned_employee_id": "INTEGER",
            "lead_source": "VARCHAR(50) DEFAULT 'AI_CHAT'",
            "contact_preference": "VARCHAR(50) DEFAULT 'ANY'",
            "consent_contact": "INTEGER DEFAULT 1",
            "follow_up_date": "DATETIME",
            "score_override": "INTEGER DEFAULT 0",
            "score_override_reason": "TEXT",
        },
        "site_visits": {
            "lead_id": "INTEGER",
            "assigned_agent_id": "INTEGER",
            "rescheduled_date": "VARCHAR(50)",
            "rescheduled_time": "VARCHAR(50)",
            "confirmation_notes": "TEXT",
            "updated_at": "DATETIME",
        },
        "handoff_requests": {
            "conversation_id": "VARCHAR(100)",
            "lead_id": "INTEGER",
            "interested_property_id": "INTEGER",
            "preferred_language": "VARCHAR(20)",
        },
    }
    inspector = inspect(engine)
    with engine.begin() as connection:
        for table_name, columns in additions.items():
            if not inspector.has_table(table_name):
                continue
            existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
            for column_name, column_type in columns.items():
                if column_name not in existing_columns:
                    connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"))
        for index_name, table_name, column_name in (
            ("ix_leads_conversation_id", "leads", "conversation_id"),
            ("ix_site_visits_lead_id", "site_visits", "lead_id"),
            ("ix_handoff_requests_conversation_id", "handoff_requests", "conversation_id"),
            ("ix_handoff_requests_lead_id", "handoff_requests", "lead_id"),
        ):
            if inspector.has_table(table_name):
                connection.execute(text(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} ({column_name})"))

@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_runtime_settings()
    # Ensure tables are created
    Base.metadata.create_all(bind=engine)
    ensure_conversation_workflow_columns()

    yield

app = FastAPI(
    title="LYKA AI — Real Estate Backend API",
    description="Real-estate intelligence and multilingual conversational AI for LYKA Realty Dubai",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers under /api
app.include_router(auth.router, prefix="/api")
app.include_router(properties.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(visits.router, prefix="/api")
app.include_router(crm.router, prefix="/api")
app.include_router(telephony.router, prefix="/api")


@app.get("/api/health")
def health_check():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))

    return {
        "status": "online",
        "service": "LYKA AI Real Estate API",
        "database": "connected",
        "database_type": engine.dialect.name,
        "version": "1.0.0",
    }


@app.get("/{frontend_path:path}", include_in_schema=False)
@app.get("/", include_in_schema=False)
def serve_frontend(frontend_path: str = ""):
    if frontend_path == "api" or frontend_path.startswith("api/"):
        return JSONResponse(status_code=404, content={"detail": "Not Found"})

    index_file = FRONTEND_DIST / "index.html"
    if not index_file.is_file():
        return JSONResponse(
            status_code=503,
            content={"detail": "Frontend build is missing; run the project startup script."},
        )

    if frontend_path:
        requested_file = (FRONTEND_DIST / frontend_path).resolve()
        if requested_file.is_relative_to(FRONTEND_DIST.resolve()) and requested_file.is_file():
            return FileResponse(requested_file)

    return FileResponse(index_file)
