import time
import logging
from typing import Dict, Tuple, Optional
from datetime import datetime, timedelta
import jwt
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from ..config import settings
from ..models.audit_log import AuditLog

logger = logging.getLogger(__name__)

# In-memory rate limiting for login attempts: key -> (failed_count, lockout_until_timestamp)
_LOGIN_ATTEMPTS: Dict[str, Tuple[int, float]] = {}
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_SECONDS = 900  # 15 minutes


def check_login_rate_limit(key: str) -> None:
    now = time.time()
    record = _LOGIN_ATTEMPTS.get(key)
    if record:
        count, lockout_until = record
        if lockout_until > now:
            remaining = int(lockout_until - now)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed login attempts. Please try again in {remaining} seconds.",
            )
        elif lockout_until > 0 and lockout_until <= now:
            # Lockout expired, reset
            _LOGIN_ATTEMPTS.pop(key, None)


def record_login_failure(key: str) -> None:
    now = time.time()
    record = _LOGIN_ATTEMPTS.get(key)
    if record:
        count, _ = record
        new_count = count + 1
        if new_count >= MAX_FAILED_ATTEMPTS:
            _LOGIN_ATTEMPTS[key] = (new_count, now + LOCKOUT_DURATION_SECONDS)
        else:
            _LOGIN_ATTEMPTS[key] = (new_count, 0)
    else:
        _LOGIN_ATTEMPTS[key] = (1, 0)


def record_login_success(key: str) -> None:
    _LOGIN_ATTEMPTS.pop(key, None)


def log_audit_event(
    db: Session,
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    user_id: Optional[int] = None,
    user_email: Optional[str] = None,
    user_role: Optional[str] = None,
    details: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> AuditLog:
    try:
        log_entry = AuditLog(
            user_id=user_id,
            user_email=user_email,
            user_role=user_role,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            details=details,
            ip_address=ip_address,
            created_at=datetime.utcnow(),
        )
        db.add(log_entry)
        db.commit()
        db.refresh(log_entry)
        return log_entry
    except Exception as exc:
        db.rollback()
        logger.error("Failed to persist audit log: %s", exc)
        return None


def generate_password_reset_token(email: str) -> str:
    payload = {
        "sub": email,
        "purpose": "password_reset",
        "exp": datetime.utcnow() + timedelta(minutes=30),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def verify_password_reset_token(token: str) -> str:
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
        if payload.get("purpose") != "password_reset":
            raise HTTPException(status_code=400, detail="Invalid token purpose")
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=400, detail="Invalid token subject")
        return email
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=400, detail="Password reset token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=400, detail="Invalid password reset token")
