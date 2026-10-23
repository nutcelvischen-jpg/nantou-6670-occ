import json
import unittest
from urllib.parse import parse_qs

import httpx

from api.tdx_adapter import TdxClient, TdxError, parse_tdx_linestring


def fake_tdx_transport(handler):
    return httpx.Client(transport=httpx.MockTransport(handler), timeout=1)


class TdxAdapterTests(unittest.TestCase):
    def test_reports_missing_credentials_without_network_request(self):
        calls = []
        client = TdxClient(None, None, http_client=fake_tdx_transport(lambda request: calls.append(request)))
        self.assertEqual(client.status()["state"], "not_configured")
        with self.assertRaises(TdxError) as caught:
            client.access_token()
        self.assertEqual(caught.exception.code, "credentials_missing")
        self.assertEqual(calls, [])

    def test_oauth_form_is_backend_only_and_token_is_cached(self):
        requests = []

        def handler(request):
            requests.append(request)
            if request.url.path.endswith("/token"):
                self.assertEqual(parse_qs(request.content.decode())["grant_type"], ["client_credentials"])
                self.assertIn("client_id=test-id", request.content.decode())
                self.assertIn("client_secret=test-secret", request.content.decode())
                return httpx.Response(200, json={"access_token": "short-lived-test-token", "expires_in": 3600})
            return httpx.Response(200, json=[])

        client = TdxClient("test-id", "test-secret", http_client=fake_tdx_transport(handler))
        self.assertEqual(client.access_token(), "short-lived-test-token")
        self.assertEqual(client.access_token(), "short-lived-test-token")
        self.assertEqual(sum(request.url.path.endswith("/token") for request in requests), 1)
        self.assertEqual(client.status()["state"], "connected")

    def test_invalid_client_is_mapped_to_safe_error_without_echoing_credentials(self):
        def handler(_request):
            return httpx.Response(400, json={"error": "invalid_client", "error_description": "Invalid client credentials"})

        client = TdxClient("sensitive-id", "sensitive-secret", http_client=fake_tdx_transport(handler))
        with self.assertRaises(TdxError) as caught:
            client.access_token()
        self.assertEqual(caught.exception.code, "invalid_client")
        self.assertNotIn("sensitive", str(caught.exception))
        self.assertEqual(client.status()["reason_code"], "invalid_client")

    def test_401_refreshes_token_once_and_retries_read(self):
        token_count = 0
        data_count = 0

        def handler(request):
            nonlocal token_count, data_count
            if request.url.path.endswith("/token"):
                token_count += 1
                return httpx.Response(200, json={"access_token": f"token-{token_count}", "expires_in": 3600})
            data_count += 1
            if data_count == 1:
                return httpx.Response(401, json={"message": "expired"})
            self.assertEqual(request.headers.get("Authorization"), "Bearer token-2")
            return httpx.Response(200, json=[{"ok": True}])

        client = TdxClient("id", "secret", http_client=fake_tdx_transport(handler))
        self.assertEqual(client.get_json("/Bus/Route/InterCity"), [{"ok": True}])
        self.assertEqual(token_count, 2)
        self.assertEqual(data_count, 2)

    def test_route_map_returns_official_geojson_and_stop_coordinates(self):
        data_calls = 0
        route = {"RouteUID": "THB6670", "RouteID": "6670", "RouteName": {"Zh_tw": "6670"}}
        stop_rows = [{
            **route,
            "Direction": 0,
            "Stops": [{
                "StopUID": "THB0001",
                "StopID": "0001",
                "StopName": {"Zh_tw": "日月潭"},
                "StopSequence": 1,
                "StopPosition": {"PositionLon": 120.9, "PositionLat": 23.9},
            }],
        }]
        shape_rows = [{
            **route,
            "SubRouteUID": "THB6670A",
            "SubRouteName": {"Zh_tw": "6670A"},
            "Direction": 0,
            "Geometry": "LINESTRING (120.9 23.9, 121.0 24.0)",
            "UpdateTime": "2026-10-23T10:00:00+08:00",
        }]

        def handler(request):
            nonlocal data_calls
            if request.url.path.endswith("/token"):
                return httpx.Response(200, json={"access_token": "token", "expires_in": 3600})
            data_calls += 1
            if request.url.path.endswith("/Route/InterCity"):
                return httpx.Response(200, json=[route])
            if request.url.path.endswith("/StopOfRoute/InterCity"):
                return httpx.Response(200, json=stop_rows)
            if request.url.path.endswith("/Shape/InterCity"):
                return httpx.Response(200, json=shape_rows)
            return httpx.Response(404)

        client = TdxClient("id", "secret", http_client=fake_tdx_transport(handler))
        payload = client.route_map("6670")
        self.assertFalse(payload["synthetic"])
        self.assertEqual(payload["route_uids"], ["THB6670"])
        self.assertEqual(payload["shapes"]["features"][0]["geometry"]["coordinates"], [[120.9, 23.9], [121.0, 24.0]])
        self.assertEqual(payload["stops"]["features"][0]["properties"]["stop_name"], "日月潭")
        self.assertEqual(payload["stops"]["features"][0]["geometry"]["coordinates"], [120.9, 23.9])
        self.assertEqual(payload["cache_status"], "fresh")
        second = client.route_map("6670")
        self.assertEqual(second["shapes"], payload["shapes"])
        self.assertEqual(data_calls, 3, "a warm route cache must avoid another three upstream requests")

    def test_route_filter_and_wkt_parser_reject_bad_input(self):
        client = TdxClient("id", "secret", http_client=fake_tdx_transport(lambda _request: httpx.Response(200, json=[])))
        with self.assertRaises(ValueError):
            client.route_map("6670' or true")
        self.assertEqual(parse_tdx_linestring("POLYGON ((1 1, 2 2, 1 1))"), [])
        self.assertEqual(parse_tdx_linestring("LINESTRING (181 20, 182 21)"), [])
        multi = parse_tdx_linestring("MULTILINESTRING ((120.1 23.1,120.2 23.2),(120.3 23.3,120.4 23.4))")
        self.assertEqual(len(multi), 2)

    def test_route_prefix_is_applied_to_official_api_calls(self):
        captured = []

        def handler(request):
            captured.append(request)
            if request.url.path.endswith("/token"):
                return httpx.Response(200, json={"access_token": "token", "expires_in": 3600})
            return httpx.Response(200, json=[])

        client = TdxClient("id", "secret", http_client=fake_tdx_transport(handler))
        client.route_map("6670")
        data_requests = [request for request in captured if not request.url.path.endswith("/token")]
        self.assertEqual(len(data_requests), 3)
        for request in data_requests:
            self.assertIn("startswith(RouteName/Zh_tw,'6670')", request.url.params["$filter"])
            self.assertEqual(request.headers.get("Authorization"), "Bearer token")


if __name__ == "__main__":
    unittest.main()
