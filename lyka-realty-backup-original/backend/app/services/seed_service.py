"""
LYKA Realty AI — Database Seeding Service
Automatically provisions safe demo personas and rental inventory
on fresh database initialization, while preserving all existing production accounts.
"""
import os
import csv
import json
import logging
from pathlib import Path
from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import SessionLocal, engine, Base
from ..models.user import User
from ..models.lead import Lead
from ..models.property import Property
from .auth_service import hash_password
from .security_service import log_audit_event

logger = logging.getLogger("lyka.seed_service")

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


def seed_demo_accounts(db: Optional[Session] = None) -> None:
    fallback_pwd = os.environ.get("DEMO_DEFAULT_PASSWORD", "LykaDemo@2026!Secure")
    
    def _do_seed(session: Session):
        for config in DEMO_CONFIGS:
            email = config["email"].strip().lower()
            password = os.environ.get(config["env_var"]) or fallback_pwd
            if len(password) < 8:
                continue

            existing = session.query(User).filter(func.lower(User.email) == email).first()
            if existing:
                # Ensure correct role & active status if already present
                existing.role = config["role"]
                existing.is_active = True
                if os.environ.get(config["env_var"]):
                    existing.hashed_password = hash_password(password)
                session.commit()
            else:
                new_user = User(
                    email=email,
                    hashed_password=hash_password(password),
                    full_name=config["full_name"],
                    phone=config["phone"],
                    role=config["role"],
                    is_active=True,
                )
                session.add(new_user)
                session.commit()
                session.refresh(new_user)
                log_audit_event(
                    db=session,
                    action="DEMO_ACCOUNT_SEEDED",
                    resource_type="user",
                    resource_id=new_user.id,
                    user_id=new_user.id,
                    user_email=new_user.email,
                    user_role=new_user.role,
                    details=f"Demo account created for role {config['role']}",
                )

        demo_phone = "+971501112233"
        existing_lead = session.query(Lead).filter(Lead.customer_phone == demo_phone).first()
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
            session.add(demo_lead)
            session.commit()

    if db is not None:
        _do_seed(db)
    else:
        with SessionLocal() as session:
            _do_seed(session)


def clean_float(value: Optional[str], default: Optional[float] = 0.0) -> Optional[float]:
    if value is None or not str(value).strip():
        return default
    try:
        return float(str(value).replace(",", "").strip())
    except ValueError:
        return default


def clean_int(value: Optional[str], default: int = 0) -> int:
    num = clean_float(value)
    return int(num) if num is not None else default


def generate_title(address: str, property_type: str, bedrooms: int) -> str:
    layout = f"{bedrooms} BHK" if bedrooms > 0 else "Studio"
    return f"{address.split(',')[0].strip()} - {layout} {property_type}"


def seed_properties_if_empty(db: Optional[Session] = None, max_rows: int = 5000) -> int:
    """Import rental properties from dubai_properties.csv if the properties table is empty."""
    def _do_import(session: Session) -> int:
        count = session.query(Property).count()
        if count > 0:
            return count

        csv_candidates = [
            Path(__file__).resolve().parents[2] / "dubai_properties.csv",
            Path(__file__).resolve().parents[3] / "dubai_properties.csv",
            Path.cwd() / "dubai_properties.csv",
            Path.cwd().parent / "dubai_properties.csv",
        ]
        csv_file = next((p for p in csv_candidates if p.is_file()), None)
        if not csv_file:
            logger.info("No dubai_properties.csv found to seed.")
            return 0

        logger.info(f"Seeding properties from {csv_file.name} (limit: {max_rows})...")
        batch = []
        imported = 0
        with csv_file.open(mode="r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                address = (row.get("Address") or "").strip()
                rent_price = clean_float(row.get("Rent"))
                purpose = (row.get("Purpose") or "").strip()
                if not address or rent_price is None or rent_price <= 0 or not purpose:
                    continue

                bedrooms = clean_int(row.get("Beds"))
                property_type = (row.get("Type") or "").strip()
                prop = Property(
                    title=generate_title(address, property_type, bedrooms),
                    address=address,
                    location=(row.get("Location") or "").strip(),
                    city=(row.get("City") or "").strip(),
                    rent_price=rent_price,
                    sale_price=clean_float(row.get("Sale_price"), default=None),
                    currency="AED",
                    beds=bedrooms,
                    baths=clean_int(row.get("Baths")),
                    property_type=property_type,
                    area_sqft=clean_float(row.get("Area_in_sqft")) or 0.0,
                    rent_per_sqft=clean_float(row.get("Rent_per_sqft"), default=None),
                    rent_category=(row.get("Rent_category") or "").strip() or None,
                    frequency=(row.get("Frequency") or "").strip() or None,
                    furnishing=(row.get("Furnishing") or "").strip(),
                    purpose=purpose,
                    latitude=clean_float(row.get("Latitude"), default=None),
                    longitude=clean_float(row.get("Longitude"), default=None),
                    amenities=json.dumps([]),
                    images=json.dumps([]),
                    posted_date=(row.get("Posted_date") or "").strip() or None,
                    age_days=clean_int(row.get("Age_of_listing_in_days"), default=0),
                    is_active=True,
                )
                batch.append(prop)
                imported += 1
                if len(batch) >= 1000:
                    session.bulk_save_objects(batch)
                    session.commit()
                    batch.clear()
                if max_rows and imported >= max_rows:
                    break

            if batch:
                session.bulk_save_objects(batch)
                session.commit()

        logger.info(f"Successfully seeded {imported} properties.")
        return imported

    if db is not None:
        return _do_import(db)
    else:
        with SessionLocal() as session:
            return _do_import(session)
