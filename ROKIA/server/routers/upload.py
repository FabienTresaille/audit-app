import os
import shutil
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from server.config import REFERENCE_PATH, UPLOAD_DIR
from server.services.xlsx_parser import parse_reference

router = APIRouter(prefix="/api", tags=["upload"])


@router.post("/reference")
async def upload_reference(file: UploadFile = File(...)):
    """Upload the ROKIA reference file (categories + contracts)."""
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Le fichier doit être au format .xlsx")

    try:
        with open(REFERENCE_PATH, "wb") as f:
            content = await file.read()
            f.write(content)

        # Validate the file by parsing it
        ref = parse_reference(REFERENCE_PATH)

        return {
            "status": "ok",
            "message": "Fichier référentiel chargé avec succès",
            "categories_count": len(ref['categories']),
            "contracts_count": len(ref['contracts']),
        }
    except Exception as e:
        # Clean up on error
        if os.path.exists(REFERENCE_PATH):
            os.remove(REFERENCE_PATH)
        raise HTTPException(status_code=400, detail=f"Erreur lors du traitement: {str(e)}")


@router.get("/reference/status")
async def reference_status():
    """Check if the reference file is loaded."""
    if os.path.exists(REFERENCE_PATH):
        try:
            ref = parse_reference(REFERENCE_PATH)
            return {
                "loaded": True,
                "categories_count": len(ref['categories']),
                "contracts_count": len(ref['contracts']),
            }
        except Exception:
            return {"loaded": False}
    return {"loaded": False}


@router.post("/tickets")
async def upload_tickets(file: UploadFile = File(...)):
    """Upload a ticket file for processing."""
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Le fichier doit être au format .xlsx")

    # Save with a unique name
    import uuid
    file_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.xlsx")

    try:
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)

        return {
            "status": "ok",
            "file_id": file_id,
            "filename": file.filename,
        }
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")
