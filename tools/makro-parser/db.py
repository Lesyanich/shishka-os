import os
import logging
from typing import Any, Dict, List, Optional, Tuple

import psycopg
import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    logging.warning("Supabase REST credentials not found in environment. Reference-data loading may fail.")


def _rest_headers() -> Dict[str, str]:
    """Headers for Supabase REST (PostgREST) with service role."""
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }


def _rest_get(path: str, params: Dict[str, str]) -> List[Dict[str, Any]]:
    """Simple helper to GET from Supabase REST API."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return []
    base = SUPABASE_URL.rstrip("/") + "/rest/v1"
    url = f"{base}/{path.lstrip('/')}"
    resp = requests.get(url, headers=_rest_headers(), params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def load_reference_data() -> Dict[str, Any]:
    """Load nomenclature, brands, suppliers and fin_sub_categories from Supabase."""
    try:
        nomenclature = _rest_get(
            "nomenclature",
            {
                "select": "id,name,base_unit,product_code,type",
                "type": "eq.RAW",
            },
        )
    except Exception as exc:  # noqa: BLE001
        logging.error("Failed to load nomenclature: %s", exc)
        nomenclature = []

    try:
        brands = _rest_get(
            "brands",
            {
                "select": "id,name,name_th,country,is_active",
            },
        )
    except Exception as exc:  # noqa: BLE001
        logging.error("Failed to load brands: %s", exc)
        brands = []

    try:
        suppliers = _rest_get(
            "suppliers",
            {
                "select": "id,name,category_code,is_deleted",
                "is_deleted": "eq.false",
            },
        )
    except Exception as exc:  # noqa: BLE001
        logging.error("Failed to load suppliers: %s", exc)
        suppliers = []

    try:
        fin_sub_categories = _rest_get(
            "fin_sub_categories",
            {"select": "sub_code,name,category_code", "category_code": "eq.11"},
        )
    except Exception as exc:  # noqa: BLE001
        logging.error("Failed to load fin_sub_categories: %s", exc)
        fin_sub_categories = []

    return {
        "nomenclature": nomenclature,
        "brands": brands,
        "suppliers": suppliers,
        "fin_sub_categories": fin_sub_categories,
    }


def find_makro_supplier_id(reference_data: Dict[str, Any]) -> Optional[str]:
    """Return supplier_id for Makro if it exists."""
    suppliers = reference_data.get("suppliers") or []
    for supplier in suppliers:
        name = (supplier.get("name") or "").lower()
        if "makro" in name:
            return supplier.get("id")
    logging.warning("Makro supplier not found in suppliers table.")
    return None


def _sql_literal(value: Any) -> str:
    """Very small helper to SQL-escape Python values."""
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    # treat everything else as text
    s = str(value).replace("'", "''")
    return f"'{s}'"


def build_batch_sql(
    batch_products: List[Dict[str, Any]],
    supplier_id: str,
) -> Tuple[str, Dict[str, int]]:
    """
    Build a single BEGIN/COMMIT SQL batch for upserting brands, sku and supplier_catalog.
    Assumes each product has:
      - nomenclature_id (UUID) or is skipped
      - english_name, thai_name, original_name
      - brand (text)
      - barcode
      - makro_code
      - price
      - package_weight_raw, package_qty, package_unit, package_type
      - category_code (int, 11) and optional sub_category_code
      - nomenclature_base_unit
    """
    created_counts = {
        "brands": 0,
        "sku": 0,
        "supplier_catalog": 0,
        "nomenclature": 0,  # placeholder, we do not create new ones yet
    }

    if not batch_products:
        return "", created_counts

    valid_products: List[Dict[str, Any]] = []
    errors: List[str] = []

    for p in batch_products:
        if not p.get("barcode"):
            errors.append(f"skip_no_barcode:{p.get('makro_code')}")
            continue
        valid_products.append(p)

    if not valid_products:
        logging.warning("No valid products in batch after filtering (nomenclature_id + barcode required).")
        return "", created_counts

    lines: List[str] = []
    lines.append("BEGIN;")

    # 0. Create missing nomenclature entries for products that didn't match existing ones
    new_nomenclature_labels = sorted(
        {
            p.get("assigned_nomenclature_name")
            for p in valid_products
            if not p.get("nomenclature_id") and p.get("assigned_nomenclature_name")
        },
    )
    for label in new_nomenclature_labels:
        base_unit = None
        for p in valid_products:
            if p.get("assigned_nomenclature_name") == label and p.get("nomenclature_base_unit"):
                base_unit = p.get("nomenclature_base_unit")
                break
        if not base_unit:
            base_unit = "kg"
        lines.append(
            "INSERT INTO nomenclature (id, product_code, name, type, base_unit) "
            "SELECT gen_random_uuid(), "
            f"'RAW-AUTO-' || substr(md5(random()::text), 1, 8), {_sql_literal(label)}, "
            "'good', "
            f"{_sql_literal(base_unit)} "
            "WHERE NOT EXISTS (SELECT 1 FROM nomenclature WHERE name = "
            f"{_sql_literal(label)} AND type = 'good');",
        )
        created_counts["nomenclature"] += 1

    # 1. Upsert brands
    brands_in_batch = sorted(
        {p.get("brand") for p in valid_products if p.get("brand")},
    )
    for brand in brands_in_batch:
        lines.append(
            "INSERT INTO brands (id, name, is_active) "
            f"VALUES (gen_random_uuid(), {_sql_literal(brand)}, TRUE) "
            "ON CONFLICT (name) DO UPDATE SET is_active = TRUE;",
        )
        created_counts["brands"] += 1

    # 2. Insert / upsert SKU
    for p in valid_products:
        product_name = p.get("english_name") or p.get("original_name") or ""
        product_name_th = p.get("thai_name") or ""
        full_title = p.get("original_name") or product_name
        brand = p.get("brand")
        package_weight = p.get("package_weight_raw") or ""
        package_qty = p.get("package_qty")
        package_unit = p.get("package_unit") or "pcs"
        package_type = p.get("package_type") or "case"

        if p.get("nomenclature_id"):
            nomenclature_expr = _sql_literal(p.get("nomenclature_id"))
        else:
            label = p.get("assigned_nomenclature_name") or ""
            nomenclature_expr = (
                f"(SELECT id FROM nomenclature WHERE name = {_sql_literal(label)} AND type = 'good' LIMIT 1)"
            )

        sql = (
            "INSERT INTO sku ("
            "id, sku_code, nomenclature_id, barcode, product_name, product_name_th, full_title, "
            "brand_id, brand, package_weight, package_qty, package_unit, package_type, is_active"
            ") VALUES ("
            "gen_random_uuid(), "
            "NULL, "
            f"{nomenclature_expr}, "
            f"{_sql_literal(p.get('barcode'))}, "
            f"{_sql_literal(product_name)}, "
            f"{_sql_literal(product_name_th)}, "
            f"{_sql_literal(full_title)}, "
            f"(SELECT id FROM brands WHERE name = {_sql_literal(brand)})" if brand else "NULL"
        )

        if brand:
            sql += ", "
            sql += _sql_literal(brand)
        else:
            sql += ", NULL"

        sql += f", {_sql_literal(package_weight)}, {_sql_literal(package_qty)}, {_sql_literal(package_unit)}, {_sql_literal(package_type)}, TRUE"
        sql += ") "
        sql += "ON CONFLICT (barcode) WHERE barcode IS NOT NULL DO UPDATE SET "
        sql += "product_name = EXCLUDED.product_name, "
        sql += "package_weight = EXCLUDED.package_weight;"
        lines.append(sql)
        created_counts["sku"] += 1

    # 3. Insert / upsert supplier_catalog
    for p in valid_products:
        brand = p.get("brand")
        product_name = p.get("english_name") or p.get("original_name") or ""
        product_name_th = p.get("thai_name") or ""
        full_title = p.get("original_name") or product_name
        base_unit = p.get("nomenclature_base_unit") or "kg"
        package_weight = p.get("package_weight_raw") or ""
        package_qty = p.get("package_qty")
        package_unit = p.get("package_unit") or "pcs"
        package_type = p.get("package_type") or "case"
        sub_category_code = p.get("sub_category_code")
        price = p.get("price") or 0

        if p.get("nomenclature_id"):
            nomenclature_expr = _sql_literal(p.get("nomenclature_id"))
        else:
            label = p.get("assigned_nomenclature_name") or ""
            nomenclature_expr = (
                f"(SELECT id FROM nomenclature WHERE name = {_sql_literal(label)} AND type = 'good' LIMIT 1)"
            )

        sql = (
            "INSERT INTO supplier_catalog ("
            "id, supplier_id, nomenclature_id, sku_id, supplier_sku, original_name, "
            "purchase_unit, conversion_factor, base_unit, barcode, product_name, product_name_th, "
            "brand, brand_id, full_title, package_weight, package_qty, package_unit, package_type, "
            "category_code, sub_category_code, last_seen_price, source"
            ") VALUES ("
            "gen_random_uuid(), "
            f"{_sql_literal(supplier_id)}, "
            f"{nomenclature_expr}, "
            f"(SELECT id FROM sku WHERE barcode = {_sql_literal(p.get('barcode'))}), "
            f"{_sql_literal(p.get('makro_code'))}, "
            f"{_sql_literal(p.get('original_name'))}, "
            f"{_sql_literal(p.get('purchase_unit') or 'pc')}, "
            "1, "
            f"{_sql_literal(base_unit)}, "
            f"{_sql_literal(p.get('barcode'))}, "
            f"{_sql_literal(product_name)}, "
            f"{_sql_literal(product_name_th)}, "
            f"{_sql_literal(brand)}, "
            f"(SELECT id FROM brands WHERE name = {_sql_literal(brand)})" if brand else "NULL"
        )

        if brand:
            sql += ", "
            sql += _sql_literal(full_title)
        else:
            sql += ", "
            sql += _sql_literal(full_title)

        sql += f", {_sql_literal(package_weight)}, {_sql_literal(package_qty)}, {_sql_literal(package_unit)}, {_sql_literal(package_type)}, "
        sql += f"{_sql_literal(p.get('category_code', 4100))}, "
        sql += "NULL" if sub_category_code is None else str(sub_category_code)
        sql += f", {_sql_literal(price)}, 'makro_parser'"
        sql += ") "
        sql += "ON CONFLICT (supplier_id, barcode) WHERE barcode IS NOT NULL "
        sql += "DO UPDATE SET last_seen_price = EXCLUDED.last_seen_price;"
        lines.append(sql)
        created_counts["supplier_catalog"] += 1

    lines.append("COMMIT;")

    batch_sql = "\n".join(lines)
    return batch_sql, created_counts


def execute_sql_batch(sql_query: str) -> Dict[str, Any]:
    """
    Execute SQL batch using a direct PostgreSQL connection via psycopg (v3).
    Uses DATABASE_URL from environment.
    """
    if not DATABASE_URL:
        logging.error("DATABASE_URL is not set. Cannot execute SQL batch.")
        return {"stdout": "", "stderr": "DATABASE_URL is not set", "returncode": 1}

    try:
        with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
            conn.execute(sql_query)
        return {"stdout": "OK", "stderr": "", "returncode": 0}
    except Exception as exc:  # noqa: BLE001
        logging.error("Error executing SQL batch: %s", exc)
        return {"stdout": "", "stderr": str(exc), "returncode": 1}


def execute_sql(sql_query: str) -> Dict[str, Any]:
    """
    Backwards-compatible wrapper for older callers.
    Delegates to execute_sql_batch.
    """
    return execute_sql_batch(sql_query)
