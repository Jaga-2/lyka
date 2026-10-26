import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.lead import Lead
from ..models.conversation import Conversation
from ..models.property import Property
from ..models.site_visit import HandoffRequest, SiteVisit
from ..models.user import User
from ..schemas.crm import (
    HandoffCreateRequest,
    SiteVisitCreateRequest,
    SiteVisitResponse,
    SiteVisitStatusUpdateRequest,
)
from ..services.auth_service import require_auth, require_role
from ..services.lead_scoring_service import calculate_explainable_lead_score

router = APIRouter(tags=["Site Visits & Handoff"])


def _visit_response(visit: SiteVisit, prop: Optional[Property]) -> SiteVisitResponse:
    return SiteVisitResponse(
        id=visit.id,
        property_id=visit.property_id,
        property_title=prop.title if prop else None,
        property_location=prop.location if prop else None,
        customer_name=visit.customer_name,
        customer_email=visit.customer_email,
        customer_phone=visit.customer_phone,
        preferred_date=visit.preferred_date,
        preferred_time=visit.preferred_time,
        notes=visit.notes,
        status=visit.status,
        assigned_agent_id=visit.assigned_agent_id,
        rescheduled_date=visit.rescheduled_date,
        rescheduled_time=visit.rescheduled_time,
        confirmation_notes=visit.confirmation_notes,
        created_at=visit.created_at,
    )


@router.post("/site-visits", response_model=SiteVisitResponse)
def create_site_visit(
    body: SiteVisitCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    prop = db.query(Property).filter(
        Property.id == body.property_id,
        Property.is_active.is_(True),
    ).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    conversation = None
    if body.conversation_id:
        conversation = db.query(Conversation).filter(Conversation.id == body.conversation_id).first()
        if conversation is None or conversation.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="This conversation does not belong to your account")
    lead_query = db.query(Lead).filter(Lead.customer_id == current_user.id)
    if body.conversation_id:
        conversation_leads = db.query(Lead).filter(Lead.conversation_id == body.conversation_id).all()
        if len(conversation_leads) > 1:
            raise HTTPException(status_code=409, detail="This conversation has conflicting lead records")
        lead = conversation_leads[0] if conversation_leads else None
        if lead is not None and lead.customer_id != current_user.id:
            raise HTTPException(status_code=409, detail="The existing lead ownership for this conversation cannot be verified")
    else:
        lead = None
    if lead is None and not body.conversation_id:
        lead = lead_query.order_by(Lead.updated_at.desc()).first()
    if lead is None:
        requirements = {
            "purpose": "rent" if prop.purpose == "For Rent" else "buy" if prop.purpose == "For Sale" else None,
            "location": prop.location,
            "bedrooms": prop.beds,
            "property_type": prop.property_type,
        }
        score, _, factors = calculate_explainable_lead_score(
            requirements, has_site_visit=True, phone_present=bool(body.customer_phone), interested_property=True
        )
        lead = Lead(
            customer_id=current_user.id,
            conversation_id=body.conversation_id,
            customer_name=current_user.full_name,
            customer_email=current_user.email,
            customer_phone=body.customer_phone,
            intent=requirements["purpose"],
            location=prop.location,
            preferred_location=prop.location,
            bedrooms=prop.beds,
            property_type=prop.property_type,
            interested_property_id=prop.id,
            preferred_language="en",
            lead_score=score,
            lead_status="SITE_VISIT",
            score_factors=json.dumps(factors),
            requirements_summary=json.dumps(requirements),
            conversation_summary=f"Site visit requested for {prop.title}.",
        )
        db.add(lead)
        db.flush()

    existing_duplicate = db.query(SiteVisit).filter(
        SiteVisit.property_id == prop.id,
        SiteVisit.user_id == current_user.id,
        SiteVisit.preferred_date == body.preferred_date,
        ~SiteVisit.status.in_(["CANCELLED"]),
    ).first()
    if existing_duplicate:
        raise HTTPException(
            status_code=409,
            detail="A viewing request for this property on this date has already been submitted.",
        )

    visit = SiteVisit(
        property_id=prop.id,
        user_id=current_user.id,
        lead_id=lead.id,
        customer_name=current_user.full_name,
        customer_email=current_user.email,
        customer_phone=body.customer_phone,
        preferred_date=body.preferred_date,
        preferred_time=body.preferred_time,
        notes=body.notes,
        status="REQUESTED",
    )
    db.add(visit)
    lead.lead_status = "SITE_VISIT"
    lead.interested_property_id = prop.id
    lead.customer_name = current_user.full_name
    lead.customer_email = current_user.email
    lead.customer_phone = body.customer_phone
    lead.customer_id = current_user.id
    if conversation is not None:
        lead.conversation_id = conversation.id
    lead.follow_up_notes = f"Site visit booked for {body.preferred_date} at {body.preferred_time} on {prop.title}."
    db.flush()
    lead.site_visit_id = visit.id
    db.commit()
    db.refresh(visit)
    return _visit_response(visit, prop)


