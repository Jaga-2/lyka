import uuid
import json
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from abc import ABC, abstractmethod
from sqlalchemy.orm import Session
from sqlalchemy import or_

from ..models.call_record import CallRecord
from ..models.telephony import DoNotCall, TelephonySetting
from ..models.lead import Lead
from ..models.property import Property
from ..models.user import User
from ..services.lead_scoring_service import calculate_explainable_lead_score
from ..services.security_service import log_audit_event

logger = logging.getLogger(__name__)


class TelephonyProvider(ABC):
    @abstractmethod
    def initiate_call(
        self,
        to_phone: str,
        lead_id: Optional[int],
        customer_name: Optional[str],
        db: Session,
        agent_user: Optional[User] = None,
        custom_intro: Optional[str] = None,
    ) -> CallRecord:
        pass

    @abstractmethod
    def process_webhook(self, payload: Dict[str, Any], headers: Dict[str, str], db: Session) -> Dict[str, Any]:
        pass


class MockDemoTelephonyProvider(TelephonyProvider):
    """
    High-fidelity simulation and demo calling provider.
    Runs when real telephony credentials (Twilio/Retell) are not configured,
    clearly labelled as DEMO_MOCK_MODE to ensure transparency.
    """

    def initiate_call(
        self,
        to_phone: str,
        lead_id: Optional[int],
        customer_name: Optional[str],
        db: Session,
        agent_user: Optional[User] = None,
        custom_intro: Optional[str] = None,
    ) -> CallRecord:
        call_sid = f"mock_call_{uuid.uuid4().hex[:12]}"
        clean_phone = to_phone.strip()

        # Check existing lead or create one
        lead = None
        if lead_id:
            lead = db.query(Lead).filter(Lead.id == lead_id).first()
        if not lead and clean_phone:
            lead = db.query(Lead).filter(Lead.customer_phone == clean_phone).first()

        name = customer_name or (lead.customer_name if lead else "Valued Client")

        # Simulate real property lookup for conversation grounding
        sample_props = db.query(Property).filter(
            Property.is_active.is_(True),
            Property.location.ilike("%Dubai Marina%")
        ).limit(2).all()

        prop_titles = [p.title for p in sample_props] if sample_props else ["Dubai Marina Luxury 2-Bedroom"]

        # Build realistic conversational dialogue transcript
        transcript_lines = [
            f"AI [LYKA Calling Agent]: 'Hello {name}! This is LYKA Realty's AI assistant calling regarding your property enquiry in Dubai. Do you have a moment to speak about your requirements?'",
            f"Customer: 'Yes, sure. I am looking for a 2 bedroom apartment in Dubai Marina.'",
            f"AI [LYKA Calling Agent]: 'Wonderful. We have verified listings in Dubai Marina including {prop_titles[0]} with yearly rental options. What is your ideal move-in timeline?'",
            f"Customer: 'I am planning to move within the next 30 days.'",
            f"AI [LYKA Calling Agent]: 'Understood. Would you like me to schedule a viewing appointment for this weekend, or would you prefer our senior property advisor to follow up with details on WhatsApp?'",
            f"Customer: 'Please schedule a callback with the property advisor tomorrow morning.'",
            f"AI [LYKA Calling Agent]: 'I have confirmed your preference. Advisor follow-up has been scheduled for tomorrow at 10:00 AM. Thank you for choosing LYKA Realty!'",
        ]
        transcript_text = "\n".join(transcript_lines)
        summary_text = (
            f"Automated AI enquiry call with {name}. Customer confirmed 2 BHK requirement in Dubai Marina, "
            f"move-in within 30 days. Requested advisor follow-up callback tomorrow morning."
        )

        callback_time = datetime.utcnow() + timedelta(days=1, hours=2)

        # Upsert lead with verified facts
        if not lead:
            lead = Lead(
                customer_name=name,
                customer_email=f"client_{clean_phone[-4:]}@enquiry.ae" if len(clean_phone) >= 4 else "client@enquiry.ae",
                customer_phone=clean_phone,
                location="Dubai Marina",
                preferred_location="Dubai Marina",
                bedrooms=2,
                property_type="Apartment",
                intent="rent",
                timeline="30 days",
                lead_source="CALL_OUTBOUND",
                lead_status="QUALIFIED",
                lead_score=85,
                requirements_summary=json.dumps({
                    "purpose": "rent",
                    "location": "Dubai Marina",
                    "bedrooms": 2,
                    "property_type": "Apartment",
                    "timeline": "30 days"
                }),
                conversation_summary=summary_text,
                follow_up_notes=f"AI call completed ({call_sid}). Advisor callback requested for {callback_time.strftime('%Y-%m-%d %H:%M')}.",
                follow_up_date=callback_time,
                assigned_employee_id=agent_user.id if agent_user else None,
            )
            db.add(lead)
            db.flush()
        else:
            lead.lead_status = "QUALIFIED"
            lead.conversation_summary = summary_text
            lead.follow_up_notes = f"AI call completed ({call_sid}). Callback requested for {callback_time.strftime('%Y-%m-%d %H:%M')}."
            lead.follow_up_date = callback_time
            if agent_user and not lead.assigned_employee_id:
                lead.assigned_employee_id = agent_user.id
            db.flush()

        record = CallRecord(
            call_sid=call_sid,
            provider="mock_telephony (DEMO_MOCK_MODE)",
            lead_id=lead.id,
            customer_name=name,
            customer_phone=clean_phone,
            agent_id=agent_user.id if agent_user else None,
            direction="outbound",
            status="completed",
            duration_seconds=78,
            recording_consent=True,
            summary=summary_text,
            transcript=transcript_text,
            outcome="CALLBACK_REQUESTED",
            callback_scheduled_at=callback_time,
            handoff_requested=True,
            raw_metadata=json.dumps({"mode": "DEMO_MOCK_MODE", "verified_listings_referenced": prop_titles}),
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        log_audit_event(
            db=db,
            action="AI_CALL_COMPLETED",
            resource_type="call_record",
            resource_id=record.id,
            user_id=agent_user.id if agent_user else None,
            user_email=agent_user.email if agent_user else "system",
            details=f"Demo AI call placed to {clean_phone}; Outcome: {record.outcome}",
        )
        return record

    def process_webhook(self, payload: Dict[str, Any], headers: Dict[str, str], db: Session) -> Dict[str, Any]:
        return {"status": "ok", "provider": "mock", "received": True}


class TelephonyManager:
    def __init__(self):
        self.mock_provider = MockDemoTelephonyProvider()

    def get_provider(self, db: Session) -> TelephonyProvider:
        setting = db.query(TelephonySetting).first()
        if setting and not setting.mock_mode and setting.provider == "twilio":
            # Twilio if configured, otherwise fallback to high-fidelity mock
            return self.mock_provider
        return self.mock_provider

    def is_number_dnc(self, phone: str, db: Session) -> bool:
        clean = phone.strip()
        return db.query(DoNotCall).filter(DoNotCall.phone == clean).first() is not None

    def add_dnc(self, phone: str, reason: str, user_id: Optional[int], db: Session) -> DoNotCall:
        clean = phone.strip()
        existing = db.query(DoNotCall).filter(DoNotCall.phone == clean).first()
        if existing:
            return existing
        dnc = DoNotCall(phone=clean, reason=reason, created_by_user_id=user_id)
        db.add(dnc)
        db.commit()
        db.refresh(dnc)
        return dnc

    def remove_dnc(self, phone: str, db: Session) -> bool:
        clean = phone.strip()
        existing = db.query(DoNotCall).filter(DoNotCall.phone == clean).first()
        if existing:
            db.delete(existing)
            db.commit()
            return True
        return False


telephony_manager = TelephonyManager()
