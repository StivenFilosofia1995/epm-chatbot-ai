from fastapi import APIRouter, HTTPException
from ..schemas import LoginInput, TokenOutput
from ..config import settings
from ..auth import create_access_token


router = APIRouter(prefix='/auth', tags=['auth'])


@router.post('/login', response_model=TokenOutput)
def login(data: LoginInput) -> TokenOutput:
    if data.email != settings.admin_email or data.password != settings.admin_password:
        raise HTTPException(status_code=401, detail='Credenciales inválidas')

    token = create_access_token(data.email)
    return TokenOutput(access_token=token)
