import sys
import json
import warnings
import math
from collections import defaultdict
import pandas as pd
import numpy as np
from mlxtend.frequent_patterns import fpgrowth, association_rules
from mlxtend.preprocessing import TransactionEncoder
from backtest import compute_attach_rate_metrics, build_basket_index

warnings.filterwarnings('ignore')

DEFAULT_MIN_SUPPORT = 0.05
DEFAULT_MIN_CONFIDENCE = 0.60
DEFAULT_MIN_LIFT = 1.20
DEFAULT_MAX_BUNDLE_CANDIDATES = 20
DEFAULT_MINIMUM_MARGIN = 0.30
MAX_BUNDLE_CANDIDATES = 100
MAX_DENSE_MATRIX_CELLS = 25_000_000
MAX_BASKETS_WITHOUT_GUARD = 50_000


def normalize_sector(sector_str):
    """Standardizes sector strings to 'cafe', 'retail', or 'services'."""
    sec = str(sector_str or '').strip().lower()
    if 'cafe' in sec or 'coffee' in sec or 'beverage' in sec:
        return 'cafe'
    if 'retail' in sec or 'supply' in sec or 'goods' in sec:
        return 'retail'
    if 'service' in sec or 'groom' in sec or 'hotel' in sec:
        return 'services'
    return 'unknown'


def parse_payload(payload):
    if isinstance(payload, list):
        return payload, {
            "minSupport": DEFAULT_MIN_SUPPORT,
            "minConfidence": DEFAULT_MIN_CONFIDENCE,
            "minLift": DEFAULT_MIN_LIFT,
            "maxBundleCandidates": DEFAULT_MAX_BUNDLE_CANDIDATES,
            "itemPrices": {},
            "itemEconomics": {},
        }

    if isinstance(payload, dict):
        baskets = (
            payload.get("baskets")
            or payload.get("transactions")
            or payload.get("data")
            or []
        )
        config = payload.get("config") or {}
        return baskets, {
            "minSupport": float(
                payload.get("minSupport", config.get("minSupport", DEFAULT_MIN_SUPPORT))
            ),
            "minConfidence": float(
                payload.get(
                    "minConfidence",
                    config.get("minConfidence", DEFAULT_MIN_CONFIDENCE),
                )
            ),
            "minLift": float(payload.get("minLift", config.get("minLift", DEFAULT_MIN_LIFT))),
            "maxBundleCandidates": safe_int(
                payload.get(
                    "maxBundleCandidates",
                    config.get("maxBundleCandidates", DEFAULT_MAX_BUNDLE_CANDIDATES),
                ),
                DEFAULT_MAX_BUNDLE_CANDIDATES,
                1,
                MAX_BUNDLE_CANDIDATES,
            ),
            "itemPrices": payload.get("itemPrices", config.get("itemPrices", {})),
            "itemEconomics": payload.get(
                "itemEconomics",
                config.get("itemEconomics", {}),
            ),
        }

    return [], {
        "minSupport": DEFAULT_MIN_SUPPORT,
        "minConfidence": DEFAULT_MIN_CONFIDENCE,
        "minLift": DEFAULT_MIN_LIFT,
        "maxBundleCandidates": DEFAULT_MAX_BUNDLE_CANDIDATES,
        "itemPrices": {},
        "itemEconomics": {},
    }


def normalize_sector(sector):
    value = str(sector or "").strip().lower()
    if value in ("cafe", "coffee"):
        return "cafe"
    if value in ("retail", "pet supplies"):
        return "retail"
    if value in ("services", "grooming"):
        return "services"
    return value


def safe_int(value, fallback, min_value=1, max_value=MAX_BUNDLE_CANDIDATES):
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        parsed = fallback
    return max(min_value, min(parsed, max_value))


def safe_float(value):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def get_price(item_prices, item_name):
    try:
        price = float(item_prices.get(item_name, 0))
    except (TypeError, ValueError):
        return None, False
    if price <= 0:
        return None, False
    return round(price), True


def get_item_economics(item_prices, item_economics, item_name):
    economics = item_economics.get(item_name, {}) if isinstance(item_economics, dict) else {}
    price_value = economics.get("price") if isinstance(economics, dict) else None
    cost_value = economics.get("unitCost") if isinstance(economics, dict) else None
    price, has_price = get_price({"value": price_value}, "value")
    if not has_price:
        price, has_price = get_price(item_prices, item_name)

    try:
        cost = float(cost_value)
    except (TypeError, ValueError):
        cost = None
    if cost is None or cost < 0:
        cost = None

    return price, cost, has_price, cost is not None


def suggested_discount_from_margin(regular_price, regular_cost, minimum_margin):
    if not regular_price or regular_price <= 0 or regular_cost is None:
        return {
            "suggestedDiscountPercent": None,
            "maxSafeDiscountPercent": None,
            "minimumMarginPercent": round(minimum_margin * 100, 1),
            "discountRationale": "Cost-of-goods data is unavailable, so WOOF cannot compute a margin-safe discount.",
        }

    if regular_cost <= 0:
        max_safe_discount = 0.25
    else:
        max_safe_discount = 1 - (regular_cost / (regular_price * (1 - minimum_margin)))
        max_safe_discount = max(0, min(max_safe_discount, 0.50))

    if max_safe_discount <= 0:
        suggested_discount = 0
    else:
        raw_suggestion = min(max_safe_discount * 0.60, 0.20)
        if max_safe_discount >= 0.05:
            raw_suggestion = max(raw_suggestion, 0.05)
        suggested_discount = min(raw_suggestion, max_safe_discount)

    suggested_percent = int(math.floor(suggested_discount * 100))
    max_safe_percent = round(max_safe_discount * 100, 1)
    minimum_margin_percent = round(minimum_margin * 100, 1)

    return {
        "suggestedDiscountPercent": suggested_percent,
        "maxSafeDiscountPercent": max_safe_percent,
        "minimumMarginPercent": minimum_margin_percent,
        "discountRationale": (
            f"Suggested {suggested_percent}% keeps projected gross margin at or above "
            f"{minimum_margin_percent}% while staying below the estimated safe ceiling of "
            f"{max_safe_percent}%."
        ),
    }


