import os

# 1. Environment Guardrails (Must be set before importing paddle)
os.environ["FLAGS_use_onednn"] = "0"
os.environ["FLAGS_enable_pir_api"] = "0"

import re
import time
import uuid
import tempfile
from typing import Any, Dict, List, Optional, Set
from PIL import Image, ImageFilter, ImageOps
from paddleocr import PaddleOCR

ocr_engine = PaddleOCR(
    lang="en", use_textline_orientation=True, device="cpu", enable_mkldnn=False
)


# ==========================================
# MANDATORY METROLOGY FIELDS & REGEX
# Grounded in:
#  - The Legal Metrology (Packaged Commodities) Rules, 2011, Rule 6
#  - Food Safety and Standards (Labelling and Display) Regulations, 2020, Reg 5
#
# Each field now carries a "scope":
#   "universal"  -> required on EVERY pre-packaged commodity under the
#                   Legal Metrology Act, regardless of what the product is
#                   (name, net quantity, MRP, mfg date, manufacturer,
#                   consumer care).
#   "food_only"  -> only required for food/beverage products under the
#                   FSSAI Labelling Regulations (batch/lot code, expiry /
#                   best-before date, FSSAI license number). A bar of soap
#                   or a bottle of detergent is not required to carry
#                   these, so checking for them there was previously a
#                   false "non-compliance" signal.
# ==========================================
MANDATORY_FIELDS = [
    ("commodity_name", "Common / Generic Name of Commodity", "universal"),
    ("net_quantity", "Net Quantity / Weight / Volume", "universal"),
    ("mrp", "Maximum Retail Price (MRP)", "universal"),
    ("batch_lot_code", "Batch / Lot / Code Number", "food_only"),
    ("date_of_manufacture", "Date of Manufacture / Packaging", "universal"),
    ("date_of_expiry", "Expiry / Use By / Best Before Date", "food_only"),
    ("manufacturer", "Manufacturer / Packer / Importer Name & Address", "universal"),
    ("consumer_care", "Consumer Care Contact (Name, Address, Phone/Email)", "universal"),
    ("fssai_license", "14-Digit FSSAI License Number", "food_only"),
]
FIELD_SCOPE = {key: scope for key, _, scope in MANDATORY_FIELDS}

# Rule/regulation citations attached to the compliance report for audit
# traceability. Fields draw from two separate statutes -- Legal Metrology
# for quantity/price/consumer-care, FSSAI Labelling Regs for food-specific
# declarations (batch number, dates, FSSAI license itself).
LEGAL_BASIS = {
    "commodity_name": "LM Rule 6(1)(b); FSSAI Reg 5(1)",
    "net_quantity": "LM Rule 6(1)(c), Rule 12-13; FSSAI Reg 5(8)",
    "mrp": "LM Rule 6(1)(e), Rule 2(m); FSSAI Reg 5(8)",
    "batch_lot_code": "FSSAI Reg 5(9)",
    "date_of_manufacture": "LM Rule 6(1)(d); FSSAI Reg 5(10)(a)",
    "date_of_expiry": "FSSAI Reg 5(10)(a)",
    "manufacturer": "LM Rule 6(1)(a), Rule 10; FSSAI Reg 5(6)(a)",
    "consumer_care": "LM Rule 6(2); FSSAI Reg 5(8)",
    "fssai_license": "FSSAI Reg 5(7)",
}

