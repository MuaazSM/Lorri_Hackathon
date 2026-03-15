"""
File Upload Endpoint — CSV/Excel shipment and vehicle ingestion.

Accepts CSV or XLSX files containing shipment data, parses them into
the internal schema, validates each row, saves valid records to the
database, and returns a summary with any errors.

Supports flexible column naming — maps common variations like
"Weight (kg)", "weight_kg", "WEIGHT" all to the internal "weight" field.

Also supports vehicle file upload and auto-fleet generation when
no vehicle file is provided.

Endpoints:
    POST /upload/shipments  — Upload shipment CSV/XLSX
    POST /upload/vehicles   — Upload vehicle CSV/XLSX
    POST /upload/auto-fleet — Auto-generate fleet based on shipment data
"""

import csv
import io
import json
from typing import List, Dict, Optional, Tuple
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Query, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.models.shipment import Shipment, PriorityEnum, StatusEnum
from backend.app.models.vehicle import Vehicle

router = APIRouter()


# ---------------------------------------------------------------------------
# Column mapping — handles common naming variations
# ---------------------------------------------------------------------------

SHIPMENT_COLUMN_MAP = {
    # shipment_id
    "shipment_id": "shipment_id",
    "id": "shipment_id",
    "shipment id": "shipment_id",
    "shipment": "shipment_id",
    "sid": "shipment_id",
    "s_id": "shipment_id",

    # origin
    "origin": "origin",
    "from": "origin",
    "source": "origin",
    "pickup_city": "origin",
    "pickup city": "origin",
    "origin_city": "origin",
    "from_city": "origin",

    # destination
    "destination": "destination",
    "to": "destination",
    "dest": "destination",
    "delivery_city": "destination",
    "delivery city": "destination",
    "destination_city": "destination",
    "to_city": "destination",

    # pickup_time
    "pickup_time": "pickup_time",
    "pickup time": "pickup_time",
    "pickup": "pickup_time",
    "pickup_date": "pickup_time",
    "pickup date": "pickup_time",
    "ready_time": "pickup_time",
    "ready time": "pickup_time",
    "start_time": "pickup_time",

    # delivery_time
    "delivery_time": "delivery_time",
    "delivery time": "delivery_time",
    "delivery": "delivery_time",
    "delivery_date": "delivery_time",
    "delivery date": "delivery_time",
    "due_time": "delivery_time",
    "due time": "delivery_time",
    "deadline": "delivery_time",
    "end_time": "delivery_time",

    # weight
    "weight": "weight",
    "weight_kg": "weight",
    "weight (kg)": "weight",
    "weight(kg)": "weight",
    "wt": "weight",
    "mass": "weight",
    "load_weight": "weight",

    # volume
    "volume": "volume",
    "volume_m3": "volume",
    "volume (m3)": "volume",
    "volume(m3)": "volume",
    "vol": "volume",
    "cbm": "volume",
    "cubic_meters": "volume",

    # priority
    "priority": "priority",
    "prio": "priority",
    "urgency": "priority",
    "shipment_priority": "priority",

    # special_handling
    "special_handling": "special_handling",
    "special handling": "special_handling",
    "handling": "special_handling",
    "cargo_type": "special_handling",
    "cargo type": "special_handling",
    "type": "special_handling",
}

VEHICLE_COLUMN_MAP = {
    "vehicle_id": "vehicle_id",
    "id": "vehicle_id",
    "vid": "vehicle_id",
    "truck_id": "vehicle_id",

    "vehicle_type": "vehicle_type",
    "type": "vehicle_type",
    "truck_type": "vehicle_type",

    "capacity_weight": "capacity_weight",
    "weight_capacity": "capacity_weight",
    "max_weight": "capacity_weight",
    "capacity (kg)": "capacity_weight",
    "capacity_kg": "capacity_weight",

    "capacity_volume": "capacity_volume",
    "volume_capacity": "capacity_volume",
    "max_volume": "capacity_volume",
    "capacity (m3)": "capacity_volume",
    "capacity_m3": "capacity_volume",

    "operating_cost": "operating_cost",
    "cost": "operating_cost",
    "trip_cost": "operating_cost",
    "cost_per_trip": "operating_cost",
}


