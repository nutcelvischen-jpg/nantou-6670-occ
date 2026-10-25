import bpy
import math
import json
import os

# 清理場景
bpy.ops.wm.read_factory_settings(use_empty=True)

scene = bpy.context.scene
engine_items = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engine_items else 'BLENDER_EEVEE'

# 21:9 超寬影院級解析度 (2560 x 1080)
scene.render.resolution_x = 2560
scene.render.resolution_y = 1080
scene.render.film_transparent = False

# 載入中文字型
font_path = "/System/Library/Fonts/STHeiti Medium.ttc"
chinese_font = bpy.data.fonts.load(font_path) if os.path.exists(font_path) else None

# 環境背景 (深邃夜幕星空科技藍)
world = bpy.data.worlds.new("GeoWorld")
scene.world = world
world.use_nodes = True
bg_node = world.node_tree.nodes.get("Background")
if bg_node:
    bg_node.inputs[0].default_value = (0.008, 0.015, 0.028, 1.0)
    bg_node.inputs[1].default_value = 0.95

# ========================================================
# 材質系統 (Materials)
# ========================================================
def make_mat(name, color, roughness=0.3, metallic=0.0, emission_color=None, emission_str=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = color
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['Metallic'].default_value = metallic
        if emission_color and emission_str > 0:
            if 'Emission Color' in bsdf.inputs:
                bsdf.inputs['Emission Color'].default_value = emission_color
                bsdf.inputs['Emission Strength'].default_value = emission_str
            elif 'Emission' in bsdf.inputs:
                bsdf.inputs['Emission'].default_value = emission_color
    return mat

mat_bus_white = make_mat("BusWhite", (0.95, 0.96, 0.98, 1.0), roughness=0.15, metallic=0.08)
mat_bus_orange = make_mat("BusOrange", (0.98, 0.44, 0.02, 1.0), roughness=0.2)
mat_bus_green = make_mat("BusGreen", (0.05, 0.72, 0.38, 1.0), roughness=0.2)
mat_glass = make_mat("BusGlass", (0.04, 0.08, 0.15, 1.0), roughness=0.05, metallic=0.6)
mat_tire = make_mat("Tire", (0.03, 0.03, 0.03, 1.0), roughness=0.8)
mat_rim = make_mat("Rim", (0.85, 0.88, 0.92, 1.0), roughness=0.2, metallic=0.9)

mat_lake = make_mat("SunMoonLake", (0.012, 0.25, 0.38, 1.0), roughness=0.04, metallic=0.7)
mat_island = make_mat("IslandLalu", (0.08, 0.25, 0.12, 1.0), roughness=0.85)
mat_road = make_mat("RealRoad", (0.08, 0.09, 0.11, 1.0), roughness=0.7)
mat_yellow_center = make_mat("YellowLine", (0.98, 0.78, 0.05, 1.0), emission_color=(0.98, 0.78, 0.05, 1.0), emission_str=4.0)

mat_terrain_basin = make_mat("TerrainBasin", (0.035, 0.055, 0.085, 1.0), roughness=0.7, metallic=0.2)
mat_mtn_ridge = make_mat("TerrainRidge", (0.025, 0.05, 0.08, 1.0), roughness=0.9)
mat_mtn_high = make_mat("CentralRange", (0.015, 0.035, 0.07, 1.0), roughness=0.95)
mat_city_block = make_mat("CityBuilding", (0.07, 0.11, 0.18, 1.0), roughness=0.4, metallic=0.3)
mat_city_window = make_mat("CityWindow", (0.15, 0.65, 0.98, 1.0), emission_color=(0.15, 0.65, 0.98, 1.0), emission_str=3.8)

# 遙測全息材質
mat_holo_cyan = make_mat("HoloCyan", (0.0, 0.92, 1.0, 1.0), emission_color=(0.0, 0.92, 1.0, 1.0), emission_str=14.0)
mat_holo_crimson = make_mat("HoloCrimson", (1.0, 0.15, 0.35, 1.0), emission_color=(1.0, 0.15, 0.35, 1.0), emission_str=16.0)
mat_holo_amber = make_mat("HoloAmber", (1.0, 0.70, 0.05, 1.0), emission_color=(1.0, 0.70, 0.05, 1.0), emission_str=14.0)
mat_holo_emerald = make_mat("HoloEmerald", (0.0, 1.0, 0.55, 1.0), emission_color=(0.0, 1.0, 0.55, 1.0), emission_str=14.0)
mat_headlight = make_mat("HeadlightGlow", (1.0, 1.0, 0.95, 1.0), emission_color=(1.0, 1.0, 0.95, 1.0), emission_str=20.0)
mat_taillight = make_mat("TaillightGlow", (1.0, 0.05, 0.05, 1.0), emission_color=(1.0, 0.05, 0.05, 1.0), emission_str=15.0)

mat_hud_bg = make_mat("HudBlackBg", (0.02, 0.03, 0.05, 1.0), roughness=0.6, metallic=0.2)

# ========================================================
# 1. 真實地理座標轉換 (GIS Projector)
# ========================================================
LNG_CENTER = 120.76
LAT_CENTER = 24.01
SCALE_X = 101.4 * 2.2 # ~223.08
SCALE_Y = 111.0 * 2.2 # ~244.20

def geo_to_3d(lat, lon):
    x = (lon - LNG_CENTER) * SCALE_X
    y = (lat - LAT_CENTER) * SCALE_Y
    
    # 真實海拔高程模擬 (臺中盆地 50m -> 國道6號 200m -> 埔里 450m -> 日月潭 748m)
    if lat > 24.08 and lon < 120.72:
        z = 0.25 # 臺中平原
    elif lon < 120.72:
        z = 0.70 # 霧峰 / 草屯淺山
    elif lat > 23.94 and lon > 120.85:
        z = 2.10 # 埔里盆地
    elif lat <= 23.90 and lon > 120.88:
        z = 3.85 # 日月潭高山湖泊
    else:
        # 中間峽谷坡度過渡
        t = (lon - 120.72) / (120.85 - 120.72)
        z = 0.70 + max(0.0, min(1.0, t)) * 1.40
    return x, y, z

# ========================================================
# 2. 構建真實地理底圖地形 (Central Taiwan Terrain Relief)
# ========================================================
# A. 臺中都會盆地地表
bpy.ops.mesh.primitive_plane_add(size=1.0, location=(-28.0, 24.0, 0.0))
taichung_floor = bpy.context.active_object
taichung_floor.scale = (46.0, 30.0, 1.0)
bpy.ops.object.transform_apply(scale=True)
taichung_floor.data.materials.append(mat_terrain_basin)

# 臺中都會建築群陣列 (烏日高鐵站、臺中火車站核心區)
for bx in range(-44, -14, 4):
    for by in range(14, 34, 4):
        h = 1.2 + abs(bx * 0.08) + (by % 3) * 1.2
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, by, h / 2.0))
        bldg = bpy.context.active_object
        bldg.scale = (2.2, 2.6, h)
        bpy.ops.object.transform_apply(scale=True)
        bldg.data.materials.append(mat_city_window if (bx + by) % 4 == 0 else mat_city_block)

