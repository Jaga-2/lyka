from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime

class SiteVisitCreateRequest(BaseModel):
    property_id: int
    customer_name: str
    customer_email: str
    customer_phone: str
    preferred_date: str
    preferred_time: str
    notes: Optional[str] = None
    conversation_id: Optional[str] = None

class SiteVisitResponse(BaseModel):
    id: int
    property_id: int
    property_title: Optional[str] = None
    property_location: Optional[str] = None
    customer_name: str
    customer_email: str
    customer_phone: str
    preferred_date: str
    preferred_time: str
    notes: Optional[str] = None
    status: str
    assigned_agent_id: Optional[int] = None
    rescheduled_date: Optional[str] = None
    rescheduled_time: Optional[str] = None
    confirmation_notes: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class LeadResponse(BaseModel):
    id: int
    customer_name: str
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    intent: Optional[str] = None
    budget: Optional[float] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    location: Optional[str] = None
    preferred_location: Optional[str] = None
    bedrooms: Optional[int] = None
    property_type: Optional[str] = None
    furnished: Optional[bool] = None
    interested_property_id: Optional[int] = None
    site_visit_id: Optional[int] = None
    preferred_language: Optional[str] = None
    assigned_employee_id: Optional[int] = None
    conversation_id: Optional[str] = None
    timeline: Optional[str] = None
    lead_score: int
    lead_status: str
    lead_source: Optional[str] = None
    contact_preference: Optional[str] = None
    consent_contact: Optional[bool] = None
    follow_up_date: Optional[datetime] = None
    score_override: Optional[bool] = None
    score_override_reason: Optional[str] = None
    score_factors: Optional[List[str]] = None
    requirements: Optional[Dict[str, Any]] = None
    conversation_summary: Optional[str] = None
    recent_conversation: Optional[List[Dict[str, Any]]] = None
    interested_property: Optional[Dict[str, Any]] = None
    site_visit: Optional[SiteVisitResponse] = None
    next_action: Optional[str] = None
    follow_up_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class LeadStatusUpdateRequest(BaseModel):
    status: str

class LeadNoteCreateRequest(BaseModel):
    note: str

class LeadAssignEmployeeRequest(BaseModel):
    employee_id: Optional[int] = None

class LeadScoreOverrideRequest(BaseModel):
    new_score: int
    reason: str

class SiteVisitStatusUpdateRequest(BaseModel):
    status: str
    assigned_agent_id: Optional[int] = None
    rescheduled_date: Optional[str] = None
    rescheduled_time: Optional[str] = None
    confirmation_notes: Optional[str] = None

class HandoffCreateRequest(BaseModel):
    customer_name: str
    customer_phone: str
    customer_email: Optional[str] = None
    requirement_summary: str
    conversation_id: Optional[str] = None
    interested_property_id: Optional[int] = None
    preferred_language: Optional[str] = None
    requirements: Optional[Dict[str, Any]] = None

class CRMAnalyticsResponse(BaseModel):
    total_leads: int
    hot_leads: int
    scheduled_visits: int
    conversion_rate: float
    leads_by_status: Dict[str, int]
    leads_by_location: Dict[str, int]

class AIFollowupDraftRequest(BaseModel):
    lead_id: int
    channel: Optional[str] = "WHATSAPP"
    tone: Optional[str] = "PROFESSIONAL_WARM"

class AIFollowupDraftResponse(BaseModel):
    draft_message: str
    suggested_subject: Optional[str] = None
    talking_points: List[str]
