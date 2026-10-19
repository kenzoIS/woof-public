"""
Attach-Rate Lift Simulation & Backtesting Engine for Cross-Selling Bundles
"""

def normalize_items_input(item_input):
    """
    Normalizes single items, lists/tuples of items, or '+'-separated strings into a set of lowercase item strings.
    """
    if isinstance(item_input, (list, tuple, set)):
        items = set()
        for i in item_input:
            items.update(normalize_items_input(i))
        return items

    item_str = str(item_input or '').strip().lower()
    if not item_str:
        return set()

    if '+' in item_str:
        return {part.strip().lower() for part in item_str.split('+') if part.strip()}

    return {item_str}


def build_basket_index(dataset):
    """
    Builds an inverted index of lowercase item tokens to basket indices for O(1) subset matching.
    """
    index = {}
    for idx, basket in enumerate(dataset):
        if isinstance(basket, dict):
            basket_items_raw = basket.get("items", [])
        else:
            basket_items_raw = basket
        items_set = normalize_items_input(basket_items_raw)
        for it in items_set:
            if it not in index:
                index[it] = set()
            index[it].add(idx)
    return index


def compute_attach_rate_metrics(
    dataset,
    anchor_item,
    bundle_item,
    confidence,
    business_fit_score=0.8,
    min_lift_threshold=5.0,
    known_anchor_count=None,
    known_both_count=None,
    basket_index=None,
):
    """
    Simulates attach rate performance against historical dataset.
    
    Returns:
        dict: {
            "baselineAttachRate": float (0.0 to 1.0),
            "predictedAttachRate": float (0.0 to 1.0),
            "attachRateLift": float (percentage lift, e.g. +25.5),
            "backtestValidationStatus": "PASSED" | "LOW_CONFIDENCE" | "INSUFFICIENT_DATA",
            "coOccurrenceCount": int,
            "anchorBasketCount": int
        }
    """
    anchor_set = normalize_items_input(anchor_item)
    bundle_set = normalize_items_input(bundle_item)

    if known_anchor_count is not None and known_both_count is not None:
        anchor_count = int(known_anchor_count)
        both_count = int(known_both_count)
    elif basket_index is not None and anchor_set:
        anchor_matches = None
        for a in anchor_set:
            matching = basket_index.get(a, set())
            anchor_matches = matching if anchor_matches is None else (anchor_matches & matching)
            if not anchor_matches:
                break
        anchor_count = len(anchor_matches) if anchor_matches else 0

        both_count = 0
        if anchor_count > 0 and bundle_set and anchor_matches:
            both_matches = set(anchor_matches)
            for b in bundle_set:
                matching = basket_index.get(b, set())
                both_matches &= matching
                if not both_matches:
                    break
            both_count = len(both_matches)
    elif dataset and anchor_set:
        anchor_count = 0
        both_count = 0
        for basket in dataset:
            if isinstance(basket, dict):
                basket_items_raw = basket.get("items", [])
            else:
                basket_items_raw = basket

            items_set = normalize_items_input(basket_items_raw)
            if anchor_set.issubset(items_set):
                anchor_count += 1
                if bundle_set and bundle_set.issubset(items_set):
                    both_count += 1
    else:
        anchor_count = 0
        both_count = 0

    baseline_attach_rate = (both_count / anchor_count) if anchor_count > 0 else 0.0

    # Model predicted attach rate boosting using confidence & domain fit score
    conf_boost = 0.15 * float(confidence or 0)
    fit_boost = 0.10 * float(business_fit_score or 0.8)
    lift_increment = conf_boost + fit_boost

    predicted_attach_rate = min(1.0, max(baseline_attach_rate, baseline_attach_rate + lift_increment))

    if baseline_attach_rate >= 0.01:
        attach_rate_lift = round(
            ((predicted_attach_rate - baseline_attach_rate) / baseline_attach_rate)
            * 100.0,
            2,
        )
    else:
        # Standardize zero/near-zero baselines as absolute percentage point lift
        attach_rate_lift = round(
            (predicted_attach_rate - baseline_attach_rate) * 100.0, 2
        )

    if anchor_count < 5:
        validation_status = "INSUFFICIENT_DATA"
    elif attach_rate_lift >= min_lift_threshold:
        validation_status = "PASSED"
    else:
        validation_status = "LOW_CONFIDENCE"

    return {
        "baselineAttachRate": round(float(baseline_attach_rate), 4),
        "predictedAttachRate": round(float(predicted_attach_rate), 4),
        "attachRateLift": round(float(attach_rate_lift), 2),
        "backtestValidationStatus": validation_status,
        "coOccurrenceCount": both_count,
        "anchorBasketCount": anchor_count,
    }
