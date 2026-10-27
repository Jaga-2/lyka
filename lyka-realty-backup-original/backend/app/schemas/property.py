from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List

class PropertyResponse(BaseModel):
    id: int
    title: str
    address: str
    location: str
    city: str
    rent_price: float
    sale_price: Optional[float] = None
    currency: str
    beds: int
    baths: int
    property_type: str
    area_sqft: float
    rent_per_sqft: Optional[float] = None
    furnishing: str
    purpose: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    amenities: List[str]
    images: List[str]
    match_score: Optional[int] = None
    match_reasons: Optional[List[str]] = None
    investment_yield: Optional[float] = None
    is_active: bool = True

    model_config = ConfigDict(from_attributes=True)

class PropertySearchRequest(BaseModel):
    query: Optional[str] = None
    location: Optional[str] = None
    city: Optional[str] = None
    beds: Optional[int] = None
    baths: Optional[int] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    property_type: Optional[str] = None
    furnishing: Optional[str] = None
    purpose: Optional[str] = None
    sort_by: Optional[str] = "price_asc"
    limit: Optional[int] = 30
    offset: Optional[int] = 0

class PropertySearchResponse(BaseModel):
    properties: List[PropertyResponse]
    total: int
    page: int
    limit: int

class PropertyCompareRequest(BaseModel):
    property_ids: List[int]
    priorities: Optional[List[str]] = None

class PropertyCompareResponse(BaseModel):
    properties: List[PropertyResponse]
    comparison_summary: str
    recommendation: str
    pros_cons: dict

class AdminPropertiesListResponse(BaseModel):
    properties: List[PropertyResponse]
    total: int
    limit: int
    offset: int


class PropertyAdminUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    address: Optional[str] = Field(default=None, min_length=1, max_length=1000)
    location: Optional[str] = Field(default=None, min_length=1, max_length=255)
    city: Optional[str] = Field(default=None, min_length=1, max_length=100)
    rent_price: Optional[float] = Field(default=None, ge=0)
    sale_price: Optional[float] = Field(default=None, ge=0)
    beds: Optional[int] = Field(default=None, ge=0)
    baths: Optional[int] = Field(default=None, ge=0)
    property_type: Optional[str] = Field(default=None, min_length=1, max_length=100)
    area_sqft: Optional[float] = Field(default=None, ge=0)
    furnishing: Optional[str] = Field(default=None, max_length=50)
    purpose: Optional[str] = Field(default=None, max_length=50)