# B. 埔里盆地地表
bpy.ops.mesh.primitive_plane_add(size=1.0, location=(34.0, -6.0, 1.95))
puli_floor = bpy.context.active_object
puli_floor.scale = (24.0, 18.0, 1.0)
bpy.ops.object.transform_apply(scale=True)
puli_floor.data.materials.append(mat_terrain_basin)

# C. 日月潭高地湖泊 (真實地理經緯度：X ~ 34, Y ~ -30, 水位標高 Z ~ 3.75)
bpy.ops.mesh.primitive_cylinder_add(radius=11.5, depth=0.18, location=(34.0, -30.0, 3.75))
sml_lake = bpy.context.active_object
sml_lake.scale = (1.35, 0.95, 1.0)
bpy.ops.object.transform_apply(scale=True)
sml_lake.data.materials.append(mat_lake)

# 拉魯島 (Lalu Island) 浮於潭心
bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=1.9, radius2=0.0, depth=0.75, location=(34.0, -30.0, 4.05))
island = bpy.context.active_object
island.data.materials.append(mat_island)

# D. 中央山脈與丘陵山脊 (層次起伏，環抱埔里與日月潭)
ridges = [
    # 東側中央山脈主脊 (海拔 2000~3000m 象徵)
    ("Mtn_East_1", 50, 16, 11.0, 26, 17, mat_mtn_high),
    ("Mtn_East_2", 54, -4, 13.0, 28, 19, mat_mtn_high),
    ("Mtn_East_3", 52, -24, 12.0, 26, 18, mat_mtn_high),
    # 埔里與魚池外圍山脈
    ("Mtn_Puli_N", 34, 12, 6.5, 20, 11, mat_mtn_ridge),
    ("Mtn_Shuishe_Great", 46, -40, 9.0, 22, 15, mat_mtn_high),
    # 西側八卦山脈 / 霧峰丘陵
    ("Mtn_Baguashan", -24, 2, 3.8, 18, 6.5, mat_mtn_ridge),
    ("Mtn_Wufeng", -4, 10, 4.2, 16, 7.5, mat_mtn_ridge),
]

