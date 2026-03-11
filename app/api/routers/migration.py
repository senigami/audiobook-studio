from fastapi import APIRouter
from fastapi.responses import JSONResponse
from ...db import migrate_state_json_to_db

router = APIRouter(prefix="/api/migration", tags=["migration"])

@router.post("/import_legacy")
def api_import_legacy_migration():
    migrate_state_json_to_db()
    return JSONResponse({"status": "success"})
