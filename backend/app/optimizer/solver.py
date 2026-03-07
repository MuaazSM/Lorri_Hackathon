from typing import List
from .heuristic import first_fit_decreasing, improve_solution
from .compatibility import shipments_compatible


def check_weight_constraint(shipments, vehicle):
    total_weight = sum(s.weight for s in shipments)
    return total_weight <= vehicle.capacity_weight


def check_volume_constraint(shipments, vehicle):
    total_volume = sum(s.volume for s in shipments)
    return total_volume <= vehicle.capacity_volume


def validate_single_assignment(trucks):

    assigned = set()

    for truck in trucks:
        for s in truck:

            if s.id in assigned:
                return False

            assigned.add(s.id)

    return True


def check_time_windows(truck):

    for i in range(len(truck)):
        for j in range(i + 1, len(truck)):

            s1 = truck[i]
            s2 = truck[j]

            if not shipments_compatible(s1, s2):
                return False

    return True


def heuristic_solver(shipments, vehicles):

    vehicle = vehicles[0]

    trucks = first_fit_decreasing(shipments, vehicle)

    trucks = improve_solution(trucks, vehicle)

    valid_trucks = []

    for truck in trucks:

        if not check_weight_constraint(truck, vehicle):
            continue

        if not check_volume_constraint(truck, vehicle):
            continue

        if not check_time_windows(truck):
            continue

        valid_trucks.append(truck)

    return valid_trucks


def solve(shipments, vehicles):
    """
    Main solver interface
    """

    if len(shipments) <= 50:
        return heuristic_solver(shipments, vehicles)

    else:
        return heuristic_solver(shipments, vehicles)