# Generic commodity names that commonly appear on Indian FMCG packaging.
# Rule 6(1)(b) / FSSAI Reg 5(1) require the COMMON/GENERIC name (e.g.
# "Biscuits", "Sambar Powder"), not the brand name, so this list
# intentionally targets product category words rather than brands.
#
# Split into FOOD vs NON_FOOD so the product category (and therefore the
# set of rules that actually apply) can be determined from whichever
# keyword is matched.
FOOD_KEYWORDS = [
    "BISCUITS",
    "COOKIES",
    "CRACKERS",
    "JUICE",
    "AERATED SOFT DRINK",
    "SOFT DRINK",
    "BEVERAGE",
    "SAMBAR POWDER",
    "MASALA",
    "SPICE",
    "CHUTNEY POWDER",
    "CURRY POWDER",
    "MIXED FRUIT",
    "NECTAR",
    "SQUASH",
    "TEA",
    "COFFEE",
    "ATTA",
    "MAIDA",
    "RAWA",
    "SUJI",
    "RICE",
    "SALT",
    "SUGAR",
    "GHEE",
    "EDIBLE OIL",
    "VANASPATI",
    "BUTTER",
    "MILK POWDER",
    "NOODLES",
    "PASTA",
    "CHIPS",
    "NAMKEEN",
    "CHOCOLATE",
    "CANDY",
    "MINERAL WATER",
    "DRINKING WATER",
    "PICKLE",
    "JAM",
    "SAUCE",
    "KETCHUP",
    "HONEY",
    "CEREAL",
    "PULSES",
]
NON_FOOD_KEYWORDS = [
    "DETERGENT",
    "SOAP",
    "SHAMPOO",
]
COMMODITY_NAME_KEYWORDS = FOOD_KEYWORDS + NON_FOOD_KEYWORDS

CATEGORY_FOOD = "food_or_beverage"
CATEGORY_NON_FOOD = "non_food_packaged_commodity"
CATEGORY_UNKNOWN = "unknown"

MRP_REGEX = re.compile(
    r"(?:MRP|MAXIMUM\s*RETAIL\s*PRICE|PRICE)\s*(?:INCL\.?\s*OF\s*ALL\s*TAXES)?\s*[:\s]*[₹RS\.?]*\s*(\d+(?:\.\d{1,2})?)",
    re.IGNORECASE,
)
FALLBACK_PRICE_REGEX = re.compile(r"(?:₹|RS\.?\s*)(\d+(?:\.\d{1,2})?)", re.IGNORECASE)

NET_QTY_REGEX = re.compile(
    r"(?:NET\s*(?:WEIGHT|WT|QTY|QUANTITY|CONTENT|VOL|VOLUME)?\s*[:\s]*)?"
    r"(\d+(?:\.\d+)?\s*(?:kgs?|gms?|gs?|mls?|fl\s*oz|litres?|liters?|l)(?![a-zA-Z])"
    r"(?:\s*[\+\*][^\n,]+)?)",
    re.IGNORECASE,
)

# Bare date token: dd/mm/yy[yy], or MONTH+year. Used together with context
# words below to classify a date as manufacture vs expiry -- FSSAI Reg
# 5(10) requires BOTH to be declared, so lumping every date-like match into
# one field (as the old mfg_or_use_by_date did) can't tell a compliant
# label (both dates present) from one missing the mfg date entirely.
DATE_TOKEN_REGEX = re.compile(
    r"(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}"
    r"|(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[A-Z]*\.?\s?\d{2,4})",
    re.IGNORECASE,
)
SHELF_LIFE_REGEX = re.compile(
    r"\d+\s*MONTHS?\s*(?:FROM|OF)?\s*(?:PACKAGING|MFG|MANUFACTURE)?", re.IGNORECASE
)

MFG_CONTEXT_WORDS = [
    "MFG",
    "MFD",
    "PKD",
    "PACKED",
    "MANUFACTURE",
    "MANUFACTURED",
    "PACKAGING",
    "PACKING",
]
EXP_CONTEXT_WORDS = ["EXP", "EXPIRY", "USE BY", "USE BEFORE", "BEST BEFORE", "BB DATE"]

# FSSAI Reg 5(9): a batch/lot/code number in some recognizable form (Batch
# No., B.No., Lot No., L.No., Code, LN, CN, BN) is mandatory on its own,
# separate from any date declaration.
BATCH_REGEX = re.compile(
    r"\b(?:BATCH\s*(?:NO\.?|NUMBER)?|B\.?\s?NO\.?|LOT\s*(?:NO\.?|NUMBER)?|L\.?\s?NO\.?|"
    r"CODE\s*(?:NO\.?|NUMBER)?|LN|CN|BN)\s*[:\-]?\s*([A-Z0-9\-\/]{2,15})",
    re.IGNORECASE,
)

