from __future__ import annotations

import re
import threading
import copy
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

TDX_BASE_URL = "https://tdx.transportdata.tw/api/basic/v2"
TDX_TOKEN_URL = "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token"


class TdxError(RuntimeError):
    def __init__(self, code: str, message: str, status_code: int = 502):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def _localized_name(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("Zh_tw") or value.get("En") or "")
    return str(value or "")


def _parse_coordinate_pair(value: str) -> list[float] | None:
    pieces = value.strip().split()
    if len(pieces) < 2:
        return None
    try:
        longitude, latitude = float(pieces[0]), float(pieces[1])
    except ValueError:
        return None
    if not (-180 <= longitude <= 180 and -90 <= latitude <= 90):
        return None
    return [longitude, latitude]


def parse_tdx_linestring(wkt: str) -> list[dict[str, Any]]:
    """Convert TDX LINESTRING / MULTILINESTRING WKT to GeoJSON geometries."""
    match = re.match(r"^\s*(LINESTRING|MULTILINESTRING)(?:\s+Z|\s+M|\s+ZM)?\s*\((.*)\)\s*$", wkt, re.IGNORECASE | re.DOTALL)
    if not match:
        return []
    geometry_type = match.group(1).upper()
    body = match.group(2).strip()
    segments: list[str] = []
    if geometry_type == "LINESTRING":
        segments = [body]
    else:
        # Split the child line strings without breaking coordinate pairs.
        depth = 0
        start: int | None = None
        for index, character in enumerate(body):
            if character == "(":
                if depth == 0:
                    start = index + 1
                depth += 1
            elif character == ")":
                depth -= 1
                if depth == 0 and start is not None:
                    segments.append(body[start:index])
                    start = None
        if depth != 0:
            return []
    output = []
    for segment in segments:
        coordinates = [_parse_coordinate_pair(token) for token in segment.split(",")]
        if len(coordinates) >= 2 and all(coordinate is not None for coordinate in coordinates):
            output.append({"type": "LineString", "coordinates": coordinates})
    return output


