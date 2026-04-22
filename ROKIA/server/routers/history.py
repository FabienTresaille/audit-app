from fastapi import APIRouter, HTTPException
from server.database import get_db

router = APIRouter(prefix="/api", tags=["history"])


@router.get("/history")
async def get_history():
    """Get all analyses grouped by client."""
    db = get_db()
    rows = db.execute(
        "SELECT id, client_name, copil_date, created_at, total_tickets, "
        "recategorized_count, status FROM analyses ORDER BY created_at DESC"
    ).fetchall()
    db.close()

    # Group by client
    clients = {}
    for r in rows:
        name = r["client_name"]
        if name not in clients:
            clients[name] = []
        clients[name].append({
            "id": r["id"],
            "client_name": r["client_name"],
            "copil_date": r["copil_date"],
            "created_at": r["created_at"],
            "total_tickets": r["total_tickets"],
            "recategorized_count": r["recategorized_count"],
            "status": r["status"],
        })

    return {"clients": clients}


@router.delete("/history/{analysis_id}")
async def delete_analysis(analysis_id: int):
    """Delete an analysis and its results."""
    db = get_db()

    analysis = db.execute("SELECT id FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
    if not analysis:
        db.close()
        raise HTTPException(404, "Analyse introuvable")

    db.execute("DELETE FROM ticket_results WHERE analysis_id = ?", (analysis_id,))
    db.execute("DELETE FROM analyses WHERE id = ?", (analysis_id,))
    db.commit()
    db.close()

    return {"status": "ok", "message": "Analyse supprimée"}
