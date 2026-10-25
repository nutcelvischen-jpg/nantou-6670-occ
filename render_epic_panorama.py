import bpy
import math
import os

# 清空目前場景
bpy.ops.wm.read_factory_settings(use_empty=True)

scene = bpy.context.scene
# 啟用 EEVEE NEXT
engine_items = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engine_items else 'BLENDER_EEVEE'

# 21:9 超寬全景解析度 (2560 x 1080)
scene.render.resolution_x = 2560
scene.render.resolution_y = 1080
scene.render.film_transparent = False

# 世界環境 (黎明薄霧晨曦 / 暮色科技藍調)
world = bpy.data.worlds.new("PanoWorld")
scene.world = world
world.use_nodes = True
bg_node = world.node_tree.nodes.get("Background")
if bg_node:
    bg_node.inputs[0].default_value = (0.012, 0.024, 0.045, 1.0)
    bg_node.inputs[1].default_value = 0.8

# ==========================================
# 材質輔助函式
# ==========================================
def create_mat(name, color, roughness=0.3, metallic=0.0, emission_color=None, emission_str=0.0):
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

mat_bus_body = create_mat("BusBody", (0.95, 0.96, 0.98, 1.0), roughness=0.15, metallic=0.1)
mat_bus_orange = create_mat("BusOrange", (0.98, 0.44, 0.02, 1.0), roughness=0.2)
mat_bus_green = create_mat("BusGreen", (0.06, 0.72, 0.38, 1.0), roughness=0.2)
mat_glass = create_mat("BusGlass", (0.05, 0.09, 0.15, 1.0), roughness=0.05, metallic=0.5)
mat_tire = create_mat("Tire", (0.04, 0.04, 0.04, 1.0), roughness=0.8)
mat_rim = create_mat("Rim", (0.85, 0.88, 0.92, 1.0), roughness=0.2, metallic=0.9)

mat_lake = create_mat("LakeSurface", (0.015, 0.16, 0.28, 1.0), roughness=0.06, metallic=0.6)
mat_island = create_mat("LaluIsland", (0.08, 0.20, 0.10, 1.0), roughness=0.8)
mat_road = create_mat("AsphaltRoad", (0.08, 0.09, 0.11, 1.0), roughness=0.7)
mat_yellow_line = create_mat("YellowLine", (0.98, 0.8, 0.05, 1.0), emission_color=(0.98, 0.8, 0.05, 1.0), emission_str=3.0)
mat_viaduct = create_mat("ViaductConcrete", (0.22, 0.24, 0.28, 1.0), roughness=0.6)

mat_mtn_fore = create_mat("MtnFore", (0.06, 0.14, 0.10, 1.0), roughness=0.9)
mat_mtn_mid = create_mat("MtnMid", (0.04, 0.09, 0.15, 1.0), roughness=0.9)
mat_mtn_back = create_mat("MtnFar", (0.025, 0.05, 0.11, 1.0), roughness=0.95)

mat_holo_cyan = create_mat("HoloCyan", (0.0, 0.95, 1.0, 1.0), emission_color=(0.0, 0.95, 1.0, 1.0), emission_str=8.0)
mat_holo_amber = create_mat("HoloAmber", (1.0, 0.7, 0.05, 1.0), emission_color=(1.0, 0.7, 0.05, 1.0), emission_str=9.0)
mat_holo_emerald = create_mat("HoloEmerald", (0.0, 1.0, 0.5, 1.0), emission_color=(0.0, 1.0, 0.5, 1.0), emission_str=8.0)
mat_holo_rose = create_mat("HoloRose", (1.0, 0.15, 0.35, 1.0), emission_color=(1.0, 0.15, 0.35, 1.0), emission_str=10.0)
mat_headlight = create_mat("Headlight", (1.0, 1.0, 0.95, 1.0), emission_color=(1.0, 1.0, 0.95, 1.0), emission_str=18.0)
mat_taillight = create_mat("Taillight", (1.0, 0.05, 0.05, 1.0), emission_color=(1.0, 0.05, 0.05, 1.0), emission_str=12.0)