# ---------------------------------------------------------------------------
# File parsing helpers
# ---------------------------------------------------------------------------

def _parse_file(file_content: bytes, filename: str) -> List[Dict]:
    """
    Parse CSV or XLSX file content into a list of row dicts.
    Returns raw rows with original column names.
    """
    extension = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

    if extension == "csv":
        return _parse_csv(file_content)
    elif extension in ("xlsx", "xls"):
        return _parse_excel(file_content)
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format: .{extension}. Use .csv or .xlsx"
        )


def _parse_csv(content: bytes) -> List[Dict]:
    """Parse CSV content into list of dicts."""
    try:
        # Try UTF-8 first, then latin-1 as fallback
        try:
            text = content.decode("utf-8-sig")  # Handle BOM
        except UnicodeDecodeError:
            text = content.decode("latin-1")

        reader = csv.DictReader(io.StringIO(text))
        rows = []
        for row in reader:
            # Strip whitespace from keys and values
            clean_row = {
                k.strip(): v.strip() if isinstance(v, str) else v
                for k, v in row.items()
                if k is not None
            }
            rows.append(clean_row)
        return rows

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")


def _parse_excel(content: bytes) -> List[Dict]:
    """Parse Excel content into list of dicts."""
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(
            status_code=400,
            detail="Excel support requires openpyxl. Install with: pip install openpyxl"
        )

    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active

        rows = list(ws.iter_rows(values_only=True))
        if len(rows) < 2:
            return []

        # First row is headers
        headers = [str(h).strip() if h else f"col_{i}" for i, h in enumerate(rows[0])]
        data = []

        for row in rows[1:]:
            row_dict = {}
            for i, val in enumerate(row):
                if i < len(headers):
                    if val is not None:
                        row_dict[headers[i]] = str(val).strip() if not isinstance(val, (int, float)) else val
                    else:
                        row_dict[headers[i]] = ""
            if any(v for v in row_dict.values()):  # Skip completely empty rows
                data.append(row_dict)

        wb.close()
        return data

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse Excel: {str(e)}")


def _map_columns(rows: List[Dict], column_map: Dict) -> List[Dict]:
    """
    Map raw column names to internal field names using the column map.
    Handles case-insensitive matching and common variations.
    """
    if not rows:
        return []

    # Build the mapping from actual column names to internal names
    sample_row = rows[0]
    actual_to_internal = {}

    for actual_col in sample_row.keys():
        normalized = actual_col.lower().strip()
        if normalized in column_map:
            actual_to_internal[actual_col] = column_map[normalized]

    # Apply mapping to all rows
    mapped_rows = []
    for row in rows:
        mapped = {}
        for actual_col, value in row.items():
            internal_name = actual_to_internal.get(actual_col)
            if internal_name:
                mapped[internal_name] = value
        mapped_rows.append(mapped)

    return mapped_rows


# ---------------------------------------------------------------------------
# Shipment validation and parsing
# ---------------------------------------------------------------------------

def _parse_datetime(value) -> Optional[str]:
    """Try multiple datetime formats and return ISO string."""
    if not value or value == "":
        return None
    if isinstance(value, datetime):
        return value.isoformat()

    formats = [
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%d-%m-%Y %H:%M:%S",
        "%d-%m-%Y %H:%M",
        "%m/%d/%Y %H:%M:%S",
        "%m/%d/%Y %H:%M",
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
    ]

    value_str = str(value).strip()
    for fmt in formats:
        try:
            dt = datetime.strptime(value_str, fmt)
            return dt.isoformat()
        except ValueError:
            continue

    return None


def _parse_float(value, default=0.0) -> float:
    """Safely parse a float value."""
    if value is None or value == "":
        return default
    try:
        # Handle comma-separated numbers like "1,500.5"
        cleaned = str(value).replace(",", "").strip()
        return float(cleaned)
    except (ValueError, TypeError):
        return default


def _parse_priority(value) -> str:
    """Parse priority to enum value."""
    if not value:
        return "MEDIUM"
    normalized = str(value).upper().strip()
    if normalized in ("HIGH", "H", "1", "URGENT"):
        return "HIGH"
    elif normalized in ("LOW", "L", "3", "ECONOMY"):
        return "LOW"
    return "MEDIUM"


