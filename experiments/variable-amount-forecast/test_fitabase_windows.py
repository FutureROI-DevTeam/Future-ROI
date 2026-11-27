import json
import unittest
from datetime import timedelta

from daily_windows import evaluation_windows
from fitabase_windows import ORIGIN, activity_minutes
from pmdata_windows import level_days, recorded_activity


class PublicActivityWindowsTest(unittest.TestCase):
    def test_recorded_zero_and_unknown_are_distinct(self):
        row = {"TotalSteps": "30", "FairlyActiveMinutes": "0", "VeryActiveMinutes": "0"}
        self.assertEqual(activity_minutes(row), 0)
        self.assertEqual(activity_minutes({**row, "FairlyActiveMinutes": "3", "VeryActiveMinutes": "4"}), 7)
        self.assertIsNone(activity_minutes({**row, "TotalSteps": "0"}))
        self.assertIsNone(activity_minutes({**row, "FairlyActiveMinutes": ""}))
        with self.assertRaises(ValueError):
            activity_minutes({**row, "VeryActiveMinutes": "-1"})

    def test_selection_uses_only_history_and_keeps_the_future_calendar(self):
        people = {
            "observed": {ORIGIN - timedelta(days=6): 0, ORIGIN: 5, ORIGIN + timedelta(days=14): 25},
            "future_only": {ORIGIN + timedelta(days=1): 10},
            "no_followup": {ORIGIN - timedelta(days=20): 5},
        }
        seven, long_one, long_two = list(evaluation_windows(people, ORIGIN))
        self.assertEqual(seven["history"], [0, None, None, None, None, None, 5])
        self.assertEqual(seven["future"], [None] * 13 + [25])
        self.assertEqual(long_one["history"][-7:], seven["history"])
        self.assertEqual(long_one["future"], seven["future"])
        self.assertEqual(long_two["future"], [None] * 14)
        self.assertEqual(set(seven), {"startDate", "history", "future"})

    def test_pmdata_requires_three_series_and_evidence_of_activity(self):
        def read(cell):
            return level_days(json.dumps([{"dateTime": "2020-01-30 00:00:00", "value": cell}]))

        zero, light, minutes = read("0"), read("15"), read("7")
        day = next(iter(zero))
        self.assertEqual(recorded_activity(light, zero, zero)[day], 0)
        self.assertEqual(recorded_activity(zero, minutes, minutes)[day], 14)
        self.assertIsNone(recorded_activity(zero, zero, zero)[day])
        self.assertIsNone(recorded_activity({}, minutes, minutes)[day])
        self.assertIsNone(recorded_activity(read(None), minutes, minutes)[day])
        with self.assertRaises(ValueError):
            recorded_activity(read("1440"), minutes, minutes)