def build_pricing_fields(
    item_prices,
    item_economics,
    item_a,
    item_b,
    is_multi_item=False,
    minimum_margin=DEFAULT_MINIMUM_MARGIN,
):
    if is_multi_item:
        return {
            "itemAPrice": None,
            "itemBPrice": None,
            "itemACost": None,
            "itemBCost": None,
            "regularCost": None,
            "regularPrice": None,
            "bundlePrice": None,
            "savings": None,
            "projectedGrossProfit": None,
            "projectedMarginPercent": None,
            "hasPriceData": False,
            "hasCostData": False,
            "pricingStatus": "proposed_pending_owner_approval",
            "proposedDiscountPercent": None,
            "suggestedDiscountPercent": None,
            "maxSafeDiscountPercent": None,
            "minimumMarginPercent": round(minimum_margin * 100, 1),
            "discountRationale": "Multi-item rules need owner review before WOOF can compute item-level margin-safe pricing.",
        }

    price_a, cost_a, has_price_a, has_cost_a = get_item_economics(
        item_prices,
        item_economics,
        item_a,
    )
    price_b, cost_b, has_price_b, has_cost_b = get_item_economics(
        item_prices,
        item_economics,
        item_b,
    )
    has_price_data = has_price_a and has_price_b
    has_cost_data = has_cost_a and has_cost_b
    regular_price = round(price_a + price_b, 2) if has_price_data else None
    regular_cost = round(cost_a + cost_b, 2) if has_cost_data else None
    discount_fields = suggested_discount_from_margin(
        regular_price,
        regular_cost,
        minimum_margin,
    )
    suggested_discount = discount_fields["suggestedDiscountPercent"]
    bundle_price = (
        round(regular_price * (1 - suggested_discount / 100), 2)
        if regular_price is not None and suggested_discount is not None
        else None
    )
    savings = (
        round(regular_price - bundle_price, 2)
        if regular_price is not None and bundle_price is not None
        else None
    )
    projected_gross_profit = (
        round(bundle_price - regular_cost, 2)
        if bundle_price is not None and regular_cost is not None
        else None
    )
    projected_margin_percent = (
        round((projected_gross_profit / bundle_price) * 100, 1)
        if projected_gross_profit is not None and bundle_price
        else None
    )

    return {
        "itemAPrice": price_a,
        "itemBPrice": price_b,
        "itemACost": round(cost_a, 2) if cost_a is not None else None,
        "itemBCost": round(cost_b, 2) if cost_b is not None else None,
        "regularCost": regular_cost,
        "regularPrice": regular_price,
        "bundlePrice": bundle_price,
        "savings": savings,
        "projectedGrossProfit": projected_gross_profit,
        "projectedMarginPercent": projected_margin_percent,
        "hasPriceData": has_price_data,
        "hasCostData": has_cost_data,
        "pricingStatus": "proposed_pending_owner_approval",
        "proposedDiscountPercent": suggested_discount,
        **discount_fields,
    }


def cross_sector_basket_count(baskets):
    return sum(
        1
        for basket in baskets
        if len(basket.get("items", [])) > 1
        and len(set(basket.get("sectors", []))) > 1
    )


def base_result(
    rules,
    bundle_candidates,
    item_metrics,
    total_baskets,
    multi_item_baskets,
    cleaned_items,
    thresholds,
    baskets=None,
    message=None,
    extra=None,
):
    cross_sector_baskets = cross_sector_basket_count(baskets or [])
    result = {
        "rules": rules,
        "bundleCandidates": bundle_candidates,
        "itemMetrics": item_metrics,
        "totalBaskets": int(total_baskets),
        "multiItemBaskets": int(multi_item_baskets),
        "crossSectorBaskets": int(cross_sector_baskets),
        "crossSectorRate": (
            round(cross_sector_baskets / multi_item_baskets, 4)
            if multi_item_baskets
            else 0
        ),
        "cleanedItems": int(cleaned_items),
        "thresholds": thresholds,
    }
    if message:
        result["message"] = message
    if extra:
        result.update(extra)
    return result


def clean_baskets(baskets):
    cleaned = []
    cleaned_items = 0
    product_sector_counts = defaultdict(lambda: defaultdict(int))

    for basket in baskets:
        raw_items = basket.get("items", []) if isinstance(basket, dict) else []
        sectors = [
            normalize_sector(sector)
            for sector in (basket.get("sectors", []) if isinstance(basket, dict) else [])
            if normalize_sector(sector)
        ]
        item_sector_lookup = defaultdict(set)
        for pair in (basket.get("itemSectors", []) if isinstance(basket, dict) else []):
            if not isinstance(pair, dict):
                continue
            item_name = "" if pair.get("item") is None else str(pair.get("item")).strip()
            sector = normalize_sector(pair.get("sector"))
            if item_name and "\x00" not in item_name and sector:
                item_sector_lookup[item_name].add(sector)

        valid_items = []

        for item in raw_items:
            item_name = "" if item is None else str(item).strip()
            if item_name == "" or "\x00" in item_name:
                cleaned_items += 1
                continue

            valid_items.append(item_name)

        if isinstance(basket, dict):
            cleaned.append({**basket, "items": valid_items, "sectors": sectors})
            for item_name in valid_items:
                sectors_for_item = item_sector_lookup.get(item_name) or sectors
                sector_weight = 3 if len(sectors_for_item) == 1 else 1
                for sector in sectors_for_item:
                    product_sector_counts[item_name][sector] += sector_weight

    return cleaned, build_product_sector_profiles(product_sector_counts), cleaned_items


def build_product_sector_profiles(product_sector_counts):
    product_sectors = {}
    primary_product_sectors = {}

    for item_name, counts in product_sector_counts.items():
        ranked_sectors = sorted(counts.items(), key=lambda x: (-x[1], x[0]))
        product_sectors[item_name] = [sector for sector, _ in ranked_sectors]
        if ranked_sectors:
            primary_product_sectors[item_name] = ranked_sectors[0][0]

    return {
        "all": product_sectors,
        "primary": primary_product_sectors,
    }


def sector_set_for_items(items, product_sectors):
    sectors = set()
    primary = product_sectors.get("primary", {})
    for item in items:
        sector = primary.get(item)
        if sector:
            sectors.add(sector)
    return sectors


def is_cross_sector(antecedents, consequents, product_sectors):
    left = sector_set_for_items(antecedents, product_sectors)
    right = sector_set_for_items(consequents, product_sectors)
    return bool(left and right and any(a != b for a in left for b in right))


SECTOR_CATEGORY_ORDER = {
    "cafe": 0,
    "services": 1,
    "retail": 2,
    "unknown": 3,
}


SECTOR_PAIR_FIT = {
    ("cafe", "services"): (
        0.88,
        "Cafe + Services is a practical wait-time bundle: customers can buy drinks while a pet service is being prepared or completed.",
    ),
    ("retail", "services"): (
        0.92,
        "Services + Retail is a practical care-continuation bundle: customers can take home products related to the service visit.",
    ),
    ("cafe", "retail"): (
        0.78,
        "Cafe + Retail can work as an add-on basket when pet owners browse treats or supplies during a cafe visit.",
    ),
    ("cafe", "cafe"): (
        0.64,
        "Cafe-only bundles can raise average order value when items fit the same eating or drinking occasion.",
    ),
    ("services", "services"): (
        0.70,
        "Service-only bundles can work when the services are naturally completed in the same appointment.",
    ),
    ("retail", "retail"): (
        0.72,
        "Retail-only bundles can work when the products fit the same pet-care need or shopping mission.",
    ),
}


