import argparse
import csv
import json
import os
import sys
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Optional, Tuple

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker

from app.config import get_database_url, settings
from app.database import Base, engine as default_engine, SessionLocal as DefaultSessionLocal
from app.models.property import Property


def clean_float(value: Optional[str], default: Optional[float] = 0.0) -> Optional[float]:
    if value is None or not value.strip():
        return default
    try:
        return float(value.replace(",", "").strip())
    except ValueError:
        return default


def clean_int(value: Optional[str], default: int = 0) -> int:
    number = clean_float(value)
    return int(number) if number is not None else default


def generate_title(address: str, property_type: str, bedrooms: int) -> str:
    layout = f"{bedrooms} BHK" if bedrooms > 0 else "Studio"
    return f"{address.split(',')[0].strip()} - {layout} {property_type}"


def property_key(prop: Property) -> Tuple[str, int, int, float, str, str]:
    return (
        (prop.address or "").strip().casefold(),
        prop.beds or 0,
        prop.baths or 0,
        round(prop.rent_price or 0.0, 2),
        (prop.location or "").strip().casefold(),
        (prop.city or "").strip().casefold(),
    )


def normalize_db_url(raw_url: str) -> str:
    url = raw_url.strip()
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg://", 1)
    elif url.startswith("postgresql://") and not url.startswith("postgresql+"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)

    # Auto-resolve Render internal hostname if running outside Render VPC
    if "@dpg-" in url:
        import re
        match = re.search(r"@([a-z0-9\-]+)([/:]|$)", url)
        if match:
            host = match.group(1)
            if "." not in host:
                url = url.replace(f"@{host}", f"@{host}.singapore-postgres.render.com", 1)
        if "sslmode=" not in url:
            sep = "&" if "?" in url else "?"
            url = f"{url}{sep}sslmode=require"

    return url


def get_target_engine_and_session(db_url: Optional[str] = None):
    if not db_url:
        return default_engine, DefaultSessionLocal

    url = normalize_db_url(db_url)
    connect_args = {}
    if url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}

    target_engine = create_engine(url, connect_args=connect_args, pool_pre_ping=True)
    TargetSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=target_engine, expire_on_commit=False)
    return target_engine, TargetSessionLocal