FSSAI_REGEX = re.compile(r"\b\d{14}\b")

# Rule 6(2) / FSSAI Reg 5(8): consumer care declaration must include phone
# and/or email, not just the word "consumer care" on its own with no
# actual contact detail.
PHONE_REGEX = re.compile(
    r"\b(?:\+?91[\s\-]?)?[6-9]\d{9}\b|\b1800[\s\-]?\d{3}[\s\-]?\d{4}\b"
)
EMAIL_REGEX = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")

# ==========================================
# "SEE ELSEWHERE ON PACK" DETECTION
# Many labels don't print every field on the main panel -- MRP is often
# printed on the neck/cap of a bottle, net quantity or batch code on the
# bottom of a can, etc. Rather than hardcoding this to MRP only, we scan
# every OCR line for a "SEE <location>" phrase and, where possible, tie it
# to the specific field it refers to (via a nearby field keyword on the
# same line). If no field keyword is present on that line, it's recorded
# as an unspecified hint the user should be aware of.
# ==========================================
SECONDARY_LOCATION_REGEX = re.compile(
    r"SEE\s+(NECK|CAP|BOTTOM|BACK|PACK(?:ET)?|CROWN|LID|REVERSE|BELOW|SIDE|LABEL|ELSEWHERE)",
    re.IGNORECASE,
)
FIELD_HINT_KEYWORDS = {
    "mrp": ["MRP", "MAXIMUM RETAIL PRICE", "MAX RETAIL PRICE", "PRICE"],
    "net_quantity": ["NET QTY", "NET QUANTITY", "NET WT", "NET WEIGHT", "NET CONTENT", "NET VOL"],
    "date_of_manufacture": ["MFG", "MFD", "PKD", "PACKED", "MANUFACTURE"],
    "date_of_expiry": ["EXP", "EXPIRY", "USE BY", "BEST BEFORE"],
    "batch_lot_code": ["BATCH", "LOT", "CODE"],
}


def preprocess_image(
    input_path: str, output_path: str, target_long_side: int = 2000
) -> str:
    img = Image.open(input_path).convert("RGB")
    long_side = max(img.size)
    if long_side < target_long_side:
        scale = target_long_side / long_side
        img = img.resize(
            (int(img.width * scale), int(img.height * scale)), Image.LANCZOS
        )
    img = ImageOps.autocontrast(img, cutoff=1)
    img = img.filter(ImageFilter.UnsharpMask(radius=2, percent=150, threshold=2))
    img.save(output_path, quality=95)
    return output_path


def detect_product_category(commodity_name: Optional[str], full_blob: str) -> str:
    """Classify the product so we know which rule set applies.

    - CATEGORY_FOOD: FSSAI-regulated food/beverage item -> universal LM
      fields + food_only FSSAI fields all apply.
    - CATEGORY_NON_FOOD: e.g. soap/detergent/shampoo -> only the universal
      Legal Metrology fields apply; FSSAI-only fields are not expected.
    - CATEGORY_UNKNOWN: couldn't tell from the label -> fall back to
      checking everything (conservative default), with a warning.
    """
    name_upper = (commodity_name or "").upper()
    blob_upper = full_blob.upper()

    if name_upper and any(k == name_upper.upper() or k in name_upper for k in NON_FOOD_KEYWORDS):
        return CATEGORY_NON_FOOD
    if name_upper and any(k in name_upper for k in FOOD_KEYWORDS):
        return CATEGORY_FOOD

    # commodity_name wasn't set (or didn't match cleanly) -- fall back to
    # scanning the whole blob directly.
    if any(k in blob_upper for k in NON_FOOD_KEYWORDS):
        return CATEGORY_NON_FOOD
    if any(k in blob_upper for k in FOOD_KEYWORDS):
        return CATEGORY_FOOD

    return CATEGORY_UNKNOWN


