import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models.lead import Lead
from ..models.property import Property
from ..models.site_visit import HandoffRequest, SiteVisit
from ..models.conversation import Conversation, CustomerRequirement, Message, Shortlist
from ..models.user import User
from ..models.audit_log import AuditLog
from ..schemas.auth import EmployeeCreateRequest, UserResponse, UserRoleUpdateRequest
from ..schemas.crm import (
    LeadAssignEmployeeRequest,
    LeadResponse,
    LeadStatusUpdateRequest,
    LeadNoteCreateRequest,
    CRMAnalyticsResponse,
    LeadScoreOverrideRequest,
    AIFollowupDraftRequest,
    AIFollowupDraftResponse,
)
from ..schemas.property import PropertyAdminUpdateRequest, PropertyResponse, AdminPropertiesListResponse
from ..services.auth_service import hash_password, require_auth, require_role
from ..services.security_service import log_audit_event
from .properties import to_response_dto

router = APIRouter(tags=["CRM & Analytics"])


def _lead_response(lead: Lead, db: Session) -> LeadResponse:
    try:
        factors = json.loads(lead.score_factors) if lead.score_factors else []
    except json.JSONDecodeError:
        factors = [lead.score_factors] if lead.score_factors else []
    try:
        requirements = json.loads(lead.requirements_summary) if lead.requirements_summary else {}
    except json.JSONDecodeError:
        requirements = {}

    recent_conversation = []
    if lead.conversation_id:
        recent_conversation = [
            {"role": message.role, "content": message.content, "created_at": message.created_at.isoformat()}
            for message in reversed(
                db.query(Message)
                .filter(Message.conversation_id == lead.conversation_id)
                .order_by(Message.id.desc())
                .limit(6)
                .all()
            )
        ]

    property_item = db.query(Property).filter(Property.id == lead.interested_property_id).first() if lead.interested_property_id else None
    interested_property = None
    if property_item:
        interested_property = {
            "id": property_item.id,
            "title": property_item.title,
            "location": property_item.location,
            "purpose": property_item.purpose,
            "bedrooms": property_item.beds,
            "listed_price_aed": property_item.rent_price if property_item.purpose == "For Rent" else property_item.sale_price,
        }

    site_visit = db.query(SiteVisit).filter(SiteVisit.id == lead.site_visit_id).first() if lead.site_visit_id else None
    if site_visit:
        visit_property = db.query(Property).filter(Property.id == site_visit.property_id).first()
        visit_dto = {
            "id": site_visit.id,
            "property_id": site_visit.property_id,
            "property_title": visit_property.title if visit_property else None,
            "property_location": visit_property.location if visit_property else None,
            "customer_name": site_visit.customer_name,
            "customer_email": site_visit.customer_email,
            "customer_phone": site_visit.customer_phone,
            "preferred_date": site_visit.preferred_date,
            "preferred_time": site_visit.preferred_time,
            "notes": site_visit.notes,
            "status": site_visit.status,
            "created_at": site_visit.created_at,
        }
    else:
        visit_dto = None

    next_action = {
        "SITE_VISIT": "Confirm the site visit date, time, and property access.",
        "CONTACTED": "Review the advisor request and contact details.",
        "CONVERTED": "Record any post-conversion follow-up.",
        "LOST": "No follow-up required unless the customer re-engages.",
    }.get(lead.lead_status, "Follow up on the customer's stated requirements.")
    return LeadResponse(
        id=lead.id,
        customer_name=lead.customer_name,
        customer_email=lead.customer_email or None,
        customer_phone=lead.customer_phone,
        intent=lead.intent,
        budget=lead.budget,
        budget_min=lead.budget_min,
        budget_max=lead.budget_max,
        location=lead.location,
        preferred_location=lead.preferred_location,
        bedrooms=lead.bedrooms,
        property_type=lead.property_type,
        furnished=bool(lead.furnished) if lead.furnished is not None else None,
        interested_property_id=lead.interested_property_id,
        site_visit_id=lead.site_visit_id,
        preferred_language=lead.preferred_language,
        assigned_employee_id=lead.assigned_employee_id,
        conversation_id=lead.conversation_id,
        timeline=lead.timeline,
        lead_score=lead.lead_score or 0,
        lead_status=lead.lead_status,
        lead_source=getattr(lead, "lead_source", "AI_CHAT"),
        contact_preference=getattr(lead, "contact_preference", "ANY"),
        consent_contact=bool(getattr(lead, "consent_contact", 1)),
        follow_up_date=getattr(lead, "follow_up_date", None),
        score_override=bool(getattr(lead, "score_override", 0)),
        score_override_reason=getattr(lead, "score_override_reason", None),
        score_factors=factors,
        requirements=requirements,
        conversation_summary=lead.conversation_summary,
        recent_conversation=recent_conversation,
        interested_property=interested_property,
        site_visit=visit_dto,
        next_action=next_action,
        follow_up_notes=lead.follow_up_notes,
        created_at=lead.created_at,
        updated_at=lead.updated_at,
    )


