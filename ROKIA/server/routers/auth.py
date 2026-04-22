from fastapi import APIRouter, HTTPException
from server.models.schemas import LoginRequest, LoginResponse, CaptchaResponse
from server.services.auth_service import (
    authenticate_user, create_access_token,
    generate_captcha, verify_captcha
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/captcha", response_model=CaptchaResponse)
async def get_captcha():
    """Generate a new math CAPTCHA."""
    captcha = generate_captcha()
    return CaptchaResponse(
        question=captcha["question"],
        token=captcha["token"]
    )


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """Authenticate user with username, password, and CAPTCHA."""
    # Verify CAPTCHA first
    if not verify_captcha(request.captcha_answer, request.captcha_token):
        raise HTTPException(status_code=400, detail="CAPTCHA incorrect ou expiré")

    # Verify credentials
    if not authenticate_user(request.username, request.password):
        raise HTTPException(status_code=401, detail="Identifiants incorrects")

    # Create JWT token
    token = create_access_token(request.username)
    return LoginResponse(token=token, username=request.username)
