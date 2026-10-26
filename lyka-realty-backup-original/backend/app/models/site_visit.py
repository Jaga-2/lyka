from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from datetime import datetime
from ..database import Base

class SiteVisit(Base):
    __tablename__ = "site_visits"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"), index=True, nullable=False)
    user_id = Column(Integer, nullable=True)
    lead_id = Column(Integer, nullable=True, index=True)
    customer_name = Column(String(255), nullable=False)
    customer_email = Column(String(255), nullable=False)
    customer_phone = Column(String(50), nullable=False)
    preferred_date = Column(String(50), nullable=False)
    preferred_time = Column(String(50), nullable=False)
    notes = Column(Text, nullable=True)
    status = Column(String(50), default="REQUESTED", index=True) # REQUESTED, ASSIGNED, SCHEDULED, CONFIRMED, COMPLETED, CANCELLED, RESCHEDULED
    assigned_agent_id = Column(Integer, nullable=True)
    rescheduled_date = Column(String(50), nullable=True)
    rescheduled_time = Column(String(50), nullable=True)
    confirmation_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class HandoffRequest(Base):
    __tablename__ = "handoff_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True)
    customer_name = Column(String(255), nullable=False)
    customer_phone = Column(String(50), nullable=False, default="")
    customer_email = Column(String(255), nullable=True)
    requirement_summary = Column(Text, nullable=False)
    conversation_id = Column(String(100), nullable=True, index=True)
    lead_id = Column(Integer, nullable=True, index=True)
    interested_property_id = Column(Integer, nullable=True)
    preferred_language = Column(String(20), nullable=True)
    status = Column(String(50), default="PENDING")
    created_at = Column(DateTime, default=datetime.utcnow)
