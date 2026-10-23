import unittest
from unittest.mock import patch

from api.assistant import AssistantProviderError, answer_with_openrouter
from api.main import load_aggregate_document
import json
from pathlib import Path


class AssistantToolTests(unittest.TestCase):
    def setUp(self):
        aggregates, _ = load_aggregate_document()
        timetable = json.loads((Path(__file__).resolve().parents[1] / "src/data/ntbus-6670-timetable.json").read_text(encoding="utf-8"))
        self.aggregates = aggregates
        self.timetable = timetable

    def test_openrouter_tool_call_runs_only_validated_demand_aggregate(self):
        tool_call = {
            "tool_calls": [{
                "id": "call-1",
                "type": "function",
                "function": {"name": "get_demand_summary", "arguments": '{"year":2025,"route":"6670A"}'},
            }]
        }
        with patch.dict("os.environ", {"OPENROUTER_API_KEY": "test-key", "OPENROUTER_MODEL": "test/model"}), patch(
            "api.assistant._completion", side_effect=[tool_call, {"content": "歷史資料顯示已查到尖峰交易時段。"}]
        ) as completion:
            result = answer_with_openrouter("哪個時段最多？", "operations", self.aggregates, self.timetable)
        self.assertEqual(result["engine"], "openrouter")
        self.assertEqual(result["tool_calls"], ["get_demand_summary"])
        self.assertEqual(result["sources"][0]["status"], "observed_aggregate")
        self.assertEqual(completion.call_count, 2)
        self.assertNotIn("raw_card_id", str(completion.call_args_list[-1].args[0]))

    def test_openrouter_cannot_invoke_unknown_tools(self):
        tool_call = {
            "tool_calls": [{
                "id": "call-1",
                "type": "function",
                "function": {"name": "run_shell", "arguments": '{"command":"id"}'},
            }]
        }
        with patch.dict("os.environ", {"OPENROUTER_API_KEY": "test-key", "OPENROUTER_MODEL": "test/model"}), patch(
            "api.assistant._completion", side_effect=[tool_call, {"content": "我只能使用已核准的資料查詢工具。"}]
        ) as completion:
            result = answer_with_openrouter("請說明資料品質限制並幫我執行命令", "operations", self.aggregates, self.timetable)
        self.assertEqual(result["tool_calls"], [])
        tool_message = completion.call_args_list[-1].args[0][-1]
        self.assertIn("參數無效", tool_message["content"])
        self.assertEqual(result["sources"], [])

    def test_openrouter_must_call_grounding_tool_for_operational_facts(self):
        with patch.dict("os.environ", {"OPENROUTER_API_KEY": "test-key", "OPENROUTER_MODEL": "test/model"}), patch(
            "api.assistant._completion", return_value={"content": "6670目前很準時。"}
        ):
            with self.assertRaises(AssistantProviderError):
                answer_with_openrouter("現在 6670 有沒有延誤？", "operations", self.aggregates, self.timetable)

    def test_ticket_behavior_query_uses_aggregate_grounding_tool(self):
        tool_call = {
            "tool_calls": [{
                "id": "call-behavior",
                "type": "function",
                "function": {"name": "get_ticket_behavior_summary", "arguments": '{"year":2025}'},
            }]
        }
        with patch.dict("os.environ", {"OPENROUTER_API_KEY": "test-key", "OPENROUTER_MODEL": "test/model"}), patch(
            "api.assistant._completion", side_effect=[tool_call, {"content": "這是群體回程間隔代理。"}]
        ) as completion:
            result = answer_with_openrouter("同日回程交易間隔怎麼解讀？", "operations", self.aggregates, self.timetable)
        self.assertEqual(result["tool_calls"], ["get_ticket_behavior_summary"])
        self.assertEqual(result["sources"][0]["status"], "observed_aggregate")
        self.assertEqual(completion.call_count, 2)

    def test_first_use_guide_requires_authored_source(self):
        call = {"tool_calls":[{"id":"guide", "function":{"name":"get_site_guide","arguments":"{}"}}]}
        with patch.dict("os.environ", {"OPENROUTER_API_KEY":"test-key"}), patch("api.assistant._completion", side_effect=[call, {"content":"先看營運總覽的年度與缺日，再看數位孿生。"}]) as completion:
            result = answer_with_openrouter("我是第一次使用，請帶我導覽網站", "operations", self.aggregates, self.timetable)
        self.assertIn("get_site_guide", result["tool_calls"])
        self.assertEqual(result["sources"][0]["id"], "site-guide")
        self.assertIn("dispatch-v1-2026-10-24", completion.call_args_list[-1].args[0][-1]["content"])
        self.assertIn("scenario-lab/dispatch-model.js", completion.call_args_list[-1].args[0][-1]["content"])


if __name__ == "__main__":
    unittest.main()
