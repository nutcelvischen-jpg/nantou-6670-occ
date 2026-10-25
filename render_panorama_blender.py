import bpy
import math
import os

# 清理舊場景
bpy.ops.wm.read_factory_settings(use_empty=True)

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT' if hasattr(bpy.types, 'RenderEngine') and 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
# 21:9 超寬全景比例 (2560 x 1080)
scene.render.resolution_x = 2560
scene.render.resolution_y = 1080

# 世界環境 (暮色漸層科技夜景)
world = bpy.data.worlds.new("World_Pano")
scene.world = world
world.use_nodes = True
bg_node = world.node_tree.nodes.get("Background")
if bg_node:
    bg_node.inputs[0].default_value = (0.015, 0.022, 0.038, 1.0)
    bg_node.inputs[1].default_value = 0.65

# 材質庫
def make_mat(name, base_color, roughness=0.3, metallic=0.0, emission_color=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = base_color
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['Metallic'].default_value = metallic
        if emission_color and emission_strength > 0:
            if 'Emission Color' in bsdf.inputs:
                bsdf.inputs['Emission Color'].default_value = emission_color
                bsdf.inputs['Emission Strength'].default_value = emission_strength
            elif 'Emission' in bsdf.inputs:
                bsdf.inputs['Emission'].default_value = emission_color
    return mat

mat_bus_white = make_mat("BusWhite", (0.95, 0.96, 0.98, 1.0), roughness=0.15, metallic=0.1)
mat_bus_orange = make_mat("BusOrange", (0.98, 0.45, 0.02, 1.0), roughness=0.2)
mat_bus_green = make_mat("BusGreen", (0.06, 0.70, 0.38, 1.0), roughness=0.2)
mat_glass = make_mat("BusGlass", (0.03, 0.07, 0.12, 1.0), roughness=0.05, metallic=0.5)
mat_rubber = make_mat("TireRubber", (0.03, 0.03, 0.03, 1.0), roughness=0.8)
mat_rim = make_mat("WheelRim", (0.85, 0.88, 0.9, 1.0), roughness=0.2, metallic=0.9)

mat_asphalt = make_mat("RoadAsphalt", (0.06, 0.07, 0.08, 1.0), roughness=0.8)
mat_road_line = make_mat("RoadLine", (0.95, 0.75, 0.05, 1.0), emission_color=(0.95, 0.75, 0.05, 1.0), emission_strength=2.0)
mat_lake = make_mat("LakeWater", (0.015, 0.12, 0.22, 1.0), roughness=0.08, metallic=0.3)
mat_mountain_fore = make_mat("MtnFore", (0.05, 0.12, 0.08, 1.0), roughness=0.9)
mat_mountain_mid = make_mat("MtnMid", (0.03, 0.08, 0.12, 1.0), roughness=0.9)
mat_mountain_back = make_mat("MtnBack", (0.02, 0.04, 0.09, 1.0), roughness=0.9)

# 科技全像發光材質
mat_holo_cyan = make_mat("HoloCyan", (0.0, 0.92, 1.0, 1.0), emission_color=(0.0, 0.92, 1.0, 1.0), emission_strength=7.0)
mat_holo_amber = make_mat("HoloAmber", (1.0, 0.65, 0.05, 1.0), emission_color=(1.0, 0.65, 0.05, 1.0), emission_strength=8.0)
mat_holo_emerald = make_mat("HoloEmerald", (0.0, 1.0, 0.55, 1.0), emission_color=(0.0, 1.0, 0.55, 1.0), emission_strength=8.0)
mat_headlight = make_mat("Headlight", (1.0, 1.0, 0.95, 1.0), emission_color=(1.0, 1.0, 0.95, 1.0), emission_strength=15.0)
mat_taillight = make_mat("Taillight", (1.0, 0.05, 0.05, 1.0), emission_color=(1.0, 0.05, 0.05, 1.0), emission_strength=12.0)

# ==========================================
# 1. 建造 3D 大巴生成函數
# ==========================================
def spawn_bus(name, loc, rot_z, scale=1.0, led_text="6670 日月潭"):
    bus_root = bpy.data.objects.new(name, None)
    bus_root.location = loc
    bus_root.rotation_euler = (0, 0, rot_z)
    bus_root.scale = (scale, scale, scale)
    scene.collection.objects.link(bus_root)

    # 車體
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.95))
    b = bpy.context.active_object
    b.scale = (5.2, 1.25, 1.5)
    bpy.ops.object.transform_apply(scale=True)
    b.data.materials.append(mat_bus_white)
    b.parent = bus_root

    # 橘綠彩繪
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.1, 0, 0.62))
    so = bpy.context.active_object
    so.scale = (5.22, 1.27, 0.2)
    bpy.ops.object.transform_apply(scale=True)
    so.data.materials.append(mat_bus_orange)
    so.parent = bus_root

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.2, 0, 0.46))
    sg = bpy.context.active_object
    sg.scale = (4.8, 1.275, 0.12)
    bpy.ops.object.transform_apply(scale=True)
    sg.data.materials.append(mat_bus_green)
    sg.parent = bus_root

    # 車窗
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.05, 0, 1.2))
    w = bpy.context.active_object
    w.scale = (4.2, 1.28, 0.6)
    bpy.ops.object.transform_apply(scale=True)
    w.data.materials.append(mat_glass)
    w.parent = bus_root

    # 前擋風玻璃
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(2.3, 0, 1.15))
    fg = bpy.context.active_object
    fg.scale = (0.6, 1.2, 0.78)
    fg.rotation_euler = (0, math.radians(-12), 0)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    fg.data.materials.append(mat_glass)
    fg.parent = bus_root

    # 車頭 LED
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(2.55, 0, 1.52))
    led = bpy.context.active_object
    led.scale = (0.08, 0.95, 0.2)
    bpy.ops.object.transform_apply(scale=True)
    led.data.materials.append(mat_holo_amber)
    led.parent = bus_root

    # 車頂空調
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.2, 0, 1.82))
    ac = bpy.context.active_object
    ac.scale = (2.2, 0.8, 0.2)
    bpy.ops.object.transform_apply(scale=True)
    ac.data.materials.append(mat_bus_white)
    ac.parent = bus_root

    # 車輪
    for wx, wy in [(1.6, 0.58), (1.6, -0.58), (-1.6, 0.58), (-1.6, -0.58)]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.38, depth=0.25, location=(wx, wy, 0.38))
        tire = bpy.context.active_object
        tire.rotation_euler = (math.radians(90), 0, 0)
        bpy.ops.object.transform_apply(rotation=True)
        tire.data.materials.append(mat_rubber)
        tire.parent = bus_root

        bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.27, location=(wx, wy, 0.38))
        rim = bpy.context.active_object
        rim.rotation_euler = (math.radians(90), 0, 0)
        bpy.ops.object.transform_apply(rotation=True)
        rim.data.materials.append(mat_rim)
        rim.parent = bus_root

    # 車頭大燈
    for hy in [0.42, -0.42]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(2.58, hy, 0.48))
        hl = bpy.context.active_object
        hl.scale = (0.06, 0.2, 0.14)
        bpy.ops.object.transform_apply(scale=True)
        hl.data.materials.append(mat_headlight)
        hl.parent = bus_root

    # 全像定位光環
    bpy.ops.mesh.primitive_torus_add(major_radius=3.6, minor_radius=0.035, location=(0, 0, 0.05))
    ring = bpy.context.active_object
    ring.data.materials.append(mat_holo_cyan)
    ring.parent = bus_root

    return bus_root

