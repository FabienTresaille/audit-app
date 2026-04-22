import random
import time
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext
from server.config import (
    ADMIN_USERNAME, ADMIN_PASSWORD,
    JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRATION_HOURS
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Pre-hash the admin password on startup
_admin_password_hash = pwd_context.hash(ADMIN_PASSWORD)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def authenticate_user(username: str, password: str) -> bool:
    """Authenticate user against admin credentials."""
    if username != ADMIN_USERNAME:
        return False
    return verify_password(password, _admin_password_hash)


def create_access_token(username: str) -> str:
    """Create a JWT access token."""
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    to_encode = {
        "sub": username,
        "exp": expire,
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_access_token(token: str) -> dict | None:
    """Verify and decode a JWT token. Returns payload or None."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username = payload.get("sub")
        if username is None:
            return None
        return payload
    except JWTError:
        return None


def generate_captcha() -> dict:
    """Generate a math CAPTCHA.
    Returns: {question: str, answer: int, token: str}
    """
    operators = [
        ("+", lambda a, b: a + b),
        ("-", lambda a, b: a - b),
        ("×", lambda a, b: a * b),
    ]

    op_symbol, op_func = random.choice(operators)

    if op_symbol == "×":
        a = random.randint(2, 9)
        b = random.randint(2, 9)
    elif op_symbol == "-":
        a = random.randint(10, 50)
        b = random.randint(1, a)  # Ensure positive result
    else:
        a = random.randint(5, 50)
        b = random.randint(5, 50)

    answer = op_func(a, b)
    question = f"{a} {op_symbol} {b} = ?"

    # Create a signed token containing the answer and expiry
    token_data = {
        "answer": answer,
        "exp": int(time.time()) + 300  # 5 min expiry
    }
    token_json = json.dumps(token_data, sort_keys=True)
    signature = hmac.new(
        JWT_SECRET.encode(), token_json.encode(), hashlib.sha256
    ).hexdigest()
    token = f"{token_json}|{signature}"

    return {
        "question": question,
        "answer": answer,
        "token": token
    }


def verify_captcha(answer: int, token: str) -> bool:
    """Verify a CAPTCHA answer against its token."""
    try:
        parts = token.split("|")
        if len(parts) != 2:
            return False

        token_json, signature = parts

        # Verify signature
        expected_sig = hmac.new(
            JWT_SECRET.encode(), token_json.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected_sig):
            return False

        # Verify expiry and answer
        token_data = json.loads(token_json)
        if int(time.time()) > token_data.get("exp", 0):
            return False

        return answer == token_data.get("answer")
    except Exception:
        return False
