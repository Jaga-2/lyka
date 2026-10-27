from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Literal, Optional

class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str
    phone: Optional[str] = None

class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    expected_role: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    phone: Optional[str] = None
    role: str
    is_active: bool = True

    model_config = ConfigDict(from_attributes=True)

class TokenResponse(BaseModel):
    user: UserResponse
    access_token: Optional[str] = None
    token_type: Optional[str] = "bearer"
    csrf_token: Optional[str] = None


class EmployeeCreateRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str
    phone: Optional[str] = None
    role: Optional[str] = "sales_agent"


class UserRoleUpdateRequest(BaseModel):
    role: Literal["customer", "employee", "sales_agent", "manager", "admin", "super_admin"]


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
