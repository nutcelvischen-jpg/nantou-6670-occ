import bpy
import math
import os

# 清理舊場景
bpy.ops.wm.read_factory_settings(use_empty=True)

scene = bpy.context.scene
engine_items = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engine_items else 'BLENDER_EEVEE'

# 21:9 超寬影院級解析度 (2560 x 1080)
scene.render.resolution_x = 2560
scene.render.resolution_y = 1080
scene.render.film_transparent = False

# 中文字型載入 (macOS 原生黑體)
font_path = "/System/Library/Fonts/STHeiti Medium.ttc"
chinese_font = bpy.data.fonts.load(font_path) if os.path.exists(font_path) else None

# 環境底色：深邃科技藍暮色
world = bpy.data.worlds.new("MasterWorld")
scene.world = world
world.use_nodes = True
bg_node = world.node_tree.nodes.get("Background")
if bg_node:
    bg_node.inputs[0].default_value = (0.010, 0.018, 0.032, 1.0)
    bg_node.inputs[1].default_value = 0.95

# ========================================================
# 材質系統
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

mat_lake = make_mat("SunMoonLake", (0.012, 0.22, 0.35, 1.0), roughness=0.04, metallic=0.7)
mat_island = make_mat("IslandLalu", (0.07, 0.22, 0.12, 1.0), roughness=0.85)
mat_asphalt = make_mat("SmoothAsphalt", (0.07, 0.08, 0.10, 1.0), roughness=0.75)
mat_yellow_center = make_mat("YellowLineCenter", (0.98, 0.78, 0.05, 1.0), emission_color=(0.98, 0.78, 0.05, 1.0), emission_str=4.0)
mat_viaduct_body = make_mat("ViaductBody", (0.16, 0.18, 0.22, 1.0), roughness=0.6)
mat_pier = make_mat("PierConcrete", (0.18, 0.20, 0.24, 1.0), roughness=0.7)

mat_mtn_back = make_mat("MtnFarRidge", (0.02, 0.04, 0.09, 1.0), roughness=0.95)
mat_mtn_mid = make_mat("MtnMidRidge", (0.035, 0.08, 0.14, 1.0), roughness=0.9)
mat_mtn_fore = make_mat("MtnForeHill", (0.04, 0.12, 0.08, 1.0), roughness=0.9)
mat_city_block = make_mat("CityBuilding", (0.08, 0.12, 0.18, 1.0), roughness=0.3, metallic=0.3)
mat_city_window = make_mat("CityWindow", (0.15, 0.65, 0.98, 1.0), emission_color=(0.15, 0.65, 0.98, 1.0), emission_str=4.0)

mat_holo_cyan = make_mat("HoloCyan", (0.0, 0.92, 1.0, 1.0), emission_color=(0.0, 0.92, 1.0, 1.0), emission_str=12.0)
mat_holo_amber = make_mat("HoloAmber", (1.0, 0.70, 0.05, 1.0), emission_color=(1.0, 0.70, 0.05, 1.0), emission_str=12.0)
mat_holo_emerald = make_mat("HoloEmerald", (0.0, 1.0, 0.55, 1.0), emission_color=(0.0, 1.0, 0.55, 1.0), emission_str=12.0)
mat_holo_crimson = make_mat("HoloCrimson", (1.0, 0.15, 0.35, 1.0), emission_color=(1.0, 0.15, 0.35, 1.0), emission_str=14.0)
mat_headlight = make_mat("HeadlightGlow", (1.0, 1.0, 0.95, 1.0), emission_color=(1.0, 1.0, 0.95, 1.0), emission_str=20.0)
mat_taillight = make_mat("TaillightGlow", (1.0, 0.05, 0.05, 1.0), emission_color=(1.0, 0.05, 0.05, 1.0), emission_str=15.0)