def _employee_lead_query(db: Session, user: User):
    query = db.query(Lead)
    if user.role in {"employee", "sales_agent"}:
        query = query.filter(or_(Lead.assigned_employee_id == user.id, Lead.assigned_employee_id.is_(None)))
    return query


def _check_and_claim_lead(lead: Lead, user: User) -> None:
    if user.role in {"employee", "sales_agent"}:
        if lead.assigned_employee_id not in (None, user.id):
            raise HTTPException(status_code=404, detail="Lead not found")
        if lead.assigned_employee_id is None:
            lead.assigned_employee_id = user.id


@router.get("/employee/leads", response_model=List[LeadResponse])
def get_leads(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["employee", "admin"])),
):
    query = _employee_lead_query(db, current_user)
    if status and status != "ALL":
        query = query.filter(Lead.lead_status == status)

    leads = query.order_by(Lead.lead_score.desc(), Lead.updated_at.desc()).all()
    res = []
    for l in leads:
        res.append(_lead_response(l, db))
    return res

@router.patch("/employee/leads/{id}/status", response_model=LeadResponse)
def update_lead_status(
    id: int,
    body: LeadStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["employee", "admin"])),
):
    if body.status not in {"NEW", "QUALIFIED", "CONTACTED", "SITE_VISIT", "NEGOTIATION", "CONVERTED", "LOST"}:
        raise HTTPException(status_code=422, detail="Invalid lead status")
    lead = _employee_lead_query(db, current_user).filter(Lead.id == id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _check_and_claim_lead(lead, current_user)
    lead.lead_status = body.status
    db.commit()
    db.refresh(lead)

    return _lead_response(lead, db)

@router.post("/employee/leads/{id}/notes", response_model=LeadResponse)
def add_lead_note(
    id: int,
    body: LeadNoteCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["employee", "admin"])),
):
    lead = _employee_lead_query(db, current_user).filter(Lead.id == id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _check_and_claim_lead(lead, current_user)
    updated_notes = f"{lead.follow_up_notes + '\n• ' if lead.follow_up_notes else '• '}{body.note.strip()}"
    lead.follow_up_notes = updated_notes
    db.commit()
    db.refresh(lead)

    return _lead_response(lead, db)


@router.patch("/admin/leads/{lead_id}/assignment", response_model=LeadResponse)
def assign_lead(
    lead_id: int,
    body: LeadAssignEmployeeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if lead is None:
        raise HTTPException(status_code=404, detail="Lead not found")
    if body.employee_id is not None:
        employee = db.query(User).filter(
            User.id == body.employee_id,
            User.role == "employee",
            User.is_active.is_(True),
        ).first()
        if employee is None:
            raise HTTPException(status_code=404, detail="Active employee not found")
    lead.assigned_employee_id = body.employee_id
    db.commit()
    db.refresh(lead)
    return _lead_response(lead, db)


@router.get("/employee/analytics", response_model=CRMAnalyticsResponse)
def get_crm_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["employee", "admin"])),
):
    scoped_leads = _employee_lead_query(db, current_user)
    total_leads = scoped_leads.count()
    hot_leads = scoped_leads.filter(Lead.lead_score >= 60).count()
    site_visits = scoped_leads.filter(Lead.site_visit_id.isnot(None)).count()

    converted = scoped_leads.filter(Lead.lead_status == "CONVERTED").count()
    rate = round((converted / max(total_leads, 1)) * 100, 1)

    leads_by_status = {}
    for st in ["NEW", "QUALIFIED", "CONTACTED", "SITE_VISIT", "NEGOTIATION", "CONVERTED", "LOST"]:
        leads_by_status[st] = scoped_leads.filter(Lead.lead_status == st).count()

    leads_by_loc = {
        "Dubai Marina": scoped_leads.filter(Lead.location.ilike("%Marina%")).count(),
        "Downtown Dubai": scoped_leads.filter(Lead.location.ilike("%Downtown%")).count(),
        "Palm Jumeirah": scoped_leads.filter(Lead.location.ilike("%Palm%")).count(),
        "Business Bay": scoped_leads.filter(Lead.location.ilike("%Business Bay%")).count(),
    }

    return CRMAnalyticsResponse(
        total_leads=total_leads,
        hot_leads=hot_leads,
        scheduled_visits=site_visits,
        conversion_rate=rate,
        leads_by_status=leads_by_status,
        leads_by_location=leads_by_loc,
    )

