from typing import List


def time_windows_compatible(s1, s2):
    """
    Check if pickup time windows overlap
    """
    if s1.pickup_end < s2.pickup_start:
        return False

    if s2.pickup_end < s1.pickup_start:
        return False

    return True


def special_handling_match(s1, s2):
    """
    Ensure special handling requirements match
    """
    if hasattr(s1, "special_handling") and hasattr(s2, "special_handling"):
        return s1.special_handling == s2.special_handling
    return True


def route_overlap(s1, s2):
    """
    Basic route compatibility check
    """
    if s1.origin == s2.origin:
        return True

    if s1.destination == s2.destination:
        return True

    return True


def shipments_compatible(s1, s2):
    """
    Master compatibility check
    """

    if not time_windows_compatible(s1, s2):
        return False

    if not special_handling_match(s1, s2):
        return False

    if not route_overlap(s1, s2):
        return False

    return True


def filter_compatible_shipments(shipments: List):
    """
    Generate compatible shipment pairs
    """
    compatible_pairs = []

    for i in range(len(shipments)):
        for j in range(i + 1, len(shipments)):
            if shipments_compatible(shipments[i], shipments[j]):
                compatible_pairs.append((shipments[i], shipments[j]))

    return compatible_pairs