for r_name, rx, ry, rz, rr, rd, r_mat in ridges:
    bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=rr, radius2=0.0, depth=rd, location=(rx, ry, rz / 2.0))
    m = bpy.context.active_object
    m.name = r_name
    m.data.materials.append(r_mat)

# ========================================================
# 3. 讀取真實 2,133 節點完整 GPS 路網，建造無縫 3D 走廊
# ========================================================
with open("/Users/chenchunchih/Documents/ChatGPT/黑客松-南投/6670_bus_data/6670_linestring.json") as f:
    line_data = json.load(f)

# 使用完整 2,133 節點的回程高精度路線 (臺中車站發車至向山遊客中心)
full_raw_path = line_data['回程']['overlays'][0]['path']
# 每 5 點均勻取樣一次 (~427 節點)，保持平滑且效能優化
full_geo_nodes = [(float(p['lat']), float(p['lng'])) for i, p in enumerate(full_raw_path) if i % 5 == 0]
if (float(full_raw_path[-1]['lat']), float(full_raw_path[-1]['lng'])) != full_geo_nodes[-1]:
    full_geo_nodes.append((float(full_raw_path[-1]['lat']), float(full_raw_path[-1]['lng'])))

road_3d_pts = [geo_to_3d(lat, lon) for lat, lon in full_geo_nodes]

# 生成真實道路 Mesh
road_mesh = bpy.data.meshes.new("RealRoad_Mesh")
road_obj = bpy.data.objects.new("RealRoad_6670", road_mesh)
scene.collection.objects.link(road_obj)

verts = []
faces = []
n = len(road_3d_pts)
half_w = 0.85

for i in range(n):
    p = road_3d_pts[i]
    if i < n - 1:
        p_next = road_3d_pts[i+1]
        dx = p_next[0] - p[0]
        dy = p_next[1] - p[1]
    else:
        p_prev = road_3d_pts[i-1]
        dx = p[0] - p_prev[0]
        dy = p[1] - p_prev[1]
        
    seg_len = math.hypot(dx, dy)
    nx = -dy / seg_len if seg_len > 1e-5 else 0
    ny = dx / seg_len if seg_len > 1e-5 else 1
    
    verts.append((p[0] + nx * half_w, p[1] + ny * half_w, p[2] + 0.05))
    verts.append((p[0] - nx * half_w, p[1] - ny * half_w, p[2] + 0.05))

for i in range(n - 1):
    faces.append((i * 2, i * 2 + 1, (i + 1) * 2 + 1, (i + 1) * 2))

road_mesh.from_pydata(verts, [], faces)
road_mesh.update()
road_obj.data.materials.append(mat_road)

