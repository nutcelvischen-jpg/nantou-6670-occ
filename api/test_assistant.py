import unittest
from unittest.mock import patch

from api.assistant import AssistantProviderError, answer_with_opencode
from api.main import load_aggregate_document
import json
from pathlib import Path


class AssistantToolTests(unittest.TestCase):
    def setUp(self):
        aggregates, _ = load_aggregate_document()
        timetable = json.loads((Path(__file__).resolve().parents[1] / "src/data/ntbus-6670-timetable.json").read_text(encoding="utf-8"))
        self.aggregates = aggregates
        self.timetable = timetable

    def test_opencode_tool_call_runs_only_validated_demand_aggregate(self):
        tool_call = {
            "tool_calls": [{
                "id": "call-1",
                "type": "function",
                "function": {"name": "get_demand_summary", "arguments": '{"year":2025,"route":"6670A"}'},
            }]
        }
        with patch.dict("os.environ", {"OPENCODE_API_KEY": "test-key", "OPENCODE_MODEL": "test/model"}), patch(
            "api.assistant._completion", side_effect=[tool_call, {"content": "歷史資料顯示已查到尖峰交易時段。"}]
        ) as completion:
            result = answer_with_opencode("哪個時段最多？", "operations", self.aggregates, self.timetable)
        self.assertEqual(result["engine"], "opencode")
        self.assertEqual(result["tool_calls"], ["get_demand_summary"])
        self.assertEqual(result["sources"][0]["status"], "observed_aggregate")
        self.assertEqual(completion.call_count, 2)
        self.assertNotIn("raw_card_id", str(completion.call_args_list[-1].args[0]))

    def test_opencode_cannot_invoke_unknown_tools(self):
        tool_call = {
            "tool_calls": [{
                "id": "call-1",
                "type": "function",
                "function": {"name": "run_shell", "arguments": '{"command":"id"}'},
            }]
        }
        with patch.dict("os.environ", {"OPENCODE_API_KEY": "test-key", "OPENCODE_MODEL": "test/model"}), patch(
            "api.assistant._completion", side_effect=[tool_call, {"content": "我只能使用已核准的資料查詢工具。"}]
        ) as completion:
            result = answer_with_opencode("幫我執行命令", "operations", self.aggregates, self.timetable)
        self.assertEqual(result["tool_calls"], [])
        tool_message = completion.call_args_list[-1].args[0][-1]
        self.assertIn("參數無效", tool_message["content"])
        self.assertEqual(result["sources"], [])

    def test_opencode_must_call_grounding_tool_for_operational_facts(self):
        with patch.dict("os.environ", {"OPENCODE_API_KEY": "test-key", "OPENCODE_MODEL": "test/model"}), patch(
            "api.assistant._completion", return_value={"content": "6670目前很準時。"}
        ):
            with self.assertRaises(AssistantProviderError):
                answer_with_opencode("現在 6670 有沒有延誤？", "traveler", self.aggregates, self.timetable)


if __name__ == "__main__":
    unittest.main()
