import os
import json
import asyncio
import logging
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from server.config import UPLOAD_DIR, REFERENCE_PATH
from server.database import get_db
from server.services.classifier import process_tickets

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["process"])

# Store progress info in memory (per analysis)
_progress_store = {}


@router.post("/process")
async def start_processing(
    client_name: str,
    copil_date: str,
    file_id: str,
    background_tasks: BackgroundTasks
):
    """Start ticket processing."""
    # Verify reference file exists
    if not os.path.exists(REFERENCE_PATH):
        raise HTTPException(400, "Veuillez d'abord charger le fichier référentiel ROKIA")

    # Verify ticket file exists
    ticket_path = os.path.join(UPLOAD_DIR, f"{file_id}.xlsx")
    if not os.path.exists(ticket_path):
        raise HTTPException(400, "Fichier de tickets introuvable")

    # Create analysis record
    db = get_db()
    cursor = db.execute(
        "INSERT INTO analyses (client_name, copil_date, status) VALUES (?, ?, 'pending')",
        (client_name, copil_date)
    )
    analysis_id = cursor.lastrowid
    db.commit()
    db.close()

    # Initialize progress
    _progress_store[analysis_id] = {"processed": 0, "total": 0, "status": "starting"}

    # Start background processing
    background_tasks.add_task(_run_processing, analysis_id, ticket_path)

    return {"analysis_id": analysis_id, "status": "started"}


async def _run_processing(analysis_id: int, ticket_path: str):
    """Background task for ticket processing."""
    async def progress_cb(processed, total):
        _progress_store[analysis_id] = {
            "processed": processed, "total": total, "status": "processing"
        }

    try:
        result = await process_tickets(analysis_id, ticket_path, progress_cb)
        _progress_store[analysis_id] = {
            "processed": result['total'],
            "total": result['total'],
            "status": "completed",
            "recategorized": result['recategorized']
        }
    except Exception as e:
        logger.error(f"Processing error: {e}")
        _progress_store[analysis_id] = {"status": "error", "error": str(e)}


@router.get("/process/{analysis_id}/progress")
async def get_progress(analysis_id: int):
    """SSE endpoint for real-time progress."""
    async def event_stream():
        while True:
            progress = _progress_store.get(analysis_id, {"status": "unknown"})
            yield f"data: {json.dumps(progress)}\n\n"

            if progress.get("status") in ("completed", "error"):
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/process/{analysis_id}/results")
async def get_results(analysis_id: int):
    """Get full results for an analysis."""
    db = get_db()

    analysis = db.execute("SELECT * FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
    if not analysis:
        db.close()
        raise HTTPException(404, "Analyse introuvable")

    rows = db.execute(
        "SELECT * FROM ticket_results WHERE analysis_id = ? ORDER BY id", (analysis_id,)
    ).fetchall()
    db.close()

    results = []
    for r in rows:
        results.append({
            "ticket_number": r["ticket_number"],
            "dit_no_interne": r["dit_no_interne"],
            "dit_etat": r["dit_etat"],
            "description": r["description"],
            "resolution": r["resolution"],
            "old_category": r["old_category"],
            "new_category": r["new_category"],
            "old_contract": r["old_contract"],
            "new_contract": r["new_contract"],
            "old_delay": r["old_delay"],
            "new_delay": r["new_delay"],
            "was_recategorized": bool(r["was_recategorized"]),
            "ai_reasoning": r["ai_reasoning"],
        })

    return {
        "id": analysis["id"],
        "client_name": analysis["client_name"],
        "copil_date": analysis["copil_date"],
        "created_at": analysis["created_at"],
        "total_tickets": analysis["total_tickets"],
        "recategorized_count": analysis["recategorized_count"],
        "status": analysis["status"],
        "results": results,
    }
