from fastapi import Header, HTTPException
from .auth import decode_access_token
from .config import settings


def get_current_admin(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail='Falta token Bearer')

    token = authorization.replace('Bearer ', '', 1).strip()

    try:
        subject = decode_access_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    if subject != settings.admin_email:
        raise HTTPException(status_code=403, detail='Usuario no autorizado')

    return subject
