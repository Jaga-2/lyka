import os
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from typing import List, Literal, Optional

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_database_url():
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        db_path = os.path.join(BACKEND_DIR, "lyka_realty.db")
        return f"sqlite:///{db_path}"
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=os.path.join(BACKEND_DIR, ".env"), extra="ignore")

    DATABASE_URL: str = get_database_url()
    APP_ENV: Literal["development", "test", "production"] = "development"
    # This fallback is for local development only. Production startup rejects it.
    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-only-change-this-secret-before-deployment")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    OPENAI_TTS_MODEL: str = os.getenv("OPENAI_TTS_MODEL", "gpt-4o-mini-tts")
    OPENAI_TTS_VOICE: str = os.getenv("OPENAI_TTS_VOICE", "alloy")
    AI_PROVIDER: Literal["openai", "gemini", "ollama"] = "ollama"
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
    OLLAMA_TIMEOUT_SECONDS: float = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "25.0"))
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = "gemini-flash-latest"

    # Cookie and session security settings
    COOKIE_SECURE: bool = os.getenv("COOKIE_SECURE", "false").lower() in ("true", "1", "yes")
    COOKIE_SAMESITE: str = os.getenv("COOKIE_SAMESITE", "lax")
    COOKIE_DOMAIN: Optional[str] = os.getenv("COOKIE_DOMAIN", None)

    CORS_ORIGINS: List[str] = [
        "https://lyka-2.onrender.com",
        "https://lyka-1.onrender.com",
        "https://lyka-realty-ai.onrender.com",
        "https://lyka-realty-web.onrender.com",
        "https://lyka-orcin.vercel.app",
        "https://lyka-p0hs0vi63-jaga10.vercel.app",
        "https://lyka-git-main-jaga10.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:8000",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value):
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return []
            if value.startswith("[") and value.endswith("]"):
                try:
                    import json
                    return json.loads(value)
                except Exception:
                    pass
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("DATABASE_URL")
    @classmethod
    def resolve_sqlite_database_path(cls, value: str) -> str:
        url = make_url(value)
        if url.get_backend_name() != "sqlite" or not url.database:
            return value
        if os.path.isabs(url.database) or url.database == ":memory:":
            return value
        database_path = os.path.abspath(os.path.join(BACKEND_DIR, url.database))
        return url.set(database=database_path).render_as_string(hide_password=False)

settings = Settings()


def validate_runtime_settings() -> None:
    """Fail fast on deployment configurations that would be unsafe or non-persistent."""
    if settings.APP_ENV != "production":
        return

    if len(settings.JWT_SECRET.strip()) < 32 or settings.JWT_SECRET == "dev-only-change-this-secret-before-deployment":
        raise RuntimeError("Production requires a unique JWT_SECRET with at least 32 characters.")

    if "*" in settings.CORS_ORIGINS:
        raise RuntimeError("Production CORS_ORIGINS must list explicit trusted origins, not a wildcard.")

    database_backend = make_url(settings.DATABASE_URL).get_backend_name()
    if database_backend != "postgresql":
        raise RuntimeError("Production requires PostgreSQL; SQLite storage may be ephemeral on hosting platforms.")

    if not settings.OPENAI_API_KEY.strip() and not settings.GEMINI_API_KEY.strip():
        raise RuntimeError("Production requires at least one AI provider key: OPENAI_API_KEY or GEMINI_API_KEY.")