def get_required_scopes(category: str) -> Set[str]:
    if category == CATEGORY_FOOD:
        return {"universal", "food_only"}
    if category == CATEGORY_NON_FOOD:
        return {"universal"}
    # CATEGORY_UNKNOWN -- be conservative and check everything.
    return {"universal", "food_only"}


def get_required_fields(category: str) -> List[Any]:
    scopes = get_required_scopes(category)
    return [f for f in MANDATORY_FIELDS if f[2] in scopes]


def detect_secondary_references(raw_texts: List[str]) -> List[Dict[str, str]]:
    """Find lines like 'MRP: See Neck' or 'Best Before: See Bottom' and
    return which field (if identifiable) needs to be read off a second
    part of the package."""
    hints: List[Dict[str, str]] = []
    for text in raw_texts:
        loc_match = SECONDARY_LOCATION_REGEX.search(text)
        if not loc_match:
            continue
        location = loc_match.group(1).upper()
        text_upper = text.upper()
        field_hint = "unspecified"
        for field_key, keywords in FIELD_HINT_KEYWORDS.items():
            if any(kw in text_upper for kw in keywords):
                field_hint = field_key
                break
        hints.append(
            {"field_hint": field_hint, "location": location, "source_text": text}
        )
    return hints


def parse_packaging_data(raw_texts: List[str]) -> Dict[str, Any]:
    full_blob = " ".join(raw_texts)
    # Every mandatory field always appears in the output. If nothing is
    # detected for a field, it stays None -> serializes as JSON null,
    # rather than being silently missing from the dict. This matters when
    # comparing across very different packet types (biscuit box, juice
    # can, spice powder pouch) where different fields will legitimately
    # be absent or unreadable on any given label.
    standard_fields: Dict[str, Any] = {key: None for key, _, _ in MANDATORY_FIELDS}

    # 1. Commodity Name (Rule 6(1)(b)) — common/generic name, not the brand.
    for keyword in COMMODITY_NAME_KEYWORDS:
        if keyword in full_blob.upper():
            standard_fields["commodity_name"] = keyword.title()
            break

    # 2. MRP
    mrp_match = MRP_REGEX.search(full_blob)
    if mrp_match:
        standard_fields["mrp"] = f"₹{mrp_match.group(1)}"
    else:
        fallback_mrp = FALLBACK_PRICE_REGEX.search(full_blob)
        if fallback_mrp:
            standard_fields["mrp"] = f"₹{fallback_mrp.group(1)}"

    # 3. Net Quantity
    # The regex itself now enforces a real, bounded unit (kg/g/ml/l/litre/etc.
    # with a negative lookahead so it can't match a bare letter that's really
    # the start of another word, e.g. "L" from "LIC"), so no extra loose
    # substring filtering is needed here.
    qty_matches = [m.strip() for m in NET_QTY_REGEX.findall(full_blob) if m.strip()]
    if qty_matches:
        standard_fields["net_quantity"] = qty_matches[0]

    # 4. FSSAI License
    fssai_matches = list(set(FSSAI_REGEX.findall(full_blob)))
    if fssai_matches:
        standard_fields["fssai_license"] = (
            fssai_matches if len(fssai_matches) > 1 else fssai_matches[0]
        )

    # 5. Batch / Lot / Code Number (FSSAI Reg 5(9)) — mandatory on its own,
    # separate from any date declaration.
    batch_match = BATCH_REGEX.search(full_blob)
    if batch_match:
        standard_fields["batch_lot_code"] = batch_match.group(1).strip()

    # 6. Dates — classified as manufacture vs expiry using nearby context
    # words on the SAME OCR line, since FSSAI Reg 5(10) requires both to be
    # declared and a compliance check needs to know which is which (not
    # just "a date was found somewhere"). Falls back to an unclassified
    # bucket if a date has no recognizable context word next to it.
    mfg_date, exp_date = None, None
    unclassified_dates = []
    for text in raw_texts:
        text_upper = text.upper()
        date_match = DATE_TOKEN_REGEX.search(text)
        if not date_match:
            continue
        date_val = date_match.group(1).strip()
        if any(w in text_upper for w in MFG_CONTEXT_WORDS):
            if mfg_date is None:
                mfg_date = date_val
        elif any(w in text_upper for w in EXP_CONTEXT_WORDS):
            if exp_date is None:
                exp_date = date_val
        else:
            unclassified_dates.append(date_val)

    # Also check for a shelf-life phrase ("N MONTHS FROM PACKAGING") as an
    # alternate valid form of the expiry declaration.
    shelf_life_match = SHELF_LIFE_REGEX.search(full_blob)
    if exp_date is None and shelf_life_match:
        exp_date = shelf_life_match.group(0).strip()

    standard_fields["date_of_manufacture"] = mfg_date
    standard_fields["date_of_expiry"] = exp_date
    # Any dates found with no clear MFG/EXP context word are kept in the raw
    # output for manual review, but intentionally don't satisfy either
    # mandatory field — an unlabeled date on a packet isn't a compliant
    # declaration of what that date actually represents.
    if unclassified_dates:
        standard_fields["_unclassified_dates_for_review"] = unclassified_dates

    # 7. Manufacturer & Consumer Care
    # Generic phrase markers work across almost any packaged good (juice,
    # cans, snacks, dairy, etc.) since Indian FSSAI labels use standard
    # legal phrasing regardless of brand. A hardcoded brand allowlist
    # (e.g. only "COCA-COLA"/"PARLE") would silently miss every other brand,
    # so we rely on the phrase patterns instead and only use brand names as
    # a last-resort hint.
    manufacturer_phrases = [
        "MFD BY",
        "MFG BY",
        "MANUFACTURED",
        "MARKETED BY",
        "PACKED BY",
        "PACKED FOR",
        "BOTTLED BY",
        "BOTTLED FOR",
        "PRODUCED BY",
        "PRODUCT OF",
        "PVT LTD",
        "PVT. LTD",
        "LTD.",
        "INDUSTRIES",
        "FOODS PVT",
        "BEVERAGES",
    ]
    # Rule 6(2) requires an actual contact route (phone/email), so we look
    # for lines with a real phone number or email first. A line that just
    # says "Consumer Care" with no number/email is a weaker, fallback signal
    # only used if nothing better is found (flagged separately as a warning
    # in validate_compliance).
    consumer_care_header_phrases = [
        "CONSUMER",
        "CARE",
        "CUSTOMER",
        "TOLL FREE",
        "TOLL-FREE",
        "HELPLINE",
        "CARE CELL",
        "FEEDBACK",
        "COMPLAINT",
    ]
    consumer_care_header_only = None
    for text in raw_texts:
        text_upper = text.upper()
        if any(m in text_upper for m in manufacturer_phrases):
            if standard_fields.get("manufacturer") is None:
                standard_fields["manufacturer"] = text
        if PHONE_REGEX.search(text) or EMAIL_REGEX.search(text):
            if standard_fields.get("consumer_care") is None:
                standard_fields["consumer_care"] = text
        elif any(c in text_upper for c in consumer_care_header_phrases):
            if consumer_care_header_only is None:
                consumer_care_header_only = text

    if standard_fields.get("consumer_care") is None and consumer_care_header_only:
        standard_fields["consumer_care"] = consumer_care_header_only

    # 8. "See neck / cap / bottom / ..." references. For any field that is
    # still None after everything above, if we found a "SEE <location>"
    # line that names that field, record a placeholder value so downstream
    # code (and the API layer) knows a second image is needed to actually
    # read it, rather than treating the field as simply absent.
    secondary_hints = detect_secondary_references(raw_texts)
    for hint in secondary_hints:
        field_key = hint["field_hint"]
        if field_key != "unspecified" and standard_fields.get(field_key) is None:
            standard_fields[field_key] = f"SEE {hint['location']}"

    standard_fields["_secondary_reference_hints"] = secondary_hints

    return standard_fields