# ==========================================
# 2. 全景地形建模：日月潭湖景、中央山脈、高架路網
# ==========================================
# 日月潭主湖面 (廣闊鏡面湖水)
bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0, -8.0, -0.4))
lake = bpy.context.active_object
lake.name = "SunMoonLake_Panorama"
lake.scale = (120.0, 70.0, 1.0)
bpy.ops.object.transform_apply(scale=True)
lake.data.materials.append(mat_lake)

# 蜿蜒環湖公路 (台21線 / 中潭公路段) - 沿著湖畔彎曲
road_segments = [
    # (x, y, z, len, angle)
    (-25, 4.0, 0.0, 18.0, 12),
    (-8, 6.5, 0.05, 18.0, -8),
    (8, 4.2, 0.0, 16.0, 18),
    (22, 9.5, 0.1, 16.0, -15),
    (36, 6.0, 0.2, 16.0, 20)
]

for idx, (rx, ry, rz, rlen, rrot) in enumerate(road_segments):
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(rx, ry, rz))
    r = bpy.context.active_object
    r.scale = (rlen, 3.8, 1.0)
    r.rotation_euler = (0, 0, math.radians(rrot))
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    r.data.materials.append(mat_asphalt)

    # 中央分向黃線
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(rx, ry, rz + 0.01))
    yl = bpy.context.active_object
    yl.scale = (rlen, 0.14, 1.0)
    yl.rotation_euler = (0, 0, math.radians(rrot))
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    yl.data.materials.append(mat_road_line)