@router.get("/site-visits", response_model=List[SiteVisitResponse])
def get_all_site_visits(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["employee", "admin"])),
):
    query = db.query(SiteVisit)
    if current_user.role == "employee":
        accessible_leads = db.query(Lead.id).filter(
            or_(Lead.assigned_employee_id == current_user.id, Lead.assigned_employee_id.is_(None))
        )
        query = query.filter(
            or_(SiteVisit.lead_id.is_(None), SiteVisit.lead_id.in_(accessible_leads))
        )
    visits = query.order_by(SiteVisit.created_at.desc()).all()
    return [_visit_response(visit, db.query(Property).filter(Property.id == visit.property_id).first()) for visit in visits]


@router.get("/site-visits/my-visits", response_model=List[SiteVisitResponse])
def get_my_visits(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    visits = db.query(SiteVisit).filter(SiteVisit.user_id == current_user.id).order_by(SiteVisit.created_at.desc()).all()
    return [_visit_response(visit, db.query(Property).filter(Property.id == visit.property_id).first()) for visit in visits]


@router.patch("/site-visits/{id}/status")
def update_visit_status(
    id: int,
    body: SiteVisitStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["employee", "sales_agent", "manager", "admin", "super_admin"])),
):
    visit_query = db.query(SiteVisit).filter(SiteVisit.id == id)
    if current_user.role in {"employee", "sales_agent"}:
        accessible_leads = db.query(Lead.id).filter(
            or_(Lead.assigned_employee_id == current_user.id, Lead.assigned_employee_id.is_(None))
        )
        visit_query = visit_query.filter(
            or_(SiteVisit.lead_id.is_(None), SiteVisit.lead_id.in_(accessible_leads))
        )
    visit = visit_query.first()
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")
    valid_statuses = {"REQUESTED", "ASSIGNED", "SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELLED", "RESCHEDULED"}
    if body.status not in valid_statuses:
        raise HTTPException(status_code=422, detail=f"Invalid site visit status. Must be one of {valid_statuses}")
    if current_user.role in {"employee", "sales_agent"} and visit.lead_id:
        lead = db.query(Lead).filter(Lead.id == visit.lead_id).first()
        if lead and lead.assigned_employee_id is None:
            lead.assigned_employee_id = current_user.id

    visit.status = body.status
    if body.assigned_agent_id is not None:
        visit.assigned_agent_id = body.assigned_agent_id
    if body.rescheduled_date:
        visit.rescheduled_date = body.rescheduled_date
        visit.preferred_date = body.rescheduled_date
    if body.rescheduled_time:
        visit.rescheduled_time = body.rescheduled_time
        visit.preferred_time = body.rescheduled_time
    if body.confirmation_notes:
        visit.confirmation_notes = body.confirmation_notes

    db.commit()
    db.refresh(visit)
    prop = db.query(Property).filter(Property.id == visit.property_id).first()
    return _visit_response(visit, prop)


