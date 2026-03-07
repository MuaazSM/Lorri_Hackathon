from typing import List


def first_fit_decreasing(shipments, vehicle):
    """
    First Fit Decreasing heuristic for truck loading
    """

    shipments_sorted = sorted(shipments, key=lambda s: s.weight, reverse=True)

    trucks = []

    for shipment in shipments_sorted:

        placed = False

        for truck in trucks:

            current_weight = sum(s.weight for s in truck)
            current_volume = sum(s.volume for s in truck)

            if (
                current_weight + shipment.weight <= vehicle.capacity_weight
                and current_volume + shipment.volume <= vehicle.capacity_volume
            ):
                truck.append(shipment)
                placed = True
                break

        if not placed:
            trucks.append([shipment])

    return trucks


def improve_solution(trucks, vehicle):
    """
    Simple local search improvement
    """

    for i in range(len(trucks)):
        for j in range(i + 1, len(trucks)):

            for s1 in trucks[i]:
                for s2 in trucks[j]:

                    if s1.weight > s2.weight:

                        trucks[i].remove(s1)
                        trucks[j].remove(s2)

                        trucks[i].append(s2)
                        trucks[j].append(s1)

                        return trucks

    return trucks