KEYWORD_AFFINITIES = [
    (
        ("coffee", "latte", "cappuccino", "americano", "espresso", "tea", "matcha", "frappe", "juice", "smoothie", "beverage", "drink"),
        ("coffee", "latte", "cappuccino", "americano", "espresso", "tea", "matcha", "frappe", "juice", "smoothie", "beverage", "drink"),
        0.82,
        "Drink + drink bundles are realistic for companion orders, paired beverages, or buy-two cafe occasions.",
    ),
    (
        ("pasta", "snack", "sandwich", "waffle", "fries", "burger", "spaghetti", "carbonara", "bread", "toast", "pancake", "muffin", "rice", "meal", "chicken", "beef", "pork"),
        ("pasta", "snack", "sandwich", "waffle", "fries", "burger", "spaghetti", "carbonara", "bread", "toast", "pancake", "muffin", "rice", "meal", "chicken", "beef", "pork"),
        0.80,
        "Human food bundles are realistic when items fit the same meal or snack occasion.",
    ),
    (
        ("groom", "bath", "spa", "trim", "wash"),
        ("coffee", "latte", "cappuccino", "americano", "tea", "drink", "juice", "smoothie"),
        1.0,
        "Grooming + drink is realistic because the owner can purchase a beverage while waiting for the pet service.",
    ),
    (
        ("hotel", "boarding", "daycare", "stay", "kennel"),
        ("dental", "treat", "chew", "tooth", "oral"),
        1.0,
        "Pet hotel + dental treats is realistic because overnight or daycare visits can be paired with take-home care items.",
    ),
    (
        ("dental", "clean", "teeth", "oral"),
        ("dental", "treat", "chew", "tooth", "oral"),
        0.96,
        "Dental service + dental product is realistic because the retail item extends the care outcome after the appointment.",
    ),
    (
        ("groom", "bath", "spa", "trim", "wash"),
        ("shampoo", "conditioner", "brush", "comb", "cologne", "spray", "toy", "leash", "harness", "treat", "chew", "food", "kibble"),
        0.94,
        "Pet service + pet product is realistic because the product helps maintain or reward the care outcome at home.",
    ),
    (
        ("groom", "bath", "spa", "trim", "wash", "hotel", "boarding", "daycare", "stay", "kennel", "event", "party", "barkday"),
        ("pupcake", "puppuccino", "woofle", "cat bento", "bento cake", "pet cake", "dog cake", "cat cake", "treat", "chew"),
        0.95,
        "Pet service + treat is realistic as a reward or take-home add-on after the visit.",
    ),
    (
        ("groom", "bath", "spa", "trim", "wash", "hotel", "boarding", "daycare", "stay", "kennel"),
        ("groom", "bath", "spa", "trim", "wash", "hotel", "boarding", "daycare", "stay", "kennel"),
        0.84,
        "Pet service packages are realistic when services can be completed in the same visit or appointment plan.",
    ),
    (
        ("training", "consult", "vet", "checkup", "clinic"),
        ("treat", "food", "supplement", "vitamin", "toy"),
        0.86,
        "Advisory or care services pair well with take-home retail items that support the same pet-care goal.",
    ),
]

# ---------------------------------------------------------
# Exact 9-Category & High-Level Type Taxonomy
# ---------------------------------------------------------
PET_BAKERY_KEYWORDS = (
    "pupcake", "pupcakes", "puppuccino", "puppaccino", "woofle", "woofles",
    "cat bento", "bento cake", "pet cake", "dog cake", "cat cake", "pup cake",
    "doggie pizza", "dog pizza", "pet pizza", "pet donut", "dog donut", "cat donut"
)

PET_RETAIL_INDICATORS = (
    "dog", "cat", "puppy", "kitten", "pet", "pets", "canine", "feline",
    "chew", "chews", "bone", "bones", "knot bone", "dental", "rawhide",
    "kibble", "wet food", "dry food", "canned food", "pouch", "loaf",
    "shampoo", "conditioner", "soap", "cologne", "spray", "tick", "flea", "mange",
    "diaper", "diapers", "pad", "pads", "pee pad", "litter", "scoop",
    "leash", "harness", "collar", "toy", "toys", "ball", "rope",
    "brush", "comb", "nail clipper", "bowl", "feeder", "carrier", "cage",
    "treat", "treats", "jerky", "stick", "sticks", "snack dog", "pet treat",
    "goodest", "pedigree", "whiskas", "royal canin", "sheba", "aozi", "smartheart",
    "st roche", "bearing", "inaba", "ciao", "churu", "catnip"
)

GROOMING_KEYWORDS = (
    "groom", "grooming", "bath", "blowdry", "trim", "wash", "cut",
    "styling", "nail", "paw", "ear clean", "dematting"
)

PET_HOTEL_KEYWORDS = (
    "hotel", "boarding", "daycare", "day care", "stay", "kennel", "overnight"
)

EVENTS_KEYWORDS = (
    "event", "barkday", "party", "booking", "celebration"
)

COFFEE_KEYWORDS = (
    "coffee", "latte", "cappuccino", "americano", "espresso", "macchiato",
    "mocha", "brew", "flat white", "cold brew", "long black", "ristretto"
)

NON_CAFFEINE_KEYWORDS = (
    "non-caffeine", "tea", "matcha", "frappe", "juice", "smoothie", "beverage",
    "drink", "chocolate", "iced tea", "lemonade", "shake", "cooler", "soda"
)

PASTA_SNACK_KEYWORDS = (
    "pasta", "snack", "sandwich", "waffle", "fries", "burger", "spaghetti",
    "carbonara", "bread", "toast", "pancake", "muffin", "nachos", "quesadilla", "clubhouse"
)

RICE_MEAL_KEYWORDS = (
    "rice", "meal", "rice bowl", "cordon bleu", "tonkatsu", "silog", "tapsilog",
    "tocilog", "pork", "beef", "chicken", "curry", "adobo", "sisig"
)

DOG_KEYWORDS = ("dog", "pup", "woof", "canine", "canines", "pupp", "puppy")
CAT_KEYWORDS = ("cat", "kitten", "feline", "meow", "purr", "kitty")


def detect_species(item_name):
    """
    Detects target species from item name string.
    Returns: 'dog' | 'cat' | 'neutral'
    """
    name = str(item_name or "").lower()
    is_dog = any(k in name for k in DOG_KEYWORDS)
    is_cat = any(k in name for k in CAT_KEYWORDS)

    if is_dog and not is_cat:
        return "dog"
    if is_cat and not is_dog:
        return "cat"
    return "neutral"


