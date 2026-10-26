from getpass import getpass

from app.database import Base, SessionLocal, engine
from app.models.user import User
from app.services.auth_service import hash_password
from app.main import ensure_conversation_workflow_columns


def main() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_conversation_workflow_columns()

    with SessionLocal() as db:
        if db.query(User).filter(User.role == "admin", User.is_active.is_(True)).first():
            raise SystemExit("An active administrator already exists; use that account to manage users.")

        email = input("Initial administrator email: ").strip().lower()
        full_name = input("Administrator full name: ").strip()
        password = getpass("Administrator password (minimum 8 characters): ")
        confirmation = getpass("Confirm password: ")
        if len(password) < 8:
            raise SystemExit("Password must contain at least 8 characters.")
        if password != confirmation:
            raise SystemExit("Passwords do not match.")
        if not email or not full_name:
            raise SystemExit("Email and full name are required.")

        user = db.query(User).filter(User.email == email).first()
        if user is None:
            user = User(email=email, full_name=full_name)
            db.add(user)
        user.full_name = full_name
        user.hashed_password = hash_password(password)
        user.role = "admin"
        user.is_active = True
        db.commit()
        print(f"Initial administrator account is ready for {email}.")


if __name__ == "__main__":
    main()