# ==========================================
# 1. 建造公車模型生成器
# ==========================================
def spawn_bus_model(name, loc, rot_z, scale=1.0, speed_level="normal"):
    root = bpy.data.objects.new(name, None)
    root.location = loc
    root.rotation_euler = (0, 0, rot_z)
    root.scale = (scale, scale, scale)
    scene.collection.objects.link(root)

    # 車體
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.9))
    body = bpy.context.active_object
    body.scale = (4.8, 1.2, 1.45)
    bpy.ops.object.transform_apply(scale=True)
    body.data.materials.append(mat_bus_body)
    body.parent = root

    # 台灣好行經典橘色 & 綠色彩繪線條
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.1, 0, 0.58))
    so = bpy.context.active_object
    so.scale = (4.82, 1.22, 0.18)
    bpy.ops.object.transform_apply(scale=True)
    so.data.materials.append(mat_bus_orange)
    so.parent = root

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.15, 0, 0.44))
    sg = bpy.context.active_object
    sg.scale = (4.4, 1.23, 0.1)
    bpy.ops.object.transform_apply(scale=True)
    sg.data.materials.append(mat_bus_green)
    sg.parent = root

    # 車窗
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.05, 0, 1.15))
    win = bpy.context.active_object
    win.scale = (4.0, 1.24, 0.58)
    bpy.ops.object.transform_apply(scale=True)
    win.data.materials.append(mat_glass)
    win.parent = root

    # 前擋風玻璃傾角
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(2.15, 0, 1.12))
    windshield = bpy.context.active_object
    windshield.scale = (0.55, 1.16, 0.72)
    windshield.rotation_euler = (0, math.radians(-14), 0)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    windshield.data.materials.append(mat_glass)
    windshield.parent = root

    # 車頂冷氣機
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.2, 0, 1.74))
    ac = bpy.context.active_object
    ac.scale = (2.2, 0.8, 0.2)
    bpy.ops.object.transform_apply(scale=True)
    ac.data.materials.append(mat_bus_body)
    ac.parent = root

    # 車頭 LED 路線牌
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(2.38, 0, 1.48))
    led = bpy.context.active_object
    led.scale = (0.08, 0.9, 0.18)
    bpy.ops.object.transform_apply(scale=True)
    led.data.materials.append(mat_holo_amber)
    led.parent = root

    # 車輪
    for wx, wy in [(1.5, 0.56), (1.5, -0.56), (-1.5, 0.56), (-1.5, -0.56)]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.38, depth=0.22, location=(wx, wy, 0.38))
        tire = bpy.context.active_object
        tire.rotation_euler = (math.radians(90), 0, 0)
        bpy.ops.object.transform_apply(rotation=True)
        tire.data.materials.append(mat_tire)
        tire.parent = root

        bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.25, location=(wx, wy, 0.38))
        rim = bpy.context.active_object
        rim.rotation_euler = (math.radians(90), 0, 0)
        bpy.ops.object.transform_apply(rotation=True)
        rim.data.materials.append(mat_rim)
        rim.parent = root

    # 前大燈
    for hy in [0.4, -0.4]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(2.42, hy, 0.45))
        hl = bpy.context.active_object
        hl.scale = (0.05, 0.18, 0.12)
        bpy.ops.object.transform_apply(scale=True)
        hl.data.materials.append(mat_headlight)
        hl.parent = root

    # 車尾燈
    for ty in [0.4, -0.4]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-2.42, ty, 0.48))
        tl = bpy.context.active_object
        tl.scale = (0.05, 0.16, 0.12)
        bpy.ops.object.transform_apply(scale=True)
        tl.data.materials.append(mat_taillight)
        tl.parent = root

    # 科技感即時遙測光環 (環繞車身)
    ring_mat = mat_holo_rose if speed_level == "fast" else (mat_holo_emerald if speed_level == "cruise" else mat_holo_cyan)
    bpy.ops.mesh.primitive_torus_add(major_radius=3.2, minor_radius=0.035, location=(0, 0, 0.05))
    radar = bpy.context.active_object
    radar.data.materials.append(ring_mat)
    radar.parent = root

    # 車頂垂直遙測信號光柱 (輕盈向上指引)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.03, depth=4.0, location=(0, 0, 3.8))
    beam = bpy.context.active_object
    beam.data.materials.append(ring_mat)
    beam.parent = root

    return root

# ==========================================
# 2. 全景地形建模：中彰投山水長廊
# ==========================================
# A. 日月潭湖域 (右側湖盆：浩瀚碧藍湖面)
bpy.ops.mesh.primitive_cylinder_add(radius=28.0, depth=0.2, location=(38.0, -2.0, -0.2))
lake = bpy.context.active_object
lake.name = "SunMoonLake_Basin"
lake.scale = (1.2, 0.8, 1.0)
bpy.ops.object.transform_apply(scale=True)
lake.data.materials.append(mat_lake)

