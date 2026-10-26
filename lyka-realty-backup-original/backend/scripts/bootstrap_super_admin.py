"""
LYKA Realty AI — Super Admin Bootstrapping Utility
Safely promotes an existing admin account or provisions the first super_admin.
Preserves all existing accounts, passwords, and inventory.
"""
import sys
import os
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(backend_dir))

from sqlalchemy import func
from app.database import SessionLocal, engine
from app.models.user import User
from app.models.audit_log import AuditLog
from app.services.auth_service import hash_password
from app.services.security_service import log_audit_event


def bootstrap_super_admin(email: str, password: str = None, full_name: str = None, phone: str = None) -> User:
    email = email.strip().lower()
    with SessionLocal() as db:
        user = db.query(User).filter(func.lower(User.email) == email).first()
        if user:
            print(f"Existing account found: {user.email} (current role: {user.role}, active: {user.is_active})")
            if user.role == "super_admin" and user.is_active:
                print("This account is already an active super_admin.")
                return user
            user.role = "super_admin"
            user.is_active = True
            if password:
                user.hashed_password = hash_password(password)
            db.commit()
            db.refresh(user)
            log_audit_event(
                db=db,
                action="SUPER_ADMIN_BOOTSTRAP_PROMOTED",
                resource_type="user",
                resource_id=user.id,
                user_id=user.id,
                user_email=user.email,
                user_role=user.role,
                details=f"Account promoted to super_admin via bootstrap script",
            )
            print(f"Successfully promoted {user.email} to super_admin.")
            return user
        else:
            if not password or len(password) < 8:
                raise ValueError("A password with at least 8 characters is required for a new super_admin account.")
            new_user = User(
                email=email,
                hashed_password=hash_password(password),
                full_name=full_name or "Platform Super Administrator",
                phone=phone,
                role="super_admin",
                is_active=True,
            )
            db.add(new_user)
            db.commit()
            db.refresh(new_user)
            log_audit_event(
                db=db,
                action="SUPER_ADMIN_BOOTSTRAP_CREATED",
                resource_type="user",
                resource_id=new_user.id,
                user_id=new_user.id,
                user_email=new_user.email,
                user_role=new_user.role,
                details="New super_admin account provisioned via bootstrap script",
            )
            print(f"Successfully created new super_admin account {new_user.email}.")
            return new_user


if __name__ == "__main__":
    print("=== LYKA Realty AI Super-Admin Bootstrapping ===")
    if len(sys.argv) > 1:
        target_email = sys.argv[1]
        target_password = sys.argv[2] if len(sys.argv) > 2 else None
        bootstrap_super_admin(target_email, target_password)
    else:
        email = input("Super admin email (e.g. admin@lykarealty.ae or superadmin@lykarealty.ae): ").strip()
        pwd = input("New password (leave blank to keep existing password if promoting): ").strip() or None
        bootstrap_super_admin(email, pwd)