# 道路中央發光引導線
for i in range(0, n - 1, 2):
    p1 = road_3d_pts[i]
    p2 = road_3d_pts[i+1]
    mx = (p1[0] + p2[0]) / 2.0
    my = (p1[1] + p2[1]) / 2.0
    mz = (p1[2] + p2[2]) / 2.0 + 0.08
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    seg_len = math.hypot(dx, dy)
    ang = math.atan2(dy, dx)
    
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(mx, my, mz))
    line = bpy.context.active_object
    line.scale = (seg_len, 0.1, 1.0)
    line.rotation_euler = (0, 0, ang)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    line.data.materials.append(mat_yellow_center)

# ========================================================
# 4. 讀取 18 輛真實公車並建立 3D 模型與【車身/車頂經緯度時速標牌】
# ========================================================
with open("/Users/chenchunchih/Documents/ChatGPT/黑客松-南投/6670_bus_data/6670_realtime_bus_positions.json") as f:
    buses = json.load(f)

# 相機俯視角約 58.5 度，標牌 billboard 傾角
HUD_PITCH = math.radians(58.5)

# 偵測站端群聚，進行航空級扇形導引線展開 (Fan-out / Spiderfy)
cluster_offsets = {
    # 日月潭水社站群聚 4 輛車 (經緯度 23.866~23.867, 120.911)
    "953-FX":   (-7.5, -2.5, 3.8),
    "985-FX":   ( 7.5, -2.5, 3.8),
    "KKA-6703": (-7.5,  3.5, 5.2),
    "KKA-6738": ( 7.5,  3.5, 5.2),
    # 臺中火車站端群聚 2 輛車 (經緯度 24.142, 120.687)
    "KKA-6725": (-6.5,  1.0, 4.0),
    "KKA-6739": ( 6.5,  1.0, 4.0),
    # 國道與高鐵端兩輛近鄰
    "956-FX":   (-5.5, -1.0, 3.6),
    "950-FX":   ( 5.5,  1.0, 4.6),
}