def _parse_handling(value) -> Optional[str]:
    """Parse special handling value."""
    if not value or str(value).strip().lower() in ("none", "", "na", "n/a", "-"):
        return None
    normalized = str(value).strip().lower()
    valid = {"fragile", "hazardous", "refrigerated", "oversized"}
    if normalized in valid:
        return normalized
    return str(value).strip()


def _validate_shipment_row(row: Dict, row_index: int) -> Tuple[Optional[Dict], Optional[Dict]]:
    """
    Validate and parse a single shipment row.
    Returns (parsed_shipment, error) — one will be None.
    """
    errors = []

    # Required fields
    origin = str(row.get("origin", "")).strip()
    destination = str(row.get("destination", "")).strip()
    weight = _parse_float(row.get("weight"))
    volume = _parse_float(row.get("volume"))

    if not origin:
        errors.append("Missing origin")
    if not destination:
        errors.append("Missing destination")
    if weight <= 0:
        errors.append(f"Invalid weight: {row.get('weight')}")
    if volume <= 0:
        # Auto-compute volume from weight if missing
        volume = round(weight / 250, 2)  # Rough density estimate

    # Shipment ID — generate if missing
    shipment_id = str(row.get("shipment_id", "")).strip()
    if not shipment_id:
        shipment_id = f"UP-{row_index + 1:04d}"

    # Time windows — optional but recommended
    pickup_time = _parse_datetime(row.get("pickup_time"))
    delivery_time = _parse_datetime(row.get("delivery_time"))

    # If no times provided, generate reasonable defaults
    if not pickup_time:
        pickup_time = datetime.now().replace(hour=8, minute=0, second=0).isoformat()
    if not delivery_time:
        # Default: 24 hours after pickup
        try:
            pt = datetime.fromisoformat(pickup_time)
            delivery_time = (pt.replace(hour=8) + __import__('datetime').timedelta(hours=24)).isoformat()
        except Exception:
            delivery_time = datetime.now().replace(hour=20, minute=0, second=0).isoformat()

    priority = _parse_priority(row.get("priority"))
    special_handling = _parse_handling(row.get("special_handling"))

    if errors:
        return None, {
            "row": row_index + 1,
            "shipment_id": shipment_id or f"row {row_index + 1}",
            "errors": errors,
            "raw_data": {k: str(v)[:50] for k, v in row.items()},
        }

    return {
        "shipment_id": shipment_id,
        "origin": origin,
        "destination": destination,
        "pickup_time": pickup_time,
        "delivery_time": delivery_time,
        "weight": weight,
        "volume": volume,
        "priority": priority,
        "special_handling": special_handling,
        "status": "PENDING",
    }, None


# ---------------------------------------------------------------------------
# Auto fleet generation
# ---------------------------------------------------------------------------

