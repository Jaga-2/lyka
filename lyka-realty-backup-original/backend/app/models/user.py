from sqlalchemy import Boolean, Column, Integer, String, DateTime
from datetime import datetime
from ..database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=True)
    role = Column(String(50), default="customer", nullable=False) # customer, employee, admin
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
