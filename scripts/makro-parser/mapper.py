import re
from typing import Any, Dict, List, Optional, Tuple


def _split_en_th_name(title: str) -> Tuple[str, str]:
    """Split combined EN | TH title into separate parts if possible."""
    if not title:
        return "", ""
    parts = [p.strip() for p in title.split("|")]
    if len(parts) == 1:
        return parts[0], ""
    # Heuristic: assume EN first, TH second
    return parts[0], parts[1]


def _normalize_unit(raw: str) -> str:
    s = raw.strip().lower()
    if s in {"kg", "kilogram", "kilograms"}:
        return "kg"
    if s in {"g", "gram", "grams"}:
        return "g"
    if s in {"l", "liter", "litre", "liters", "litres"}:
        return "L"
    if s in {"ml", "milliliter", "millilitre", "milliliters", "millilitres"}:
        return "ml"
    if s in {"pc", "pcs", "piece", "pieces"}:
        return "pcs"
    return raw


def normalize_package_weight(weight_str: str) -> Tuple[Optional[float], Optional[str]]:
    """Parse strings like '2 kg', '500 ml', '1L' into numeric qty + normalized unit."""
    if not weight_str:
        return None, None
    text = weight_str.strip().lower()
    match = re.match(r"([0-9]+(?:[.,][0-9]+)?)\s*([a-zA-Z]+)", text)
    if not match:
        return None, None
    qty_raw, unit_raw = match.groups()
    try:
        qty = float(qty_raw.replace(",", "."))
    except ValueError:
        return None, None
    unit = _normalize_unit(unit_raw)
    return qty, unit


def determine_base_unit_from_category(
    english_name: str,
    category_path: List[str],
) -> str:
    """Infer base_unit (kg, L, pcs) from name and category hints."""
    name_lower = (english_name or "").lower()
    cats = " ".join(category_path).lower()
    text = name_lower + " " + cats

    if any(k in text for k in ["water", "oil", "sauce", "juice", "milk", "drink", "beverage"]):
        return "L"
    if any(k in text for k in ["egg", "piece", "pcs", "pack", "bottle", "can", "box", "tray"]):
        return "pcs"
    return "kg"


def determine_nomenclature(
    product_name_en: str,
    product_name_th: str,
    category_path: List[str],
    all_existing_nomenclatures: List[Dict[str, Any]],
) -> Tuple[Optional[str], Optional[str], str]:
    """
    Heuristics to select or suggest a nomenclature.
    Returns (nomenclature_id, base_unit, nomenclature_name_label).
    """
    name_lower = (product_name_en or "").lower()

    # First try to match against existing nomenclatures by simple substring
    for nom in all_existing_nomenclatures:
        nom_name = (nom.get("name") or "").lower()
        if not nom_name:
            continue
        if nom_name in name_lower or name_lower in nom_name:
            return nom["id"], nom.get("base_unit"), nom.get("name", "")

    # Very basic grouping fallback by keywords
    if "butter" in name_lower and "peanut" not in name_lower:
        return None, "kg", "Butter"
    if "olive oil" in name_lower or ("olive" in name_lower and "oil" in name_lower):
        return None, "L", "Olive Oil"
    if "ketchup" in name_lower:
        return None, "kg", "Ketchup"

    base_unit = determine_base_unit_from_category(product_name_en, category_path)
    # UNKNOWN_NOMENCLATURE means: needs manual mapping later
    return None, base_unit, "UNKNOWN_NOMENCLATURE"

def parse_product_json(raw_next_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Extract required fields from __NEXT_DATA__ JSON."""

    def find_product(obj: Any) -> Optional[Dict[str, Any]]:
        if isinstance(obj, dict):
            if "product" in obj and isinstance(obj["product"], dict):
                return obj["product"]
            for _, v in obj.items():
                found = find_product(v)
                if found:
                    return found
        elif isinstance(obj, list):
            for item in obj:
                found = find_product(item)
                if found:
                    return found
        return None

    product = find_product(raw_next_data)
    if not product:
        return None

    raw_title = product.get("title", "") or ""
    english_name, thai_name = _split_en_th_name(raw_title)

    brand_name = None
    if "brand" in product:
        brand_val = product["brand"]
        if isinstance(brand_val, dict):
            brand_name = brand_val.get("name")
        else:
            brand_name = brand_val

    ean = None
    makro_code = None
    price = 0.0
    package_weight_raw = ""

    variants = product.get("variants") or []
    if variants:
        v0 = variants[0]
        ean = v0.get("barcode") or v0.get("ean")
        makro_code = v0.get("sku")
        prices = v0.get("prices") or []
        if prices:
            amount = prices[0].get("amount") or 0
            try:
                price = float(amount) / 100.0
            except (TypeError, ValueError):
                price = 0.0

    if not makro_code:
        makro_code = product.get("sku")

    package_weight_raw = product.get("weight") or ""
    pkg_qty, pkg_unit = normalize_package_weight(package_weight_raw)

    category_path: List[str] = []
    if "categories" in product and isinstance(product["categories"], list):
        for c in product["categories"]:
            name = c.get("name")
            if name:
                category_path.append(name)

    country_of_origin = product.get("country_of_origin") or ""

    return {
        "original_name": raw_title,
        "english_name": english_name or raw_title,
        "thai_name": thai_name,
        "brand": brand_name,
        "price": price,
        "makro_code": makro_code,
        "barcode": ean,
        "package_weight_raw": package_weight_raw,
        "package_qty": pkg_qty,
        "package_unit": pkg_unit,
        "package_type": "case",
        "purchase_unit": "pc",
        "category_path": category_path,
        "country_of_origin": country_of_origin,
    }