class TdxClient:
    """Backend-only OAuth client for read-only TDX public transit endpoints."""

    def __init__(
        self,
        client_id: str | None,
        client_secret: str | None,
        *,
        http_client: httpx.Client | None = None,
        token_url: str = TDX_TOKEN_URL,
        base_url: str = TDX_BASE_URL,
        timeout_seconds: float = 12.0,
    ):
        self.client_id = (client_id or "").strip()
        self.client_secret = (client_secret or "").strip()
        self.http = http_client or httpx.Client(timeout=timeout_seconds)
        self.token_url = token_url
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self._token: str | None = None
        self._token_expires_at: datetime | None = None
        self._last_auth_error: str | None = None
        self._lock = threading.Lock()
        self._route_cache: dict[str, tuple[datetime, dict[str, Any]]] = {}
        self._route_cache_lock = threading.Lock()

    @property
    def configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    def status(self) -> dict[str, Any]:
        if not self.configured:
            return {
                "state": "not_configured",
                "reason_code": "credentials_missing",
                "message": "TDX 後端憑證未設定。",
            }
        if self._token and self._token_expires_at and self._token_expires_at > datetime.now(timezone.utc):
            return {
                "state": "connected",
                "reason_code": None,
                "message": "TDX OAuth 已驗證；尚未代表已載入路線資料。",
                "token_expires_at": self._token_expires_at.isoformat(),
            }
        if self._last_auth_error:
            return {
                "state": "not_connected",
                "reason_code": self._last_auth_error,
                "message": "TDX OAuth 尚未通過驗證。",
            }
        return {
            "state": "not_checked",
            "reason_code": "credential_validation_required",
            "message": "已設定後端憑證；需執行唯讀 OAuth 驗證。",
        }

    def access_token(self) -> str:
        with self._lock:
            now = datetime.now(timezone.utc)
            if self._token and self._token_expires_at and self._token_expires_at - timedelta(seconds=60) > now:
                return self._token
            if not self.configured:
                raise TdxError("credentials_missing", "TDX 後端憑證未設定。", 503)
            try:
                response = self.http.post(
                    self.token_url,
                    data={
                        "grant_type": "client_credentials",
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    timeout=self.timeout_seconds,
                )
            except httpx.TimeoutException as error:
                self._last_auth_error = "provider_timeout"
                raise TdxError("provider_timeout", "連線 TDX 認證服務逾時。", 504) from error
            except httpx.RequestError as error:
                self._last_auth_error = "provider_unavailable"
                raise TdxError("provider_unavailable", "目前無法連線 TDX 認證服務。", 503) from error
            if response.status_code >= 400:
                code = "invalid_client" if response.status_code in (400, 401) else "provider_auth_error"
                try:
                    provider_code = response.json().get("error")
                    if provider_code == "invalid_client":
                        code = "invalid_client"
                except (ValueError, AttributeError):
                    pass
                self._last_auth_error = code
                message = "TDX 憑證驗證失敗。" if code == "invalid_client" else "TDX 認證服務目前無法驗證憑證。"
                raise TdxError(code, message, 401 if code == "invalid_client" else 502)
            try:
                payload = response.json()
                token = payload.get("access_token")
                expires_in = int(payload.get("expires_in", 0))
            except (ValueError, TypeError, AttributeError) as error:
                self._last_auth_error = "invalid_auth_response"
                raise TdxError("invalid_auth_response", "TDX 認證服務回傳格式無效。", 502) from error
            if not isinstance(token, str) or not token or expires_in <= 0:
                self._last_auth_error = "invalid_auth_response"
                raise TdxError("invalid_auth_response", "TDX 認證服務回傳格式無效。", 502)
            self._token = token
            self._token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
            self._last_auth_error = None
            return token

    def get_json(self, path: str, params: dict[str, str] | None = None) -> Any:
        if not path.startswith("/") or ".." in path:
            raise ValueError("TDX endpoint path must be a safe absolute API path")
        for attempt in range(2):
            token = self.access_token()
            try:
                response = self.http.get(
                    f"{self.base_url}{path}",
                    params=params or {"$format": "JSON"},
                    headers={"Authorization": f"Bearer {token}", "Accept-Encoding": "gzip"},
                    timeout=self.timeout_seconds,
                )
            except httpx.TimeoutException as error:
                raise TdxError("provider_timeout", "TDX 資料服務逾時。", 504) from error
            except httpx.RequestError as error:
                raise TdxError("provider_unavailable", "目前無法連線 TDX 資料服務。", 503) from error
            if response.status_code == 401 and attempt == 0:
                with self._lock:
                    self._token = None
                    self._token_expires_at = None
                continue
            if response.status_code == 429:
                raise TdxError("rate_limited", "TDX 資料服務流量限制，請稍後再試。", 429)
            if response.status_code >= 400:
                raise TdxError("provider_data_error", "TDX 資料服務未能完成查詢。", 502)
            try:
                return response.json()
            except ValueError as error:
                raise TdxError("invalid_data_response", "TDX 資料服務回傳格式無效。", 502) from error
        raise TdxError("auth_expired", "TDX OAuth 權杖更新失敗。", 401)

    def route_map(self, route_prefix: str = "6670") -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9-]{1,16}", route_prefix):
            raise ValueError("route prefix must contain only letters, digits, or hyphens")
        with self._route_cache_lock:
            cached = self._route_cache.get(route_prefix)
            now = datetime.now(timezone.utc)
            if cached and now - cached[0] < timedelta(hours=6):
                return copy.deepcopy(cached[1])
            try:
                result = self._fetch_route_map(route_prefix)
            except TdxError:
                if not cached:
                    raise
                stale = copy.deepcopy(cached[1])
                stale["cache_status"] = "stale"
                stale["warnings"].append(
                    f"TDX 暫不可用；使用本機快取官方路線快照（擷取時間 {stale['retrieved_at']}）。"
                )
                return stale
            result["cache_status"] = "fresh"
            self._route_cache[route_prefix] = (datetime.now(timezone.utc), result)
            return copy.deepcopy(result)

    def _fetch_route_map(self, route_prefix: str) -> dict[str, Any]:
        safe_prefix = route_prefix.replace("'", "''")
        params = {"$filter": f"startswith(RouteName/Zh_tw,'{safe_prefix}')", "$top": "300", "$format": "JSON"}
        route_rows = self.get_json("/Bus/Route/InterCity", params)
        stop_rows = self.get_json("/Bus/StopOfRoute/InterCity", params)
        shape_rows = self.get_json("/Bus/Shape/InterCity", params)
        if not all(isinstance(rows, list) for rows in (route_rows, stop_rows, shape_rows)):
            raise TdxError("invalid_data_response", "TDX 路線服務回傳格式無效。", 502)

        def matching(row: Any) -> bool:
            return isinstance(row, dict) and _localized_name(row.get("RouteName")).startswith(route_prefix)

        routes = [row for row in route_rows if matching(row)]
        stops = [row for row in stop_rows if matching(row)]
        shapes = [row for row in shape_rows if matching(row)]
        route_uids = {str(row.get("RouteUID")) for row in routes if row.get("RouteUID")}
        features = []
        for row in shapes:
            geometries = parse_tdx_linestring(str(row.get("Geometry") or ""))
            for geometry in geometries:
                features.append({
                    "type": "Feature",
                    "properties": {
                        "route_uid": row.get("RouteUID"),
                        "route_id": row.get("RouteID"),
                        "sub_route_uid": row.get("SubRouteUID"),
                        "route_name": _localized_name(row.get("RouteName")),
                        "sub_route_name": _localized_name(row.get("SubRouteName")),
                        "direction": row.get("Direction"),
                        "update_time": row.get("UpdateTime"),
                    },
                    "geometry": geometry,
                })
        stop_features = []
        for route in stops:
            route_uid = str(route.get("RouteUID") or "")
            for stop in route.get("Stops", []) if isinstance(route.get("Stops"), list) else []:
                if not isinstance(stop, dict):
                    continue
                position = stop.get("StopPosition") or {}
                if not isinstance(position, dict):
                    continue
                try:
                    longitude = float(position.get("PositionLon"))
                    latitude = float(position.get("PositionLat"))
                except (TypeError, ValueError):
                    continue
                if not (-180 <= longitude <= 180 and -90 <= latitude <= 90):
                    continue
                stop_features.append({
                    "type": "Feature",
                    "properties": {
                        "route_uid": route_uid,
                        "route_name": _localized_name(route.get("RouteName")),
                        "sub_route_uid": route.get("SubRouteUID"),
                        "sub_route_name": _localized_name(route.get("SubRouteName")),
                        "direction": route.get("Direction"),
                        "stop_uid": stop.get("StopUID"),
                        "stop_id": stop.get("StopID"),
                        "stop_name": _localized_name(stop.get("StopName")),
                        "stop_sequence": stop.get("StopSequence"),
                    },
                    "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
                })
        return {
            "source": "TDX MOTC",
            "synthetic": False,
            "route_prefix": route_prefix,
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "api_family": "Bus v2 InterCity",
            "routes": routes,
            "route_uids": sorted(route_uids),
            "shapes": {"type": "FeatureCollection", "features": features},
            "stops": {"type": "FeatureCollection", "features": stop_features},
            "warnings": [
                "TDX 路線、站序與線形屬官方供應資料；不代表即時車輛位置。",
                "票證聚合尚未與 TDX StopUID 完成站點對照，請勿將兩者直接作 OD join。",
            ],
        }
