from sqlalchemy import Boolean, Column, Integer, String, Float, Text
from ..database import Base

class Property(Base):
    __tablename__ = "properties"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), nullable=False)
    address = Column(String(1000), nullable=False)
    location = Column(String(255), index=True, nullable=False)
    city = Column(String(100), index=True, default="Dubai")
    rent_price = Column(Float, index=True, default=0.0)
    sale_price = Column(Float, nullable=True, index=True)
    currency = Column(String(10), default="AED")
    beds = Column(Integer, index=True, default=1)
    baths = Column(Integer, default=1)
    property_type = Column(String(100), index=True, default="Apartment")
    area_sqft = Column(Float, default=0.0)
    rent_per_sqft = Column(Float, nullable=True)
    rent_category = Column(String(50), nullable=True)
    frequency = Column(String(50), default="Yearly")
    furnishing = Column(String(50), index=True, default="Unfurnished")
    purpose = Column(String(50), index=True, default="For Sale")
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    amenities = Column(Text, default="")
    images = Column(Text, default="")
    posted_date = Column(String(50), nullable=True)
    age_days = Column(Integer, nullable=True)
    investment_yield = Column(Float, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
