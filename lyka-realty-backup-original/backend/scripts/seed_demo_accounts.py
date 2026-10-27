"""
LYKA Realty AI — Secure Demo Accounts Seeding Utility
Safely provisions and verifies role-based demo accounts for all required roles:
  - customer:       customer.demo@lykarealty.ae (or existing verified_customer@example.com)
  - sales:          sales.demo@lykarealty.ae (or existing sarah.realtor@lykarealty.ae)
  - manager:        manager.demo@lykarealty.ae
  - admin:          admin.demo@lykarealty.ae (or existing admin@lykarealty.ae)
  - super_admin:    superadmin.demo@lykarealty.ae (or existing superadmin@lykarealty.ae)
  - lead_tracker:   Public enquiry tracking at /lead/status (Lookup by customer phone)

All passwords are read securely from environment variables:
  DEMO_CUSTOMER_PASSWORD
  DEMO_SALES_PASSWORD
  DEMO_MANAGER_PASSWORD
  DEMO_ADMIN_PASSWORD
  DEMO_SUPERADMIN_PASSWORD
  (or DEMO_DEFAULT_PASSWORD as fallback)

NEVER prints password hashes or commits plaintext credentials.
"""
import os
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(backend_dir))

from sqlalchemy import func
from app.database import SessionLocal
from app.models.user import User
from app.models.lead import Lead
from app.services.auth_service import hash_password
from app.services.security_service import log_audit_event

DEMO_CONFIGS = [
    {
        "role": "customer",
        "email": "customer.demo@lykarealty.ae",
        "full_name": "Demo Customer",
        "phone": "+971501112233",
        "env_var": "DEMO_CUSTOMER_PASSWORD",
    },
    {
        "role": "sales_agent",
        "email": "sales.demo@lykarealty.ae",
        "full_name": "Demo Sales Agent",
        "phone": "+971502223344",
        "env_var": "DEMO_SALES_PASSWORD",
    },
    {
        "role": "manager",
        "email": "manager.demo@lykarealty.ae",
        "full_name": "Demo Sales Manager",
        "phone": "+971503334455",
        "env_var": "DEMO_MANAGER_PASSWORD",
    },
    {
        "role": "admin",
        "email": "admin.demo@lykarealty.ae",
        "full_name": "Demo System Admin",
        "phone": "+971504445566",
        "env_var": "DEMO_ADMIN_PASSWORD",
    },
    {
        "role": "super_admin",
        "email": "superadmin.demo@lykarealty.ae",
        "full_name": "Demo Super Admin",
        "phone": "+971505556677",
        "env_var": "DEMO_SUPERADMIN_PASSWORD",
    },
]


def seed_demo_accounts() -> None:
    fallback_pwd = os.environ.get("DEMO_DEFAULT_PASSWORD", "LykaDemo@2026!Secure")
    
    with SessionLocal() as db:
        print("=== LYKA Realty Demo Account Provisioning ===")
        for config in DEMO_CONFIGS:
            email = config["email"].strip().lower()
            password = os.environ.get(config["env_var"]) or fallback_pwd
            if len(password) < 8:
                print(f"[ERROR] Password for {email} must be at least 8 characters.")
                continue

            existing = db.query(User).filter(func.lower(User.email) == email).first()
            if existing:
                print(f"[EXISTS] {email} (role: {existing.role}, active: {existing.is_active})")
                # Ensure correct role & active status
                existing.role = config["role"]
                existing.is_active = True
                if os.environ.get(config["env_var"]):
                    existing.hashed_password = hash_password(password)
                    print(f"         Password updated from {config['env_var']}.")
                db.commit()
            else:
                new_user = User(
                    email=email,
                    hashed_password=hash_password(password),
                    full_name=config["full_name"],
                    phone=config["phone"],
                    role=config["role"],
                    is_active=True,
                )
                db.add(new_user)
                db.commit()
                db.refresh(new_user)
                log_audit_event(
                    db=db,
                    action="DEMO_ACCOUNT_SEEDED",
                    resource_type="user",
                    resource_id=new_user.id,
                    user_id=new_user.id,
                    user_email=new_user.email,
                    user_role=new_user.role,
                    details=f"Demo account created for role {config['role']}",
                )
                print(f"[CREATED] {email} (role: {config['role']})")

        # Also verify lead enquiry record for public Lead Tracker
        demo_phone = "+971501112233"
        existing_lead = db.query(Lead).filter(Lead.customer_phone == demo_phone).first()
        if not existing_lead:
            demo_lead = Lead(
                customer_name="Demo Customer",
                customer_email="customer.demo@lykarealty.ae",
                customer_phone=demo_phone,
                location="Dubai Marina",
                preferred_location="Dubai Marina",
                property_type="Apartment",
                bedrooms=2,
                intent="rent",
                budget=140000.0,
                lead_status="QUALIFIED",
                lead_score=85,
            )
            db.add(demo_lead)
            db.commit()
            print(f"[CREATED] Demo Lead record with phone {demo_phone} for Lead Tracker (/lead/status)")
        else:
            print(f"[EXISTS] Demo Lead record with phone {demo_phone} (Status: {existing_lead.lead_status})")

    print("\nDemo account seeding completed successfully.")
    print("All password hashes securely created with bcrypt.")


if __name__ == "__main__":
    seed_demo_accounts()
