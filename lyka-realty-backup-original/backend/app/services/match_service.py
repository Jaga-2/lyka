from typing import Dict, Any, List, Optional, Tuple
from ..models.property import Property

def calculate_explainable_match(property_item: Property, requirements: Dict[str, Any]) -> Tuple[Optional[int], List[str]]:
    has_requirements = any(
        value is not None and value != ""
        for key, value in requirements.items()
        if key != "buy_or_rent"
    )
    if not has_requirements:
        return None, []

    score = 70
    reasons = []

    # 1. Location matching
    req_location = requirements.get("location") or requirements.get("area")
    if req_location:
        req_loc_lower = str(req_location).lower()
        prop_loc_lower = (property_item.location + " " + property_item.address).lower()
        if req_loc_lower in prop_loc_lower:
            score += 10
            reasons.append(f"Located in requested community: {property_item.location}")
        else:
            score -= 10

    # 2. Bedrooms matching
    req_beds = requirements.get("bedrooms")
    if req_beds is not None:
        try:
            req_beds_int = int(req_beds)
            if property_item.beds == req_beds_int:
                score += 8
                bed_str = f"{property_item.beds} BHK" if property_item.beds > 0 else "Studio"
                reasons.append(f"Exact match on layout: {bed_str}")
            elif abs(property_item.beds - req_beds_int) == 1:
                score += 3
            else:
                score -= 8
        except Exception:
            pass

    # 3. Budget matching
    req_budget = requirements.get("budget")
    if req_budget is not None:
        try:
            budget_val = float(req_budget)
            is_rental = requirements.get("buy_or_rent") == "rent"
            effective_price = property_item.rent_price if is_rental else property_item.sale_price

            if effective_price is None:
                pass
            elif effective_price <= budget_val:
                score += 8
                diff = budget_val - effective_price
                if diff > 0:
                    reasons.append(f"Comfortably within budget (AED {effective_price:,.0f} vs AED {budget_val:,.0f})")
                else:
                    reasons.append(f"Direct match with AED {budget_val:,.0f} budget")
            elif effective_price <= budget_val * 1.10:
                score += 2
                reasons.append(f"Close to budget target (within 10% range)")
            else:
                score -= 10
        except Exception:
            pass

    # 4. Property type matching
    req_type = requirements.get("property_type")
    if req_type and str(req_type).lower() in property_item.property_type.lower():
        score += 3
        reasons.append(f"Matches preferred type: {property_item.property_type}")

    # 5. Furnishing matching
    req_furnished = requirements.get("furnished")
    if req_furnished is not None:
        is_req_furn = bool(req_furnished)
        is_prop_furn = property_item.furnishing.lower() == "furnished"
        if is_req_furn == is_prop_furn:
            score += 3
            reasons.append(f"Matches {property_item.furnishing} preference")

    # Bound match percentage between 75% and 98%
    final_score = min(max(score, 75), 98)

    return final_score, reasons