@router.get("/admin/stats")
def get_admin_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    return {
        "total_users": db.query(User).filter(User.is_active.is_(True)).count(),
        "total_properties": db.query(Property).filter(Property.is_active.is_(True)).count(),
        "total_leads": db.query(Lead).count(),
        "total_site_visits": db.query(SiteVisit).count(),
        "users_by_role": {
            "customer": db.query(User).filter(User.role == "customer", User.is_active.is_(True)).count(),
            "employee": db.query(User).filter(User.role == "employee", User.is_active.is_(True)).count(),
            "admin": db.query(User).filter(User.role == "admin", User.is_active.is_(True)).count(),
        },
    }

@router.get("/customer/shortlist")
def get_shortlist(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    props = (
        db.query(Property)
        .join(Shortlist, Shortlist.property_id == Property.id)
        .filter(Shortlist.user_id == current_user.id)
        .all()
    )
    return [to_response_dto(p) for p in props]

@router.post("/customer/shortlist/{property_id}")
def toggle_shortlist(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    prop = db.query(Property).filter(Property.id == property_id).first()
    if prop is None:
        raise HTTPException(status_code=404, detail="Property not found")
    saved = db.query(Shortlist).filter(
        Shortlist.user_id == current_user.id,
        Shortlist.property_id == property_id,
    ).first()
    if saved:
        db.delete(saved)
        db.commit()
        return {"is_shortlisted": False}
    db.add(Shortlist(user_id=current_user.id, property_id=property_id))
    db.commit()
    return {"is_shortlisted": True}


@router.get("/customer/leads/me", response_model=List[LeadResponse])
def get_my_leads(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    leads = db.query(Lead).filter(Lead.customer_id == current_user.id).order_by(Lead.updated_at.desc()).all()
    return [_lead_response(lead, db) for lead in leads]


@router.get("/customer/requirements")
def get_my_requirements(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    requirements = (
        db.query(CustomerRequirement)
        .filter(CustomerRequirement.user_id == current_user.id)
        .order_by(CustomerRequirement.updated_at.desc())
        .all()
    )
    return [_requirement_response(item) for item in requirements]


@router.get("/employee/requirements")
def get_employee_requirements(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["employee", "admin"])),
):
    accessible_conversations = (
        _employee_lead_query(db, current_user)
        .with_entities(Lead.conversation_id)
        .filter(Lead.conversation_id.isnot(None))
    )
    requirements = (
        db.query(CustomerRequirement)
        .filter(CustomerRequirement.conversation_id.in_(accessible_conversations))
        .order_by(CustomerRequirement.updated_at.desc())
        .all()
    )
    return [_requirement_response(item) for item in requirements]


@router.get("/admin/requirements")
def get_admin_requirements(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    requirements = db.query(CustomerRequirement).order_by(CustomerRequirement.updated_at.desc()).all()
    return [_requirement_response(item) for item in requirements]


@router.get("/customer/conversations")
def get_my_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    conversations = (
        db.query(Conversation)
        .filter(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc())
        .all()
    )
    return [
        {
            "id": conversation.id,
            "created_at": conversation.created_at,
            "updated_at": conversation.updated_at,
            "messages": [
                {"role": message.role, "content": message.content, "created_at": message.created_at}
                for message in db.query(Message)
                .filter(Message.conversation_id == conversation.id)
                .order_by(Message.id.asc())
                .all()
            ],
        }
        for conversation in conversations
    ]


@router.get("/employee/conversations")
def get_employee_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["employee", "admin"])),
):
    conversation_ids = _employee_lead_query(db, current_user).with_entities(Lead.conversation_id).filter(
        Lead.conversation_id.isnot(None)
    ).distinct()
    conversations = db.query(Conversation).filter(Conversation.id.in_(conversation_ids)).order_by(
        Conversation.updated_at.desc()
    ).all()
    return _conversation_responses(conversations, db)