def get_item_category(item_name, sectors=None):
    """
    Classifies item into one of 9 exact categories with strict domain boundaries:
    1. Coffee (Human Drink)
    2. Non-Caffeine (Human Drink)
    3. Pasta/Snacks (Human Food)
    4. Rice Meals (Human Food)
    5. Grooming (Pet Service)
    6. Pet Hotel (Pet Service)
    7. Events (Pet Service)
    8. Pet Bakery (Pet Treat - Cafe dine-in safe)
    9. Pet Supplies (Pet Retail - supplies, dental chews, knot bones, kibble, wet food)
    """
    name = str(item_name or "").lower()
    primary_sector = normalize_sector((sectors or ["unknown"])[0]) if sectors else "unknown"

    # 1. Fresh Pet Bakery (Dog/Cat cafe items)
    if any(k in name for k in PET_BAKERY_KEYWORDS):
        return "Pet Bakery"

    # 2. Services Sector or Keywords (Must take priority over retail keywords like "dog" in "dog grooming")
    if primary_sector == "services":
        if any(k in name for k in PET_HOTEL_KEYWORDS):
            return "Pet Hotel"
        if any(k in name for k in EVENTS_KEYWORDS):
            return "Events"
        return "Grooming"

    if any(k in name for k in GROOMING_KEYWORDS) or "spa" in name.split():
        return "Grooming"
    if any(k in name for k in PET_HOTEL_KEYWORDS):
        return "Pet Hotel"
    if any(k in name for k in EVENTS_KEYWORDS):
        return "Events"

    # 3. Check Pet Retail Indicators or Retail Sector
    # Items with pet indicators (bones, chews, pet food, wet food, kibble) cannot become Human Food/Drink
    is_pet_item = (
        primary_sector == "retail"
        or any(k in name for k in PET_RETAIL_INDICATORS)
    )

    if is_pet_item:
        return "Pet Supplies"

    # 4. Human Cafe Food & Drink
    if any(k in name for k in COFFEE_KEYWORDS):
        return "Coffee"
    if any(k in name for k in NON_CAFFEINE_KEYWORDS):
        return "Non-Caffeine"
    if any(k in name for k in RICE_MEAL_KEYWORDS):
        return "Rice Meals"
    if any(k in name for k in PASTA_SNACK_KEYWORDS):
        return "Pasta/Snacks"

    # 5. Sector-based fallbacks
    if primary_sector == "cafe":
        return "Coffee"

    return "Pet Supplies"


def get_high_level_type(category):
    """
    Maps 9 categories into 5 High-Level Types:
    - 'Human Drink': Coffee, Non-Caffeine
    - 'Human Food': Pasta/Snacks, Rice Meals
    - 'Pet Service': Grooming, Pet Hotel, Events
    - 'Pet Bakery': Pet Bakery (Cafe dine-in treats)
    - 'Pet Supplies': Pet Supplies (Retail supplies, chews, packaged foods, hygiene)
    """
    if category in ("Coffee", "Non-Caffeine"):
        return "Human Drink"
    if category in ("Pasta/Snacks", "Rice Meals"):
        return "Human Food"
    if category in ("Grooming", "Pet Hotel", "Events"):
        return "Pet Service"
    if category == "Pet Bakery":
        return "Pet Bakery"
    if category == "Pet Supplies":
        return "Pet Supplies"
    return "Unknown"


