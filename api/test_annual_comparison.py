import json
import unittest
from pathlib import Path
from api.annual_comparison import annual_context
from api.assistant import answer_demo
class AnnualComparisonTests(unittest.TestCase):
    def setUp(self):self.data=json.loads((Path(__file__).resolve().parents[1]/'src/data/ticket-aggregates.json').read_text())
    def test_totals_coverage_and_denominators(self):
        c=annual_context(self.data,'年度差異',2025,2024)['annual_comparison']
        self.assertEqual(c['total']['delta'],50612);self.assertEqual(c['base']['observedDays'],361);self.assertEqual(c['target']['observedDays'],364)
        self.assertEqual(c['commonCalendar']['days'],359);self.assertAlmostEqual(c['dailyMean']['target'],925761/364)
        self.assertEqual(sum(m['target'] for m in c['months']),925761)
    def test_missing_and_subline_scope(self):
        self.assertIsNone(annual_context(self.data,'2025跟2026年度比較',2025,2024)['annual_comparison'])
        c=annual_context(self.data,'年度比較',2025,2024,'6670D')['annual_comparison'];self.assertEqual(c['total']['delta'],-6299);self.assertIsNone(c['dailyMean']['target'])
    def test_local_fallback_has_both_sources(self):
        r=answer_demo('比較2024與2025年度交易差異','operations',self.data,{},2025,'全部')
        self.assertIn('50,612',r['answer']);self.assertEqual(len(r['sources']),2)