def spawn_real_bus_with_hud(idx, b_info):
    plate = b_info.get("PlateNumb", "BUS")
    spd = b_info.get("Speed", 0)
    lat = b_info["BusPosition"]["PositionLat"]
    lon = b_info["BusPosition"]["PositionLon"]
    az = b_info.get("Azimuth", 0)
    sub = b_info.get("SubRouteName", {}).get("Zh_tw", "6670")

    bx, by, bz = geo_to_3d(lat, lon)

    # 建立公車父物件
    bus_root = bpy.data.objects.new(f"Bus_{idx}_{plate}", None)
    bus_root.location = (bx, by, bz + 0.1)
    bus_root.rotation_euler = (0, 0, math.radians(-az + 90))
    scene.collection.objects.link(bus_root)

    # 車體 (長 3.8, 寬 1.0, 高 1.15)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.65))
    body = bpy.context.active_object
    body.scale = (3.8, 1.0, 1.15)
    bpy.ops.object.transform_apply(scale=True)
    body.data.materials.append(mat_bus_white)
    body.parent = bus_root

    # 橘綠彩繪飾條
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.08, 0, 0.42))
    so = bpy.context.active_object
    so.scale = (3.82, 1.02, 0.15)
    bpy.ops.object.transform_apply(scale=True)
    so.data.materials.append(mat_bus_orange)
    so.parent = bus_root

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.12, 0, 0.30))
    sg = bpy.context.active_object
    sg.scale = (3.5, 1.03, 0.08)
    bpy.ops.object.transform_apply(scale=True)
    sg.data.materials.append(mat_bus_green)
    sg.parent = bus_root

    # 玻璃窗
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.05, 0, 0.85))
    win = bpy.context.active_object
    win.scale = (3.2, 1.04, 0.45)
    bpy.ops.object.transform_apply(scale=True)
    win.data.materials.append(mat_glass)
    win.parent = bus_root

    # 車燈
    for hy in [0.35, -0.35]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(1.92, hy, 0.35))
        hl = bpy.context.active_object
        hl.scale = (0.05, 0.15, 0.1)
        bpy.ops.object.transform_apply(scale=True)
        hl.data.materials.append(mat_headlight)
        hl.parent = bus_root

    for ty in [0.35, -0.35]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-1.92, ty, 0.38))
        tl = bpy.context.active_object
        tl.scale = (0.05, 0.12, 0.1)
        bpy.ops.object.transform_apply(scale=True)
        tl.data.materials.append(mat_taillight)
        tl.parent = bus_root

    # 地表速度遙測光環
    speed_mat = mat_holo_crimson if spd > 80 else (mat_holo_emerald if spd > 30 else mat_holo_cyan)
    bpy.ops.mesh.primitive_torus_add(major_radius=2.6, minor_radius=0.035, location=(0, 0, 0.05))
    radar = bpy.context.active_object
    radar.data.materials.append(speed_mat)
    radar.parent = bus_root
    radar.visible_shadow = False

    # 取得防重疊偏移量
    dx_off, dy_off, dz_off = cluster_offsets.get(plate, (0.0, 0.0, 3.8))
    tag_x = bx + dx_off
    tag_y = by + dy_off
    tag_z = bz + dz_off

    # 實體全息指引光纖 (從車身頂點連向懸浮標牌)
    beam_len = math.hypot(dx_off, dy_off, dz_off)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.035, depth=beam_len, location=((bx + tag_x)/2.0, (by + tag_y)/2.0, (bz + tag_z)/2.0))
    beam = bpy.context.active_object
    beam.data.materials.append(speed_mat)
    # 計算傾角
    dx_diff = tag_x - bx
    dy_diff = tag_y - by
    dz_diff = tag_z - bz
    pitch_angle = math.atan2(math.hypot(dx_diff, dy_diff), dz_diff)
    yaw_angle = math.atan2(dy_diff, dx_diff)
    beam.rotation_euler = (0, pitch_angle, yaw_angle - math.radians(90))
    beam.visible_shadow = False

    # ========================================================
    # 車頂 3D 浮空標牌：【車號 + 車速 + 經緯度】
    # ========================================================
    if chinese_font:
        # 標牌半透明深色底板
        bpy.ops.mesh.primitive_plane_add(size=1.0, location=(tag_x, tag_y, tag_z))
        plate_bg = bpy.context.active_object
        plate_bg.name = f"Bg_{plate}"
        plate_bg.scale = (6.6, 1.75, 1.0)
        plate_bg.rotation_euler = (HUD_PITCH, 0, 0)
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        plate_bg.data.materials.append(mat_hud_bg)
        plate_bg.visible_shadow = False

        # 3D 文字標籤
        label_text = f"{plate} [{sub}]  {spd}km/h\n{lat:.4f}°N, {lon:.4f}°E"
        bpy.ops.object.text_add(location=(tag_x, tag_y - 0.06, tag_z + 0.15))
        txt = bpy.context.active_object
        txt.name = f"HUD_Text_{plate}"
        txt.data.body = label_text
        txt.data.font = chinese_font
        txt.data.size = 0.72
        txt.data.extrude = 0.02
        txt.data.align_x = 'CENTER'
        txt.rotation_euler = (HUD_PITCH, 0, 0)
        txt.data.materials.append(speed_mat)
        txt.visible_shadow = False

    return bus_root

# 部署全線 18 輛公車
for idx, b in enumerate(buses):
    spawn_real_bus_with_hud(idx + 1, b)