def evaluate_bundle_guardrails(anchor_name, offer_name, anchor_sectors=None, offer_sectors=None):
    """
    Evaluates WOOF business guardrails and maps pairs to practical bundle archetypes.
    Ensures 100% logical and operational consistency:
    - Human food and beverages can NEVER bundle with retail pet supplies, dental chews, knot bones, kibble, wet food, or hygiene chemicals.
    - Dog and Cat items can NEVER be mixed (Species Mismatch).
    - Human Drink can ONLY bundle with Pet Bakery as 'Pamper Both / Duo Experience' or with Pet Service as 'Cafe + Service Waiting Combo'.
    - Human Food (meals/pasta) can only bundle with Human Drinks/Food or Pet Services.
    """
    anchor_cat = get_item_category(anchor_name, anchor_sectors)
    offer_cat = get_item_category(offer_name, offer_sectors)

    anchor_type = get_high_level_type(anchor_cat)
    offer_type = get_high_level_type(offer_cat)

    anchor_sp = detect_species(anchor_name)
    offer_sp = detect_species(offer_name)

    # ❌ 1. Species Mismatch Guardrail Rule (Dog + Cat is BANNED)
    if anchor_sp != "neutral" and offer_sp != "neutral" and anchor_sp != offer_sp:
        return {
            "isValid": False,
            "exclusionReason": f"Species mismatch detected ({anchor_sp.capitalize()} + {offer_sp.capitalize()}).",
            "categoryCompat": 1.0,
            "speciesMatch": 0.0,
            "bundleArchetype": "Excluded / Species Mismatch",
            "anchorCategory": anchor_cat,
            "offerCategory": offer_cat,
            "anchorType": anchor_type,
            "offerType": offer_type,
            "anchorSpecies": anchor_sp,
            "offerSpecies": offer_sp,
        }

    # ❌ 2. Human Beverage + Pet Retail / Supplies / Chews Exclusion Rule
    is_beverage_pet_supplies_pair = (
        (anchor_type == "Human Drink" and offer_type == "Pet Supplies")
        or (offer_type == "Human Drink" and anchor_type == "Pet Supplies")
    )
    if is_beverage_pet_supplies_pair:
        return {
            "isValid": False,
            "exclusionReason": "Human Beverages cannot be bundled with Pet Supplies, Dental Chews, or Pet Food.",
            "categoryCompat": 0.0,
            "speciesMatch": 1.0,
            "bundleArchetype": "Excluded / Beverage + Utility",
            "anchorCategory": anchor_cat,
            "offerCategory": offer_cat,
            "anchorType": anchor_type,
            "offerType": offer_type,
            "anchorSpecies": anchor_sp,
            "offerSpecies": offer_sp,
        }

    # ❌ 3. Human Food + Pet Items Exclusion Rule
    # Human Food (Rice Meals / Pasta / Snacks) cannot be bundled with Pet Supplies, Dental Chews, or Pet Bakery treats.
    is_human_food_pet_pair = (
        (anchor_type == "Human Food" and offer_type in ("Pet Supplies", "Pet Bakery"))
        or (offer_type == "Human Food" and anchor_type in ("Pet Supplies", "Pet Bakery"))
    )
    if is_human_food_pet_pair:
        return {
            "isValid": False,
            "exclusionReason": "Human Food cannot be bundled with Pet Supplies, Dental Chews, or Pet Treats.",
            "categoryCompat": 0.0,
            "speciesMatch": 1.0,
            "bundleArchetype": "Excluded / Main Meal + Pet Item",
            "anchorCategory": anchor_cat,
            "offerCategory": offer_cat,
            "anchorType": anchor_type,
            "offerType": offer_type,
            "anchorSpecies": anchor_sp,
            "offerSpecies": offer_sp,
        }

    # ---------------------------------------------------------
    # Valid Bundle Archetypes
    # ---------------------------------------------------------
    types = {anchor_type, offer_type}
    cats = {anchor_cat, offer_cat}

    archetype = None

    # ☕ Type A: Human Cafe Pairs
    if anchor_type == "Human Drink" and offer_type == "Human Drink":
        archetype = "Beverage Pair / Companion Drinks"

    elif anchor_type == "Human Food" and offer_type == "Human Food":
        archetype = "Human Food Combo"

    elif types == {"Human Drink", "Human Food"}:
        archetype = "Human Cafe Combo"

    # 🐶 Type B: "Pamper Both / Duo Experience" (Human Drink + Pet Bakery only)
    elif types == {"Human Drink", "Pet Bakery"}:
        archetype = "Pamper Both / Duo Experience"

    # ⏳ Type C: "Cafe + Service Waiting Combo" (Human Drink/Food + Pet Service)
    elif ("Human Drink" in types or "Human Food" in types) and "Pet Service" in types:
        archetype = "Cafe + Service Waiting Combo"

    # ✂️ Type D: "Service + Aftercare / Reward" (Pet Service + Pet Supplies OR Pet Bakery)
    elif "Pet Service" in types and ("Pet Supplies" in types or "Pet Bakery" in types):
        archetype = "Service + Aftercare / Reward"

    elif anchor_type == "Pet Service" and offer_type == "Pet Service":
        archetype = "Pet Service Package"

    # 🍖 Type E: "Pet Meal + Specialty Treat" (Pet Supplies + Pet Bakery)
    elif types == {"Pet Supplies", "Pet Bakery"}:
        archetype = "Pet Meal + Specialty Treat"

    # 🛍️ Type F: "Pet Care Essentials" (Pure Retail + Retail)
    elif anchor_type == "Pet Supplies" and offer_type == "Pet Supplies":
        archetype = "Pet Care Essentials"

    else:
        # Reject any other cross-domain combinations that are not explicitly approved
        return {
            "isValid": False,
            "exclusionReason": "Cross-domain pairing does not match any approved operational archetype.",
            "categoryCompat": 0.0,
            "speciesMatch": 1.0,
            "bundleArchetype": "Excluded / Incompatible Categories",
            "anchorCategory": anchor_cat,
            "offerCategory": offer_cat,
            "anchorType": anchor_type,
            "offerType": offer_type,
            "anchorSpecies": anchor_sp,
            "offerSpecies": offer_sp,
        }

    compat_by_archetype = {
        "Cafe + Service Waiting Combo": 1.0,
        "Service + Aftercare / Reward": 1.0,
        "Pamper Both / Duo Experience": 0.96,
        "Human Cafe Combo": 0.92,
        "Pet Meal + Specialty Treat": 0.90,
        "Pet Service Package": 0.86,
        "Pet Care Essentials": 0.84,
        "Beverage Pair / Companion Drinks": 0.80,
        "Human Food Combo": 0.78,
    }

    return {
        "isValid": True,
        "exclusionReason": None,
        "categoryCompat": compat_by_archetype.get(archetype, 0.75),
        "speciesMatch": 1.0,
        "bundleArchetype": archetype,
        "anchorCategory": anchor_cat,
        "offerCategory": offer_cat,
        "anchorType": anchor_type,
        "offerType": offer_type,
        "anchorSpecies": anchor_sp,
        "offerSpecies": offer_sp,
    }


def compute_null_invariant_metrics(supp_a, supp_b, supp_ab):
    """
    Computes Jiawei Han's Null-Invariant Data Mining Metrics:
    1. Kulczynski Measure (Kulc): Arithmetic mean of conditional probabilities P(A|B) and P(B|A).
       Kulc = 0.5 * ( (Supp(A∩B)/Supp(A)) + (Supp(A∩B)/Supp(B)) )
    2. Imbalance Ratio (IR): Quantifies support asymmetry between anchor A and offer B.
       IR = |Supp(A) - Supp(B)| / (Supp(A) + Supp(B) - Supp(A∩B))
    """
    sa = float(supp_a or 0.0)
    sb = float(supp_b or 0.0)
    sab = float(supp_ab or 0.0)

    conf_a_b = (sab / sa) if sa > 0 else 0.0
    conf_b_a = (sab / sb) if sb > 0 else 0.0

    kulc = round(0.5 * (conf_a_b + conf_b_a), 4)

    denom = sa + sb - sab
    ir = round(abs(sa - sb) / denom, 4) if denom > 0 else 0.0

    return kulc, ir


def compute_synergy_score(
    lift,
    anchor_price,
    offer_price,
    guardrail_result,
    max_lift_in_set=5.0,
):
    """
    Computes normalized Synergy Score (0% to 100%):
    S_synergy = (0.35 * Lift_norm + 0.35 * C_compat + 0.15 * S_match + 0.15 * P_affinity) * 100
    """
    if not guardrail_result["isValid"]:
        return 0.0, {
            "liftScore": 0.0,
            "categoryCompat": guardrail_result["categoryCompat"],
            "speciesMatch": guardrail_result["speciesMatch"],
            "priceAffinity": 0.0,
        }

    raw_lift = float(lift or 1.0)
    denom = max(1.0, float(max_lift_in_set or 5.0) - 1.0)
    lift_norm = min(1.0, max(0.0, (raw_lift - 1.0) / denom))

    c_compat = float(guardrail_result["categoryCompat"])
    s_match = float(guardrail_result["speciesMatch"])

    p_anchor = float(anchor_price or 0.0)
    p_offer = float(offer_price or 0.0)

    if p_anchor <= 0 or p_offer <= 0:
        p_affinity = 1.0
    elif p_offer <= 1.5 * p_anchor:
        p_affinity = 1.0
    else:
        p_affinity = max(0.0, 1.0 - ((p_offer - (1.5 * p_anchor)) / (2.0 * p_anchor)))

    synergy_score = round(
        (0.35 * lift_norm + 0.35 * c_compat + 0.15 * s_match + 0.15 * p_affinity) * 100.0,
        1
    )

    return synergy_score, {
        "liftScore": round(lift_norm, 2),
        "categoryCompat": round(c_compat, 2),
        "speciesMatch": round(s_match, 2),
        "priceAffinity": round(p_affinity, 2),
    }


