from pydantic import BaseModel, Field
from typing import Optional


class LoginInput(BaseModel):
    email: str
    password: str


class TokenOutput(BaseModel):
    access_token: str
    token_type: str = 'bearer'


class ScheduleItem(BaseModel):
    uva_nombre: str
    fecha: str
    hora_inicio: Optional[str] = None
    hora_fin: Optional[str] = None
    actividad: str
    descripcion: Optional[str] = None
    edad_recomendada: Optional[str] = None


class ReplaceMonthInput(BaseModel):
    year: int = Field(ge=2024, le=2100)
    month: int = Field(ge=1, le=12)


class SessionResetInput(BaseModel):
    session_id: str