# 國道六號遠景高架橋 (Viaduct in background)
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 24.0, 3.2))
viaduct = bpy.context.active_object
viaduct.scale = (90.0, 3.2, 0.4)
bpy.ops.object.transform_apply(scale=True)
viaduct.data.materials.append(mat_asphalt)

# 遠景高架橋柱
for px in range(-38, 39, 12):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.45, depth=3.2, location=(px, 24.0, 1.6))
    pier = bpy.context.active_object
    pier.data.materials.append(make_mat("PierMat", (0.2, 0.22, 0.25, 1.0), roughness=0.5))

# 中央山脈與環湖群山 (層次分明的背景山巒)
mountains = [
    # 前景山丘
    ("Mtn_Fore_L", -32, 12, 3.5, 22.0, 14.0, mat_mountain_fore),
    ("Mtn_Fore_R", 30, 15, 4.0, 24.0, 16.0, mat_mountain_fore),
    # 中景水社大山
    ("Mtn_Mid_1", -15, -30, 8.0, 30.0, 22.0, mat_mountain_mid),
    ("Mtn_Mid_2", 12, -32, 9.5, 34.0, 24.0, mat_mountain_mid),
    ("Mtn_Mid_3", 0, -35, 7.5, 28.0, 20.0, mat_mountain_mid),
    # 遠景青翠山稜
    ("Mtn_Far_1", -45, -45, 14.0, 42.0, 32.0, mat_mountain_back),
    ("Mtn_Far_2", 40, -48, 15.0, 45.0, 34.0, mat_mountain_back)
]

for m_name, mx, my, mz, mr, md, m_mat in mountains:
    bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=mr, radius2=0.0, depth=md, location=(mx, my, mz))
    m = bpy.context.active_object
    m.name = m_name
    m.data.materials.append(m_mat)

# ==========================================
# 3. 部署全景公車車隊 (多輛車行駛在山水走廊間)
# ==========================================
# 1. 前景主視覺公車 (953-FX 6670F 向山線，過彎特寫)
spawn_bus("Bus_Hero_Foreground", loc=(-1.5, 5.2, 0.0), rot_z=math.radians(12), scale=1.05)

# 2. 中景湖畔公車 (958-FX 6670B 直達車，沿湖巡航)
spawn_bus("Bus_Mid_Lakeside", loc=(18.5, 7.8, 0.08), rot_z=math.radians(-14), scale=0.85)

# 3. 遠景高架橋上的公車 (KKA-6715 102 km/h 國道奔馳中)
spawn_bus("Bus_Far_Highway", loc=(-14.0, 24.0, 3.4), rot_z=math.radians(0), scale=0.6)

# 4. 對向回程公車 (950-FX 回程臺中)
spawn_bus("Bus_Opposite", loc=(-19.0, 3.0, 0.0), rot_z=math.radians(190), scale=0.8)

# ==========================================
# 4. 科技感數位孿生 HUD 全像疊加元素 (Holographic Digital Twin Beams)
# ==========================================
# 沿線全像光流軌跡 (Holographic Cyan Light Ribbon)
bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0, 6.0, 0.45))
h_ribbon = bpy.context.active_object
h_ribbon.scale = (75.0, 0.08, 1.0)
h_ribbon.data.materials.append(mat_holo_cyan)

