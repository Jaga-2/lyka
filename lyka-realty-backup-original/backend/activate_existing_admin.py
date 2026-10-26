from pathlib import Path

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import SessionLocal, engine
from app.config import BACKEND_DIR
from app.models.user import User


def activate_existing_admin(db: Session, email: str, confirmation: str) -> User:
    normalized_email = email.strip().lower()
    if confirmation != f"ACTIVATE {normalized_email}":
        raise ValueError("Activation was not confirmed.")

    active_admin = db.query(User).filter(User.role == "admin", User.is_active.is_(True)).first()
    if active_admin is not None:
        raise ValueError("An active administrator exists; use the normal admin account-management page.")

    user = db.query(User).filter(func.lower(User.email) == normalized_email).first()
    if user is None or user.role != "admin":
        raise ValueError("No existing administrator account matches that email.")
    if user.is_active:
        raise ValueError("That administrator account is already active.")

    user.is_active = True
    db.commit()
    return user


def main() -> None:
    expected_database = (Path(BACKEND_DIR) / "lyka_realty.db").resolve()
    configured_database = Path(engine.url.database).resolve() if engine.url.database else None
    if engine.dialect.name != "sqlite" or configured_database != expected_database:
        raise SystemExit(
            "Recovery is restricted to backend\\lyka_realty.db; no changes were made."
        )

    print("This recovery utility activates only an existing inactive administrator.")
    print("It does not create accounts, change roles, reset passwords, or issue a recovery secret.")
    email = input("Existing administrator email: ").strip().lower()

    with SessionLocal() as db:
        if db.query(User).filter(User.role == "admin", User.is_active.is_(True)).first():
            raise SystemExit("An active administrator exists; use the normal admin account-management page.")
        user = db.query(User).filter(func.lower(User.email) == email).first()
        if user is None or user.role != "admin" or user.is_active:
            raise SystemExit("No matching inactive administrator account was found.")
        print(f"Verified existing account: {user.email} (role=admin, status=inactive).")
        confirmation = input(
            f"Type ACTIVATE {user.email} to enable only this account's active flag: "
        ).strip()
        try:
            user = activate_existing_admin(db, email, confirmation)
        except ValueError as error:
            raise SystemExit(str(error)) from error
        print(f"Existing administrator account {user.email} is now active.")


if __name__ == "__main__":
    main()
