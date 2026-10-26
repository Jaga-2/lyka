from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from ..config import settings
from ..database import get_db
from ..models.user import User
from ..schemas.auth import (
    UserRegisterRequest,
    UserLoginRequest,
    TokenResponse,
    UserResponse,
    PasswordResetRequest,
    PasswordResetConfirm,
    ProfileUpdateRequest,
)
from ..services.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    require_auth,
    get_current_user,
    set_auth_cookies,
    clear_auth_cookies,
    generate_csrf_token,
    ROLE_EQUIVALENCE,
)
from ..services.security_service import (
    check_login_rate_limit,
    record_login_failure,
    record_login_success,
    log_audit_event,
    generate_password_reset_token,
    verify_password_reset_token,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=TokenResponse)
def register(
    req: UserRegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    email = str(req.email).strip().lower()
    existing = db.query(User).filter(func.lower(User.email) == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    new_user = User(
        email=email,
        hashed_password=hash_password(req.password),
        full_name=req.full_name,
        phone=req.phone,
        role="customer",  # Public registration is strictly restricted to customer
        is_active=True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    client_ip = request.client.host if request.client else None
    log_audit_event(
        db=db,
        action="USER_REGISTERED",
        resource_type="user",
        resource_id=new_user.id,
        user_id=new_user.id,
        user_email=new_user.email,
        user_role=new_user.role,
        ip_address=client_ip,
        details="Customer self-registration",
    )

    token = create_access_token({"sub": new_user.id, "role": new_user.role})
    csrf_token = generate_csrf_token()
    set_auth_cookies(response=response, token=token, csrf_token=csrf_token, request=request)

    exposed_token = token if request.headers.get("x-request-token") == "true" or settings.APP_ENV == "test" else None
    return TokenResponse(
        user=UserResponse.model_validate(new_user),
        access_token=exposed_token,
        csrf_token=csrf_token,
    )


@router.post("/login", response_model=TokenResponse)
def login(
    req: UserLoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    email = str(req.email).strip().lower()
    client_ip = request.client.host if request.client else None

    # Lead cannot log in as an account
    if req.expected_role == "lead":
        raise HTTPException(
            status_code=400,
            detail="A lead is a CRM enquiry record, not a login account. To view properties and chat with LYKA, please log in as a Customer or register an account.",
        )

    # Throttling check
    check_login_rate_limit(email)

    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user or not user.is_active or not verify_password(req.password, user.hashed_password):
        record_login_failure(email)
        log_audit_event(
            db=db,
            action="LOGIN_FAILED",
            resource_type="auth",
            user_email=email,
            ip_address=client_ip,
            details="Invalid credentials or inactive account",
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # If an expected role was specified, verify that the user's role satisfies it
    if req.expected_role:
        expected = req.expected_role.lower()
        acceptable = ROLE_EQUIVALENCE.get(expected, {expected})
        if user.role not in acceptable:
            record_login_failure(email)
            log_audit_event(
                db=db,
                action="LOGIN_ROLE_MISMATCH",
                resource_type="auth",
                user_id=user.id,
                user_email=user.email,
                user_role=user.role,
                ip_address=client_ip,
                details=f"Attempted login to {expected} portal with role {user.role}",
            )
            raise HTTPException(
                status_code=403,
                detail=f"This account has the role '{user.role}', which is not authorized for the {expected} workspace.",
            )

    # Success: clear failed attempts and record audit log
    record_login_success(email)
    log_audit_event(
        db=db,
        action="LOGIN_SUCCESS",
        resource_type="user",
        resource_id=user.id,
        user_id=user.id,
        user_email=user.email,
        user_role=user.role,
        ip_address=client_ip,
    )

    token = create_access_token({"sub": user.id, "role": user.role})
    csrf_token = generate_csrf_token()
    set_auth_cookies(response=response, token=token, csrf_token=csrf_token, request=request)

    exposed_token = token if request.headers.get("x-request-token") == "true" or settings.APP_ENV == "test" else None
    return TokenResponse(
        user=UserResponse.model_validate(user),
        access_token=exposed_token,
        csrf_token=csrf_token,
    )


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user),
):
    if user:
        client_ip = request.client.host if request.client else None
        log_audit_event(
            db=db,
            action="USER_LOGOUT",
            resource_type="user",
            resource_id=user.id,
            user_id=user.id,
            user_email=user.email,
            user_role=user.role,
            ip_address=client_ip,
        )
    clear_auth_cookies(response=response, request=request)
    return {"message": "Logged out successfully"}


@router.get("/csrf")
def get_csrf(request: Request, response: Response):
    csrf_token = request.cookies.get("lyka_csrf_token")
    if not csrf_token:
        csrf_token = generate_csrf_token()
        is_secure = settings.COOKIE_SECURE or settings.APP_ENV == "production"
        if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
            is_secure = True
        samesite = settings.COOKIE_SAMESITE.lower()
        if samesite == "none":
            is_secure = True
        response.set_cookie(
            key="lyka_csrf_token",
            value=csrf_token,
            max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            expires=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            path="/",
            domain=settings.COOKIE_DOMAIN,
            secure=is_secure,
            httponly=False,
            samesite=samesite,
        )
    return {"csrf_token": csrf_token}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(require_auth)):
    return UserResponse.model_validate(current_user)


@router.patch("/profile", response_model=UserResponse)
def update_profile(
    req: ProfileUpdateRequest,
    current_user: User = Depends(require_auth),
    db: Session = Depends(get_db),
):
    if req.full_name is not None and req.full_name.strip():
        current_user.full_name = req.full_name.strip()
    if req.phone is not None:
        current_user.phone = req.phone.strip()
    db.commit()
    db.refresh(current_user)
    return UserResponse.model_validate(current_user)


@router.post("/request-password-reset")
def request_password_reset(req: PasswordResetRequest, db: Session = Depends(get_db)):
    email = str(req.email).strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email, User.is_active.is_(True)).first()
    if not user:
        # Don't leak user existence; return standard message
        return {
            "message": "If an active account with that email exists, password reset instructions have been generated.",
            "reset_token": None,
        }

    token = generate_password_reset_token(user.email)
    log_audit_event(
        db=db,
        action="PASSWORD_RESET_REQUESTED",
        resource_type="user",
        resource_id=user.id,
        user_id=user.id,
        user_email=user.email,
        user_role=user.role,
    )
    return {
        "message": "If an active account with that email exists, password reset instructions have been generated.",
        "reset_token": token if settings.APP_ENV == "test" else None,
    }


@router.post("/reset-password")
def reset_password(req: PasswordResetConfirm, db: Session = Depends(get_db)):
    email = verify_password_reset_token(req.token)
    user = db.query(User).filter(func.lower(User.email) == email.lower(), User.is_active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User account not found or inactive")

    user.hashed_password = hash_password(req.new_password)
    db.commit()

    log_audit_event(
        db=db,
        action="PASSWORD_RESET_COMPLETED",
        resource_type="user",
        resource_id=user.id,
        user_id=user.id,
        user_email=user.email,
        user_role=user.role,
    )
    return {"message": "Password has been successfully updated. You may now log in."}

