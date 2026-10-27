from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict

from ..database import get_db
from ..models.user import User
from ..models.call_record import CallRecord
from ..models.telephony import DoNotCall, TelephonySetting
from ..services.auth_service import require_auth, require_role
from ..services.telephony_service import telephony_manager
from ..services.security_service import log_audit_event

router = APIRouter(prefix="/telephony", tags=["Telephony & AI Calling"])


class InitiateCallRequest(BaseModel):
    phone: str = Field(min_length=7, max_length=25)
    lead_id: Optional[int] = None
    customer_name: Optional[str] = None
    custom_intro: Optional[str] = None


class CallRecordDTO(BaseModel):
    id: int
    call_sid: str
    provider: str
    lead_id: Optional[int] = None
    customer_name: Optional[str] = None
    customer_phone: str
    direction: str
    status: str
    duration_seconds: int
    outcome: Optional[str] = None
    summary: Optional[str] = None
    transcript: Optional[str] = None
    callback_scheduled_at: Optional[str] = None
    created_at: str

    model_config = ConfigDict(from_attributes=True)


class DNCRequest(BaseModel):
    phone: str
    reason: Optional[str] = "Customer requested opt-out"


class TelephonySettingsDTO(BaseModel):
    provider: str
    is_enabled: bool
    mock_mode: bool
    daily_call_limit: int
    max_concurrency: int
    monthly_budget_usd: float

    model_config = ConfigDict(from_attributes=True)


class TelephonySettingsUpdate(BaseModel):
    provider: Optional[str] = None
    is_enabled: Optional[bool] = None
    mock_mode: Optional[bool] = None
    daily_call_limit: Optional[int] = None
    max_concurrency: Optional[int] = None
    monthly_budget_usd: Optional[float] = None


@router.post("/calls")
def initiate_call(
    body: InitiateCallRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["employee", "sales_agent", "manager", "admin", "super_admin"])),
):
    phone = body.phone.strip()

    # 1. Check Do-Not-Call list
    if telephony_manager.is_number_dnc(phone, db):
        raise HTTPException(
            status_code=400,
            detail=f"The phone number {phone} is registered on the Do-Not-Call (DNC) list. Outbound calls are prohibited.",
        )

    # 2. Get provider & execute
    provider = telephony_manager.get_provider(db)
    call_record = provider.initiate_call(
        to_phone=phone,
        lead_id=body.lead_id,
        customer_name=body.customer_name,
        db=db,
        agent_user=current_user,
        custom_intro=body.custom_intro,
    )

    return {
        "success": True,
        "message": "AI Calling session completed successfully.",
        "call_id": call_record.id,
        "call_sid": call_record.call_sid,
        "provider": call_record.provider,
        "status": call_record.status,
        "duration_seconds": call_record.duration_seconds,
        "outcome": call_record.outcome,
        "summary": call_record.summary,
        "callback_scheduled_at": call_record.callback_scheduled_at.isoformat() if call_record.callback_scheduled_at else None,
        "lead_id": call_record.lead_id,
    }


@router.get("/calls")
def get_call_history(
    lead_id: Optional[int] = None,
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["employee", "sales_agent", "manager", "admin", "super_admin"])),
):
    query = db.query(CallRecord)
    if lead_id:
        query = query.filter(CallRecord.lead_id == lead_id)
    if current_user.role in {"employee", "sales_agent"}:
        query = query.filter(CallRecord.agent_id == current_user.id)
    records = query.order_by(CallRecord.created_at.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "call_sid": r.call_sid,
            "provider": r.provider,
            "lead_id": r.lead_id,
            "customer_name": r.customer_name,
            "customer_phone": r.customer_phone,
            "direction": r.direction,
            "status": r.status,
            "duration_seconds": r.duration_seconds,
            "outcome": r.outcome,
            "summary": r.summary,
            "transcript": r.transcript,
            "callback_scheduled_at": r.callback_scheduled_at.isoformat() if r.callback_scheduled_at else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in records
    ]


@router.get("/dnc")
def list_dnc(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["employee", "sales_agent", "manager", "admin", "super_admin"])),
):
    items = db.query(DoNotCall).order_by(DoNotCall.created_at.desc()).all()
    return [
        {"id": item.id, "phone": item.phone, "reason": item.reason, "created_at": item.created_at.isoformat()}
        for item in items
    ]


@router.post("/dnc")
def add_dnc(
    body: DNCRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["employee", "sales_agent", "manager", "admin", "super_admin"])),
):
    entry = telephony_manager.add_dnc(body.phone, body.reason or "Opt-out", current_user.id, db)
    log_audit_event(
        db=db,
        action="DNC_NUMBER_ADDED",
        resource_type="do_not_call",
        resource_id=entry.id,
        user_id=current_user.id,
        user_email=current_user.email,
        details=f"Added {body.phone} to DNC list: {body.reason}",
    )
    return {"success": True, "phone": entry.phone, "reason": entry.reason}


@router.delete("/dnc/{phone}")
def remove_dnc(
    phone: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "super_admin"])),
):
    removed = telephony_manager.remove_dnc(phone, db)
    if not removed:
        raise HTTPException(status_code=404, detail="Phone number not found in DNC list")
    log_audit_event(
        db=db,
        action="DNC_NUMBER_REMOVED",
        resource_type="do_not_call",
        user_id=current_user.id,
        user_email=current_user.email,
        details=f"Removed {phone} from DNC list",
    )
    return {"success": True, "message": f"{phone} removed from DNC list"}


@router.get("/settings")
def get_telephony_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "super_admin"])),
):
    setting = db.query(TelephonySetting).first()
    if not setting:
        setting = TelephonySetting()
        db.add(setting)
        db.commit()
        db.refresh(setting)
    return {
        "provider": setting.provider,
        "is_enabled": setting.is_enabled,
        "mock_mode": setting.mock_mode,
        "daily_call_limit": setting.daily_call_limit,
        "max_concurrency": setting.max_concurrency,
        "monthly_budget_usd": setting.monthly_budget_usd,
        "mode_label": "DEMO / MOCK MODE (Zero-credential local safe calling)" if setting.mock_mode else "LIVE TELEPHONY (Twilio/Retell)",
    }


@router.patch("/settings")
def update_telephony_settings(
    body: TelephonySettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "super_admin"])),
):
    setting = db.query(TelephonySetting).first()
    if not setting:
        setting = TelephonySetting()
        db.add(setting)

    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(setting, field, val)

    db.commit()
    db.refresh(setting)

    log_audit_event(
        db=db,
        action="TELEPHONY_SETTINGS_UPDATED",
        resource_type="telephony_settings",
        user_id=current_user.id,
        user_email=current_user.email,
        details=f"Provider: {setting.provider}, Mock mode: {setting.mock_mode}",
    )
    return {
        "success": True,
        "provider": setting.provider,
        "is_enabled": setting.is_enabled,
        "mock_mode": setting.mock_mode,
        "daily_call_limit": setting.daily_call_limit,
        "max_concurrency": setting.max_concurrency,
        "monthly_budget_usd": setting.monthly_budget_usd,
    }


@router.post("/webhook")
async def telephony_webhook(request: Request, db: Session = Depends(get_db)):
    headers = dict(request.headers)
    try:
        payload = await request.json()
    except Exception:
        payload = dict(await request.form())
    provider = telephony_manager.get_provider(db)
    return provider.process_webhook(payload, headers, db)