@router.get("/admin/conversations")
def get_admin_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    conversations = db.query(Conversation).order_by(Conversation.updated_at.desc()).all()
    return _conversation_responses(conversations, db)


@router.get("/customer/handoffs")
def get_my_handoffs(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    handoffs = (
        db.query(HandoffRequest)
        .filter(HandoffRequest.user_id == current_user.id)
        .order_by(HandoffRequest.created_at.desc())
        .all()
    )
    return [_handoff_response(handoff) for handoff in handoffs]


@router.get("/employee/handoffs")
def get_employee_handoffs(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["employee", "admin"])),
):
    query = db.query(HandoffRequest)
    if current_user.role == "employee":
        accessible_leads = _employee_lead_query(db, current_user).with_entities(Lead.id)
        query = query.filter(
            or_(HandoffRequest.lead_id.is_(None), HandoffRequest.lead_id.in_(accessible_leads))
        )
    handoffs = query.order_by(HandoffRequest.created_at.desc()).all()
    return [_handoff_response(handoff) for handoff in handoffs]


@router.get("/admin/handoffs")
def get_admin_handoffs(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    handoffs = db.query(HandoffRequest).order_by(HandoffRequest.created_at.desc()).all()
    return [_handoff_response(handoff) for handoff in handoffs]


def _conversation_responses(conversations: List[Conversation], db: Session):
    return [
        {
            "id": conversation.id,
            "user_id": conversation.user_id,
            "created_at": conversation.created_at,
            "updated_at": conversation.updated_at,
            "messages": [
                {"role": message.role, "content": message.content, "created_at": message.created_at}
                for message in db.query(Message)
                .filter(Message.conversation_id == conversation.id)
                .order_by(Message.id.asc())
                .all()
            ],
        }
        for conversation in conversations
    ]


def _handoff_response(handoff: HandoffRequest):
    return {
        "id": handoff.id,
        "user_id": handoff.user_id,
        "customer_name": handoff.customer_name,
        "customer_phone": handoff.customer_phone,
        "customer_email": handoff.customer_email,
        "requirement_summary": handoff.requirement_summary,
        "conversation_id": handoff.conversation_id,
        "lead_id": handoff.lead_id,
        "interested_property_id": handoff.interested_property_id,
        "preferred_language": handoff.preferred_language,
        "status": handoff.status,
        "created_at": handoff.created_at,
    }


def _requirement_response(item: CustomerRequirement):
    return {
        "id": item.id,
        "user_id": item.user_id,
        "conversation_id": item.conversation_id,
        "intent": item.intent,
        "buy_or_rent": item.buy_or_rent,
        "location": item.location,
        "area": item.area,
        "property_type": item.property_type,
        "bedrooms": item.bedrooms,
        "bathrooms": item.bathrooms,
        "budget": item.budget,
        "currency": item.currency,
        "timeline": item.timeline,
        "purpose": item.purpose,
        "furnished": item.furnished,
        "parking": item.parking,
        "amenities": item.amenities,
        "investment_or_personal_use": item.investment_or_personal_use,
        "raw_json": item.raw_json,
        "updated_at": item.updated_at,
    }


@router.get("/admin/users", response_model=List[UserResponse])
def get_admin_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    return db.query(User).order_by(User.id.asc()).all()


@router.patch("/admin/users/{user_id}/role", response_model=UserResponse)
def set_user_role(
    user_id: int,
    body: UserRoleUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == "admin" or user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Administrator roles cannot be changed through this endpoint")
    user.role = body.role
    db.commit()
    db.refresh(user)
    return user


@router.post("/admin/employees", response_model=UserResponse, status_code=201)
def create_employee(
    body: EmployeeCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=409, detail="User with this email already exists")
    employee = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        phone=body.phone,
        role="employee",
        is_active=True,
    )
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee


@router.patch("/admin/users/{user_id}/active", response_model=UserResponse)
def set_user_active(
    user_id: int,
    is_active: bool,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id and not is_active:
        raise HTTPException(status_code=400, detail="Administrators cannot deactivate their own account")
    if user.role == "admin" and not is_active:
        active_admins = db.query(User).filter(User.role == "admin", User.is_active.is_(True)).count()
        if active_admins <= 1:
            raise HTTPException(status_code=400, detail="The last active administrator cannot be deactivated")
    user.is_active = is_active
    db.commit()
    db.refresh(user)
    return user


@router.get("/admin/properties", response_model=AdminPropertiesListResponse)
def get_admin_properties(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    query = db.query(Property).order_by(Property.id.asc())
    total = query.count()
    properties = query.offset(offset).limit(limit).all()
    return {
        "properties": [to_response_dto(prop) for prop in properties],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.patch("/admin/properties/{property_id}", response_model=PropertyResponse)
def update_admin_property(
    property_id: int,
    body: PropertyAdminUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    prop = db.query(Property).filter(Property.id == property_id).first()
    if prop is None:
        raise HTTPException(status_code=404, detail="Property not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(prop, field, value)
    db.commit()
    db.refresh(prop)
    return to_response_dto(prop)


@router.patch("/admin/properties/{property_id}/active", response_model=PropertyResponse)
def set_property_active(
    property_id: int,
    is_active: bool,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    prop = db.query(Property).filter(Property.id == property_id).first()
    if prop is None:
        raise HTTPException(status_code=404, detail="Property not found")
    prop.is_active = is_active
    db.commit()
    db.refresh(prop)
    return to_response_dto(prop)


# --- LEAD ENQUIRY TRACKING (Lead record lookup, not a login account) ---
@router.get("/leads/enquiry-status")
def track_lead_enquiry(phone: str = Query(...), db: Session = Depends(get_db)):
    clean_phone = phone.strip()
    query_phone_alt = clean_phone.replace(" ", "+") if " " in clean_phone else clean_phone
    leads = db.query(Lead).filter(
        or_(
            Lead.customer_phone == clean_phone,
            Lead.customer_phone == query_phone_alt,
            Lead.customer_phone == clean_phone.replace("+", ""),
            Lead.customer_phone == f"+{clean_phone.lstrip('+')}",
        )
    ).order_by(Lead.updated_at.desc()).all()
    if not leads:
        return {
            "found": False,
            "message": "No enquiry found matching this phone number. You can submit an enquiry or chat with LYKA AI anytime.",
            "leads": [],
        }
    return {
        "found": True,
        "message": f"Found {len(leads)} enquiry record(s) for {clean_phone}.",
        "leads": [
            {
                "id": l.id,
                "customer_name": l.customer_name,
                "preferred_location": l.preferred_location or l.location,
                "property_type": l.property_type,
                "bedrooms": l.bedrooms,
                "lead_status": l.lead_status,
                "created_at": l.created_at.isoformat() if l.created_at else None,
                "updated_at": l.updated_at.isoformat() if l.updated_at else None,
            }
            for l in leads
        ],
    }


# --- SALES AGENT SCORE OVERRIDE & AI DRAFT ---
@router.post("/employee/leads/{id}/score-override", response_model=LeadResponse)
def override_lead_score(
    id: int,
    body: LeadScoreOverrideRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["employee", "sales_agent", "manager", "admin", "super_admin"])),
):
    lead = db.query(Lead).filter(Lead.id == id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _check_and_claim_lead(lead, current_user)
    lead.lead_score = max(0, min(100, body.new_score))
    lead.score_override = 1
    lead.score_override_reason = body.reason.strip()
    note_text = f"Lead score manually adjusted to {lead.lead_score} by {current_user.full_name}: {body.reason.strip()}"
    lead.follow_up_notes = f"{lead.follow_up_notes + '\n• ' if lead.follow_up_notes else '• '}{note_text}"
    db.commit()
    db.refresh(lead)

    log_audit_event(
        db=db,
        action="LEAD_SCORE_OVERRIDDEN",
        resource_type="lead",
        resource_id=lead.id,
        user_id=current_user.id,
        user_email=current_user.email,
        user_role=current_user.role,
        details=note_text,
    )
    return _lead_response(lead, db)


@router.post("/employee/leads/{id}/ai-draft", response_model=AIFollowupDraftResponse)
def generate_ai_draft(
    id: int,
    body: AIFollowupDraftRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["employee", "sales_agent", "manager", "admin", "super_admin"])),
):
    lead = db.query(Lead).filter(Lead.id == id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    prop = db.query(Property).filter(Property.id == lead.interested_property_id).first() if lead.interested_property_id else None
    loc = lead.preferred_location or lead.location or "Dubai"
    beds = f"{lead.bedrooms} BHK" if lead.bedrooms else "property"
    client_name = lead.customer_name or "Valued Client"

    channel = (body.channel or "WHATSAPP").upper()
    if channel == "WHATSAPP":
        draft = (
            f"Hello {client_name}! This is {current_user.full_name} from LYKA Realty. "
            f"I reviewed your enquiry for a {beds} in {loc}. "
            f"{f'We have excellent options in {prop.title}. ' if prop else 'We have curated verified inventory ready for you. '}"
            f"Would you be available for a brief 5-minute call or a viewing visit this week?"
        )
        subject = None
    elif channel == "EMAIL":
        subject = f"LYKA Realty — Curated {beds} options in {loc} for {client_name}"
        draft = (
            f"Dear {client_name},\n\n"
            f"Thank you for contacting LYKA Realty. My name is {current_user.full_name}, your assigned property consultant.\n\n"
            f"Following your consultation with LYKA AI regarding {beds} properties in {loc}, I have prepared a tailored selection of verified listings that match your criteria.\n\n"
            f"Please let me know if you would like to arrange an in-person viewing or review financial schedules.\n\n"
            f"Warm regards,\n{current_user.full_name}\nLYKA Realty Dubai"
        )
    else:  # CALL_SCRIPT
        subject = None
        draft = (
            f"1. Greet {client_name} warmly and introduce yourself as {current_user.full_name} from LYKA Realty.\n"
            f"2. Reference their enquiry for a {beds} in {loc}.\n"
            f"3. Confirm their target move-in timeline and budget flexibility.\n"
            f"4. Propose viewing slots for {prop.title if prop else 'top 2 matching residences'}."
        )

    talking_points = [
        f"Preferred location: {loc}",
        f"Layout: {beds}",
        f"Timeline: {lead.timeline or 'Flexible'}",
        f"Lead Score: {lead.lead_score}/100",
    ]
    return AIFollowupDraftResponse(
        draft_message=draft,
        suggested_subject=subject,
        talking_points=talking_points,
    )


# --- MANAGER WORKSPACE ENDPOINTS ---
@router.get("/manager/pipeline")
def get_manager_pipeline(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["manager", "admin", "super_admin"])),
):
    total = db.query(Lead).count()
    status_counts = {}
    for st in ["NEW", "QUALIFIED", "CONTACTED", "SITE_VISIT", "NEGOTIATION", "CONVERTED", "LOST"]:
        status_counts[st] = db.query(Lead).filter(Lead.lead_status == st).count()

    overdue_count = db.query(Lead).filter(
        Lead.follow_up_date.isnot(None),
        Lead.follow_up_date < datetime.utcnow(),
        ~Lead.lead_status.in_(["CONVERTED", "LOST"])
    ).count()

    converted = status_counts.get("CONVERTED", 0)
    conversion_rate = round((converted / max(total, 1)) * 100, 1)

    return {
        "total_leads": total,
        "status_breakdown": status_counts,
        "overdue_followups": overdue_count,
        "conversion_rate": conversion_rate,
        "avg_response_time_minutes": 14.5,
    }


@router.get("/manager/team-workload")
def get_manager_team_workload(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["manager", "admin", "super_admin"])),
):
    agents = db.query(User).filter(User.role.in_(["employee", "sales_agent"]), User.is_active.is_(True)).all()
    unassigned = db.query(Lead).filter(Lead.assigned_employee_id.is_(None)).count()
    workload = []
    for agent in agents:
        count = db.query(Lead).filter(Lead.assigned_employee_id == agent.id).count()
        visits = db.query(SiteVisit).filter(SiteVisit.assigned_agent_id == agent.id).count()
        workload.append({
            "agent_id": agent.id,
            "agent_name": agent.full_name,
            "agent_email": agent.email,
            "active_leads": count,
            "assigned_visits": visits,
        })
    return {
        "unassigned_leads": unassigned,
        "agents": workload,
    }


@router.post("/manager/leads/reassign")
def reassign_lead_manager(
    lead_id: int,
    body: LeadAssignEmployeeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["manager", "admin", "super_admin"])),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    old_id = lead.assigned_employee_id
    lead.assigned_employee_id = body.employee_id
    db.commit()
    db.refresh(lead)

    log_audit_event(
        db=db,
        action="LEAD_REASSIGNED",
        resource_type="lead",
        resource_id=lead.id,
        user_id=current_user.id,
        user_email=current_user.email,
        user_role=current_user.role,
        details=f"Lead {lead.id} reassigned from agent {old_id} to agent {body.employee_id}",
    )
    return _lead_response(lead, db)


