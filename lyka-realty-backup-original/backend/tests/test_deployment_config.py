import pytest
from sqlalchemy.engine import make_url

from app.config import settings, validate_runtime_settings

def _restore(monkeypatch, **values):
    for key, value in values.items():
        monkeypatch.setattr(settings, key, value)

def test_development_does_not_require_production_secrets(monkeypatch):
    _restore(monkeypatch, APP_ENV="development")
    validate_runtime_settings()

def test_production_rejects_weak_jwt_secret(monkeypatch):
    _restore(
        monkeypatch,
        APP_ENV="production",
        JWT_SECRET="dev-only-change-this-secret-before-deployment",
        DATABASE_URL="postgresql://user:password@localhost/testdb",
        AI_PROVIDER="gemini",
        GEMINI_API_KEY="test-key",
    )
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        validate_runtime_settings()

def test_production_rejects_sqlite(monkeypatch):
    _restore(
        monkeypatch,
        APP_ENV="production",
        JWT_SECRET="a" * 48,
        DATABASE_URL="sqlite:///./test.db",
        AI_PROVIDER="gemini",
        GEMINI_API_KEY="test-key",
    )
    with pytest.raises(RuntimeError, match="PostgreSQL"):
        validate_runtime_settings()

def test_production_requires_at_least_one_ai_key(monkeypatch):
    _restore(
        monkeypatch,
        APP_ENV="production",
        JWT_SECRET="a" * 48,
        DATABASE_URL="postgresql://user:password@localhost/testdb",
        AI_PROVIDER="gemini",
        GEMINI_API_KEY="",
        OPENAI_API_KEY="",
    )
    with pytest.raises(RuntimeError, match="at least one AI provider key"):
        validate_runtime_settings()


def test_production_allows_fallback_key_when_preferred_key_missing(monkeypatch):
    _restore(
        monkeypatch,
        APP_ENV="production",
        JWT_SECRET="a" * 48,
        DATABASE_URL="postgresql://user:password@localhost/testdb",
        AI_PROVIDER="gemini",
        GEMINI_API_KEY="",
        OPENAI_API_KEY="openai-test-key",
    )
    validate_runtime_settings()

def test_production_accepts_valid_configuration(monkeypatch):
    _restore(
        monkeypatch,
        APP_ENV="production",
        JWT_SECRET="a" * 48,
        DATABASE_URL="postgresql://user:password@localhost/testdb",
        AI_PROVIDER="gemini",
        GEMINI_API_KEY="test-key",
    )
    validate_runtime_settings()