# ========================================================
# 1. 無縫連續帶狀道路生成器
# ========================================================
def create_seamless_road(name, points, width=3.4, mat_road=mat_asphalt, mat_center=mat_yellow_center):
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    
    verts = []
    faces = []
    n = len(points)
    for i in range(n):
        p = points[i]
        if i < n - 1:
            dx = points[i+1][0] - p[0]
            dy = points[i+1][1] - p[1]
        else:
            dx = p[0] - points[i-1][0]
            dy = p[1] - points[i-1][1]
            
        seg_len = math.hypot(dx, dy)
        nx = -dy / seg_len if seg_len > 1e-5 else 0
        ny = dx / seg_len if seg_len > 1e-5 else 1
            
        half_w = width / 2.0
        verts.append((p[0] + nx * half_w, p[1] + ny * half_w, p[2]))
        verts.append((p[0] - nx * half_w, p[1] - ny * half_w, p[2]))
        
    for i in range(n - 1):
        faces.append((i * 2, i * 2 + 1, (i + 1) * 2 + 1, (i + 1) * 2))
        
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj.data.materials.append(mat_road)
    
    # 中央黃線
    mesh_line = bpy.data.meshes.new(f"{name}_Line_Mesh")
    obj_line = bpy.data.objects.new(f"{name}_CenterLine", mesh_line)
    scene.collection.objects.link(obj_line)
    
    line_verts = []
    line_faces = []
    line_w = 0.16
    for i in range(n):
        p = points[i]
        if i < n - 1:
            dx = points[i+1][0] - p[0]
            dy = points[i+1][1] - p[1]
        else:
            dx = p[0] - points[i-1][0]
            dy = p[1] - points[i-1][1]
        seg_len = math.hypot(dx, dy)
        nx = -dy / seg_len if seg_len > 1e-5 else 0
        ny = dx / seg_len if seg_len > 1e-5 else 1
        half_lw = line_w / 2.0
        line_verts.append((p[0] + nx * half_lw, p[1] + ny * half_lw, p[2] + 0.02))
        line_verts.append((p[0] - nx * half_lw, p[1] - ny * half_lw, p[2] + 0.02))
        
    for i in range(n - 1):
        line_faces.append((i * 2, i * 2 + 1, (i + 1) * 2 + 1, (i + 1) * 2))
        
    mesh_line.from_pydata(line_verts, [], line_faces)
    mesh_line.update()
    obj_line.data.materials.append(mat_center)
    
    return obj

# ========================================================
# 2. 全線道路網建置 (國道6號高架 + 台21線山水環湖)
# ========================================================
# 國道6號高速走廊
g6_pts = [
    (-40.0, 7.5, 3.2),
    (-26.0, 8.5, 3.2),
    (-14.0, 8.5, 3.2),
    (-2.0, 8.0, 3.2),
    (10.0, 6.8, 3.0),
    (18.0, 5.5, 2.2),
    (24.0, 4.0, 0.4)
]
create_seamless_road("Highway_G6", g6_pts, width=4.2, mat_road=mat_viaduct_body)

# 國道橋柱
for x_pier in range(-38, 19, 9):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.55, depth=3.2, location=(x_pier, 8.2, 1.6))
    pier = bpy.context.active_object
    pier.data.materials.append(mat_pier)

# 台21線中潭公路 & 日月潭景觀環湖路網
t21_pts = [
    (-52.0, -8.0, 0.05),
    (-42.0, -6.5, 0.05),
    (-32.0, -3.0, 0.08),
    (-24.0, 1.0, 0.1),
    (-16.0, 3.0, 0.12),
    (-8.0, 1.5, 0.15),
    (0.0, 0.0, 0.18),
    (8.0, 0.5, 0.2),   # 埔里
    (16.0, 2.8, 0.22),
    (24.0, 3.8, 0.25),
    (31.0, 2.5, 0.25),  # 抵達日月潭
    (36.0, -2.0, 0.22), # 水社碼頭
    (42.0, -7.5, 0.2),  # 向山遊客中心
    (48.0, -6.0, 0.2),  # 月潭
    (54.0, -0.5, 0.22), # 伊達邵
    (58.0, 6.0, 0.25)   # 文武廟
]
create_seamless_road("Provincial_Hwy_21", t21_pts, width=3.4, mat_road=mat_asphalt)

# 全息光流導航主線 (立體浮空青藍色路徑光帶)
for i in range(len(t21_pts) - 1):
    p1 = t21_pts[i]
    p2 = t21_pts[i+1]
    mx = (p1[0] + p2[0]) / 2.0
    my = (p1[1] + p2[1]) / 2.0
    mz = (p1[2] + p2[2]) / 2.0 + 0.35
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    seg_len = math.hypot(dx, dy)
    ang = math.atan2(dy, dx)
    
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(mx, my, mz))
    h_ribbon = bpy.context.active_object
    h_ribbon.scale = (seg_len, 0.12, 1.0)
    h_ribbon.rotation_euler = (0, 0, ang)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    h_ribbon.data.materials.append(mat_holo_cyan)