# --- AUDIT LOGS & SUPER ADMIN ENDPOINTS ---
@router.get("/admin/audit-logs")
def get_admin_audit_logs(
    limit: int = Query(default=50, ge=1, le=100),
    action: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "super_admin"])),
):
    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    logs = query.order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [
        {
            "id": item.id,
            "user_id": item.user_id,
            "user_email": item.user_email,
            "user_role": item.user_role,
            "action": item.action,
            "resource_type": item.resource_type,
            "resource_id": item.resource_id,
            "details": item.details,
            "ip_address": item.ip_address,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }
        for item in logs
    ]


@router.get("/super-admin/audit-trail")
def get_super_admin_audit_trail(
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["super_admin"])),
):
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [
        {
            "id": item.id,
            "user_id": item.user_id,
            "user_email": item.user_email,
            "user_role": item.user_role,
            "action": item.action,
            "resource_type": item.resource_type,
            "resource_id": item.resource_id,
            "details": item.details,
            "ip_address": item.ip_address,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }
        for item in logs
    ]


@router.get("/super-admin/admins")
def get_super_admin_admins(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["super_admin"])),
):
    admins = db.query(User).filter(User.role.in_(["admin", "super_admin"])).all()
    return [UserResponse.model_validate(u) for u in admins]


@router.post("/super-admin/admins", status_code=201)
def create_admin_account(
    body: EmployeeCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["super_admin"])),
):
    email = str(body.email).strip().lower()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(status_code=409, detail="User with this email already exists")

    new_admin = User(
        email=email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        phone=body.phone,
        role=body.role if body.role in {"admin", "manager"} else "admin",
        is_active=True,
    )
    db.add(new_admin)
    db.commit()
    db.refresh(new_admin)

    log_audit_event(
        db=db,
        action="ADMIN_ACCOUNT_CREATED",
        resource_type="user",
        resource_id=new_admin.id,
        user_id=current_user.id,
        user_email=current_user.email,
        user_role=current_user.role,
        details=f"Super admin created {new_admin.role} account {new_admin.email}",
    )
    return UserResponse.model_validate(new_admin)


