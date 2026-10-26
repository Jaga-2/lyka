import argparse
import csv
import json
import sys
from collections import defaultdict, deque
from pathlib import Path
from typing import Optional, Tuple

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.database import Base, SessionLocal, engine
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
        prop.address.strip().casefold(),
        prop.beds,
        prop.baths,
        round(prop.rent_price, 2),
        prop.location.strip().casefold(),
        prop.city.strip().casefold(),
    )


def import_properties(csv_path: Path) -> int:
    if not csv_path.is_file():
        raise FileNotFoundError(f"Property CSV not found: {csv_path}")

    Base.metadata.create_all(bind=engine)
    imported = 0
    updated = 0
    inserted = 0

    with csv_path.open(mode="r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        required_columns = {"Address", "Rent", "Beds", "Baths", "Type", "Purpose"}
        missing_columns = required_columns.difference(reader.fieldnames or [])
        if missing_columns:
            raise ValueError(f"Property CSV is missing required columns: {', '.join(sorted(missing_columns))}")

        with SessionLocal() as session, session.begin():
            existing_by_key = defaultdict(deque)
            for prop in session.query(Property).order_by(Property.id).all():
                existing_by_key[property_key(prop)].append(prop)

            batch = []
            for row in reader:
                address = (row.get("Address") or "").strip()
                rent_price = clean_float(row.get("Rent"))
                purpose = (row.get("Purpose") or "").strip()
                if not address or rent_price is None or rent_price <= 0 or not purpose:
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
                }
                key = (
                    address.casefold(),
                    bedrooms,
                    baths,
                    round(rent_price, 2),
                    location.casefold(),
                    city.casefold(),
                )
                existing = existing_by_key[key]
                if existing:
                    prop = existing.popleft()
                    for field, value in property_data.items():
                        setattr(prop, field, value)
                    updated += 1
                else:
                    batch.append(Property(**property_data))
                    inserted += 1
                imported += 1

                if len(batch) >= 1000:
                    session.bulk_save_objects(batch)
                    session.flush()
                    batch.clear()

            if batch:
                session.bulk_save_objects(batch)

            if imported == 0:
                raise ValueError(f"No valid property rows were found in {csv_path}.")

    print(
        f"Synced {imported:,} source property listings from {csv_path} "
        f"({updated:,} updated in place, {inserted:,} added)."
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
    args = parser.parse_args()
    import_properties(args.csv)


if __name__ == "__main__":
    main()
