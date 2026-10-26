from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime
from datetime import datetime
from ..database import Base

class DoNotCall(Base):
    __tablename__ = "do_not_call_numbers"

    id = Column(Integer, primary_key=True, index=True)
    phone = Column(String(50), unique=True, index=True, nullable=False)
    reason = Column(String(255), nullable=True)
    created_by_user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class TelephonySetting(Base):
    __tablename__ = "telephony_settings"

    id = Column(Integer, primary_key=True)
    provider = Column(String(50), default="mock") # mock, twilio, retell
    is_enabled = Column(Boolean, default=True)
    mock_mode = Column(Boolean, default=True)
    daily_call_limit = Column(Integer, default=100)
    max_concurrency = Column(Integer, default=3)
    monthly_budget_usd = Column(Float, default=50.0)
    api_endpoint = Column(String(255), nullable=True)
    webhook_secret = Column(String(255), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