@router.post("/super-admin/assign-role")
def assign_role_super_admin(
    user_id: int,
    body: UserRoleUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["super_admin"])),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    old_role = user.role
    user.role = body.role
    db.commit()
    db.refresh(user)

    log_audit_event(
        db=db,
        action="SUPER_ADMIN_ROLE_CHANGE",
        resource_type="user",
        resource_id=user.id,
        user_id=current_user.id,
        user_email=current_user.email,
        user_role=current_user.role,
        details=f"User {user.email} role changed from {old_role} to {body.role}",
    )
    return UserResponse.model_validate(user)


@router.get("/super-admin/platform-config")
def get_platform_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["super_admin"])),
):
    return {
        "platform_name": "LYKA Realty AI",
        "environment": "development",
        "database_dialect": "sqlite",
        "ai_provider_active": "ollama (local-first with cloud failover)",
        "security_features": {
            "login_throttling": "Enabled (5 attempts / 15-minute lockout)",
            "audit_logging": "Enabled",
            "password_reset": "Cryptographic token verification enabled",
            "rbac_roles": ["customer", "sales_agent", "manager", "admin", "super_admin"],
        },
        "stats": {
            "total_users": db.query(User).count(),
            "total_properties": db.query(Property).count(),
            "total_leads": db.query(Lead).count(),
            "total_visits": db.query(SiteVisit).count(),
            "total_audit_events": db.query(AuditLog).count(),
        },
    }
