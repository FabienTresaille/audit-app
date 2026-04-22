from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from server.database import get_db
from server.services.xlsx_parser import generate_result_xlsx

router = APIRouter(prefix="/api", tags=["export"])


@router.get("/export/{analysis_id}")
async def export_xlsx(analysis_id: int):
    """Export analysis results as an xlsx file."""
    db = get_db()

    analysis = db.execute("SELECT * FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
    if not analysis:
        db.close()
        raise HTTPException(404, "Analyse introuvable")

    if analysis["status"] != "completed":
        db.close()
        raise HTTPException(400, "L'analyse n'est pas terminée")

    rows = db.execute(
        "SELECT * FROM ticket_results WHERE analysis_id = ? ORDER BY id", (analysis_id,)
    ).fetchall()
    db.close()

    results = [dict(r) for r in rows]
    for r in results:
        r['was_recategorized'] = bool(r.get('was_recategorized', 0))

    # Identify recurring issues
    from collections import Counter
    cat_counter = Counter()
    cat_tickets = {}
    for r in results:
        cat = r.get('new_category', '')
        if cat:
            cat_counter[cat] += 1
            cat_tickets.setdefault(cat, []).append(r['ticket_number'] or '')

    recurring = [
        {'category': cat, 'count': count,
         'tickets': ', '.join(cat_tickets[cat][:20]),
         'detail': f"Apparaît dans {count} tickets."}
        for cat, count in cat_counter.most_common() if count >= 2
    ]

    xlsx_bytes = generate_result_xlsx(
        results, recurring,
        client_name=analysis["client_name"],
        copil_date=analysis["copil_date"]
    )

    filename = f"ROKIA_{analysis['client_name']}_{analysis['copil_date']}.xlsx"
    filename = filename.replace(" ", "_")

    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