# ========================================================
# 3. 日月潭湖域與水系
# ========================================================
bpy.ops.mesh.primitive_cylinder_add(radius=25.0, depth=0.15, location=(45.0, 0.0, -0.15))
lake_main = bpy.context.active_object
lake_main.scale = (1.25, 0.9, 1.0)
bpy.ops.object.transform_apply(scale=True)
lake_main.data.materials.append(mat_lake)

bpy.ops.mesh.primitive_cylinder_add(radius=17.0, depth=0.14, location=(38.0, -4.5, -0.14))
lake_sub = bpy.context.active_object
lake_sub.scale = (1.1, 0.85, 1.0)
bpy.ops.object.transform_apply(scale=True)
lake_sub.data.materials.append(mat_lake)

# 拉魯島
bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=2.6, radius2=0.0, depth=0.9, location=(43.0, -1.0, 0.25))
island = bpy.context.active_object
island.data.materials.append(mat_island)

# ========================================================
# 4. 臺中高鐵都會區
# ========================================================
bpy.ops.mesh.primitive_plane_add(size=1.0, location=(-42.0, -2.0, -0.1))
city_ground = bpy.context.active_object
city_ground.scale = (32.0, 36.0, 1.0)
bpy.ops.object.transform_apply(scale=True)
city_ground.data.materials.append(make_mat("CityBase", (0.03, 0.05, 0.09, 1.0), roughness=0.5, metallic=0.4))

for bx in range(-54, -30, 4):
    for by in range(-16, 12, 5):
        h = 2.0 + abs(bx * 0.12) + (by % 3) * 1.5
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, by, h / 2.0))
        bldg = bpy.context.active_object
        bldg.scale = (2.6, 3.2, h)
        bpy.ops.object.transform_apply(scale=True)
        bldg.data.materials.append(mat_city_window if (bx + by) % 5 == 0 else mat_city_block)

# ========================================================
# 5. 背景山脈與平緩前景丘陵 (開闊視野)
# ========================================================
mountains = [
    # 遠景中央山脈主脊 (深邃層次)
    ("Mtn_Central_1", -20, 36, 16, 36, 30, mat_mtn_back),
    ("Mtn_Central_2", 8, 38, 18, 40, 34, mat_mtn_back),
    ("Mtn_Central_3", 34, 35, 20, 44, 38, mat_mtn_back),
    ("Mtn_Central_4", 58, 30, 16, 36, 32, mat_mtn_back),
    # 中景水社大山 & 丘陵
    ("Mtn_Shuishe_Great", 46, -26, 12, 28, 24, mat_mtn_mid),
    ("Mtn_Puli_Ridge", 12, 22, 9, 24, 18, mat_mtn_mid),
    ("Mtn_Wufeng_Ridge", -14, 20, 7.5, 20, 15, mat_mtn_mid),
    # 平緩前景丘陵 (低矮自然，不阻擋道路與湖水)
    ("Mtn_Fore_Caotun", -10, -25, -1.0, 18, 5.0, mat_mtn_fore),
    ("Mtn_Fore_Xiangshan", 28, -24, -1.0, 20, 5.5, mat_mtn_fore),
]

for m_name, mx, my, mz, mr, md, m_mat in mountains:
    bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=mr, radius2=0.0, depth=md, location=(mx, my, mz / 2.0))
    mtn = bpy.context.active_object
    mtn.name = m_name
    mtn.data.materials.append(m_mat)

