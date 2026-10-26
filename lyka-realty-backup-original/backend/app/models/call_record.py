from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from datetime import datetime
from ..database import Base

class CallRecord(Base):
    __tablename__ = "call_records"

    id = Column(Integer, primary_key=True, index=True)
    call_sid = Column(String(100), unique=True, index=True, nullable=False)
    provider = Column(String(50), nullable=False, default="mock_telephony")
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=True, index=True)
    customer_name = Column(String(255), nullable=True)
    customer_phone = Column(String(50), nullable=False, index=True)
    agent_id = Column(Integer, nullable=True)
    direction = Column(String(20), nullable=False, default="outbound") # inbound, outbound
    status = Column(String(50), nullable=False, default="initiated", index=True) # initiated, ringing, in_progress, completed, failed, busy, no_answer
    duration_seconds = Column(Integer, default=0)
    recording_consent = Column(Boolean, default=False)
    summary = Column(Text, nullable=True)
    transcript = Column(Text, nullable=True)
    outcome = Column(String(100), nullable=True, index=True) # QUALIFIED, CALLBACK_REQUESTED, NOT_INTERESTED, HANDOFF_REQUESTED, WRONG_NUMBER, VOICEMAIL
    callback_scheduled_at = Column(DateTime, nullable=True)
    handoff_requested = Column(Boolean, default=False)
    raw_metadata = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
