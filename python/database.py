import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# Place SQLite database in the python/ directory alongside the backend files
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "inspections.db")


class DuplicateInspectionError(Exception):
    def __init__(self, message: str, existing_id: str):
        super().__init__(message)
        self.existing_id = existing_id


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10.0)
    conn.row_factory = sqlite3.Row
    # Enable WAL mode for concurrency and foreign keys
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def init_db() -> None:
    """Create the inspections table and indexes if they do not already exist."""
    with get_db_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS inspections (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                officer_name TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                company_name TEXT,
                product_name TEXT,
                product_category TEXT,
                latitude REAL,
                longitude REAL,
                compliance_status TEXT NOT NULL,
                compliance_score TEXT,
                extracted_data TEXT NOT NULL,
                compliance_report TEXT NOT NULL,
                violations TEXT NOT NULL,
                image_reference TEXT,
                created_at TEXT NOT NULL
            );
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_inspections_company ON inspections(company_name);"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections(compliance_status);"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_inspections_created_at ON inspections(created_at DESC);"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_inspections_session ON inspections(session_id);"
        )
        conn.commit()


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    """Convert an SQLite Row to an inspection dictionary with JSON fields deserialized."""
    d = dict(row)
    # Parse JSON fields safely
    for json_field in ("extracted_data", "compliance_report", "violations"):
        raw_val = d.get(json_field)
        if isinstance(raw_val, str):
            try:
                d[json_field] = json.loads(raw_val)
            except Exception:
                d[json_field] = [] if json_field == "violations" else {}
        elif raw_val is None:
            d[json_field] = [] if json_field == "violations" else {}

    # Mirror both 'id' and 'inspection_id' for consumer convenience
    d["inspection_id"] = d["id"]
    return d


def create_inspection(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Persist a new inspection record into SQLite.
    Prevents duplicate saves if session_id or id already exists.
    """
    inspection_id = data.get("inspection_id") or data.get("id")
    if not inspection_id:
        date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
        unique_token = uuid.uuid4().hex[:8].upper()
        inspection_id = f"INSP-{date_str}-{unique_token}"

    session_id = data.get("session_id")
    officer_name = data.get("officer_name") or "Officer #1042"
    timestamp = data.get("timestamp") or datetime.now(timezone.utc).isoformat()
    company_name = data.get("company_name")
    product_name = data.get("product_name")
    product_category = data.get("product_category")
    latitude = data.get("latitude")
    longitude = data.get("longitude")
    compliance_status = data.get("compliance_status") or "UNKNOWN"
    compliance_score = data.get("compliance_score")
    image_reference = data.get("image_reference")
    created_at = datetime.now(timezone.utc).isoformat()

    extracted_data = data.get("extracted_data") or {}
    compliance_report = data.get("compliance_report") or {}
    violations = data.get("violations") or []

    # Serialize JSON fields
    extracted_data_json = json.dumps(extracted_data)
    compliance_report_json = json.dumps(compliance_report)
    violations_json = json.dumps(violations)

    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Check for duplicate session_id if provided
        if session_id:
            cursor.execute(
                "SELECT id FROM inspections WHERE session_id = ? LIMIT 1",
                (session_id,),
            )
            existing = cursor.fetchone()
            if existing:
                raise DuplicateInspectionError(
                    f"An inspection record for this analysis session already exists with ID: {existing['id']}",
                    existing_id=existing["id"],
                )

        # Check for duplicate id
        cursor.execute("SELECT id FROM inspections WHERE id = ? LIMIT 1", (inspection_id,))
        existing_id_row = cursor.fetchone()
        if existing_id_row:
            raise DuplicateInspectionError(
                f"An inspection with ID {inspection_id} already exists.",
                existing_id=inspection_id,
            )

        cursor.execute(
            """
            INSERT INTO inspections (
                id,
                session_id,
                officer_name,
                timestamp,
                company_name,
                product_name,
                product_category,
                latitude,
                longitude,
                compliance_status,
                compliance_score,
                extracted_data,
                compliance_report,
                violations,
                image_reference,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                inspection_id,
                session_id,
                officer_name,
                timestamp,
                company_name,
                product_name,
                product_category,
                latitude,
                longitude,
                compliance_status,
                compliance_score,
                extracted_data_json,
                compliance_report_json,
                violations_json,
                image_reference,
                created_at,
            ),
        )
        conn.commit()

        cursor.execute("SELECT * FROM inspections WHERE id = ?", (inspection_id,))
        row = cursor.fetchone()
        return _row_to_dict(row)


def get_inspections(
    company: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """
    Retrieve inspection records with optional company and status filtering.
    """
    query = "SELECT * FROM inspections WHERE 1=1"
    params: List[Any] = []

    if company:
        query += " AND LOWER(company_name) LIKE LOWER(?)"
        params.append(f"%{company.strip()}%")

    if status:
        query += " AND UPPER(compliance_status) = UPPER(?)"
        params.append(status.strip())

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [_row_to_dict(r) for r in rows]


def get_inspection_by_id(inspection_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve a single inspection record in detail by its ID.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM inspections WHERE id = ?", (inspection_id,))
        row = cursor.fetchone()
        if not row:
            return None
        return _row_to_dict(row)