def _generate_fleet_from_shipments(
    shipments: List[Dict],
    vehicle_count: Optional[int] = None,
) -> List[Dict]:
    """
    Generate a reasonable vehicle fleet based on shipment characteristics.

    Analyzes weight distribution of shipments and creates a mixed fleet
    of small, medium, large, and refrigerated vehicles that can handle
    the load.
    """
    if not shipments:
        return []

    weights = [s.get("weight", 0) for s in shipments]
    max_weight = max(weights) if weights else 5000
    total_weight = sum(weights)
    has_refrigerated = any(s.get("special_handling") == "refrigerated" for s in shipments)

    # Auto-compute fleet size if not specified
    if vehicle_count is None:
        # Rough heuristic: 1 truck per 5000kg of total weight, min 3, max 30
        vehicle_count = max(3, min(30, int(total_weight / 5000) + 2))

    fleet = []

    # Vehicle type templates
    types = [
        {"type": "small_tempo", "weight": 3000, "volume": 12, "cost": 5000},
        {"type": "medium_truck", "weight": 7000, "volume": 25, "cost": 8000},
        {"type": "large_trailer", "weight": 15000, "volume": 50, "cost": 15000},
    ]

    # Ensure at least one truck can carry the heaviest shipment
    if max_weight > 7000:
        # Need large trailers
        n_large = max(2, vehicle_count // 3)
        n_medium = max(1, (vehicle_count - n_large) // 2)
        n_small = vehicle_count - n_large - n_medium
    elif max_weight > 3000:
        # Need medium trucks
        n_large = max(1, vehicle_count // 4)
        n_medium = max(2, vehicle_count // 2)
        n_small = vehicle_count - n_large - n_medium
    else:
        # Small fleet works
        n_large = max(1, vehicle_count // 5)
        n_medium = max(1, vehicle_count // 3)
        n_small = vehicle_count - n_large - n_medium

    vid = 1
    for _ in range(n_small):
        fleet.append({
            "vehicle_id": f"VH-{vid:04d}",
            "vehicle_type": "small_tempo",
            "capacity_weight": 3000,
            "capacity_volume": 12,
            "operating_cost": 5000,
        })
        vid += 1

    for _ in range(n_medium):
        fleet.append({
            "vehicle_id": f"VH-{vid:04d}",
            "vehicle_type": "medium_truck",
            "capacity_weight": 7000,
            "capacity_volume": 25,
            "operating_cost": 8000,
        })
        vid += 1

    for _ in range(n_large):
        fleet.append({
            "vehicle_id": f"VH-{vid:04d}",
            "vehicle_type": "large_trailer",
            "capacity_weight": 15000,
            "capacity_volume": 50,
            "operating_cost": 15000,
        })
        vid += 1

    # Add refrigerated trucks if needed
    if has_refrigerated:
        fleet.append({
            "vehicle_id": f"VH-{vid:04d}",
            "vehicle_type": "refrigerated",
            "capacity_weight": 5000,
            "capacity_volume": 20,
            "operating_cost": 12000,
        })
        vid += 1

    return fleet


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@router.post("/upload/shipments")
async def upload_shipments(
    file: UploadFile = File(..., description="CSV or XLSX file with shipment data"),
    clear_existing: bool = Query(False, description="Clear existing shipments before import"),
    auto_generate_fleet: bool = Query(True, description="Auto-generate vehicle fleet if none exists"),
    vehicle_count: Optional[int] = Query(None, description="Number of vehicles to generate (auto if None)"),
    db: Session = Depends(get_db),
):
    """
    Upload shipment data from a CSV or Excel file.

    Parses the file, validates each row, saves valid shipments to the
    database, and optionally auto-generates a matching vehicle fleet.

    The column names are flexible — common variations like
    "Weight (kg)", "weight_kg", "WEIGHT" all map correctly.

    Returns a summary with counts, errors, and a sample of parsed data.
    """
    # Read file content
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    filename = file.filename or "unknown.csv"

    # Parse the file into raw rows
    raw_rows = _parse_file(content, filename)
    if not raw_rows:
        raise HTTPException(status_code=400, detail="No data rows found in file")

    # Map columns to internal names
    mapped_rows = _map_columns(raw_rows, SHIPMENT_COLUMN_MAP)

    # Check which columns were mapped
    mapped_fields = set()
    if mapped_rows:
        mapped_fields = set(mapped_rows[0].keys())

    unmapped_original = set(raw_rows[0].keys()) - {
        col for col in raw_rows[0].keys()
        if col.lower().strip() in SHIPMENT_COLUMN_MAP
    }

    # Validate each row
    valid_shipments = []
    row_errors = []

    for i, row in enumerate(mapped_rows):
        parsed, error = _validate_shipment_row(row, i)
        if parsed:
            valid_shipments.append(parsed)
        if error:
            row_errors.append(error)

    # Clear existing data if requested
    if clear_existing:
        db.query(Shipment).delete()
        db.query(Vehicle).delete()
        db.commit()

    # Save valid shipments to database
    saved_count = 0
    for s in valid_shipments:
        try:
            db_shipment = Shipment(
                shipment_id=s["shipment_id"],
                origin=s["origin"],
                destination=s["destination"],
                pickup_time=datetime.fromisoformat(s["pickup_time"]) if s["pickup_time"] else None,
                delivery_time=datetime.fromisoformat(s["delivery_time"]) if s["delivery_time"] else None,
                weight=s["weight"],
                volume=s["volume"],
                priority=PriorityEnum(s["priority"]),
                special_handling=s["special_handling"],
                status=StatusEnum.PENDING,
            )
            db.add(db_shipment)
            saved_count += 1
        except Exception as e:
            row_errors.append({
                "row": "DB",
                "shipment_id": s["shipment_id"],
                "errors": [f"Database error: {str(e)}"],
            })

    # Auto-generate fleet if requested and no vehicles exist
    fleet_generated = 0
    if auto_generate_fleet:
        existing_vehicles = db.query(Vehicle).count()
        if existing_vehicles == 0 or clear_existing:
            fleet = _generate_fleet_from_shipments(valid_shipments, vehicle_count)
            for v in fleet:
                db_vehicle = Vehicle(
                    vehicle_id=v["vehicle_id"],
                    vehicle_type=v["vehicle_type"],
                    capacity_weight=v["capacity_weight"],
                    capacity_volume=v["capacity_volume"],
                    operating_cost=v["operating_cost"],
                )
                db.add(db_vehicle)
                fleet_generated += 1

    db.commit()

    # Build response
    return {
        "status": "success" if saved_count > 0 else "error",
        "file": filename,
        "total_rows": len(raw_rows),
        "shipments_saved": saved_count,
        "errors_count": len(row_errors),
        "vehicles_generated": fleet_generated,
        "columns_detected": list(raw_rows[0].keys()) if raw_rows else [],
        "columns_mapped": list(mapped_fields),
        "columns_unmapped": list(unmapped_original) if unmapped_original else [],
        "errors": row_errors[:20],  # Cap at 20 errors to avoid huge responses
        "sample_data": valid_shipments[:5],  # Show first 5 parsed shipments
        "message": (
            f"Imported {saved_count} shipments from {filename}. "
            f"{len(row_errors)} rows had errors. "
            f"{fleet_generated} vehicles auto-generated."
            if saved_count > 0
            else f"No valid shipments found. {len(row_errors)} errors detected."
        ),
    }


@router.post("/upload/vehicles")
async def upload_vehicles(
    file: UploadFile = File(..., description="CSV or XLSX file with vehicle data"),
    clear_existing: bool = Query(False, description="Clear existing vehicles before import"),
    db: Session = Depends(get_db),
):
    """
    Upload vehicle/fleet data from a CSV or Excel file.
    """
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    filename = file.filename or "unknown.csv"
    raw_rows = _parse_file(content, filename)
    if not raw_rows:
        raise HTTPException(status_code=400, detail="No data rows found in file")

    mapped_rows = _map_columns(raw_rows, VEHICLE_COLUMN_MAP)

    if clear_existing:
        db.query(Vehicle).delete()
        db.commit()

    saved_count = 0
    errors = []

    for i, row in enumerate(mapped_rows):
        vid = str(row.get("vehicle_id", f"VH-{i+1:04d}")).strip()
        vtype = str(row.get("vehicle_type", "medium_truck")).strip()
        cap_w = _parse_float(row.get("capacity_weight"), 7000)
        cap_v = _parse_float(row.get("capacity_volume"), 25)
        cost = _parse_float(row.get("operating_cost"), 8000)

        if cap_w <= 0:
            errors.append({"row": i + 1, "vehicle_id": vid, "errors": ["Invalid capacity_weight"]})
            continue

        try:
            db_vehicle = Vehicle(
                vehicle_id=vid,
                vehicle_type=vtype,
                capacity_weight=cap_w,
                capacity_volume=cap_v,
                operating_cost=cost,
            )
            db.add(db_vehicle)
            saved_count += 1
        except Exception as e:
            errors.append({"row": i + 1, "vehicle_id": vid, "errors": [str(e)]})

    db.commit()

    return {
        "status": "success" if saved_count > 0 else "error",
        "file": filename,
        "total_rows": len(raw_rows),
        "vehicles_saved": saved_count,
        "errors_count": len(errors),
        "errors": errors[:20],
        "message": f"Imported {saved_count} vehicles from {filename}.",
    }