def bundle_category_key(left_sectors, right_sectors):
    sectors = [
        normalize_sector((left_sectors or ["unknown"])[0]) or "unknown",
        normalize_sector((right_sectors or ["unknown"])[0]) or "unknown",
    ]
    return "__".join(
        sorted(
            sectors,
            key=lambda sector: (SECTOR_CATEGORY_ORDER.get(sector, 99), sector),
        )
    )


def has_keyword(value, keywords):
    item = str(value or "").lower()
    return any(keyword in item for keyword in keywords)


def keyword_affinity_score(item_a, item_b):
    for left_keywords, right_keywords, score, reason in KEYWORD_AFFINITIES:
        if (
            has_keyword(item_a, left_keywords)
            and has_keyword(item_b, right_keywords)
        ) or (
            has_keyword(item_b, left_keywords)
            and has_keyword(item_a, right_keywords)
        ):
            return score, reason
    return 0, ""


def business_fit_for_pair(item_a, item_b, left_sectors, right_sectors):
    category = bundle_category_key(left_sectors, right_sectors)
    category_parts = tuple(category.split("__"))
    sector_score, sector_reason = SECTOR_PAIR_FIT.get(
        category_parts,
        (
            0.50,
            "This pairing is kept only when transaction behavior suggests a useful bundle opportunity.",
        ),
    )
    keyword_score, keyword_reason = keyword_affinity_score(item_a, item_b)
    if keyword_score > sector_score:
        return keyword_score, keyword_reason, category
    return sector_score, sector_reason, category


def build_pair_counts(dataset):
    pair_counts = defaultdict(int)
    for basket in dataset:
        unique_items = sorted(set(basket))
        for left_index, left in enumerate(unique_items):
            for right in unique_items[left_index + 1:]:
                pair_counts[(left, right)] += 1
    return pair_counts


def support_level(rank, total_items):
    if total_items <= 1:
        return "fast"
    percentile = rank / max(total_items - 1, 1)
    if percentile <= 0.25:
        return "fast"
    if percentile >= 0.5:
        return "slow"
    return "moderate"


def build_low_association_bundles(
    dataset,
    product_sectors,
    item_stats,
    min_confidence,
    min_lift,
    max_candidates,
    item_prices=None,
    item_economics=None,
):
    item_prices = item_prices or {}
    item_economics = item_economics or {}
    total_baskets = len(dataset)
    if total_baskets == 0:
        return []

    fast_items = [
        item
        for item, stats in item_stats.items()
        if stats["velocity"] == "fast"
    ]
    slow_items = [
        item
        for item, stats in item_stats.items()
        if stats["velocity"] == "slow"
    ]
    pair_counts = build_pair_counts(dataset)
    candidates = []

    for anchor in fast_items:
        for bundle_item in slow_items:
            if anchor == bundle_item:
                continue

            pair_key = tuple(sorted([anchor, bundle_item]))
            cooccurrences = pair_counts.get(pair_key, 0)
            pair_support = cooccurrences / total_baskets
            anchor_support = item_stats[anchor]["support"]
            bundle_support = item_stats[bundle_item]["support"]
            confidence = pair_support / anchor_support if anchor_support else 0
            lift = (
                pair_support / (anchor_support * bundle_support)
                if anchor_support and bundle_support and pair_support
                else 0
            )

            if confidence >= min_confidence and lift >= min_lift:
                continue

            lift_gap = max(0, min_lift - lift) / min_lift if min_lift else 0
            confidence_gap = (
                max(0, min_confidence - confidence) / min_confidence
                if min_confidence
                else 0
            )
            base_opportunity_score = (
                anchor_support
                * (1 - bundle_support)
                * (0.6 * lift_gap + 0.4 * confidence_gap)
            )
            anchor_sectors = sorted(sector_set_for_items([anchor], product_sectors))
            bundle_sectors = sorted(sector_set_for_items([bundle_item], product_sectors))

            guardrail_res = evaluate_bundle_guardrails(anchor, bundle_item, anchor_sectors, bundle_sectors)
            if not guardrail_res["isValid"]:
                continue

            business_fit_score, bundle_fit_reason, bundle_category = business_fit_for_pair(
                anchor,
                bundle_item,
                anchor_sectors,
                bundle_sectors,
            )
            opportunity_score = base_opportunity_score * (
                0.65 + (0.75 * business_fit_score)
            )

            pricing_fields = build_pricing_fields(
                item_prices,
                item_economics,
                anchor,
                bundle_item,
            )

            synergy_score, synergy_breakdown = compute_synergy_score(
                lift,
                pricing_fields.get("itemAPrice", 0),
                pricing_fields.get("itemBPrice", 0),
                guardrail_res,
                max_lift_in_set=5.0,
            )

            backtest_metrics = compute_attach_rate_metrics(
                dataset,
                anchor,
                bundle_item,
                confidence,
                business_fit_score,
                known_anchor_count=item_stats[anchor]["basketCount"],
                known_both_count=cooccurrences,
            )

            margin_percent = pricing_fields.get("projectedMarginPercent")
            estimated_margin_impact = (
                round(margin_percent - (DEFAULT_MINIMUM_MARGIN * 100), 2)
                if margin_percent is not None
                else 0.0
            )

            is_emerging_trend = bool(cooccurrences <= 3 and guardrail_res["isValid"] and synergy_score >= 70.0)

            kulc, ir = compute_null_invariant_metrics(anchor_support, bundle_support, pair_support)

            candidates.append({
                "anchorItem": anchor,
                "bundleItem": bundle_item,
                "itemA": anchor,
                "itemB": bundle_item,
                "anchorVelocity": "fast",
                "bundleVelocity": "slow",
                "offerVelocity": "slow",
                "anchorSupport": round(anchor_support, 4),
                "bundleSupport": round(bundle_support, 4),
                "pairSupport": round(pair_support, 4),
                "confidence": round(confidence, 4),
                "lift": round(lift, 2),
                "kulc": kulc,
                "imbalanceRatio": ir,
                "cooccurrences": cooccurrences,
                "coOccurrenceCount": backtest_metrics["coOccurrenceCount"],
                "baseOpportunityScore": round(base_opportunity_score, 4),
                "opportunityScore": round(opportunity_score, 4),
                "synergyScore": synergy_score,
                "bundleArchetype": guardrail_res["bundleArchetype"],
                "synergyBreakdown": synergy_breakdown,
                "isEmergingTrend": is_emerging_trend,
                "businessFitScore": round(business_fit_score, 2),
                "bundleCategory": bundle_category,
                "bundleFitReason": bundle_fit_reason,
                "reason": f"[{guardrail_res['bundleArchetype']}] {bundle_fit_reason} Fast-moving anchor paired with a slower-moving offer.",
                "antecedentSectors": anchor_sectors,
                "consequentSectors": bundle_sectors,
                "crossSector": is_cross_sector([anchor], [bundle_item], product_sectors),
                "isLowAssociation": True,
                "estimatedMarginImpact": estimated_margin_impact,
                **backtest_metrics,
                **pricing_fields,
            })

    return sorted(
        candidates,
        key=lambda x: (
            x["opportunityScore"],
            x["anchorSupport"],
            -x["bundleSupport"],
            x["crossSector"],
        ),
        reverse=True,
    )[:max_candidates]