@router.post("/handoff")
def create_handoff(
    body: HandoffCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    handoff = None
    lead = None
    property_item = None
    if body.interested_property_id is not None:
        property_item = db.query(Property).filter(
            Property.id == body.interested_property_id,
            Property.is_active.is_(True),
        ).first()
        if property_item is None:
            raise HTTPException(status_code=404, detail="Property not found")

    if body.conversation_id:
        conversation = db.query(Conversation).filter(Conversation.id == body.conversation_id).first()
        if conversation is None or conversation.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="This conversation does not belong to your account")
        handoffs = (
            db.query(HandoffRequest)
            .filter(HandoffRequest.conversation_id == body.conversation_id)
            .all()
        )
        if len(handoffs) > 1:
            raise HTTPException(status_code=409, detail="This conversation has conflicting handoff records")
        handoff = handoffs[0] if handoffs else None
        if handoff is not None and handoff.user_id != current_user.id:
            raise HTTPException(status_code=409, detail="The existing handoff ownership for this conversation cannot be verified")

        leads = db.query(Lead).filter(Lead.conversation_id == body.conversation_id).all()
        if len(leads) > 1:
            raise HTTPException(status_code=409, detail="This conversation has conflicting lead records")
        lead = leads[0] if leads else None
        if lead is not None and lead.customer_id != current_user.id:
            raise HTTPException(status_code=409, detail="The existing lead ownership for this conversation cannot be verified")

    if lead is None:
        requirements = body.requirements or {}
        score, _, factors = calculate_explainable_lead_score(
            requirements, phone_present=bool(body.customer_phone), agent_request=True,
            interested_property=body.interested_property_id is not None,
        )
        lead = Lead(
            conversation_id=body.conversation_id,
            customer_id=current_user.id,
            customer_name=current_user.full_name,
            customer_email=current_user.email,
            customer_phone=body.customer_phone,
            intent=requirements.get("purpose") or requirements.get("buy_or_rent"),
            location=requirements.get("location"),
            preferred_location=requirements.get("location"),
            bedrooms=requirements.get("bedrooms"),
            budget=requirements.get("budget_target"),
            budget_min=requirements.get("budget_min"),
            budget_max=requirements.get("budget_max"),
            property_type=requirements.get("property_type"),
            interested_property_id=body.interested_property_id,
            preferred_language=body.preferred_language,
            lead_score=score,
            lead_status="CONTACTED",
            score_factors=json.dumps(factors),
            requirements_summary=json.dumps(requirements, ensure_ascii=False),
            conversation_summary=body.requirement_summary,
        )
        db.add(lead)
        db.flush()
    lead.customer_id = current_user.id
    if body.conversation_id:
        lead.conversation_id = body.conversation_id
    lead.customer_name = current_user.full_name
    lead.customer_email = current_user.email
    lead.customer_phone = body.customer_phone

    if handoff is None:
        handoff = HandoffRequest(
            conversation_id=body.conversation_id,
            customer_name=current_user.full_name,
            customer_phone=body.customer_phone,
            customer_email=current_user.email,
            requirement_summary=body.requirement_summary,
            status="PENDING",
            user_id=current_user.id,
            lead_id=lead.id,
            interested_property_id=property_item.id if property_item else None,
            preferred_language=body.preferred_language,
        )
        db.add(handoff)
    else:
        handoff.customer_name = current_user.full_name
        handoff.customer_phone = body.customer_phone
        handoff.customer_email = current_user.email
        handoff.requirement_summary = body.requirement_summary
        handoff.status = "PENDING"
        handoff.user_id = current_user.id
        handoff.lead_id = lead.id
        handoff.interested_property_id = property_item.id if property_item else handoff.interested_property_id
        handoff.preferred_language = body.preferred_language or handoff.preferred_language
    lead.customer_name = current_user.full_name
    lead.customer_email = current_user.email
    lead.customer_phone = body.customer_phone
    lead.lead_status = "CONTACTED"
    requirements = body.requirements or {}
    lead.intent = requirements.get("purpose") or requirements.get("buy_or_rent") or lead.intent
    lead.budget = requirements.get("budget_target", lead.budget)
    lead.budget_min = requirements.get("budget_min", lead.budget_min)
    lead.budget_max = requirements.get("budget_max", lead.budget_max)
    lead.preferred_location = requirements.get("location", lead.preferred_location)
    lead.location = requirements.get("location", lead.location)
    lead.bedrooms = requirements.get("bedrooms", lead.bedrooms)
    lead.property_type = requirements.get("property_type", lead.property_type)
    lead.preferred_language = body.preferred_language or lead.preferred_language
    lead.interested_property_id = body.interested_property_id or lead.interested_property_id
    lead.lead_score, _, score_factors = calculate_explainable_lead_score(
        requirements,
        phone_present=bool(body.customer_phone),
        agent_request=True,
        interested_property=lead.interested_property_id is not None,
    )
    lead.score_factors = json.dumps(score_factors)
    lead.requirements_summary = json.dumps(requirements, ensure_ascii=False) if requirements else lead.requirements_summary
    lead.conversation_summary = body.requirement_summary
    lead.follow_up_notes = "Customer requested advisor contact. Request is available for LYKA team review."
    db.commit()
    db.refresh(handoff)
    return {
        "id": handoff.id,
        "status": handoff.status,
        "message": "Your request has been recorded for the LYKA Realty team to review.",
    }