# ========================================================
# 6. 3D 大巴模型生成器
# ========================================================
def spawn_bus(name, loc, rot_z, scale=1.0, speed_mode="normal"):
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
    body.data.materials.append(mat_bus_white)
    body.parent = root

    # 台灣好行彩繪橘綠飾條
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

    # 玻璃窗
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.05, 0, 1.15))
    win = bpy.context.active_object
    win.scale = (4.0, 1.24, 0.58)
    bpy.ops.object.transform_apply(scale=True)
    win.data.materials.append(mat_glass)
    win.parent = root

    # 前擋風玻璃
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(2.15, 0, 1.12))
    ws = bpy.context.active_object
    ws.scale = (0.55, 1.16, 0.72)
    ws.rotation_euler = (0, math.radians(-14), 0)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    ws.data.materials.append(mat_glass)
    ws.parent = root

    # LED 牌
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

    # 車燈
    for hy in [0.4, -0.4]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(2.42, hy, 0.45))
        hl = bpy.context.active_object
        hl.scale = (0.05, 0.18, 0.12)
        bpy.ops.object.transform_apply(scale=True)
        hl.data.materials.append(mat_headlight)
        hl.parent = root

    for ty in [0.4, -0.4]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-2.42, ty, 0.48))
        tl = bpy.context.active_object
        tl.scale = (0.05, 0.16, 0.12)
        bpy.ops.object.transform_apply(scale=True)
        tl.data.materials.append(mat_taillight)
        tl.parent = root

    # 遙測光環
    ring_mat = mat_holo_crimson if speed_mode == "fast" else (mat_holo_emerald if speed_mode == "cruise" else mat_holo_cyan)
    bpy.ops.mesh.primitive_torus_add(major_radius=3.2, minor_radius=0.035, location=(0, 0, 0.05))
    radar = bpy.context.active_object
    radar.data.materials.append(ring_mat)
    radar.parent = root

    bpy.ops.mesh.primitive_cylinder_add(radius=0.03, depth=3.8, location=(0, 0, 3.8))
    beam = bpy.context.active_object
    beam.data.materials.append(ring_mat)
    beam.parent = root

    return root

# ========================================================
# 7. 全線車隊佈署 (11 輛車精準分布)
# ========================================================
fleet = [
    # 國道6號高速段 (102 km/h 飆速中，紅玫瑰光環)
    ("Bus_KKA6715_Express", (-20.0, 8.5, 3.2), 0, 0.95, "fast"),
    ("Bus_KKA6721_Express", (-8.0, 8.2, 3.2), 0, 0.95, "fast"),
    # 臺中起點
    ("Bus_952FX_TaichungHSR", (-48.0, -7.5, 0.05), math.radians(15), 0.95, "cruise"),
    ("Bus_951FX_Gancheng", (-38.0, -5.2, 0.05), math.radians(20), 0.92, "cruise"),
    # 草屯 / 霧峰
    ("Bus_KKA6718_Caotun", (-20.0, 2.0, 0.1), math.radians(22), 0.92, "cruise"),
    ("Bus_KKA6716_Wufeng", (-12.0, 2.5, 0.12), math.radians(-10), 0.90, "cruise"),
    # 埔里
    ("Bus_KKA6712_PuliCenter", (4.0, 0.2, 0.18), math.radians(12), 0.95, "cruise"),
    ("Bus_950FX_PuliTurn", (12.0, 1.8, 0.2), math.radians(25), 0.92, "cruise"),
    # 日月潭水社
    ("Bus_958FX_Shuishe", (34.0, -0.5, 0.22), math.radians(-35), 0.96, "cruise"),
    # 日月潭向山
    ("Bus_953FX_Xiangshan", (40.0, -6.5, 0.2), math.radians(-25), 1.05, "cruise"),
    # 伊達邵
    ("Bus_KKA6713_Ithashao", (51.0, -3.5, 0.2), math.radians(45), 0.92, "cruise"),
]

for b_name, b_loc, b_rot, b_scale, b_spd in fleet:
    spawn_bus(b_name, b_loc, b_rot, scale=b_scale, speed_mode=b_spd)

# ========================================================
# 8. 全息站點光柱與 3D 懸浮發光文字標牌 (Holographic Text Labels)
# ========================================================
waypoints = [
    ("ST_Taichung_HSR", -41.0, -7.0, 0.05, "臺中高鐵站", mat_holo_amber),
    ("ST_G6_Expressway", -14.0, 8.5, 3.2, "國道6號高速走廊 (102 km/h)", mat_holo_crimson),
    ("ST_Puli_Station", 8.0, 0.5, 0.2, "埔里轉運站", mat_holo_cyan),
    ("ST_Shuishe_Pier", 36.0, -2.0, 0.22, "日月潭水社碼頭", mat_holo_emerald),
    ("ST_Xiangshan_Center", 43.5, -7.5, 0.2, "向山遊客中心", mat_holo_cyan),
    ("ST_Ithashao_Cable", 53.0, -0.5, 0.22, "伊達邵纜車站", mat_holo_amber),
]

