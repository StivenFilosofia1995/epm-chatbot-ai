from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    supabase_url: str
    supabase_service_key: str

    admin_email: str
    admin_password: str

    jwt_secret: str
    jwt_expire_minutes: int = 480

    frontend_origin: str = 'http://localhost:5173'
    bot_api_base_url: str = 'http://localhost:3000/wa'
    bot_admin_api_key: str = ''
    tesseract_cmd: str = 'C:/Program Files/Tesseract-OCR/tesseract.exe'
    tesseract_tessdata_dir: str = './tessdata'


settings = Settings()