# 浮空站點雷達光柱 (向山遊客中心、水社碼頭、埔里轉運中心)
waypoints = [
    ("WP_Xiangshan", -16.0, 3.5, 0.0, "向山遊客中心"),
    ("WP_Shuishe", 0.0, 5.5, 0.0, "水社綜合商場"),
    ("WP_Puli", 24.0, 9.0, 0.0, "埔里轉運站")
]

for wp_id, wx, wy, wz, wp_title in waypoints:
    # 垂直雷達光柱
    bpy.ops.mesh.primitive_cylinder_add(radius=0.12, depth=7.0, location=(wx, wy, 3.5))
    pillar = bpy.context.active_object
    pillar.data.materials.append(mat_holo_cyan)

    # 地面同心環
    bpy.ops.mesh.primitive_torus_add(major_radius=2.5, minor_radius=0.03, location=(wx, wy, 0.05))
    t1 = bpy.context.active_object
    t1.data.materials.append(mat_holo_cyan)

    # 頂部浮空鑽石標記
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.7, radius2=0.0, depth=1.2, location=(wx, wy, 7.0))
    d1 = bpy.context.active_object
    d1.data.materials.append(mat_holo_amber)

# ==========================================
# 5. 電影級寬螢幕攝影機與照明配置 (21:9 CinemaScope)
# ==========================================
# 太陽光：晨曦金色斜射光，照耀山嶺與湖面波紋
bpy.ops.object.light_add(type='SUN', location=(25, 20, 35))
sun = bpy.context.active_object
sun.data.energy = 4.8
sun.data.color = (1.0, 0.94, 0.85)
sun.rotation_euler = (math.radians(48), math.radians(18), math.radians(-42))

# 科技深藍色環境補光 (Cyber Indigo Ambient Light)
bpy.ops.object.light_add(type='AREA', location=(-15, -15, 15))
area_light = bpy.context.active_object
area_light.data.energy = 1200.0
area_light.data.color = (0.05, 0.75, 1.0)
area_light.data.size = 28.0

# 車頭投射光束 (Spotlight on road)
bpy.ops.object.light_add(type='SPOT', location=(1.2, 5.4, 0.6))
hero_spot = bpy.context.active_object
hero_spot.data.energy = 500.0
hero_spot.data.spot_size = math.radians(65)
hero_spot.data.spot_blend = 0.5
hero_spot.data.color = (1.0, 0.98, 0.92)
hero_spot.rotation_euler = (math.radians(-10), math.radians(80), math.radians(-10))

# 攝影機：21:9 超寬全景透視，俯瞰全走廊山水大景
bpy.ops.object.camera_add(location=(8.5, -15.5, 9.2))
cam = bpy.context.active_object
cam.name = "OCC_Panorama_Camera"
cam.data.lens = 28 # 28mm 超廣角電影鏡頭
cam.rotation_euler = (math.radians(62), 0, math.radians(28))
scene.camera = cam

# 輸出設定
output_dir = "/Users/chenchunchih/Documents/ChatGPT/黑客松-南投"
render_img_path = os.path.join(output_dir, "blender_6670_panorama.png")
blend_file_path = os.path.join(output_dir, "6670_sunmoonlake_panorama.blend")
glb_file_path = os.path.join(output_dir, "6670_sunmoonlake_panorama.glb")

scene.render.filepath = render_img_path

print(f"[*] Rendering Ultra-Wide 21:9 3D Panorama to: {render_img_path}")
bpy.ops.render.render(write_still=True)
print("[+] Panorama render finished successfully!")

print(f"[*] Saving Blender Panorama project to: {blend_file_path}")
bpy.ops.wm.save_as_mainfile(filepath=blend_file_path)

print(f"[*] Exporting Panorama GLB to: {glb_file_path}")
bpy.ops.export_scene.gltf(filepath=glb_file_path, export_format='GLB')

print("[+] All Panoramic tasks completed successfully!")