# ========================================================
# 5. 標註主要地理地標信標 (Major Hubs)
# ========================================================
hubs = [
    ("HUB_Taichung_HSR", 24.11105, 120.6165, "臺中高鐵站", mat_holo_amber),
    ("HUB_Taichung_Station", 24.1480, 120.6830, "臺中火車站", mat_holo_cyan),
    ("HUB_Freeway_6", 23.9873, 120.7940, "國道6號 (102 km/h)", mat_holo_crimson),
    ("HUB_Puli_Center", 23.9635, 120.9691, "埔里轉運站", mat_holo_cyan),
    ("HUB_Shuishe_Pier", 23.8760, 120.9025, "日月潭水社碼頭", mat_holo_emerald),
    ("HUB_Xiangshan", 23.8460, 120.9013, "向山遊客中心", mat_holo_cyan),
]

for hid, hlat, hlon, hname, hmat in hubs:
    hx, hy, hz = geo_to_3d(hlat, hlon)
    # 光柱
    bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=9.5, location=(hx, hy, hz + 4.75))
    hp = bpy.context.active_object
    hp.data.materials.append(hmat)
    hp.visible_shadow = False

    # 同心環
    bpy.ops.mesh.primitive_torus_add(major_radius=3.2, minor_radius=0.04, location=(hx, hy, hz + 0.1))
    hr = bpy.context.active_object
    hr.data.materials.append(hmat)
    hr.visible_shadow = False

    # 頂端鑽石
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.9, radius2=0.0, depth=1.6, location=(hx, hy, hz + 10.0))
    hd = bpy.context.active_object
    hd.data.materials.append(hmat)
    hd.visible_shadow = False

    if chinese_font:
        bpy.ops.object.text_add(location=(hx, hy, hz + 11.2))
        htxt = bpy.context.active_object
        htxt.name = f"Text_{hid}"
        htxt.data.body = hname
        htxt.data.font = chinese_font
        htxt.data.size = 1.25
        htxt.data.extrude = 0.03
        htxt.data.align_x = 'CENTER'
        htxt.rotation_euler = (HUD_PITCH, 0, 0)
        htxt.data.materials.append(hmat)
        htxt.visible_shadow = False

# ========================================================
# 6. 超寬電影級全景攝影機與燈光
# ========================================================
bpy.ops.object.light_add(type='SUN', location=(30, 40, 60))
sun = bpy.context.active_object
sun.data.energy = 4.8
sun.data.color = (1.0, 0.95, 0.9)
sun.rotation_euler = (math.radians(52), math.radians(14), math.radians(-32))

bpy.ops.object.light_add(type='AREA', location=(6.0, -8.0, 45))
amb = bpy.context.active_object
amb.data.energy = 4200.0
amb.data.color = (0.05, 0.70, 1.0)
amb.data.size = 90.0

# 攝影機：居中對準中央走廊 (中心點 X=6, Y=-5)
# 鏡頭以 58.5度俯瞰，完美將左側臺中市到右側日月潭水域全景盡收眼底！
bpy.ops.object.camera_add(location=(6.0, -82.0, 52.0))
cam = bpy.context.active_object
cam.name = "Real_Geo_Panorama_Camera"
cam.data.lens = 22.5
cam.rotation_euler = (math.radians(58.5), 0, 0)
scene.camera = cam

# ========================================================
# 7. 渲染與導出
# ========================================================
output_dir = "/Users/chenchunchih/Documents/ChatGPT/黑客松-南投"
render_img_path = os.path.join(output_dir, "blender_6670_panorama.png")
blend_file_path = os.path.join(output_dir, "6670_sunmoonlake_panorama.blend")
glb_file_path = os.path.join(output_dir, "6670_sunmoonlake_panorama.glb")

scene.render.filepath = render_img_path

print(f"[*] Rendering Real Geographic 3D Corridor Panorama to: {render_img_path}")
bpy.ops.render.render(write_still=True)
print("[+] Render finished successfully!")

print(f"[*] Saving Blender Scene to: {blend_file_path}")
bpy.ops.wm.save_as_mainfile(filepath=blend_file_path)

print(f"[*] Exporting Real Geo GLB to: {glb_file_path}")
bpy.ops.export_scene.gltf(filepath=glb_file_path, export_format='GLB')

print("[+] All 18 Real Geo Buses with Lat, Lon & Speed labels successfully rendered!")
