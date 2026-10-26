from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from .property import PropertyResponse

class ExtractedRequirementsSchema(BaseModel):
    intent: Optional[str] = None # buy, rent, invest
    buy_or_rent: Optional[str] = None
    location: Optional[str] = None
    area: Optional[str] = None
    property_type: Optional[str] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    budget: Optional[float] = None
    currency: Optional[str] = "AED"
    timeline: Optional[str] = None
    purpose: Optional[str] = None
    furnished: Optional[bool] = None
    parking: Optional[bool] = None
    amenities: Optional[List[str]] = None
    family_size: Optional[int] = None
    financing: Optional[bool] = None
    investment_or_personal_use: Optional[str] = None

class AIChatHistoryItem(BaseModel):
    role: str
    content: str

class AIChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    history: Optional[List[AIChatHistoryItem]] = []
    requirements: Optional[Dict[str, Any]] = {}
    selected_property_id: Optional[int] = None
    synthesize_audio: bool = False
    stream: Optional[bool] = False

class AIChatResponse(BaseModel):
    response: str
    conversation_id: str
    properties: List[PropertyResponse] = []
    extracted_requirements: Dict[str, Any] = {}
    action_type: str = "general" # search, compare, schedule_visit, handoff, general
    audio_base64: Optional[str] = None
    language: str = "en"
    audio_error: Optional[str] = None
