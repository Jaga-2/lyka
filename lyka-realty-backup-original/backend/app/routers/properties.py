import json
import re
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import Optional, List

from ..database import get_db
from ..models.property import Property
from ..schemas.property import (
    PropertyResponse,
    PropertySearchRequest,
    PropertySearchResponse,
    PropertyCompareRequest,
    PropertyCompareResponse,
)
from ..services.match_service import calculate_explainable_match

router = APIRouter(prefix="/properties", tags=["Properties"])

DEFAULT_PROPERTY_IMAGES = {
    "Apartment": [
        "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
    ],
    "Villa": [
        "https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80",
    ],
    "Townhouse": [
        "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80",
    ],
    "Penthouse": [
        "https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1502005229762-ee1b2b8ba32f?auto=format&fit=crop&w=1200&q=80",
    ],
}


def to_response_dto(prop: Property, reqs: dict = None) -> PropertyResponse:
    amenities_list = []
    if prop.amenities:
        try:
            amenities_list = json.loads(prop.amenities)
        except Exception:
            amenities_list = [a.strip() for a in prop.amenities.split(",") if a.strip()]

    images_list = []
    if prop.images:
        try:
            images_list = json.loads(prop.images)
        except Exception:
            images_list = [prop.images]

    if not images_list:
        pool = DEFAULT_PROPERTY_IMAGES.get(prop.property_type or "Apartment", DEFAULT_PROPERTY_IMAGES["Apartment"])
        selected_img = pool[(prop.id or 0) % len(pool)]
        images_list = [selected_img]

    score, reasons = calculate_explainable_match(prop, reqs or {})

    return PropertyResponse(
        id=prop.id,
        title=prop.title,
        address=prop.address,
        location=prop.location,
        city=prop.city,
        rent_price=prop.rent_price,
        sale_price=prop.sale_price if prop.sale_price and prop.sale_price > 0 else None,
        currency=prop.currency,
        beds=prop.beds,
        baths=prop.baths,
        property_type=prop.property_type,
        area_sqft=prop.area_sqft,
        rent_per_sqft=prop.rent_per_sqft,
        furnishing=prop.furnishing,
        purpose=prop.purpose,
        latitude=prop.latitude,
        longitude=prop.longitude,
        amenities=amenities_list,
        images=images_list,
        match_score=score,
        match_reasons=reasons,
        investment_yield=prop.investment_yield,
        is_active=prop.is_active,
    )

@router.post("/search", response_model=PropertySearchResponse)
def search_properties(body: PropertySearchRequest, db: Session = Depends(get_db)):
    query = db.query(Property).filter(Property.is_active.is_(True))

    if body.query:
        raw_q = body.query.strip()
        q = f"%{raw_q}%"
        query_conditions = [
            Property.title.ilike(q),
            Property.address.ilike(q),
            Property.location.ilike(q),
            Property.city.ilike(q),
        ]
        bed_match = re.search(r"\b(studio|[0-9]+)[\s-]*(?:bhk|bed(?:room)?s?)\b", raw_q, re.I)
        if bed_match:
            b_val = 0 if bed_match.group(1).lower() == "studio" else int(bed_match.group(1))
            query_conditions.append(Property.beds == b_val)
            query_conditions.append(Property.title.ilike(f"%{b_val} BHK%"))
        query = query.filter(or_(*query_conditions))

    if body.location:
        loc = body.location.strip()
        query = query.filter(
            or_(
                Property.location.ilike(f"%{loc}%"),
                Property.address.ilike(f"%{loc}%"),
                Property.city.ilike(f"%{loc}%"),
            )
        )

    if body.city:
        query = query.filter(Property.city.ilike(f"%{body.city.strip()}%"))

    if body.beds is not None:
        if body.beds >= 4:
            query = query.filter(Property.beds >= 4)
        else:
            query = query.filter(Property.beds == body.beds)

    if body.baths is not None:
        query = query.filter(Property.baths >= body.baths)

    if body.property_type:
        query = query.filter(Property.property_type.ilike(f"%{body.property_type.strip()}%"))

    if body.furnishing:
        f = body.furnishing.strip()
        if f.lower() in ("furnished", "unfurnished"):
            query = query.filter(func.lower(Property.furnishing) == f.lower())
        else:
            query = query.filter(Property.furnishing.ilike(f"%{f}%"))

    # Purpose and Price handling:
    purpose_str = (body.purpose or "").strip().lower()
    has_sale_in_db = db.query(Property.id).filter(Property.is_active.is_(True), Property.purpose.ilike("%Sale%")).first() is not None

    if "rent" in purpose_str:
        query = query.filter(Property.purpose.ilike("%For Rent%"))
        is_rent = True
    elif "sale" in purpose_str or "buy" in purpose_str:
        if has_sale_in_db:
            query = query.filter(Property.purpose.ilike("%For Sale%"))
            is_rent = False
        else:
            # Fall back to rental inventory if database has rental-only data
            is_rent = True
    else:
        is_rent = True

    price_col = Property.rent_price if is_rent else Property.sale_price

    if body.min_price is not None:
        query = query.filter(price_col >= body.min_price)

    if body.max_price is not None:
        query = query.filter(price_col <= body.max_price)

    # Sort
    if body.sort_by == "price_desc":
        query = query.order_by(price_col.desc())
    elif body.sort_by == "beds":
        query = query.order_by(Property.beds.desc())
    elif body.sort_by == "area":
        query = query.order_by(Property.area_sqft.desc())
    else:
        query = query.order_by(price_col.asc())

    total = query.count()
    items = query.offset(body.offset or 0).limit(body.limit or 30).all()

    reqs_ctx = {
        "location": body.location,
        "bedrooms": body.beds,
        "budget": body.max_price,
        "property_type": body.property_type,
        "buy_or_rent": "rent" if is_rent else "buy",
    }

    dtos = [to_response_dto(p, reqs_ctx) for p in items]
    return PropertySearchResponse(
        properties=dtos,
        total=total,
        page=(body.offset or 0) // (body.limit or 30) + 1,
        limit=body.limit or 30,
    )