def validate_compliance(fields: Dict[str, Any], category: str) -> Dict[str, Any]:
    required_fields = get_required_fields(category)
    missing_fields, warnings = [], []

    for field_key, display_name, _scope in required_fields:
        if field_key not in fields or not fields[field_key]:
            missing_fields.append(display_name)

    if "mrp" in fields and fields["mrp"] and "SEE" in str(fields["mrp"]).upper():
        warnings.append(
            "MRP not printed in the main label text — check secondary print area (bottle neck/cap, can lid, pouch seal, etc.)."
        )

    care_text = fields.get("consumer_care")
    if care_text and not (
        PHONE_REGEX.search(str(care_text)) or EMAIL_REGEX.search(str(care_text))
    ):
        warnings.append(
            "Consumer care text found but no phone number or email detected — Rule 6(2) requires an actual contact route, not just a 'Consumer Care' label."
        )

    if category == CATEGORY_UNKNOWN:
        warnings.append(
            "Product category could not be determined from the label — checking all "
            "Legal Metrology + FSSAI fields as a precaution. Results may include "
            "requirements (e.g. FSSAI license, batch code, expiry date) that don't "
            "actually apply if this isn't a food/beverage product."
        )

    needs_secondary_image = any(
        isinstance(fields.get(field_key), str) and fields[field_key].upper().startswith("SEE ")
        for field_key, _display_name, _scope in required_fields
    )

    denom = len(required_fields) if required_fields else 1
    compliance_percentage = ((denom - len(missing_fields)) / denom) * 100

    return {
        "product_category": category,
        "fields_checked": [display_name for _key, display_name, _scope in required_fields],
        "is_compliant": len(missing_fields) == 0 and not needs_secondary_image,
        "compliance_score": f"{compliance_percentage:.0f}%",
        "missing_mandatory_fields": missing_fields,
        "needs_secondary_image": needs_secondary_image,
        "secondary_image_hints": fields.get("_secondary_reference_hints", []),
        "warnings": warnings,
        "legal_basis": {
            display_name: LEGAL_BASIS.get(field_key, "")
            for field_key, display_name, _scope in required_fields
        },
    }


