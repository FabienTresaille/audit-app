import logging
from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from server.config import PUBLIC_DIR
from server.database import init_db
from server.services.auth_service import verify_access_token
from server.routers import auth, upload, process, export, history

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="ROKIA",
    description="Outil de recatégorisation de tickets support par IA",
    version="1.0.0"
)

# Initialize database on startup
@app.on_event("startup")
async def startup():
    init_db()
    logger.info("ROKIA started successfully")


# JWT Authentication middleware
UNPROTECTED_PATHS = {
    "/api/auth/captcha",
    "/api/auth/login",
}

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path

    # Allow static files and unprotected API routes
    if not path.startswith("/api/") or path in UNPROTECTED_PATHS:
        return await call_next(request)

    # Check JWT token
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(status_code=401, content={"detail": "Non authentifié"})

    token = auth_header.split(" ", 1)[1]
    payload = verify_access_token(token)
    if payload is None:
        return JSONResponse(status_code=401, content={"detail": "Token invalide ou expiré"})

    # Attach user info to request state
    request.state.user = payload.get("sub")
    return await call_next(request)


# Include routers
app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(process.router)
app.include_router(export.router)
app.include_router(history.router)

# Serve static files
app.mount("/static", StaticFiles(directory=PUBLIC_DIR), name="static")


# Serve login page
@app.get("/")
async def serve_login():
    return FileResponse(f"{PUBLIC_DIR}/index.html")


# Serve app page
@app.get("/app")
async def serve_app():
    return FileResponse(f"{PUBLIC_DIR}/app.html")
