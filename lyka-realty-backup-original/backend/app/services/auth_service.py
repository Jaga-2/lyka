import hmac
import secrets
import bcrypt
import jwt
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import HTTPException, status, Depends, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from ..config import settings
from ..database import get_db
from ..models.user import User

security = HTTPBearer(auto_error=False)

COOKIE_ACCESS_TOKEN_KEY = "lyka_access_token"
COOKIE_CSRF_TOKEN_KEY = "lyka_csrf_token"


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if "sub" in to_encode:
        to_encode["sub"] = str(to_encode["sub"])
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def generate_csrf_token() -> str:
    return secrets.token_hex(32)


def set_auth_cookies(
    response: Response,
    token: str,
    csrf_token: Optional[str] = None,
    request: Optional[Request] = None,
) -> None:
    is_secure = settings.COOKIE_SECURE or settings.APP_ENV == "production"
    if request and (request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"):
        is_secure = True

    samesite = settings.COOKIE_SAMESITE.lower()
    if samesite == "none":
        is_secure = True

    max_age = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60

    response.set_cookie(
        key=COOKIE_ACCESS_TOKEN_KEY,
        value=token,
        max_age=max_age,
        expires=max_age,
        path="/",
        domain=settings.COOKIE_DOMAIN,
        secure=is_secure,
        httponly=True,  # Inaccessible to frontend JS
        samesite=samesite,
    )

    if csrf_token:
        response.set_cookie(
            key=COOKIE_CSRF_TOKEN_KEY,
            value=csrf_token,
            max_age=max_age,
            expires=max_age,
            path="/",
            domain=settings.COOKIE_DOMAIN,
            secure=is_secure,
            httponly=False,  # Client JS reads this to populate X-CSRF-Token header
            samesite=samesite,
        )


def clear_auth_cookies(response: Response, request: Optional[Request] = None) -> None:
    is_secure = settings.COOKIE_SECURE or settings.APP_ENV == "production"
    if request and (request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"):
        is_secure = True

    samesite = settings.COOKIE_SAMESITE.lower()
    if samesite == "none":
        is_secure = True

    response.delete_cookie(
        key=COOKIE_ACCESS_TOKEN_KEY,
        path="/",
        domain=settings.COOKIE_DOMAIN,
        secure=is_secure,
        httponly=True,
        samesite=samesite,
    )
    response.delete_cookie(
        key=COOKIE_CSRF_TOKEN_KEY,
        path="/",
        domain=settings.COOKIE_DOMAIN,
        secure=is_secure,
        httponly=False,
        samesite=samesite,
    )


def verify_csrf_token(request: Request) -> None:
    csrf_cookie = request.cookies.get(COOKIE_CSRF_TOKEN_KEY)
    csrf_header = request.headers.get("x-csrf-token") or request.headers.get("X-CSRF-Token")

    if not csrf_cookie or not csrf_header:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token missing. Please refresh and retry.",
        )

    if not hmac.compare_digest(csrf_cookie, csrf_header):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token validation failed.",
        )


VALID_ROLES = {"customer", "employee", "sales_agent", "manager", "admin", "super_admin"}

ROLE_EQUIVALENCE = {
    "super_admin": {"super_admin"},
    "admin": {"admin", "super_admin"},
    "manager": {"manager", "admin", "super_admin"},
    "sales_agent": {"sales_agent", "employee", "manager", "admin", "super_admin"},
    "employee": {"sales_agent", "employee", "manager", "admin", "super_admin"},
    "customer": {"customer"},
}


def get_current_user(
    request: Request,
    auth: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    token = None
    auth_source = None

    if auth and auth.credentials:
        token = auth.credentials
        auth_source = "bearer"
    elif request and COOKIE_ACCESS_TOKEN_KEY in request.cookies:
        token = request.cookies.get(COOKIE_ACCESS_TOKEN_KEY)
        auth_source = "cookie"

    if not token:
        return None

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_sub": False},
        )
        subject = payload.get("sub")
        if subject is None:
            return None
        user_id = int(subject)
    except (jwt.InvalidTokenError, TypeError, ValueError):
        return None

    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active or user.role not in VALID_ROLES:
        return None

    request.state.auth_source = auth_source
    request.state.current_user = user
    return user


def require_auth(
    request: Request,
    user: Optional[User] = Depends(get_current_user),
) -> User:
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided or invalid",
        )

    # State-changing requests authenticated via ambient browser cookie require valid CSRF
    auth_source = getattr(request.state, "auth_source", None)
    if auth_source == "cookie" and request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        verify_csrf_token(request)

    return user


def require_role(allowed_roles: List[str]):
    def role_checker(user: User = Depends(require_auth)) -> User:
        user_role = user.role
        can_access = False
        for req_role in allowed_roles:
            acceptable = ROLE_EQUIVALENCE.get(req_role, {req_role})
            if user_role in acceptable:
                can_access = True
                break
        if not can_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied for role '{user.role}'. Required: {allowed_roles}",
            )
        return user
    return role_checker

