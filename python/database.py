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
    officer: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """
    Retrieve inspection records with optional company, status, officer, and date range filtering.
    """
    query = "SELECT * FROM inspections WHERE 1=1"
    params: List[Any] = []

    if company:
        query += " AND LOWER(company_name) LIKE LOWER(?)"
        params.append(f"%{company.strip()}%")

    if status:
        query += " AND UPPER(compliance_status) = UPPER(?)"
        params.append(status.strip())

    if officer:
        query += " AND LOWER(officer_name) LIKE LOWER(?)"
        params.append(f"%{officer.strip()}%")

    if start_date:
        query += " AND (created_at >= ? OR timestamp >= ?)"
        params.extend([start_date.strip(), start_date.strip()])

    if end_date:
        query += " AND (created_at <= ? OR timestamp <= ?)"
        params.extend([end_date.strip(), end_date.strip()])

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


def get_admin_analytics() -> Dict[str, Any]:
    """
    Compute inspection intelligence analytics across all stored records:
    - Overview counts (total, compliant, non-compliant, violations, average score)
    - Officer statistics (inspections, compliant, non-compliant, rate)
    - Most violated rules (counts, percentage, legal references)
    - Companies with most violations (inspections, violating inspections, total violations, compliance rate)
    - Location markers with valid latitude/longitude
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM inspections ORDER BY created_at DESC")
        rows = cursor.fetchall()

        total_inspections = len(rows)
        compliant_count = 0
        non_compliant_count = 0
        pending_secondary_count = 0
        unknown_count = 0

        total_violations_count = 0
        violating_inspections_count = 0

        valid_scores: List[float] = []

        officer_map: Dict[str, Dict[str, Any]] = {}
        company_map: Dict[str, Dict[str, Any]] = {}
        violation_counts: Dict[str, int] = {}
        locations: List[Dict[str, Any]] = []

        for r in rows:
            record = _row_to_dict(r)
            status_val = (record.get("compliance_status") or "UNKNOWN").upper()
            officer = record.get("officer_name") or "Officer #1042"
            raw_company = record.get("company_name")
            company = str(raw_company).strip() if raw_company else "Unbranded / Unknown"
            score_str = record.get("compliance_score")
            violations = record.get("violations") or []
            if not isinstance(violations, list):
                violations = []

            num_violations = len(violations)
            total_violations_count += num_violations
            if num_violations > 0 or status_val == "NON_COMPLIANT":
                violating_inspections_count += 1

            if status_val == "COMPLIANT":
                compliant_count += 1
            elif status_val == "NON_COMPLIANT":
                non_compliant_count += 1
            elif status_val == "PENDING_SECONDARY":
                pending_secondary_count += 1
            else:
                unknown_count += 1

            if score_str:
                clean_score = str(score_str).replace("%", "").strip()
                try:
                    valid_scores.append(float(clean_score))
                except ValueError:
                    pass
            elif status_val == "COMPLIANT":
                valid_scores.append(100.0)
            elif status_val == "NON_COMPLIANT":
                valid_scores.append(0.0)

            # Officer stats
            if officer not in officer_map:
                officer_map[officer] = {
                    "officer": officer,
                    "inspections": 0,
                    "compliant": 0,
                    "non_compliant": 0,
                }
            officer_map[officer]["inspections"] += 1
            if status_val == "COMPLIANT":
                officer_map[officer]["compliant"] += 1
            elif status_val == "NON_COMPLIANT":
                officer_map[officer]["non_compliant"] += 1

            # Company stats
            if company not in company_map:
                company_map[company] = {
                    "company": company,
                    "inspections": 0,
                    "violating_inspections": 0,
                    "violations": 0,
                    "compliant": 0,
                }
            company_map[company]["inspections"] += 1
            company_map[company]["violations"] += num_violations
            if num_violations > 0 or status_val == "NON_COMPLIANT":
                company_map[company]["violating_inspections"] += 1
            if status_val == "COMPLIANT":
                company_map[company]["compliant"] += 1

            # Violations count
            for v in violations:
                v_str = str(v).strip()
                if v_str:
                    violation_counts[v_str] = violation_counts.get(v_str, 0) + 1

            # Location markers
            lat = record.get("latitude")
            lng = record.get("longitude")
            if lat is not None and lng is not None:
                locations.append(
                    {
                        "id": record["id"],
                        "company_name": record.get("company_name") or "Unbranded",
                        "product_name": record.get("product_name") or "Unspecified Product",
                        "officer_name": officer,
                        "compliance_status": status_val,
                        "compliance_score": record.get("compliance_score"),
                        "latitude": lat,
                        "longitude": lng,
                        "timestamp": record.get("timestamp") or record.get("created_at"),
                        "violations_count": num_violations,
                    }
                )

        avg_score = (
            round(sum(valid_scores) / len(valid_scores), 1) if valid_scores else 0.0
        )

        officer_stats = []
        for o_data in officer_map.values():
            tot = o_data["inspections"]
            comp = o_data["compliant"]
            rate = round((comp / tot) * 100, 1) if tot > 0 else 0.0
            officer_stats.append(
                {
                    "officer": o_data["officer"],
                    "inspections": tot,
                    "compliant": comp,
                    "non_compliant": o_data["non_compliant"],
                    "compliance_rate": rate,
                }
            )
        officer_stats.sort(key=lambda x: x["inspections"], reverse=True)

        most_violated_rules = []
        for rule_name, count in violation_counts.items():
            pct = (
                round((count / total_violations_count) * 100, 1)
                if total_violations_count > 0
                else 0.0
            )
            most_violated_rules.append(
                {
                    "rule_name": rule_name,
                    "count": count,
                    "percentage": pct,
                }
            )
        most_violated_rules.sort(key=lambda x: x["count"], reverse=True)

        company_stats = []
        for c_data in company_map.values():
            tot = c_data["inspections"]
            comp = c_data["compliant"]
            rate = round((comp / tot) * 100, 1) if tot > 0 else 0.0
            company_stats.append(
                {
                    "company": c_data["company"],
                    "inspections": tot,
                    "violating_inspections": c_data["violating_inspections"],
                    "violations": c_data["violations"],
                    "compliance_rate": rate,
                }
            )
        company_stats.sort(
            key=lambda x: (x["violations"], x["violating_inspections"], x["inspections"]),
            reverse=True,
        )

        return {
            "overview": {
                "total_inspections": total_inspections,
                "compliant_inspections": compliant_count,
                "non_compliant_inspections": non_compliant_count,
                "pending_secondary_inspections": pending_secondary_count,
                "unknown_inspections": unknown_count,
                "total_violations": total_violations_count,
                "violating_inspections": violating_inspections_count,
                "average_compliance_score": avg_score,
            },
            "officer_statistics": officer_stats,
            "violation_intelligence": most_violated_rules,
            "company_statistics": company_stats,
            "locations": locations,
            "locations_with_coords_count": len(locations),
            "locations_without_coords_count": total_inspections - len(locations),
        }


def seed_demo_data_if_needed() -> None:
    """
    Seed realistic Indian demo inspection records if no demo records exist yet.
    Preserves all existing user-created inspections and tests multi-officer,
    multi-company, violation analytics, and GPS map markers.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM inspections WHERE id LIKE 'INSP-DEMO-%' LIMIT 1")
        if cursor.fetchone():
            return  # Already seeded

        demo_records = [
            {
                "id": "INSP-DEMO-001",
                "session_id": "demo-sess-001",
                "officer_name": "Inspector Chandru Narayanan",
                "timestamp": "2026-10-15T11:20:00Z",
                "company_name": "Hindustan Fast Foods Pvt Ltd",
                "product_name": "Spiced Potato Chips 150g",
                "product_category": "food",
                "latitude": 28.6328,
                "longitude": 77.2197,  # Connaught Place, New Delhi
                "compliance_status": "NON_COMPLIANT",
                "compliance_score": "67%",
                "extracted_data": json.dumps({"standard_fields": {"commodity_name": "Spiced Potato Chips", "manufacturer": "Hindustan Fast Foods Pvt Ltd"}}),
                "compliance_report": json.dumps({"is_compliant": False, "compliance_score": "67%", "product_category": "food"}),
                "violations": json.dumps(["Maximum Retail Price (MRP)", "Expiry / Use By / Best Before Date"]),
                "image_reference": "demo_chips_label.jpg",
                "created_at": "2026-10-15T11:20:00Z",
            },
            {
                "id": "INSP-DEMO-002",
                "session_id": "demo-sess-002",
                "officer_name": "Inspector Chandru Narayanan",
                "timestamp": "2026-10-15T14:45:00Z",
                "company_name": "Northern Dairies & Agro Ltd",
                "product_name": "Pasteurized Cow Milk 1L",
                "product_category": "food",
                "latitude": 28.5355,
                "longitude": 77.2610,  # Saket, New Delhi
                "compliance_status": "COMPLIANT",
                "compliance_score": "100%",
                "extracted_data": json.dumps({"standard_fields": {"commodity_name": "Pasteurized Cow Milk", "manufacturer": "Northern Dairies & Agro Ltd"}}),
                "compliance_report": json.dumps({"is_compliant": True, "compliance_score": "100%", "product_category": "food"}),
                "violations": json.dumps([]),
                "image_reference": "demo_milk_packet.jpg",
                "created_at": "2026-10-15T14:45:00Z",
            },
            {
                "id": "INSP-DEMO-003",
                "session_id": "demo-sess-003",
                "officer_name": "Inspector Fathima",
                "timestamp": "2026-10-16T09:15:00Z",
                "company_name": "Apex Personal Care Products",
                "product_name": "Herbal Hand Wash 250ml",
                "product_category": "cosmetics",
                "latitude": 19.0760,
                "longitude": 72.8777,  # Bandra, Mumbai
                "compliance_status": "NON_COMPLIANT",
                "compliance_score": "55%",
                "extracted_data": json.dumps({"standard_fields": {"commodity_name": "Herbal Hand Wash", "manufacturer": "Apex Personal Care Products"}}),
                "compliance_report": json.dumps({"is_compliant": False, "compliance_score": "55%", "product_category": "cosmetics"}),
                "violations": json.dumps(["Net Quantity / Weight / Volume", "Manufacturer / Packer / Importer Name & Address", "Consumer Care Contact (Name, Address, Phone/Email)"]),
                "image_reference": "demo_handwash.jpg",
                "created_at": "2026-10-16T09:15:00Z",
            },
            {
                "id": "INSP-DEMO-004",
                "session_id": "demo-sess-004",
                "officer_name": "Inspector Fathima",
                "timestamp": "2026-10-16T12:30:00Z",
                "company_name": "Maharashtra Confectioneries",
                "product_name": "Choco Cream Biscuits 120g",
                "product_category": "food",
                "latitude": 19.1136,
                "longitude": 72.8697,  # Andheri East, Mumbai
                "compliance_status": "NON_COMPLIANT",
                "compliance_score": "78%",
                "extracted_data": json.dumps({"standard_fields": {"commodity_name": "Choco Cream Biscuits", "manufacturer": "Maharashtra Confectioneries"}}),
                "compliance_report": json.dumps({"is_compliant": False, "compliance_score": "78%", "product_category": "food"}),
                "violations": json.dumps(["Batch / Lot / Code Number", "14-Digit FSSAI License Number"]),
                "image_reference": "demo_biscuit_pack.jpg",
                "created_at": "2026-10-16T12:30:00Z",
            },
            {
                "id": "INSP-DEMO-005",
                "session_id": "demo-sess-005",
                "officer_name": "Inspector Fathima",
                "timestamp": "2026-10-16T15:10:00Z",
                "company_name": "Western Beverages India",
                "product_name": "Sparkling Natural Mineral Water 750ml",
                "product_category": "beverage",
                "latitude": 18.9220,
                "longitude": 72.8347,  # Colaba, Mumbai
                "compliance_status": "COMPLIANT",
                "compliance_score": "100%",
                "extracted_data": json.dumps({"standard_fields": {"commodity_name": "Natural Mineral Water", "manufacturer": "Western Beverages India"}}),
                "compliance_report": json.dumps({"is_compliant": True, "compliance_score": "100%", "product_category": "beverage"}),
                "violations": json.dumps([]),
                "image_reference": "demo_water_bottle.jpg",
                "created_at": "2026-10-16T15:10:00Z",
            },
            {
                "id": "INSP-DEMO-006",
                "session_id": "demo-sess-006",
                "officer_name": "Inspector Subhaharini",
                "timestamp": "2026-10-17T08:30:00Z",
                "company_name": "Karnataka Spices & Condiments",
                "product_name": "Garam Masala Blend 100g",
                "product_category": "food",
                "latitude": 12.9716,
                "longitude": 77.5946,  # MG Road, Bengaluru
                "compliance_status": "NON_COMPLIANT",
                "compliance_score": "44%",
                "extracted_data": json.dumps({"standard_fields": {"commodity_name": "Garam Masala Blend", "manufacturer": "Karnataka Spices & Condiments"}}),
                "compliance_report": json.dumps({"is_compliant": False, "compliance_score": "44%", "product_category": "food"}),
                "violations": json.dumps(["Date of Manufacture / Packaging", "Expiry / Use By / Best Before Date", "Maximum Retail Price (MRP)", "Net Quantity / Weight / Volume"]),
                "image_reference": "demo_garam_masala.jpg",
                "created_at": "2026-10-17T08:30:00Z",
            },
            {
                "id": "INSP-DEMO-007",
                "session_id": "demo-sess-007",
                "officer_name": "Inspector Subhaharini",
                "timestamp": "2026-10-17T11:00:00Z",
                "company_name": "Southern Tea Processors Ltd",
                "product_name": "Nilgiri Premium Leaf Tea 250g",
                "product_category": "beverage",
                "latitude": 12.9352,
                "longitude": 77.6245,  # Koramangala, Bengaluru
                "compliance_status": "COMPLIANT",
                "compliance_score": "100%",
                "extracted_data": json.dumps({"standard_fields": {"commodity_name": "Nilgiri Premium Leaf Tea", "manufacturer": "Southern Tea Processors Ltd"}}),
                "compliance_report": json.dumps({"is_compliant": True, "compliance_score": "100%", "product_category": "beverage"}),
                "violations": json.dumps([]),
                "image_reference": "demo_tea_pack.jpg",
                "created_at": "2026-10-17T11:00:00Z",
            },
            {
                "id": "INSP-DEMO-008",
                "session_id": "demo-sess-008",
                "officer_name": "Inspector Subhaharini",
                "timestamp": "2026-10-17T13:40:00Z",
                "company_name": "Apex Personal Care Products",
                "product_name": "Glycerin Skin Moisturizer 200ml",
                "product_category": "cosmetics",
                "latitude": 13.0827,
                "longitude": 80.2707,  # T. Nagar, Chennai
                "compliance_status": "NON_COMPLIANT",
                "compliance_score": "60%",
                "extracted_data": json.dumps({"standard_fields": {"commodity_name": "Glycerin Skin Moisturizer", "manufacturer": "Apex Personal Care Products"}}),
                "compliance_report": json.dumps({"is_compliant": False, "compliance_score": "60%", "product_category": "cosmetics"}),
                "violations": json.dumps(["Manufacturer / Packer / Importer Name & Address", "Maximum Retail Price (MRP)"]),
                "image_reference": "demo_moisturizer.jpg",
                "created_at": "2026-10-17T13:40:00Z",
            },
        ]

        for d in demo_records:
            cursor.execute(
                """
                INSERT OR IGNORE INTO inspections (
                    id, session_id, officer_name, timestamp, company_name, product_name,
                    product_category, latitude, longitude, compliance_status, compliance_score,
                    extracted_data, compliance_report, violations, image_reference, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    d["id"],
                    d["session_id"],
                    d["officer_name"],
                    d["timestamp"],
                    d["company_name"],
                    d["product_name"],
                    d["product_category"],
                    d["latitude"],
                    d["longitude"],
                    d["compliance_status"],
                    d["compliance_score"],
                    d["extracted_data"],
                    d["compliance_report"],
                    d["violations"],
                    d["image_reference"],
                    d["created_at"],
                ),
            )
        conn.commit()