def import_properties(
    csv_path: Path,
    db_url: Optional[str] = None,
    batch_size: int = 2000,
    replace_existing: bool = False,
) -> int:
    if not csv_path.is_file():
        raise FileNotFoundError(f"Property CSV not found: {csv_path}")

    target_engine, TargetSessionLocal = get_target_engine_and_session(db_url)

    # Ensure tables exist in target database
    Base.metadata.create_all(bind=target_engine)
    backend_name = target_engine.url.get_backend_name()
    print(f"Connected to database backend: {backend_name} ({target_engine.url.host})")

    imported = 0
    updated = 0
    inserted = 0
    skipped = 0
    start_time = time.time()

    with csv_path.open(mode="r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        required_columns = {"Address", "Rent", "Beds", "Baths", "Type", "Purpose"}
        missing_columns = required_columns.difference(reader.fieldnames or [])
        if missing_columns:
            raise ValueError(f"Property CSV is missing required columns: {', '.join(sorted(missing_columns))}")

        with TargetSessionLocal() as session:
            if replace_existing:
                print("Clearing existing properties as --replace was specified...")
                session.query(Property).delete()
                session.commit()
                print("Existing properties cleared.")

            existing_count = session.query(func.count(Property.id)).scalar() or 0
            existing_by_key = defaultdict(deque)

            if existing_count > 0:
                print(f"Loading {existing_count:,} existing properties to avoid duplicate inserts...")
                for prop in session.query(Property).order_by(Property.id).all():
                    existing_by_key[property_key(prop)].append(prop)
                print(f"Loaded {len(existing_by_key):,} unique existing property keys.")
            else:
                print("Target table is currently empty. Direct insert mode enabled.")

            batch = []
            for row in reader:
                address = (row.get("Address") or "").strip()
                rent_price = clean_float(row.get("Rent"))
                purpose = (row.get("Purpose") or "").strip()
                if not address or rent_price is None or rent_price <= 0 or not purpose:
                    skipped += 1
                    continue

                property_type = (row.get("Type") or "").strip()
                bedrooms = clean_int(row.get("Beds"))
                area_sqft = clean_float(row.get("Area_in_sqft"))
                rent_per_sqft = clean_float(row.get("Rent_per_sqft"), default=None)
                location = (row.get("Location") or "").strip()
                city = (row.get("City") or "").strip()
                baths = clean_int(row.get("Baths"))

                property_data = {
                    "title": generate_title(address, property_type, bedrooms),
                    "address": address,
                    "location": location,
                    "city": city,
                    "rent_price": rent_price,
                    "sale_price": clean_float(row.get("Sale_price"), default=None),
                    "currency": "AED",
                    "beds": bedrooms,
                    "baths": baths,
                    "property_type": property_type,
                    "area_sqft": area_sqft or 0,
                    "rent_per_sqft": rent_per_sqft if rent_per_sqft and rent_per_sqft > 0 else None,
                    "rent_category": (row.get("Rent_category") or "").strip() or None,
                    "frequency": (row.get("Frequency") or "").strip() or None,
                    "furnishing": (row.get("Furnishing") or "").strip(),
                    "purpose": purpose,
                    "latitude": clean_float(row.get("Latitude"), default=None),
                    "longitude": clean_float(row.get("Longitude"), default=None),
                    "amenities": json.dumps([]),
                    "images": json.dumps([]),
                    "posted_date": (row.get("Posted_date") or "").strip() or None,
                    "age_days": clean_int(row.get("Age_of_listing_in_days"), default=0),
                    "investment_yield": None,
                    "is_active": True,
                }

                if existing_count > 0:
                    key = (
                        address.casefold(),
                        bedrooms,
                        baths,
                        round(rent_price, 2),
                        location.casefold(),
                        city.casefold(),
                    )
                    existing_list = existing_by_key.get(key)
                    if existing_list:
                        prop = existing_list.popleft()
                        for field, value in property_data.items():
                            setattr(prop, field, value)
                        updated += 1
                        imported += 1
                        continue

                batch.append(property_data)
                inserted += 1
                imported += 1

                if len(batch) >= batch_size:
                    session.bulk_insert_mappings(Property, batch)
                    session.commit()
                    batch.clear()
                    elapsed = time.time() - start_time
                    rate = imported / elapsed if elapsed > 0 else 0
                    print(f"  -> Processed {imported:,} rows ({inserted:,} inserted, {updated:,} updated, {rate:.0f} rows/s)...")

            if batch:
                session.bulk_insert_mappings(Property, batch)
                session.commit()
                batch.clear()

            if imported == 0:
                raise ValueError(f"No valid property rows were found in {csv_path}.")

    elapsed = time.time() - start_time
    print(
        f"\nSuccessfully synced {imported:,} property listings from {csv_path} in {elapsed:.1f}s "
        f"({updated:,} updated in place, {inserted:,} added, {skipped:,} skipped)."
    )
    return imported


def main() -> None:
    parser = argparse.ArgumentParser(description="Import source property listings into the configured database.")
    parser.add_argument(
        "--csv",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "dubai_properties.csv",
        help="Path to the source property CSV.",
    )
    parser.add_argument(
        "--db-url",
        type=str,
        default=None,
        help="Target database URL (overrides DATABASE_URL from .env or environment).",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=2000,
        help="Batch size for database commits (default: 2000).",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Clear existing properties before importing a fresh copy.",
    )
    args = parser.parse_args()
    import_properties(
        csv_path=args.csv,
        db_url=args.db_url,
        batch_size=args.batch_size,
        replace_existing=args.replace,
    )


if __name__ == "__main__":
    main()