# 拉魯島 (Lalu Island) 浮於湖中
bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=2.8, radius2=0.0, depth=0.8, location=(38.0, -2.0, 0.2))
island = bpy.context.active_object
island.data.materials.append(mat_island)

# B. 台中盆地平原 (左側平原高科技網格地面)
bpy.ops.mesh.primitive_plane_add(size=1.0, location=(-36.0, 0.0, -0.1))
tc_basin = bpy.context.active_object
tc_basin.scale = (42.0, 48.0, 1.0)
bpy.ops.object.transform_apply(scale=True)
tc_basin.data.materials.append(create_mat("TaichungGridFloor", (0.04, 0.06, 0.1, 1.0), roughness=0.5, metallic=0.4))

# 台中都會區科技微型建築群 (立體塊體陣列)
for bx in range(-48, -26, 5):
    for by in range(-14, 15, 6):
        h = 1.5 + abs(bx * 0.1) + abs(by * 0.08)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, by, h / 2.0))
        b_cube = bpy.context.active_object
        b_cube.scale = (3.2, 3.6, h)
        bpy.ops.object.transform_apply(scale=True)
        b_cube.data.materials.append(create_mat("CityBuilding", (0.1, 0.13, 0.18, 1.0), roughness=0.3))

# C. 埔里盆地中繼站 (中間盆地)
bpy.ops.mesh.primitive_plane_add(size=1.0, location=(6.0, 4.0, 0.0))
puli_basin = bpy.context.active_object
puli_basin.scale = (24.0, 20.0, 1.0)
bpy.ops.object.transform_apply(scale=True)
puli_basin.data.materials.append(create_mat("PuliBasinFloor", (0.05, 0.08, 0.12, 1.0), roughness=0.6))

# D. 中央山脈與群山起伏 (背景層巒疊嶂，霧氣繚繞)
mountains_data = [
    # 遠景中央山脈大縱走 (壯闊背景)
    ("Mtn_Central_1", -15, 34, 14, 32, 28, mat_mtn_back),
    ("Mtn_Central_2", 10, 36, 16, 36, 32, mat_mtn_back),
    ("Mtn_Central_3", 35, 32, 18, 40, 36, mat_mtn_back),
    ("Mtn_Central_4", 55, 28, 15, 34, 30, mat_mtn_back),
    # 中景水社大山 & 埔里外圍山丘
    ("Mtn_Shuishe", 48, -22, 11, 26, 22, mat_mtn_mid),
    ("Mtn_Puli_Hills", 8, 20, 8, 22, 16, mat_mtn_mid),
    ("Mtn_Wufeng_Hills", -18, 18, 6.5, 18, 13, mat_mtn_mid),
    # 前景山岬 (環抱日月潭與中潭公路)
    ("Mtn_Fore_Xiangshan", 24, -18, 4.2, 16, 8.5, mat_mtn_fore),
    ("Mtn_Fore_Caotun", -8, -16, 3.5, 14, 7.0, mat_mtn_fore),
]

for m_name, mx, my, mz, mr, md, m_mat in mountains_data:
    bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=mr, radius2=0.0, depth=md, location=(mx, my, mz / 2.0))
    mtn = bpy.context.active_object
    mtn.name = m_name
    mtn.data.materials.append(m_mat)

# ==========================================
# 3. 台灣好行 6670 全線骨幹路網 (蜿蜒山水公路 + 國道高架)
# ==========================================
# 建立貫通台中的主動脈 (國道6號高速走廊高架橋)
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-12.0, 8.0, 2.8))
g6_viaduct = bpy.context.active_object
g6_viaduct.name = "NationalHighway_6_Viaduct"
g6_viaduct.scale = (56.0, 3.8, 0.45)
bpy.ops.object.transform_apply(scale=True)
g6_viaduct.data.materials.append(mat_viaduct)

# 國道橋柱
for px in range(-36, 14, 10):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=2.8, location=(px, 8.0, 1.4))
    pier = bpy.context.active_object
    pier.data.materials.append(mat_viaduct)

# 國道黃色中央反光帶
bpy.ops.mesh.primitive_plane_add(size=1.0, location=(-12.0, 8.0, 3.05))
g6_line = bpy.context.active_object
g6_line.scale = (56.0, 0.15, 1.0)
bpy.ops.object.transform_apply(scale=True)
g6_line.data.materials.append(mat_yellow_line)