@router.get("/featured", response_model=List[PropertyResponse])
def get_featured(db: Session = Depends(get_db)):
    props = db.query(Property).filter(
        Property.is_active.is_(True),
        Property.location.ilike("%Dubai Marina%")
    ).limit(6).all()
    if not props:
        props = db.query(Property).filter(Property.is_active.is_(True)).limit(6).all()
    return [to_response_dto(p) for p in props]

@router.get("/filter-options")
def get_filter_options(db: Session = Depends(get_db)):
    locations = [
        location
        for (location,) in db.query(Property.location).filter(Property.is_active.is_(True))
        .filter(Property.location.isnot(None), Property.location != "")
        .distinct()
        .order_by(Property.location)
        .all()
    ]
    types = [
        property_type
        for (property_type,) in db.query(Property.property_type).filter(Property.is_active.is_(True))
        .filter(Property.property_type.isnot(None), Property.property_type != "")
        .distinct()
        .order_by(Property.property_type)
        .all()
    ]
    cities = [
        city
        for (city,) in db.query(Property.city).filter(Property.is_active.is_(True))
        .filter(Property.city.isnot(None), Property.city != "")
        .distinct()
        .order_by(Property.city)
        .all()
    ]
    max_price = db.query(func.max(Property.rent_price)).filter(Property.is_active.is_(True)).scalar() or 0
    return {
        "locations": locations,
        "property_types": types,
        "cities": cities,
        "max_price": max_price,
    }

@router.get("/{id}", response_model=PropertyResponse)
def get_property(id: int, requirements: Optional[str] = None, db: Session = Depends(get_db)):
    prop = db.query(Property).filter(Property.id == id, Property.is_active.is_(True)).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    reqs = {}
    if requirements:
        try:
            reqs = json.loads(requirements)
        except Exception:
            pass

    return to_response_dto(prop, reqs)

@router.post("/compare", response_model=PropertyCompareResponse)
def compare_properties(body: PropertyCompareRequest, db: Session = Depends(get_db)):
    if not body.property_ids:
        raise HTTPException(status_code=400, detail="No properties selected for comparison")

    props = db.query(Property).filter(Property.id.in_(body.property_ids), Property.is_active.is_(True)).all()
    if not props:
        raise HTTPException(status_code=404, detail="Selected properties not found")

    dtos = [to_response_dto(p) for p in props]

    def listed_price(prop: Property) -> Optional[float]:
        price = prop.rent_price if prop.purpose == "For Rent" else prop.sale_price
        return price if price is not None and price > 0 else None

    properties_with_prices = [prop for prop in props if listed_price(prop) is not None]
    cheapest = min(properties_with_prices, key=listed_price) if properties_with_prices else None

    sorted_by_area = sorted(props, key=lambda x: x.area_sqft, reverse=True)
    largest = sorted_by_area[0]

    price_label = "annual rent" if all(prop.purpose == "For Rent" for prop in props) else "listed price"
    summary_lines = [f"Comparing {len(props)} selected UAE listings:"]
    if cheapest:
        summary_lines.append(
            f"• Lowest {price_label}: {cheapest.title} at AED {listed_price(cheapest):,.0f}."
        )
    else:
        summary_lines.append("• No listed price is available for these properties.")
    summary_lines.append(
        f"• Largest area: {largest.title} at {largest.area_sqft:,.0f} sqft across {largest.beds} bedrooms."
    )
    summary = "\n".join(summary_lines)

    recommendation = (
        f"{cheapest.title} has the lowest listed {price_label}. "
        f"{largest.title} has the largest listed area ({largest.area_sqft:,.0f} sqft)."
        if cheapest
        else f"{largest.title} has the largest listed area ({largest.area_sqft:,.0f} sqft)."
    )

    pros_cons = {}
    for p in props:
        pros = [f"Listed location: {p.location}", f"Purpose: {p.purpose}"]
        if listed_price(p) > 0:
            price_period = " per year" if p.purpose == "For Rent" else ""
            pros.append(f"Listed price: AED {listed_price(p):,.0f}{price_period}")
        if p.furnishing:
            pros.append(f"Furnishing: {p.furnishing}")
        cons = []
        if p.beds < 2:
            cons.append("Single bedroom or studio configuration")

        pros_cons[p.id] = {"pros": pros, "cons": cons}

    return PropertyCompareResponse(
        properties=dtos,
        comparison_summary=summary,
        recommendation=recommendation,
        pros_cons=pros_cons,
    )
