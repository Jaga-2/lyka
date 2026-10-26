"""Interactively reset a password for an existing active account in SQLite."""

from getpass import getpass
from pathlib import Path

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import SessionLocal, engine
from app.config import BACKEND_DIR
from app.models.user import User
from app.services.auth_service import hash_password


def reset_active_account_password(db: Session, email: str, new_password: str) -> User:
    normalized_email = email.strip().lower()
    matching_users = (
        db.query(User)
        .filter(func.lower(User.email) == normalized_email)
        .limit(2)
        .all()
    )
    if len(matching_users) != 1:
        raise ValueError("No single account matches that email.")

    user = matching_users[0]
    if not user.is_active:
        raise ValueError("Only an existing active account can be reset.")
    password_bytes = new_password.encode("utf-8")
    if not 8 <= len(password_bytes) <= 72:
        raise ValueError("Password must be 8 to 72 bytes when encoded as UTF-8.")

    user.hashed_password = hash_password(new_password)
    db.commit()
    db.refresh(user)
    return user


def mask_email(email: str) -> str:
    local, separator, domain = email.partition("@")
    if not separator:
        return "***"
    return f"{local[:1]}***@{domain}"


def main() -> None:
    expected_database = (Path(BACKEND_DIR) / "lyka_realty.db").resolve()
    configured_database = Path(engine.url.database).resolve() if engine.url.database else None
    if engine.dialect.name != "sqlite" or configured_database != expected_database:
        raise SystemExit(
            "Password recovery is restricted to backend\\lyka_realty.db; no changes were made."
        )

    print("LYKA active-account password reset (project SQLite only)", flush=True)
    try:
        email = input("Enter the existing active account's email: ").strip().lower()
    except EOFError:
        raise SystemExit(
            "No terminal input was available. Run this command directly in the VS Code terminal."
        ) from None
    if not email:
        raise SystemExit("Email is required; no changes were made.")

    with SessionLocal() as db:
        matching_users = (
            db.query(User)
            .filter(func.lower(User.email) == email.lower())
            .limit(2)
            .all()
        )
        if len(matching_users) != 1:
            raise SystemExit("No single account matches that email; no changes were made.")

        user = matching_users[0]
        if not user.is_active:
            raise SystemExit(
                "That account is inactive; no changes were made."
            )
        print(
            f"Verified active account (role={user.role}, {mask_email(user.email)}).",
            flush=True,
        )

        try:
            confirmation_phrase = input(
                f"Type RESET {user.email} to confirm the password reset: "
            ).strip()
        except (EOFError, KeyboardInterrupt):
            raise SystemExit("Confirmation cancelled; no changes were made.") from None
        if confirmation_phrase != f"RESET {user.email}":
            raise SystemExit("Confirmation did not match; no changes were made.")

        try:
            password = getpass("Enter the new password (input hidden): ")
            password_confirmation = getpass("Confirm the new password (input hidden): ")
        except (EOFError, KeyboardInterrupt):
            raise SystemExit("Password entry cancelled; no changes were made.") from None
        if password != password_confirmation:
            raise SystemExit("Passwords did not match; no changes were made.")

        try:
            reset_active_account_password(db, user.email, password)
        except ValueError as error:
            raise SystemExit(f"{error} No changes were made.") from None
        print("Password reset successfully. The password was not displayed.")


if __name__ == "__main__":
    main()
