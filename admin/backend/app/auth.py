from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from .config import settings


ALGORITHM = 'HS256'


def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {'sub': subject, 'exp': expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_access_token(token: str) -> str:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise ValueError('Token inválido') from exc

    sub = payload.get('sub')
    if not sub:
        raise ValueError('Token sin sujeto')
    return sub
