from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Float
from datetime import datetime
from ..database import Base

class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String(100), primary_key=True)
    user_id = Column(Integer, nullable=True)
    context_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(String(100), ForeignKey("conversations.id"), index=True, nullable=False)
    role = Column(String(20), nullable=False) # user, assistant, system
    content = Column(Text, nullable=False)
    extracted_requirements = Column(Text, nullable=True) # JSON
    created_at = Column(DateTime, default=datetime.utcnow)

class CustomerRequirement(Base):
    __tablename__ = "customer_requirements"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True)
    conversation_id = Column(String(100), nullable=True)
    intent = Column(String(50), nullable=True)
    buy_or_rent = Column(String(50), nullable=True)
    location = Column(String(255), nullable=True)
    area = Column(String(255), nullable=True)
    property_type = Column(String(100), nullable=True)
    bedrooms = Column(Integer, nullable=True)
    bathrooms = Column(Integer, nullable=True)
    budget = Column(Float, nullable=True)
    currency = Column(String(10), default="AED")
    timeline = Column(String(100), nullable=True)
    purpose = Column(String(100), nullable=True)
    furnished = Column(Boolean, nullable=True)
    parking = Column(Boolean, nullable=True)
    amenities = Column(Text, nullable=True)
    investment_or_personal_use = Column(String(50), nullable=True)
    raw_json = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Shortlist(Base):
    __tablename__ = "shortlists"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
