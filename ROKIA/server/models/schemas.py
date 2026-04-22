from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# --- Auth ---
class LoginRequest(BaseModel):
    username: str
    password: str
    captcha_answer: int
    captcha_token: str


class LoginResponse(BaseModel):
    token: str
    username: str


class CaptchaResponse(BaseModel):
    question: str
    token: str


# --- Process ---
class ProcessRequest(BaseModel):
    client_name: str
    copil_date: str


class TicketResult(BaseModel):
    ticket_number: Optional[str] = None
    dit_no_interne: Optional[str] = None
    dit_etat: Optional[str] = None
    description: Optional[str] = None
    resolution: Optional[str] = None
    old_category: Optional[str] = None
    new_category: Optional[str] = None
    old_contract: Optional[str] = None
    new_contract: Optional[str] = None
    old_delay: Optional[str] = None
    new_delay: Optional[str] = None
    was_recategorized: bool = False
    ai_reasoning: Optional[str] = None


class AnalysisResponse(BaseModel):
    id: int
    client_name: str
    copil_date: str
    created_at: Optional[str] = None
    total_tickets: int = 0
    recategorized_count: int = 0
    status: str = "pending"
    error_message: Optional[str] = None
    results: Optional[List[TicketResult]] = None


class AnalysisSummary(BaseModel):
    id: int
    client_name: str
    copil_date: str
    created_at: Optional[str] = None
    total_tickets: int = 0
    recategorized_count: int = 0
    status: str = "pending"


class HistoryResponse(BaseModel):
    analyses: List[AnalysisSummary]