def merge_extracted_fields(
    primary: Dict[str, Any], secondary: Dict[str, Any]
) -> Dict[str, Any]:
    """Combine standard_fields from the primary image with a follow-up
    image taken of a secondary print area (neck, cap, bottom, etc.).

    Only fills in fields that are missing or still placeholders (e.g.
    "SEE NECK") in the primary result — a value already read correctly
    from the primary image is never overwritten by the secondary image.
    """
    merged = dict(primary)
    for field_key, _display_name, _scope in MANDATORY_FIELDS:
        primary_val = primary.get(field_key)
        is_placeholder = isinstance(primary_val, str) and primary_val.upper().startswith("SEE ")
        if primary_val is None or is_placeholder:
            secondary_val = secondary.get(field_key)
            if secondary_val and not (
                isinstance(secondary_val, str) and secondary_val.upper().startswith("SEE ")
            ):
                merged[field_key] = secondary_val

    merged["_unclassified_dates_for_review"] = list(
        set(
            (primary.get("_unclassified_dates_for_review") or [])
            + (secondary.get("_unclassified_dates_for_review") or [])
        )
    ) or None
    merged["_secondary_reference_hints"] = primary.get("_secondary_reference_hints", [])
    return merged


def _extract_raw_texts(ocr_results: Any) -> List[str]:
    raw_texts: List[str] = []

    if not ocr_results:
        return raw_texts

    # Case 1: Root object is a dictionary
    if isinstance(ocr_results, dict):
        for key in ("rec_texts", "text_lines", "texts"):
            value = ocr_results.get(key)
            if isinstance(value, list):
                for item in value:
                    text = str(item).strip()
                    if text:
                        raw_texts.append(text)
        if raw_texts:
            return raw_texts

    # Case 2: Root object is a list (Standard PaddleOCR or Multi-page output)
    if isinstance(ocr_results, list):
        for page in ocr_results:
            if not page:
                continue

            # Case 2a: Page is a dictionary
            if isinstance(page, dict):
                for key in ("rec_texts", "text_lines", "texts"):
                    value = page.get(key)
                    if isinstance(value, list):
                        for item in value:
                            text = str(item).strip()
                            if text:
                                raw_texts.append(text)
                continue

            # Case 2b: Standard nested PaddleOCR structures [[coord, (text, score)], ...]
            if isinstance(page, (list, tuple)):
                for line in page:
                    if not isinstance(line, (list, tuple)) or len(line) < 2:
                        continue

                    item = line[1]

                    # Direct check for tuple/list ("Text String", confidence_score)
                    if isinstance(item, (list, tuple)) and item:
                        text = str(item[0]).strip()
                    elif isinstance(item, str):
                        text = item.strip()
                    else:
                        continue

                    if text:
                        raw_texts.append(text)

    return raw_texts