for st_id, sx, sy, sz, st_name, st_mat in waypoints:
    # 垂直光柱
    bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=9.5, location=(sx, sy, sz + 4.75))
    pillar = bpy.context.active_object
    pillar.data.materials.append(st_mat)
    pillar.visible_shadow = False

    # 地面擴散雷達同心環
    for cr in [2.4, 4.5]:
        bpy.ops.mesh.primitive_torus_add(major_radius=cr, minor_radius=0.04, location=(sx, sy, sz + 0.05))
        c_ring = bpy.context.active_object
        c_ring.data.materials.append(st_mat)
        c_ring.visible_shadow = False

    # 頂端八面體懸浮信標
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.85, radius2=0.0, depth=1.5, location=(sx, sy, sz + 9.8))
    beacon = bpy.context.active_object
    beacon.data.materials.append(st_mat)
    beacon.visible_shadow = False

    # 3D 浮空全息標籤文字 (面對攝影機角度傾斜，不投射實體陰影)
    if chinese_font:
        bpy.ops.object.text_add(location=(sx, sy, sz + 11.2))
        txt_obj = bpy.context.active_object
        txt_obj.name = f"Text_{st_id}"
        txt_obj.data.body = st_name
        txt_obj.data.font = chinese_font
        txt_obj.data.size = 1.15
        txt_obj.data.extrude = 0.03
        txt_obj.data.align_x = 'CENTER'
        txt_obj.rotation_euler = (math.radians(62.5), 0, 0)
        txt_obj.data.materials.append(st_mat)
        txt_obj.visible_shadow = False

# ========================================================
# 9. 超廣角電影級攝影機與光影
# ========================================================
bpy.ops.object.light_add(type='SUN', location=(35, 45, 55))
sun = bpy.context.active_object
sun.data.energy = 4.6
sun.data.color = (1.0, 0.95, 0.88)
sun.rotation_euler = (math.radians(50), math.radians(16), math.radians(-36))

bpy.ops.object.light_add(type='AREA', location=(4.0, -28.0, 32))
amb_light = bpy.context.active_object
amb_light.data.energy = 3600.0
amb_light.data.color = (0.04, 0.65, 1.0)
amb_light.data.size = 70.0

bpy.ops.object.light_add(type='AREA', location=(44, -2, 18))
lake_spot = bpy.context.active_object
lake_spot.data.energy = 2400.0
lake_spot.data.color = (0.0, 0.95, 0.85)
lake_spot.data.size = 38.0

bpy.ops.object.light_add(type='AREA', location=(-42, -2, 15))
city_spot = bpy.context.active_object
city_spot.data.energy = 1800.0
city_spot.data.color = (1.0, 0.72, 0.25)
city_spot.data.size = 32.0

# 攝影機：完美居中俯瞰長廊
bpy.ops.object.camera_add(location=(4.0, -60.0, 36.0))
cam = bpy.context.active_object
cam.name = "Master_Panorama_Camera"
cam.data.lens = 20.5 # 超廣角
cam.rotation_euler = (math.radians(62.5), 0, math.radians(0))
scene.camera = cam

# ========================================================
# 10. 渲染輸出
# ========================================================
output_dir = "/Users/chenchunchih/Documents/ChatGPT/黑客松-南投"
render_img_path = os.path.join(output_dir, "blender_6670_panorama.png")
blend_file_path = os.path.join(output_dir, "6670_sunmoonlake_panorama.blend")
glb_file_path = os.path.join(output_dir, "6670_sunmoonlake_panorama.glb")

scene.render.filepath = render_img_path

print(f"[*] Rendering Master 21:9 Panorama with 3D Holographic Typography to: {render_img_path}")
bpy.ops.render.render(write_still=True)
print("[+] Master Panorama render finished successfully!")

print(f"[*] Saving Blender Scene to: {blend_file_path}")
bpy.ops.wm.save_as_mainfile(filepath=blend_file_path)

print(f"[*] Exporting GLB Digital Twin to: {glb_file_path}")
bpy.ops.export_scene.gltf(filepath=glb_file_path, export_format='GLB')

print("[+] All tasks completed with excellence!")
