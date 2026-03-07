import pytest
from app.optimizer.heuristic import first_fit_decreasing
from app.optimizer.solver import validate_single_assignment


class Shipment:
    def __init__(self, id, weight, volume, pickup_start, pickup_end):

        self.id = id
        self.weight = weight
        self.volume = volume
        self.pickup_start = pickup_start
        self.pickup_end = pickup_end
        self.origin = "A"
        self.destination = "B"


class Vehicle:
    def __init__(self):

        self.capacity_weight = 100
        self.capacity_volume = 100


def create_shipments():

    shipments = []

    for i in range(10):

        shipments.append(
            Shipment(
                id=i,
                weight=10,
                volume=5,
                pickup_start=0,
                pickup_end=10,
            )
        )

    return shipments


def test_capacity():

    shipments = create_shipments()

    vehicle = Vehicle()

    trucks = first_fit_decreasing(shipments, vehicle)

    for truck in trucks:

        total_weight = sum(s.weight for s in truck)

        assert total_weight <= vehicle.capacity_weight


def test_single_assignment():

    shipments = create_shipments()

    vehicle = Vehicle()

    trucks = first_fit_decreasing(shipments, vehicle)

    assert validate_single_assignment(trucks)


def test_all_shipments_assigned():

    shipments = create_shipments()

    vehicle = Vehicle()

    trucks = first_fit_decreasing(shipments, vehicle)

    assigned = []

    for truck in trucks:
        assigned.extend(truck)

    assert len(assigned) == len(shipments)