def run_ocr(image_path: str) -> List[str]:
    """Preprocess + OCR a single image file and return raw text lines."""
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image file not found: {image_path}")

    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_file:
        prepped_path = tmp_file.name

    try:
        preprocess_image(image_path, prepped_path)

        # FIX: the installed PaddleOCR version has no .predict() method at all,
        # so calling it raises AttributeError, not TypeError. The old
        # `except TypeError` clause never caught that, so the error propagated
        # up uncaught. Check for the method up front instead of relying on
        # exception-based control flow.
        if hasattr(ocr_engine, "predict"):
            ocr_results = ocr_engine.predict(prepped_path)
        else:
            ocr_results = ocr_engine.ocr(prepped_path, cls=False)

        raw_texts = _extract_raw_texts(ocr_results)

        # Debug aid: if raw_texts is empty, print the raw shape so you can see
        # what your installed version actually returns.
        if not raw_texts:
            print("DEBUG: no text extracted. Raw OCR result was:")
            print(ocr_results)

        return raw_texts
    finally:
        if os.path.exists(prepped_path):
            os.remove(prepped_path)


def extract_package_data(image_path: str) -> Dict[str, Any]:
    """OCR one image and return its standard_fields + detected category,
    without yet producing a compliance report (used so a second/follow-up
    image's data can be merged in before compliance is judged)."""
    raw_texts = run_ocr(image_path)
    standard_fields = parse_packaging_data(raw_texts)
    full_blob = " ".join(raw_texts)
    category = detect_product_category(standard_fields.get("commodity_name"), full_blob)
    return {
        "standard_fields": standard_fields,
        "raw_texts": raw_texts,
        "category": category,
    }


def analyze_package_image(image_path: str) -> Dict[str, Any]:
    """Single-image entry point (kept for CLI / backward-compatible use).
    If the label references a secondary print area (e.g. "MRP: See Neck"),
    the returned compliance_report will have needs_secondary_image=True —
    callers that can obtain a second image should extract data from it and
    call merge_extracted_fields() + validate_compliance() instead of
    treating this single-image result as final.
    """
    data = extract_package_data(image_path)
    compliance_report = validate_compliance(data["standard_fields"], data["category"])
    return {
        "extracted_data": {
            "standard_fields": data["standard_fields"],
            "raw_text_detected": data["raw_texts"],
        },
        "compliance_report": compliance_report,
    }


SUPPORTED_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff")


def _find_candidate_images(project_root: str) -> List[str]:
    """Scan the project root and a 'new' subfolder (if present) for any
    supported image file. This lets the script work on any packaged
    product image — bottles, cans, juice cartons, pouches, boxes — rather
    than only a file literally named bottle.jpg."""
    search_dirs = [project_root, os.path.join(project_root, "new")]
    found = []
    for d in search_dirs:
        if os.path.isdir(d):
            for fname in sorted(os.listdir(d)):
                if fname.lower().endswith(SUPPORTED_EXTENSIONS):
                    found.append(os.path.join(d, fname))
    return found


