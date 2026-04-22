import os
from dotenv import load_dotenv

load_dotenv()

# --- Gemini ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# --- Auth ---
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# --- Processing ---
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "25"))
MAX_ROWS = 1000

# --- Paths ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_DIR = os.path.join(BASE_DIR, "db")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
PUBLIC_DIR = os.path.join(os.path.dirname(BASE_DIR), "public")
DB_PATH = os.path.join(DB_DIR, "rokia.db")
REFERENCE_PATH = os.path.join(DATA_DIR, "rokia_reference.xlsx")

# Ensure directories exist
for d in [DATA_DIR, DB_DIR, UPLOAD_DIR]:
    os.makedirs(d, exist_ok=True)
