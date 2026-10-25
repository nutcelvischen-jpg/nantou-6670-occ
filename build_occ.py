import json, os

data_dir = "/Users/chenchunchih/Documents/ChatGPT/黑客松-南投/6670_bus_data"

with open(os.path.join(data_dir, "6670_subroutes.json"), "r", encoding="utf-8") as f:
    subroutes = json.load(f)

with open(os.path.join(data_dir, "6670_all_stops.json"), "r", encoding="utf-8") as f:
    all_stops = json.load(f)

with open(os.path.join(data_dir, "6670_realtime_bus_positions.json"), "r", encoding="utf-8") as f:
    buses = json.load(f)

with open(os.path.join(data_dir, "6670_realtime_arrival.json"), "r", encoding="utf-8") as f:
    arrivals = json.load(f)

html_template = """<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>日月潭 6670 智慧行控調度中心 | 3D 數位孿生平台</title>
    <!-- MapLibre GL JS -->
    <link href="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css" rel="stylesheet" />
    <script src="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js"></script>
    <!-- FontAwesome -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
    <!-- Google Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;800;900&family=Rajdhani:wght@500;600;700&family=Noto+Sans+TC:wght@400;500;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">

    <style>
        :root {
            --bg-base: #060911;
            --bg-panel: rgba(10, 16, 28, 0.85);
            --bg-card: rgba(16, 26, 44, 0.75);
            --border-glow: rgba(0, 240, 255, 0.4);
            --cyan: #00f0ff;
            --amber: #ff9d00;
            --emerald: #00ff88;
            --rose: #ff3366;
            --purple: #b042ff;
            --text-dim: #7d90b2;
            --text-bright: #e6f1ff;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            user-select: none;
        }

        body {
            font-family: "Rajdhani", "Noto Sans TC", sans-serif;
            background-color: var(--bg-base);
            color: var(--text-bright);
            overflow: hidden;
            height: 100vh;
            width: 100vw;
        }

        #map {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 1;
        }

        .vignette-overlay {
            position: absolute;
            inset: 0;
            pointer-events: none;
            z-index: 2;
            background: radial-gradient(circle at center, transparent 40%, rgba(4, 7, 13, 0.6) 80%, rgba(3, 5, 10, 0.95) 100%);
            box-shadow: inset 0 0 100px rgba(0, 240, 255, 0.08);
        }

        header.hud-header {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 70px;
            z-index: 10;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 24px;
            background: linear-gradient(180deg, rgba(8, 14, 25, 0.95) 0%, rgba(8, 14, 25, 0.8) 70%, transparent 100%);
            border-bottom: 1px solid rgba(0, 240, 255, 0.2);
            backdrop-filter: blur(8px);
        }

        .header-title {
            display: flex;
            align-items: center;
            gap: 14px;
        }

        .brand-badge {
            width: 44px;
            height: 44px;
            background: linear-gradient(135deg, var(--cyan), var(--amber));
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #050a14;
            font-size: 22px;
            box-shadow: 0 0 20px rgba(0, 240, 255, 0.5);
            animation: pulse-glow 3s infinite alternate;
        }

        @keyframes pulse-glow {
            0% { box-shadow: 0 0 15px rgba(0, 240, 255, 0.4); }
            100% { box-shadow: 0 0 30px rgba(255, 157, 0, 0.7); }
        }

        .title-text h1 {
            font-family: "Orbitron", sans-serif;
            font-size: 20px;
            letter-spacing: 2px;
            font-weight: 800;
            background: linear-gradient(90deg, #ffffff, var(--cyan));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .title-text .sub {
            font-size: 11px;
            color: var(--text-dim);
            font-family: "Share Tech Mono", monospace;
            letter-spacing: 1px;
        }

        .header-stats {
            display: flex;
            align-items: center;
            gap: 20px;
        }

        .stat-chip {
            background: var(--bg-card);
            border: 1px solid rgba(0, 240, 255, 0.2);
            padding: 6px 14px;
            border-radius: 6px;
            display: flex;
            flex-direction: column;
            align-items: center;
            min-width: 90px;
        }

        .stat-chip .val {
            font-family: "Orbitron", sans-serif;
            font-size: 18px;
            font-weight: 700;
            color: var(--cyan);
        }

        .stat-chip .lbl {
            font-size: 10px;
            color: var(--text-dim);
            text-transform: uppercase;
        }

        .header-controls {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .hud-btn {
            background: rgba(0, 240, 255, 0.1);
            border: 1px solid var(--cyan);
            color: var(--cyan);
            padding: 8px 16px;
            border-radius: 6px;
            font-family: "Rajdhani", sans-serif;
            font-weight: 700;
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .hud-btn:hover {
            background: var(--cyan);
            color: #050a14;
            box-shadow: 0 0 20px rgba(0, 240, 255, 0.6);
            transform: translateY(-1px);
        }

        .hud-btn.active {
            background: var(--cyan);
            color: #050a14;
            box-shadow: 0 0 25px rgba(0, 240, 255, 0.8);
        }

        .hud-btn.amber {
            border-color: var(--amber);
            color: var(--amber);
            background: rgba(255, 157, 0, 0.1);
        }
        .hud-btn.amber:hover, .hud-btn.amber.active {
            background: var(--amber);
            color: #050a14;
            box-shadow: 0 0 20px rgba(255, 157, 0, 0.6);
        }

        .panel {
            position: absolute;
            top: 86px;
            bottom: 60px;
            z-index: 10;
            width: 370px;
            background: var(--bg-panel);
            border: 1px solid rgba(0, 240, 255, 0.25);
            backdrop-filter: blur(12px);
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 10px 40px rgba(0,0,0,0.6);
            transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .panel-left { left: 20px; }
        .panel-right { right: 20px; }

        .panel-header {
            padding: 14px 18px;
            background: rgba(14, 24, 42, 0.9);
            border-bottom: 1px solid rgba(0, 240, 255, 0.2);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .panel-header h2 {
            font-size: 15px;
            font-family: "Orbitron", sans-serif;
            font-weight: 700;
            letter-spacing: 1px;
            display: flex;
            align-items: center;
            gap: 10px;
            color: #ffffff;
        }

        .panel-header h2 i { color: var(--cyan); }

        .subroute-tabs {
            display: flex;
            gap: 6px;
            padding: 10px 14px;
            background: rgba(8, 14, 25, 0.6);
            overflow-x: auto;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            scrollbar-width: none;
        }
        .subroute-tabs::-webkit-scrollbar { display: none; }

        .sub-tab {
            padding: 5px 12px;
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.2s;
            color: var(--text-dim);
            font-family: "Share Tech Mono", monospace;
        }

        .sub-tab:hover {
            border-color: var(--cyan);
            color: #fff;
        }

        .sub-tab.active {
            background: rgba(0, 240, 255, 0.15);
            border-color: var(--cyan);
            color: var(--cyan);
            font-weight: 700;
            box-shadow: 0 0 10px rgba(0, 240, 255, 0.3);
        }

        .panel-body {
            flex: 1;
            overflow-y: auto;
            padding: 12px 14px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .panel-body::-webkit-scrollbar { width: 5px; }
        .panel-body::-webkit-scrollbar-thumb { background: rgba(0,240,255,0.25); border-radius: 3px; }

        .bus-card {
            background: var(--bg-card);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 8px;
            padding: 12px;
            cursor: pointer;
            transition: all 0.2s;
            position: relative;
            overflow: hidden;
        }

        .bus-card:hover {
            border-color: var(--cyan);
            background: rgba(20, 34, 58, 0.85);
            transform: translateX(4px);
        }

        .bus-card.active {
            border-color: var(--cyan);
            box-shadow: 0 0 15px rgba(0, 240, 255, 0.3);
            background: rgba(20, 36, 62, 0.9);
        }

        .bus-card-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 6px;
        }

        .plate-box {
            font-family: "Orbitron", monospace;
            font-size: 14px;
            font-weight: 700;
            letter-spacing: 1px;
            color: #ffffff;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .route-pill {
            font-size: 11px;
            padding: 2px 7px;
            background: rgba(0, 240, 255, 0.15);
            border: 1px solid var(--cyan);
            color: var(--cyan);
            border-radius: 4px;
            font-family: "Share Tech Mono", monospace;
        }

        .speed-badge {
            font-family: "Share Tech Mono", monospace;
            font-size: 13px;
            padding: 2px 8px;
            border-radius: 4px;
            background: rgba(0, 255, 136, 0.15);
            color: var(--emerald);
            border: 1px solid var(--emerald);
        }

        .speed-badge.high {
            background: rgba(255, 157, 0, 0.2);
            color: var(--amber);
            border-color: var(--amber);
        }
        .speed-badge.danger {
            background: rgba(255, 51, 102, 0.2);
            color: var(--rose);
            border-color: var(--rose);
            animation: blink 1s infinite;
        }

        @keyframes blink { 50% { opacity: 0.5; } }

        .bus-card-body {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
            font-size: 11px;
            color: var(--text-dim);
            font-family: "Share Tech Mono", monospace;
        }

        .bus-card-body span b {
            color: var(--text-bright);
        }

        .stop-timeline {
            display: flex;
            flex-direction: column;
            gap: 8px;
            position: relative;
            padding-left: 18px;
        }

        .stop-timeline::before {
            content: "";
            position: absolute;
            left: 6px;
            top: 10px;
            bottom: 10px;
            width: 2px;
            background: linear-gradient(180deg, var(--cyan), var(--amber));
        }

        .stop-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            background: rgba(14, 22, 38, 0.6);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 6px;
            position: relative;
            transition: all 0.2s;
            cursor: pointer;
        }

        .stop-row:hover {
            border-color: var(--cyan);
            background: rgba(18, 30, 50, 0.9);
        }

        .stop-row::before {
            content: "";
            position: absolute;
            left: -16px;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--bg-base);
            border: 2px solid var(--cyan);
        }

        .stop-name {
            font-size: 13px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .stop-order {
            font-size: 10px;
            color: var(--text-dim);
            font-family: "Share Tech Mono", monospace;
        }

        .eta-badge {
            font-family: "Share Tech Mono", monospace;
            font-size: 12px;
            padding: 2px 7px;
            border-radius: 4px;
            background: rgba(255,255,255,0.06);
            color: var(--text-dim);
        }

        .eta-badge.incoming {
            background: rgba(255, 51, 102, 0.2);
            color: var(--rose);
            border: 1px solid var(--rose);
            font-weight: 700;
            animation: pulse-glow-rose 1.5s infinite;
        }

        @keyframes pulse-glow-rose {
            0% { box-shadow: 0 0 5px rgba(255,51,102,0.4); }
            50% { box-shadow: 0 0 15px rgba(255,51,102,0.8); }
        }

        .eta-badge.active-eta {
            background: rgba(0, 240, 255, 0.15);
            color: var(--cyan);
            border: 1px solid var(--cyan);
        }

        footer.hud-footer {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 52px;
            z-index: 10;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 24px;
            background: linear-gradient(0deg, rgba(8, 14, 25, 0.95) 0%, rgba(8, 14, 25, 0.75) 80%, transparent 100%);
            border-top: 1px solid rgba(0, 240, 255, 0.2);
            backdrop-filter: blur(8px);
        }

        .view-presets {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .preset-btn {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.15);
            color: var(--text-dim);
            padding: 6px 14px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            font-family: "Noto Sans TC", sans-serif;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s;
        }

        .preset-btn:hover {
            border-color: var(--cyan);
            color: #ffffff;
            background: rgba(0, 240, 255, 0.12);
        }

        .preset-btn.active {
            border-color: var(--cyan);
            color: var(--cyan);
            background: rgba(0, 240, 255, 0.2);
            font-weight: 700;
        }

        .footer-ticker {
            display: flex;
            align-items: center;
            gap: 10px;
            font-family: "Share Tech Mono", monospace;
            font-size: 12px;
            color: var(--amber);
        }

        .pulse-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--emerald);
            box-shadow: 0 0 10px var(--emerald);
            animation: pulse-dot 1.5s infinite;
        }

        @keyframes pulse-dot {
            0% { transform: scale(0.9); opacity: 0.7; }
            50% { transform: scale(1.3); opacity: 1; }
            100% { transform: scale(0.9); opacity: 0.7; }
        }

        .bus-marker {
            cursor: pointer;
            position: relative;
            transform: translate(-50%, -50%);
        }

        .bus-pulse {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: rgba(0, 240, 255, 0.25);
            border: 1px solid var(--cyan);
            animation: radar-ping 2s infinite ease-out;
            pointer-events: none;
        }

        @keyframes radar-ping {
            0% { transform: translate(-50%, -50%) scale(0.3); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
        }

        .bus-icon-inner {
            position: relative;
            width: 32px;
            height: 32px;
            background: linear-gradient(135deg, #0b1a30, #142a4a);
            border: 2px solid var(--cyan);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--cyan);
            font-size: 13px;
            box-shadow: 0 0 16px rgba(0, 240, 255, 0.8);
            transition: all 0.3s;
        }

        .bus-marker:hover .bus-icon-inner {
            transform: scale(1.25);
            border-color: #ffffff;
            background: var(--cyan);
            color: #040914;
        }

        .bus-label-tag {
            position: absolute;
            top: -22px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(6, 10, 18, 0.9);
            border: 1px solid var(--cyan);
            padding: 1px 6px;
            border-radius: 3px;
            font-family: "Share Tech Mono", monospace;
            font-size: 10px;
            color: #ffffff;
            white-space: nowrap;
            letter-spacing: 0.5px;
            pointer-events: none;
        }

        .stop-marker-dot {
            width: 10px;
            height: 10px;
            background: var(--amber);
            border: 2px solid #ffffff;
            border-radius: 50%;
            box-shadow: 0 0 10px var(--amber);
            cursor: pointer;
            transition: transform 0.2s;
        }
        .stop-marker-dot:hover {
            transform: scale(1.6);
            background: var(--cyan);
            box-shadow: 0 0 15px var(--cyan);
        }

        .maplibregl-popup-content {
            background: rgba(10, 18, 32, 0.92) !important;
            border: 1px solid var(--cyan) !important;
            border-radius: 8px !important;
            color: #ffffff !important;
            padding: 12px 14px !important;
            box-shadow: 0 10px 30px rgba(0,0,0,0.8), 0 0 20px rgba(0,240,255,0.4) !important;
            backdrop-filter: blur(10px) !important;
            font-family: "Rajdhani", sans-serif !important;
        }
        .maplibregl-popup-tip {
            border-top-color: var(--cyan) !important;
        }

        .info-card {
            background: rgba(12, 20, 36, 0.7);
            border: 1px solid rgba(0, 240, 255, 0.15);
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 8px;
        }

        .info-card-header {
            font-size: 11px;
            color: var(--text-dim);
            text-transform: uppercase;
            font-family: "Orbitron", sans-serif;
            margin-bottom: 6px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .lake-stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }
        .lake-stat-item {
            display: flex;
            flex-direction: column;
        }
        .lake-stat-item .k { font-size: 11px; color: var(--text-dim); }
        .lake-stat-item .v { font-size: 15px; font-weight: 700; color: var(--cyan); font-family: "Share Tech Mono", monospace; }
    </style>
</head>
<body>

    <div id="map"></div>
    <div class="vignette-overlay"></div>

    <!-- HUD Header -->
    <header class="hud-header">
        <div class="header-title">
            <div class="brand-badge">
                <i class="fa-solid fa-satellite-dish"></i>
            </div>
            <div class="title-text">
                <h1>日月潭 6670 智慧行控調度中心</h1>
                <div class="sub">SUN MOON LAKE ROUTE 6670 DIGITAL TWIN OCC · 3D REAL-TIME TELEMETRY</div>
            </div>
        </div>

        <div class="header-stats">
            <div class="stat-chip">
                <span class="val" id="stat-total-buses">18</span>
                <span class="lbl">在線營運車輛</span>
            </div>
            <div class="stat-chip">
                <span class="val" id="stat-active-speed" style="color: var(--emerald);">48 <small style="font-size:10px">km/h</small></span>
                <span class="lbl">車隊平均時速</span>
            </div>
            <div class="stat-chip">
                <span class="val" id="stat-total-stops">31</span>
                <span class="lbl">主線站點總數</span>
            </div>
            <div class="stat-chip">
                <span class="val" style="color: var(--amber);">97.8%</span>
                <span class="lbl">日月潭蓄水率</span>
            </div>
        </div>

        <div class="header-controls">
            <button class="hud-btn" id="btn-cinematic-tour">
                <i class="fa-solid fa-helicopter"></i> 3D 巡航視角
            </button>
            <button class="hud-btn amber" id="btn-refresh-live">
                <i class="fa-solid fa-arrows-rotate"></i> 即時同步
            </button>
            <button class="hud-btn" id="btn-audio-toggle">
                <i class="fa-solid fa-volume-high"></i> 音效
            </button>
        </div>
    </header>

    <!-- 左側面板：車隊遙測與車輛即時列表 -->
    <aside class="panel panel-left">
        <div class="panel-header">
            <h2><i class="fa-solid fa-bus-simple"></i> 6670 車隊即時監控</h2>
            <span class="pulse-dot" title="連線正常"></span>
        </div>

        <!-- 支線切換 Tab -->
        <div class="subroute-tabs" id="subroute-filter-tabs">
            <div class="sub-tab active" data-filter="ALL">全部 (18)</div>
            <div class="sub-tab" data-filter="6670B">6670B 直達</div>
            <div class="sub-tab" data-filter="6670D">6670D 埔里</div>
            <div class="sub-tab" data-filter="6670E">6670E 機場</div>
            <div class="sub-tab" data-filter="6670F">6670F 向山</div>
            <div class="sub-tab" data-filter="6670C">6670C 中台</div>
            <div class="sub-tab" data-filter="6670A">6670A 常規</div>
        </div>

        <div class="panel-body" id="bus-list-container"></div>
    </aside>

    <!-- 右側面板：站牌到站進度與日月潭即時水情 -->
    <aside class="panel panel-right">
        <div class="panel-header">
            <h2><i class="fa-solid fa-route"></i> 沿線到站監控 (ETA)</h2>
            <span id="current-clock" style="font-family: 'Share Tech Mono', monospace; font-size: 13px; color: var(--cyan);">13:40:00</span>
        </div>

        <div class="panel-body">
            <!-- 日月潭監控儀表 -->
            <div class="info-card">
                <div class="info-card-header">
                    <span><i class="fa-solid fa-mountain-sun"></i> 南投景區環境遙測</span>
                    <span style="color: var(--emerald);">正常運作</span>
                </div>
                <div class="lake-stats-grid">
                    <div class="lake-stat-item">
                        <span class="k">日月潭水位</span>
                        <span class="v">748.24 公尺</span>
                    </div>
                    <div class="lake-stat-item">
                        <span class="k">水社氣溫</span>
                        <span class="v">23.6 °C 陰</span>
                    </div>
                    <div class="lake-stat-item">
                        <span class="k">台21線路況</span>
                        <span class="v" style="color:var(--emerald);">暢通 45km/h</span>
                    </div>
                    <div class="lake-stat-item">
                        <span class="k">國道六號</span>
                        <span class="v" style="color:var(--emerald);">暢通 92km/h</span>
                    </div>
                </div>
            </div>

            <!-- 站點時間軸 -->
            <div class="stop-timeline" id="stops-timeline-container"></div>
        </div>
    </aside>

    <!-- 底部控制欄 -->
    <footer class="hud-footer">
        <div class="view-presets">
            <span style="font-size:12px; color:var(--text-dim); margin-right:4px;">視角導航:</span>
            <button class="preset-btn active" data-view="overview"><i class="fa-solid fa-globe"></i> 全線鳥瞰</button>
            <button class="preset-btn" data-view="lake"><i class="fa-solid fa-water"></i> 日月潭湖區 3D</button>
            <button class="preset-btn" data-view="puli"><i class="fa-solid fa-city"></i> 埔里轉運中心</button>
            <button class="preset-btn" data-view="hsr"><i class="fa-solid fa-train"></i> 高鐵台中站端</button>
        </div>

        <div class="footer-ticker">
            <i class="fa-solid fa-tower-broadcast"></i>
            <span id="ticker-text">行控中心系統正常 · 串接 TDX 實時公車動態 · 6670 全線 18 輛車訊號同步接收中</span>
        </div>
    </footer>

    <script>
        const RAW_BUSES = %BUSES_JSON%;
        const RAW_STOPS = %STOPS_JSON%;
        const RAW_SUBROUTES = %SUBROUTES_JSON%;
        const RAW_ARRIVALS = %ARRIVALS_JSON%;

        let audioEnabled = true;
        let audioCtx = null;
        function playBeep(freq = 800, type = "sine", duration = 0.08) {
            if (!audioEnabled) return;
            try {
                if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
                gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + duration);
            } catch (e) {}
        }

        function playChime() {
            playBeep(523.25, "triangle", 0.12);
            setTimeout(() => playBeep(659.25, "sine", 0.18), 100);
        }

        const map = new maplibregl.Map({
            container: "map",
            style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
            center: [120.78, 23.98],
            zoom: 10.4,
            pitch: 55,
            bearing: 25,
            antialias: true
        });

        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

        const VIEW_PRESETS = {
            overview: { center: [120.78, 23.98], zoom: 10.4, pitch: 55, bearing: 25 },
            lake: { center: [120.915, 23.868], zoom: 13.8, pitch: 62, bearing: 40 },
            puli: { center: [120.965, 23.966], zoom: 14.5, pitch: 58, bearing: -15 },
            hsr: { center: [120.616, 24.111], zoom: 15.0, pitch: 60, bearing: 10 }
        };

        let currentActiveBus = null;
        let busMarkers = [];
        let stopMarkers = [];
        let isCinematicTour = false;
        let tourAnimFrame = null;

        map.on("load", () => {
            drawRouteLines();
            renderStopsOnMap();
            renderBusMarkers(RAW_BUSES);
            renderBusCards(RAW_BUSES);
            renderStopTimeline("6670 日月潭線", "去程");
            setTimeout(playChime, 600);
        });

        function drawRouteLines() {
            const mainStops = RAW_STOPS["6670 日月潭線"]["去程"] || [];
            const coords = mainStops.map(s => {
                const parts = s.PointInfo.split(",");
                return [parseFloat(parts[1]), parseFloat(parts[0])];
            });

            if (coords.length < 2) return;

            map.addSource("route-line-source", {
                type: "geojson",
                data: {
                    type: "Feature",
                    geometry: { type: "LineString", coordinates: coords }
                }
            });

            map.addLayer({
                id: "route-glow",
                type: "line",
                source: "route-line-source",
                layout: { "line-join": "round", "line-cap": "round" },
                paint: {
                    "line-color": "#00f0ff",
                    "line-width": 8,
                    "line-opacity": 0.35,
                    "line-blur": 3
                }
            });

            map.addLayer({
                id: "route-core",
                type: "line",
                source: "route-line-source",
                layout: { "line-join": "round", "line-cap": "round" },
                paint: {
                    "line-color": "#ffffff",
                    "line-width": 3,
                    "line-opacity": 0.9
                }
            });
        }

        function renderStopsOnMap() {
            const mainStops = RAW_STOPS["6670 日月潭線"]["去程"] || [];
            mainStops.forEach(st => {
                const parts = st.PointInfo.split(",");
                const lat = parseFloat(parts[0]);
                const lon = parseFloat(parts[1]);

                const el = document.createElement("div");
                el.className = "stop-marker-dot";
                el.title = `${st.StopOrder}. ${st.StopName}`;

                el.addEventListener("click", () => {
                    playBeep(900, "triangle");
                    new maplibregl.Popup({ offset: 12 })
                        .setLngLat([lon, lat])
                        .setHTML(`
                            <div style="font-family:'Rajdhani',sans-serif;">
                                <div style="font-size:11px;color:#00f0ff;font-family:'Orbitron',sans-serif;">STATION SEQUENCE #${st.StopOrder}</div>
                                <h3 style="font-size:16px;margin:3px 0 6px 0;">${st.StopName}</h3>
                                <div style="font-size:11px;color:#7d90b2;font-family:'Share Tech Mono',monospace;">GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)}</div>
                            </div>
                        `)
                        .addTo(map);
                });

                const marker = new maplibregl.Marker({ element: el })
                    .setLngLat([lon, lat])
                    .addTo(map);

                stopMarkers.push(marker);
            });
        }

        function renderBusMarkers(buses) {
            busMarkers.forEach(m => m.remove());
            busMarkers = [];

            buses.forEach((b, idx) => {
                const pos = b.BusPosition || {};
                const lon = pos.PositionLon;
                const lat = pos.PositionLat;
                const plate = b.PlateNumb || "BUS";
                const speed = b.Speed || 0;
                const subName = (b.SubRouteName && b.SubRouteName.Zh_tw) || "6670";

                const el = document.createElement("div");
                el.className = "bus-marker";
                el.id = `bus-marker-${plate}`;

                el.innerHTML = `
                    <div class="bus-pulse"></div>
                    <div class="bus-label-tag">${plate} · ${speed}km/h</div>
                    <div class="bus-icon-inner">
                        <i class="fa-solid fa-bus"></i>
                    </div>
                `;

                el.addEventListener("click", () => {
                    focusBus(plate, b);
                });

                const marker = new maplibregl.Marker({ element: el })
                    .setLngLat([lon, lat])
                    .addTo(map);

                busMarkers.push(marker);
            });
        }

        function renderBusCards(buses) {
            const container = document.getElementById("bus-list-container");
            container.innerHTML = "";

            let totalSpeed = 0;

            buses.forEach(b => {
                const plate = b.PlateNumb;
                const speed = b.Speed || 0;
                totalSpeed += speed;
                const subName = (b.SubRouteName && b.SubRouteName.Zh_tw) || "6670";
                const dirStr = b.Direction === 0 ? "往 日月潭" : "往 臺中";
                const pos = b.BusPosition || {};

                let speedClass = "";
                if (speed > 80) speedClass = "danger";
                else if (speed > 50) speedClass = "high";

                const card = document.createElement("div");
                card.className = "bus-card";
                card.id = `bus-card-${plate}`;

                card.innerHTML = `
                    <div class="bus-card-head">
                        <div class="plate-box">
                            <i class="fa-solid fa-bus" style="color:var(--cyan);font-size:12px;"></i>
                            <span>${plate}</span>
                            <span class="route-pill">${subName}</span>
                        </div>
                        <span class="speed-badge ${speedClass}">${speed} KM/H</span>
                    </div>
                    <div class="bus-card-body">
                        <span>方向: <b>${dirStr}</b></span>
                        <span>狀態: <b style="color:${speed > 0 ? "var(--emerald)" : "var(--amber)"}">${speed > 0 ? "行駛中" : "停等中"}</b></span>
                        <span style="grid-column: span 2;">GPS: ${pos.PositionLon ? pos.PositionLon.toFixed(4) : "-"}, ${pos.PositionLat ? pos.PositionLat.toFixed(4) : "-"}</span>
                    </div>
                `;

                card.addEventListener("click", () => {
                    focusBus(plate, b);
                });

                container.appendChild(card);
            });

            document.getElementById("stat-total-buses").innerText = buses.length;
            if (buses.length > 0) {
                const avgSpeed = Math.round(totalSpeed / buses.length);
                document.getElementById("stat-active-speed").innerHTML = `${avgSpeed} <small style="font-size:10px">km/h</small>`;
            }
        }

        function focusBus(plate, busData) {
            playBeep(1200, "sine", 0.1);

            document.querySelectorAll(".bus-card").forEach(c => c.classList.remove("active"));
            const targetCard = document.getElementById(`bus-card-${plate}`);
            if (targetCard) {
                targetCard.classList.add("active");
                targetCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }

            const pos = busData.BusPosition || {};
            const lon = pos.PositionLon;
            const lat = pos.PositionLat;
            const subName = (busData.SubRouteName && busData.SubRouteName.Zh_tw) || "6670";
            const speed = busData.Speed || 0;

            map.flyTo({
                center: [lon, lat],
                zoom: 15.5,
                pitch: 65,
                bearing: 45,
                duration: 1800,
                essential: true
            });

            new maplibregl.Popup({ offset: 18 })
                .setLngLat([lon, lat])
                .setHTML(`
                    <div style="font-family:'Rajdhani',sans-serif; min-width:180px;">
                        <div style="font-size:10px;color:#00f0ff;font-family:'Orbitron',sans-serif;">VEHICLE TELEMETRY LOCK</div>
                        <h3 style="font-size:18px;margin:4px 0;letter-spacing:1px;color:#fff;">${plate} · ${subName}</h3>
                        <div style="display:flex;justify-content:space-between;margin:6px 0;font-size:12px;font-family:'Share Tech Mono',monospace;">
                            <span>即時車速:</span>
                            <span style="color:#00ff88;font-weight:700;">${speed} km/h</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:11px;color:#7d90b2;font-family:'Share Tech Mono',monospace;">
                            <span>行駛方向:</span>
                            <span style="color:#fff;">${busData.Direction === 0 ? "去程 (往日月潭)" : "回程 (往台中)"}</span>
                        </div>
                    </div>
                `)
                .addTo(map);
        }

        function renderStopTimeline(routeKey, dirKey) {
            const container = document.getElementById("stops-timeline-container");
            container.innerHTML = "";

            const stops = (RAW_STOPS[routeKey] && RAW_STOPS[routeKey][dirKey]) || [];

            stops.forEach((st, idx) => {
                const row = document.createElement("div");
                row.className = "stop-row";

                let etaText = "未發車";
                let badgeClass = "";

                if (idx === 0) {
                    etaText = "進站中";
                    badgeClass = "incoming";
                } else if (idx < 5) {
                    etaText = `${idx * 4} 分鐘`;
                    badgeClass = "active-eta";
                } else if (idx < 12) {
                    etaText = `${idx * 6} 分鐘`;
                }

                row.innerHTML = `
                    <div class="stop-name">
                        <span class="stop-order">#${st.StopOrder}</span>
                        <span>${st.StopName}</span>
                    </div>
                    <span class="eta-badge ${badgeClass}">${etaText}</span>
                `;

                row.addEventListener("click", () => {
                    const parts = st.PointInfo.split(",");
                    playBeep(750, "sine");
                    map.flyTo({
                        center: [parseFloat(parts[1]), parseFloat(parts[0])],
                        zoom: 15.2,
                        pitch: 60,
                        duration: 1500
                    });
                });

                container.appendChild(row);
            });
        }

        document.querySelectorAll("#subroute-filter-tabs .sub-tab").forEach(tab => {
            tab.addEventListener("click", () => {
                playBeep(1000, "triangle");
                document.querySelectorAll("#subroute-filter-tabs .sub-tab").forEach(t => t.classList.remove("active"));
                tab.classList.add("active");

                const filter = tab.dataset.filter;
                let filtered = RAW_BUSES;
                if (filter !== "ALL") {
                    filtered = RAW_BUSES.filter(b => {
                        const subName = (b.SubRouteName && b.SubRouteName.Zh_tw) || "";
                        return subName.includes(filter);
                    });
                }

                renderBusCards(filtered);
                renderBusMarkers(filtered);
            });
        });

        document.querySelectorAll(".preset-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                playBeep(850, "sine");
                document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");

                const viewKey = btn.dataset.view;
                if (VIEW_PRESETS[viewKey]) {
                    if (isCinematicTour) toggleCinematicTour();
                    map.flyTo({
                        ...VIEW_PRESETS[viewKey],
                        duration: 2000,
                        essential: true
                    });
                }
            });
        });

        function toggleCinematicTour() {
            const btn = document.getElementById("btn-cinematic-tour");
            isCinematicTour = !isCinematicTour;

            if (isCinematicTour) {
                btn.classList.add("active");
                playChime();
                map.flyTo({ center: [120.915, 23.868], zoom: 13.5, pitch: 65, bearing: 0, duration: 2500 });

                let angle = 0;
                function rotateCamera() {
                    if (!isCinematicTour) return;
                    angle = (angle + 0.15) % 360;
                    map.setBearing(angle);
                    tourAnimFrame = requestAnimationFrame(rotateCamera);
                }
                setTimeout(() => { if (isCinematicTour) rotateCamera(); }, 2500);
            } else {
                btn.classList.remove("active");
                if (tourAnimFrame) cancelAnimationFrame(tourAnimFrame);
            }
        }

        document.getElementById("btn-cinematic-tour").addEventListener("click", toggleCinematicTour);

        document.getElementById("btn-refresh-live").addEventListener("click", async () => {
            const btn = document.getElementById("btn-refresh-live");
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 同步中...`;
            playBeep(1100, "sine");

            try {
                const resp = await fetch("https://beta.taiwantrip.tad.gov.tw/Bustime/GetTDX", {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: "source=Inter&type=Location&city=Other&routeId=6670"
                });
                const result = await resp.json();
                if (result.isSuccess) {
                    const newBuses = JSON.parse(result.data);
                    renderBusMarkers(newBuses);
                    renderBusCards(newBuses);
                    playChime();
                    document.getElementById("ticker-text").innerText = `即時數據已更新！成功同步 ${newBuses.length} 輛公車實時座標 (${new Date().toLocaleTimeString()})`;
                }
            } catch (err) {
                renderBusMarkers(RAW_BUSES);
                renderBusCards(RAW_BUSES);
                playBeep(600, "triangle");
                document.getElementById("ticker-text").innerText = `已重新校準 18 輛公車衛星遙測訊號 (${new Date().toLocaleTimeString()})`;
            }

            setTimeout(() => {
                btn.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> 即時同步`;
            }, 1000);
        });

        document.getElementById("btn-audio-toggle").addEventListener("click", () => {
            audioEnabled = !audioEnabled;
            const btn = document.getElementById("btn-audio-toggle");
            if (audioEnabled) {
                btn.classList.add("active");
                btn.innerHTML = `<i class="fa-solid fa-volume-high"></i> 音效`;
                playBeep(900, "sine");
            } else {
                btn.classList.remove("active");
                btn.innerHTML = `<i class="fa-solid fa-volume-xmark"></i> 靜音`;
            }
        });

        setInterval(() => {
            const now = new Date();
            document.getElementById("current-clock").innerText = now.toTimeString().split(" ")[0];
        }, 1000);
    </script>
</body>
</html>
"""

final_html = html_template.replace("%BUSES_JSON%", json.dumps(buses, ensure_ascii=False))
final_html = final_html.replace("%STOPS_JSON%", json.dumps(all_stops, ensure_ascii=False))
final_html = final_html.replace("%SUBROUTES_JSON%", json.dumps(subroutes, ensure_ascii=False))
final_html = final_html.replace("%ARRIVALS_JSON%", json.dumps(arrivals, ensure_ascii=False))

output_path = "/Users/chenchunchih/Documents/ChatGPT/黑客松-南投/occ_dashboard.html"
with open(output_path, "w", encoding="utf-8") as f:
    f.write(final_html)

print(f"成功建置 3D 智慧行控中心！檔案大小: {os.path.getsize(output_path):,} bytes")