def build_item_metrics(dataset, product_sectors, item_prices=None, item_economics=None):
    item_prices = item_prices or {}
    item_economics = item_economics or {}
    total_baskets = len(dataset)
    item_counts = defaultdict(int)
    for basket in dataset:
        for item in set(basket):
            item_counts[item] += 1

    ranked_items = sorted(item_counts.items(), key=lambda x: (-x[1], x[0]))
    item_stats = {}
    item_metrics = []

    for rank, (item, count) in enumerate(ranked_items):
        sectors = sorted(sector_set_for_items([item], product_sectors))
        support = count / total_baskets if total_baskets else 0
        velocity = support_level(rank, len(ranked_items))
        price, cost, has_price, has_cost = get_item_economics(
            item_prices,
            item_economics,
            item,
        )
        economics = item_economics.get(item, {}) if isinstance(item_economics, dict) else {}
        unit_gross_profit = safe_float(economics.get("unitGrossProfit")) if isinstance(economics, dict) else None
        margin = safe_float(economics.get("margin")) if isinstance(economics, dict) else None
        item_stats[item] = {
            "support": support,
            "basketCount": count,
            "velocity": velocity,
        }
        metric = {
            "item": item,
            "sector": sectors[0] if sectors else "unknown",
            "sectors": sectors,
            "support": round(support, 4),
            "basketCount": count,
            "velocity": velocity,
        }
        if has_price:
            metric["price"] = round(price)
        if has_cost:
            metric["unitCost"] = round(cost, 2)
        if unit_gross_profit is not None:
            metric["unitGrossProfit"] = round(unit_gross_profit, 2)
        if margin is not None:
            metric["margin"] = round(margin, 4)
        item_metrics.append(metric)

    return item_stats, item_metrics


