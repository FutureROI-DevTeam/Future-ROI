from datetime import timedelta


def evaluation_windows(people, origin):
    """One fixed forecast origin per person, without selecting on future availability."""
    for days in (7, 28):
        start = origin - timedelta(days=days - 1)
        for records in people.values():
            if not any(start <= day <= origin for day in records):
                continue
            minutes = [records.get(start + timedelta(days=i)) for i in range(days + 14)]
            yield {"startDate": start.isoformat(), "history": minutes[:days], "future": minutes[days:]}