# 台21線中潭公路 & 環湖公路 (曲折蜿蜒進入日月潭)
winding_curves = [
    # (x, y, z, len, angle)
    (-26.0, -1.0, 0.05, 16.0, 18),
    (-12.0, 3.2, 0.1, 15.0, -12),
    (2.0, 1.8, 0.1, 16.0, 15),
    (16.0, 5.0, 0.15, 15.0, -22),
    (27.0, -2.5, 0.15, 18.0, 28),
    (42.0, 6.0, 0.2, 22.0, -15),
    (52.0, -4.0, 0.2, 20.0, 35),
]

for idx, (wx, wy, wz, wlen, wrot) in enumerate(winding_curves):
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(wx, wy, wz))
    rd = bpy.context.active_object
    rd.scale = (wlen, 3.6, 1.0)
    rd.rotation_euler = (0, 0, math.radians(wrot))
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    rd.data.materials.append(mat_road)

    # 黃線
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(wx, wy, wz + 0.01))
    yl = bpy.context.active_object
    yl.scale = (wlen, 0.12, 1.0)
    yl.rotation_euler = (0, 0, math.radians(wrot))
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    yl.data.materials.append(mat_yellow_line)

# 全息光流導航主線 (立體浮空青藍色路徑光帶，貫串全圖)
path_points = [
    (-52, -6, 0.5), (-38, -4, 0.8), (-24, 0.5, 1.2), (-10, 8.0, 3.2),
    (5, 7.5, 2.5), (18, 4.0, 1.5), (28, -2.0, 1.2), (40, 5.0, 1.0), (52, -4.0, 0.8)
]
for i in range(len(path_points) - 1):
    p1 = path_points[i]
    p2 = path_points[i+1]
    mx = (p1[0] + p2[0]) / 2.0
    my = (p1[1] + p2[1]) / 2.0
    mz = (p1[2] + p2[2]) / 2.0
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    seg_len = math.sqrt(dx*dx + dy*dy)
    ang = math.atan2(dy, dx)
    
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(mx, my, mz + 0.1))
    holo_seg = bpy.context.active_object
    holo_seg.scale = (seg_len, 0.18, 1.0)
    holo_seg.rotation_euler = (0, 0, ang)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    holo_seg.data.materials.append(mat_holo_cyan)

# ==========================================
# 4. 部署 6670 全線即時運行的 10 輛標誌性公車 (分布在全走廊各節點)
# ==========================================
buses_fleet = [
    # 國道6號高速巡航公車 (102 km/h，紅玫瑰警戒光環)
    ("Bus_KKA6715_Express", (-18.0, 8.0, 3.0), 0, 0.9, "fast"),
    ("Bus_KKA6721_NationalHwy", (-5.0, 8.0, 3.0), 0, 0.9, "fast"),
    # 臺中高鐵站起訖端公車 (整裝出發)
    ("Bus_952FX_TaichungHSR", (-44.0, -5.0, 0.0), math.radians(25), 0.95, "cruise"),
    ("Bus_951FX_Gancheng", (-34.0, -2.5, 0.0), math.radians(18), 0.9, "cruise"),
    # 草屯 / 霧峰轉運走廊
    ("Bus_KKA6718_Caotun", (-22.0, 0.5, 0.1), math.radians(20), 0.92, "cruise"),
    # 埔里大站中繼公車
    ("Bus_KKA6712_Puli", (8.0, 2.5, 0.1), math.radians(-15), 0.95, "cruise"),
    ("Bus_950FX_PuliTurn", (17.0, 4.2, 0.15), math.radians(-25), 0.92, "cruise"),
    # 日月潭水社碼頭終點大站
    ("Bus_958FX_Shuishe", (32.0, -1.0, 0.15), math.radians(30), 0.95, "cruise"),
    # 日月潭向山遊客中心 (6670F 向山線特寫主角車)
    ("Bus_953FX_Xiangshan", (42.0, 5.2, 0.2), math.radians(-18), 1.0, "cruise"),
    # 伊達邵 / 玄光寺環湖延伸巡航車
    ("Bus_KKA6713_Ithashao", (50.0, -3.0, 0.2), math.radians(40), 0.9, "cruise"),
]

for b_name, b_loc, b_rot, b_scale, b_spd in buses_fleet:
    spawn_bus_model(b_name, b_loc, b_rot, scale=b_scale, speed_level=b_spd)