# ==========================================
# FASTAPI APP
# Two-step flow:
#   1. POST /analyze            -> analyze the main product image. If a
#                                   field is only readable from a
#                                   secondary area (neck/cap/bottom/etc),
#                                   the response comes back with
#                                   status="needs_secondary_image" and a
#                                   session_id.
#   2. POST /analyze/secondary  -> given that session_id + a second image,
#                                   OCRs the second image, merges its data
#                                   with the first, and returns the final
#                                   compliance report.
# ==========================================
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import shutil

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session store for pending two-image analyses.
# NOTE: this is process-local and non-persistent -- fine for a single
# server instance / dev use. For production (multiple workers, restarts),
# swap this dict out for Redis or a DB row keyed by session_id.
PENDING_SESSIONS: Dict[str, Dict[str, Any]] = {}
SESSION_TTL_SECONDS = 15 * 60


def _cleanup_stale_sessions() -> None:
    now = time.time()
    stale = [
        sid
        for sid, data in PENDING_SESSIONS.items()
        if now - data["created_at"] > SESSION_TTL_SECONDS
    ]
    for sid in stale:
        PENDING_SESSIONS.pop(sid, None)


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    _cleanup_stale_sessions()
    suffix = os.path.splitext(file.filename or "")[1]

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
        shutil.copyfileobj(file.file, temp_file)
        temp_path = temp_file.name

    try:
        data = extract_package_data(temp_path)
        compliance_report = validate_compliance(data["standard_fields"], data["category"])

        response: Dict[str, Any] = {
            "status": "complete",
            "extracted_data": {
                "standard_fields": data["standard_fields"],
                "raw_text_detected": data["raw_texts"],
            },
            "compliance_report": compliance_report,
        }

        if compliance_report["needs_secondary_image"]:
            session_id = str(uuid.uuid4())
            PENDING_SESSIONS[session_id] = {
                "created_at": time.time(),
                "standard_fields": data["standard_fields"],
                "raw_texts": data["raw_texts"],
                "category": data["category"],
            }
            response["status"] = "needs_secondary_image"
            response["session_id"] = session_id
            response["message"] = (
                "Some fields are only printed on another part of the package. "
                "Please upload a photo of: "
                + "; ".join(
                    f"{h['field_hint']} (see {h['location'].lower()})"
                    if h["field_hint"] != "unspecified"
                    else f"see {h['location'].lower()}"
                    for h in compliance_report["secondary_image_hints"]
                )
                + ". Then call /analyze/secondary with this session_id and that image."
            )

        return response
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.post("/analyze/secondary")
async def analyze_secondary(
    session_id: str = Form(...), file: UploadFile = File(...)
):
    _cleanup_stale_sessions()
    session = PENDING_SESSIONS.get(session_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail="Unknown or expired session_id. Re-run /analyze on the primary image first.",
        )

    suffix = os.path.splitext(file.filename or "")[1]
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
        shutil.copyfileobj(file.file, temp_file)
        temp_path = temp_file.name

    try:
        secondary_data = extract_package_data(temp_path)

        merged_fields = merge_extracted_fields(
            session["standard_fields"], secondary_data["standard_fields"]
        )
        # Category was already determined from the primary image; if it
        # came back unknown there, give the secondary image a chance to
        # help (e.g. commodity name was only printed near the MRP-neck text).
        category = session["category"]
        if category == CATEGORY_UNKNOWN:
            category = secondary_data["category"]

        compliance_report = validate_compliance(merged_fields, category)

        result = {
            "status": "complete",
            "extracted_data": {
                "standard_fields": merged_fields,
                "raw_text_detected_primary": session["raw_texts"],
                "raw_text_detected_secondary": secondary_data["raw_texts"],
            },
            "compliance_report": compliance_report,
        }

        # Session fulfilled -- drop it. If still incomplete (e.g. a third
        # print area exists), the caller can inspect
        # compliance_report.needs_secondary_image and repeat the flow with
        # a fresh /analyze call if desired.
        PENDING_SESSIONS.pop(session_id, None)
        return result
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)