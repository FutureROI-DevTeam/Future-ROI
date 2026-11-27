"""Convert the two published Zenodo archives to anonymous evaluation windows on stdout."""
import argparse
import csv
from datetime import date, datetime, timedelta
import hashlib
import io
import json
from pathlib import Path
import sys
import zipfile


EXPORTS = (
    ("3.12.16-4.11.16", "cca5d7b1cae2370b3e1024349aa86732394129afcc84ce7b6067693ac0f4c2c6"),
    ("4.12.16-5.12.16", "4741dfabd18453de19b6dd0a7204e8fea6e45e70bc9ddbe396956c8e4fde02f8"),
)
ORIGIN = date(2016, 4, 28)


def activity_minutes(row):
    cells = [row[name] for name in ("TotalSteps", "FairlyActiveMinutes", "VeryActiveMinutes")]
    if any(value == "" for value in cells):
        return None
    steps, moderate, very = map(int, cells)
    if min(steps, moderate, very) < 0 or moderate + very > 1440:
        raise ValueError("Invalid daily step or activity-minute count")
    return moderate + very if steps > 0 else None


def read_days(directory):
    people = {}
    for period, expected in EXPORTS:
        archive = directory / f"mturkfitbit_export_{period}.zip"
        if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
            raise ValueError(f"Unexpected archive SHA-256 for {period}")
        with zipfile.ZipFile(archive) as source:
            with source.open(f"Fitabase Data {period}/dailyActivity_merged.csv") as stream:
                rows = csv.DictReader(io.TextIOWrapper(stream, encoding="utf-8-sig", newline=""))
                seen = set()
                for row in rows:
                    person = row["Id"]
                    day = datetime.strptime(row["ActivityDate"], "%m/%d/%Y").date()
                    if (person, day) in seen:
                        raise ValueError(f"Duplicate daily activity row in {period}")
                    seen.add((person, day))
                    # The later export takes precedence if the two periods overlap.
                    people.setdefault(person, {})[day] = activity_minutes(row)
    return people


def evaluation_windows(people):
    for days in (7, 28):
        start = ORIGIN - timedelta(days=days - 1)
        for records in people.values():
            # Inclusion depends on a row during the history, never on future availability.
            if not any(start <= day <= ORIGIN for day in records):
                continue
            minutes = [records.get(start + timedelta(days=i)) for i in range(days + 14)]
            yield {"startDate": start.isoformat(), "history": minutes[:days], "future": minutes[days:]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="Directory containing the two original Zenodo ZIP files")
    people = read_days(parser.parse_args().directory)
    json.dump(list(evaluation_windows(people)), sys.stdout, separators=(",", ":"))