# ==========================================
# 5. 全息 3D 站點地標與遙測信標 (HUD Waypoints)
# ==========================================
stations = [
    ("ST_Taichung_HSR", -44.0, -5.0, 0.0, "臺中高鐵站", mat_holo_amber),
    ("ST_National_Hwy6", -12.0, 8.0, 3.0, "國道6號高速走廊", mat_holo_rose),
    ("ST_Puli_Terminal", 8.0, 2.5, 0.1, "埔里轉運站", mat_holo_cyan),
    ("ST_Shuishe_Pier", 32.0, -1.0, 0.15, "水社碼頭商場", mat_holo_emerald),
    ("ST_Xiangshan_Center", 42.0, 5.2, 0.2, "向山遊客中心", mat_holo_cyan),
    ("ST_Ithashao", 50.0, -3.0, 0.2, "伊達邵纜車站", mat_holo_amber),
]

for st_id, sx, sy, sz, st_name, st_mat in stations:
    # 垂直光柱 (直衝雲霄)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=9.0, location=(sx, sy, sz + 4.5))
    pillar = bpy.context.active_object
    pillar.data.materials.append(st_mat)

    # 地面擴散脈衝同心環
    for cr in [2.5, 4.5]:
        bpy.ops.mesh.primitive_torus_add(major_radius=cr, minor_radius=0.04, location=(sx, sy, sz + 0.05))
        c_ring = bpy.context.active_object
        c_ring.data.materials.append(st_mat)

    # 頂端八面體全息信標
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.9, radius2=0.0, depth=1.6, location=(sx, sy, sz + 9.5))
    beacon = bpy.context.active_object
    beacon.data.materials.append(st_mat)

# ==========================================
# 6. 電影級超廣角 21:9 攝影機與環境打光 (Epic Ultrawide Cinematic Shot)
# ==========================================
# 太陽光：金色晨曦破曉光，從右上方斜射，在湖面形成璀璨反射
bpy.ops.object.light_add(type='SUN', location=(30, 40, 50))
sun = bpy.context.active_object
sun.data.energy = 4.2
sun.data.color = (1.0, 0.94, 0.88)
sun.rotation_euler = (math.radians(52), math.radians(15), math.radians(-38))

# 科技深藍色大範圍氛圍光
bpy.ops.object.light_add(type='AREA', location=(0, -20, 25))
ambient_light = bpy.context.active_object
ambient_light.data.energy = 2500.0
ambient_light.data.color = (0.05, 0.65, 1.0)
ambient_light.data.size = 50.0

# 日月潭湖面碧綠補光
bpy.ops.object.light_add(type='AREA', location=(38, -2, 12))
lake_light = bpy.context.active_object
lake_light.data.energy = 1400.0
lake_light.data.color = (0.0, 0.9, 0.8)
lake_light.data.size = 25.0

# 臺中都會區琥珀暖金補光
bpy.ops.object.light_add(type='AREA', location=(-36, 0, 10))
city_light = bpy.context.active_object
city_light.data.energy = 1200.0
city_light.data.color = (1.0, 0.7, 0.2)
city_light.data.size = 25.0

# 攝影機：電影級 21:9 超寬全景機位
# 居高臨下俯瞰整個中彰投山水長廊，從臺中盆地到日月潭一覽無遺！
bpy.ops.object.camera_add(location=(2.0, -42.0, 24.0))
cam = bpy.context.active_object
cam.name = "Epic_Panorama_Camera"
cam.data.lens = 22 # 22mm 超廣角電影鏡頭
cam.rotation_euler = (math.radians(62), 0, math.radians(2))
scene.camera = cam

# ==========================================
# 7. 渲染並輸出
# ==========================================
output_dir = "/Users/chenchunchih/Documents/ChatGPT/黑客松-南投"
render_img_path = os.path.join(output_dir, "blender_6670_panorama.png")
blend_file_path = os.path.join(output_dir, "6670_sunmoonlake_panorama.blend")
glb_file_path = os.path.join(output_dir, "6670_sunmoonlake_panorama.glb")

scene.render.filepath = render_img_path

print(f"[*] Rendering Epic 21:9 Full-Corridor Panorama to: {render_img_path}")
bpy.ops.render.render(write_still=True)
print("[+] Epic Panorama render finished successfully!")

print(f"[*] Saving Blender Project to: {blend_file_path}")
bpy.ops.wm.save_as_mainfile(filepath=blend_file_path)

print(f"[*] Exporting GLB Digital Twin to: {glb_file_path}")
bpy.ops.export_scene.gltf(filepath=glb_file_path, export_format='GLB')

print("[+] All done! Panorama generation complete.")
