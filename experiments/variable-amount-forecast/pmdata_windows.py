"""Convert PMData's three daily Fitbit activity series to anonymous evaluation windows."""
import argparse
from datetime import date, datetime
import hashlib
import json
from pathlib import Path
import sys

from daily_windows import evaluation_windows


ORIGIN = date(2020, 1, 30)
LEVELS = ("lightly_active_minutes", "moderately_active_minutes", "very_active_minutes")
SOURCE_SHA256 = "5e00446279c3536140762e8942be1400414a3271f07961e35f66d787a41daf0e"


def level_days(raw):
    days = {}
    for row in json.loads(raw):
        day = datetime.fromisoformat(row["dateTime"]).date()
        cell = row["value"]
        value = None if cell is None or cell == "" else int(cell)
        if day in days or (value is not None and not 0 <= value <= 1440):
            raise ValueError("Duplicate day or invalid daily activity minutes")
        days[day] = value
    return days


def recorded_activity(light, moderate, very):
    days = {}
    for day in light.keys() | moderate.keys() | very.keys():
        values = [level.get(day) for level in (light, moderate, very)]
        if None in values or sum(values) == 0:
            days[day] = None
        elif sum(values) > 1440:
            raise ValueError("Combined daily activity minutes exceed 24 hours")
        else:
            days[day] = values[1] + values[2]
    return days


def read_days(directory):
    digest = hashlib.sha256()
    people = {}
    for number in range(1, 17):
        label = f"p{number:02d}"
        levels = []
        for level in LEVELS:
            member = Path(label, "fitbit", level + ".json")
            path = directory / member
            if path.is_file():
                raw = path.read_bytes()
                line = member.as_posix() + " " + hashlib.sha256(raw).hexdigest() + "\n"
                digest.update(line.encode("ascii"))
                levels.append(level_days(raw))
            else:
                # One daily series is absent in the published OSF release.
                levels.append({})
        people[label] = recorded_activity(*levels)
    if digest.hexdigest() != SOURCE_SHA256:
        raise ValueError("Unexpected PMData daily files. Use the original OSF pmdata folder.")
    return people


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="OSF pmdata folder containing p01 through p16")
    people = read_days(parser.parse_args().directory)
    json.dump(list(evaluation_windows(people, ORIGIN)), sys.stdout, separators=(",", ":"))