def run_cross_sell(baskets, config=None):
    config = config or {}
    min_support = float(config.get("minSupport", DEFAULT_MIN_SUPPORT))
    min_confidence = float(config.get("minConfidence", DEFAULT_MIN_CONFIDENCE))
    min_lift = float(config.get("minLift", DEFAULT_MIN_LIFT))
    max_bundle_candidates = safe_int(
        config.get("maxBundleCandidates", DEFAULT_MAX_BUNDLE_CANDIDATES),
        DEFAULT_MAX_BUNDLE_CANDIDATES,
        1,
        MAX_BUNDLE_CANDIDATES,
    )
    item_prices = config.get("itemPrices") or {}
    item_economics = config.get("itemEconomics") or {}
    thresholds = {
        "minSupport": min_support,
        "minConfidence": min_confidence,
        "minLift": min_lift,
        "maxBundleCandidates": max_bundle_candidates,
    }

    try:
        started_basket_count = len(baskets)
        baskets, product_sectors, cleaned_items = clean_baskets(baskets)
        if cleaned_items:
            print(f"Cleaned invalid cross-sell items: {cleaned_items}", file=sys.stderr)

        if not baskets or len(baskets) < 5:
            return base_result(
                [],
                [],
                [],
                started_basket_count,
                0,
                cleaned_items,
                thresholds,
                baskets,
                "Not enough data",
            )
            
        multi_item_baskets = [b for b in baskets if len(b['items']) > 1]
        multi_item_baskets.sort(key=lambda x: x.get("date") or "1970-01-01T00:00:00.000Z")
        if len(multi_item_baskets) > 5000:
            multi_item_baskets = multi_item_baskets[-5000:]
        
        split_idx = int(len(multi_item_baskets) * 0.8)
        train_baskets = multi_item_baskets[:split_idx]
        test_baskets = multi_item_baskets[split_idx:]
        
        dataset = [b['items'] for b in multi_item_baskets]
        train_dataset = [b['items'] for b in train_baskets]
        test_dataset_sets = [set(b['items']) for b in test_baskets]

        if len(train_dataset) < 5:
             return base_result(
                 [],
                 [],
                 [],
                 started_basket_count,
                 len(dataset),
                 cleaned_items,
                 thresholds,
                 baskets,
                 "Not enough multi-item baskets for training",
             )

        item_stats, item_metrics = build_item_metrics(
            dataset,
            product_sectors,
            item_prices,
            item_economics,
        )
        bundle_candidates = build_low_association_bundles(
            dataset,
            product_sectors,
            item_stats,
            min_confidence,
            min_lift,
            max_bundle_candidates,
            item_prices,
            item_economics,
        )

        basket_index = build_basket_index(dataset)

        unique_products = sorted({item for basket in dataset for item in basket})
        matrix_cells = len(dataset) * len(unique_products)
        
        # When dataset is very large, sample most recent 5,000 multi-item baskets to ensure rapid FP-Growth without timeout
        dense_train = train_dataset
        if len(dense_train) > 5000:
            dense_train = dense_train[-5000:]
             
        te = TransactionEncoder()
        te_ary = te.fit(dense_train).transform(dense_train)
        df = pd.DataFrame(te_ary, columns=te.columns_)
        
        # FP-Growth (Restricted to bundles of 2 to 3 items maximum)
        frequent_itemsets = fpgrowth(df, min_support=min_support, use_colnames=True, max_len=3)
        if frequent_itemsets.empty:
            return base_result(
                [],
                bundle_candidates,
                item_metrics,
                started_basket_count,
                len(dataset),
                cleaned_items,
                thresholds,
                baskets,
                "No frequent itemsets found at current thresholds",
                {"uniqueItemCount": int(len(unique_products))},
            )
            
        try:
            rules = association_rules(frequent_itemsets, metric="lift", min_threshold=min_lift, num_itemsets=len(train_dataset))
        except Exception as e:
            rules = pd.DataFrame()
            
        if rules.empty:
            return base_result(
                [],
                bundle_candidates,
                item_metrics,
                started_basket_count,
                len(dataset),
                cleaned_items,
                thresholds,
                baskets,
                "No association rules found",
                {"uniqueItemCount": int(len(unique_products))},
            )

        rules = rules[
            (rules["support"] >= min_support)
            & (rules["confidence"] >= min_confidence)
            & (rules["lift"] >= min_lift)
        ]

        if rules.empty:
            return base_result(
                [],
                bundle_candidates,
                item_metrics,
                started_basket_count,
                len(dataset),
                cleaned_items,
                thresholds,
                baskets,
                "No rules met the configured thresholds",
                {"uniqueItemCount": int(len(unique_products))},
            )
            
        deduped_rules = {}
        for _, row in rules.iterrows():
            antecedents = sorted(str(item) for item in row['antecedents'])
            consequents = sorted(str(item) for item in row['consequents'])

            # Strictly limit bundle size to 2-3 items together
            total_items = len(antecedents) + len(consequents)
            if total_items < 2 or total_items > 3:
                continue

            antecedent_sectors = sorted(sector_set_for_items(antecedents, product_sectors))
            consequent_sectors = sorted(sector_set_for_items(consequents, product_sectors))

            is_multi_item = len(antecedents) > 1 or len(consequents) > 1
            item_a = " + ".join(antecedents) if antecedents else "Unknown"
            item_b = " + ".join(consequents) if consequents else "Unknown"

            guardrail_res = evaluate_bundle_guardrails(item_a, item_b, antecedent_sectors, consequent_sectors)
            if not guardrail_res["isValid"]:
                continue

            pricing_fields = build_pricing_fields(
                item_prices,
                item_economics,
                item_a,
                item_b,
                is_multi_item,
            )

            synergy_score, synergy_breakdown = compute_synergy_score(
                float(row['lift']),
                pricing_fields.get("itemAPrice", 0),
                pricing_fields.get("itemBPrice", 0),
                guardrail_res,
                max_lift_in_set=5.0,
            )

            biz_fit_score, bundle_fit_reason, bundle_category = business_fit_for_pair(
                item_a, item_b, antecedent_sectors, consequent_sectors
            )

            backtest_metrics = compute_attach_rate_metrics(
                dataset,
                item_a,
                item_b,
                round(float(row['confidence']), 4),
                biz_fit_score,
                basket_index=basket_index,
            )

            margin_percent = pricing_fields.get("projectedMarginPercent")
            estimated_margin_impact = (
                round(margin_percent - (DEFAULT_MINIMUM_MARGIN * 100), 2)
                if margin_percent is not None
                else 0.0
            )

            anchor_basket_count = backtest_metrics.get("anchorBasketCount", 0)
            anchor_support = round(anchor_basket_count / len(dataset), 4) if dataset else round(float(row['support']), 4)
            pair_support = round(float(row['support']), 4)
            model_score = float(row['lift']) * 35
            score = round(
                model_score
                * (0.70 + (0.30 * biz_fit_score))
                * (0.85 + (0.15 * (synergy_score / 100))),
                2,
            )

            rule_cooccurrences = int(row['support'] * len(train_dataset))
            is_emerging_trend = bool(rule_cooccurrences <= 3 and guardrail_res["isValid"] and synergy_score >= 70.0)

            recurrence_count = sum(1 for b in test_dataset_sets if all(item in b for item in antecedents + consequents))
            recurrence_rate = recurrence_count / len(test_dataset_sets) if test_dataset_sets else 0
            validated_by_holdout = recurrence_rate >= pair_support * 0.5

            is_significant = (
                pair_support >= 0.05
                and round(float(row['confidence']), 4) >= 0.60
                and round(float(row['lift']), 2) >= 1.20
            )

            bundle_key = str(item_b).strip().lower()
            bundle_basket_count = len(basket_index.get(bundle_key, set())) if basket_index and bundle_key in basket_index else (sum(1 for b in dataset if item_b in b) if dataset else 0)
            bundle_support = round(bundle_basket_count / len(dataset), 4) if dataset else round(float(row['support']), 4)
            kulc, ir = compute_null_invariant_metrics(anchor_support, bundle_support, pair_support)

            rule_obj = {
                "itemA": str(item_a),
                "itemB": str(item_b),
                "anchorItem": str(item_a),
                "bundleItem": str(item_b),
                "antecedents": antecedents,
                "consequents": consequents,
                "antecedentSectors": antecedent_sectors,
                "consequentSectors": consequent_sectors,
                "support": pair_support,
                "pairSupport": pair_support,
                "anchorSupport": anchor_support,
                "bundleSupport": bundle_support,
                "confidence": round(float(row['confidence']), 4),
                "lift": round(float(row['lift']), 2),
                "kulc": kulc,
                "imbalanceRatio": ir,
                "cooccurrences": rule_cooccurrences,
                "coOccurrenceCount": backtest_metrics["coOccurrenceCount"],
                "opportunityScore": score,
                "testRecurrenceRate": round(float(recurrence_rate), 4),
                "validatedByHoldout": bool(validated_by_holdout),
                "isSignificant": bool(is_significant),
                "synergyScore": synergy_score,
                "bundleArchetype": guardrail_res["bundleArchetype"],
                "synergyBreakdown": synergy_breakdown,
                "isEmergingTrend": is_emerging_trend,
                "businessFitScore": round(float(biz_fit_score), 2),
                "bundleCategory": bundle_category,
                "bundleFitReason": bundle_fit_reason,
                "reason": f"[{guardrail_res['bundleArchetype']}] {bundle_fit_reason} Supported by FP-Growth with lift {round(float(row['lift']), 2)} and confidence {round(float(row['confidence']), 4)}.",
                "isMultiItem": is_multi_item,
                "crossSector": is_cross_sector(antecedents, consequents, product_sectors),
                "anchorVelocity": "fast",
                "bundleVelocity": "fast",
                "offerVelocity": "fast",
                "estimatedMarginImpact": estimated_margin_impact,
                **backtest_metrics,
                **pricing_fields,
            }

            # Deduplicate symmetric pairs (A=>B vs B=>A), keeping higher confidence direction
            if not is_multi_item:
                pair_key = tuple(sorted([item_a, item_b]))
                if pair_key not in deduped_rules or rule_obj["confidence"] > deduped_rules[pair_key]["confidence"]:
                    deduped_rules[pair_key] = rule_obj
            else:
                multi_key = (tuple(antecedents), tuple(consequents))
                if multi_key not in deduped_rules or rule_obj["confidence"] > deduped_rules[multi_key]["confidence"]:
                    deduped_rules[multi_key] = rule_obj

        rules_output = sorted(
            list(deduped_rules.values()),
            key=lambda x: (x['opportunityScore'], x['lift'], x['confidence']),
            reverse=True,
        )[:50]
        
        return base_result(
            rules_output,
            bundle_candidates,
            item_metrics,
            started_basket_count,
            len(dataset),
            cleaned_items,
            thresholds,
            baskets,
            extra={"uniqueItemCount": int(len(unique_products))},
        )
    except Exception as e:
        return {"error": str(e)}

class NpEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super(NpEncoder, self).default(obj)

if __name__ == "__main__":
    input_data = sys.stdin.read()
    try:
        payload = json.loads(input_data)
        data, config = parse_payload(payload)
        result = run_cross_sell(data, config)
        print(json.dumps(result, cls=NpEncoder))
    except Exception as e:
        print(json.dumps({"error": "Invalid JSON input or script error: " + str(e)}))

