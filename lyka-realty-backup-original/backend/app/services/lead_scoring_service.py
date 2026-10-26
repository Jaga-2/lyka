from typing import Any, Dict, List, Tuple


def calculate_explainable_lead_score(
    requirements: Dict[str, Any],
    has_site_visit: bool = False,
    phone_present: bool = False,
    interested_property: bool = False,
    agent_request: bool = False,
) -> Tuple[int, str, List[str]]:
    factors: List[str] = []
    score = 0

    if requirements.get("purpose") or requirements.get("buy_or_rent"):
        score += 20
        factors.append("20: buying or renting intent provided")
    if requirements.get("budget_target") is not None or requirements.get("budget_min") is not None or requirements.get("budget_max") is not None:
        score += 20
        factors.append("20: budget provided")
    if requirements.get("location"):
        score += 15
        factors.append("15: preferred location provided")
    if requirements.get("bedrooms") is not None or requirements.get("property_type"):
        score += 15
        factors.append("15: bedroom or property-type requirement provided")
    if interested_property:
        score += 15
        factors.append("15: specific property interest recorded")
    if has_site_visit or agent_request:
        score += 15
        factors.append("15: site visit or agent request")
    if phone_present:
        factors.append("Contact phone is available")

    category = "Cold" if score < 30 else "Warm" if score < 60 else "Hot" if score < 80 else "Highly Qualified"
    factors.append(f"Score classification: {category}")
    return score, category, factors
