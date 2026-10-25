import bpy
import math
import json
import os

# 清理場景
bpy.ops.wm.read_factory_settings(use_empty=True)

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT' if hasattr(bpy.types, 'RenderEngine') and 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080

# 背景世界顏色 (深邃數位夜景)
world = bpy.data.worlds.new("World_Fleet")
scene.world = world
world.use_nodes = True
bg_node = world.node_tree.nodes.get("Background")
if bg_node:
    bg_node.inputs[0].default_value = (0.012, 0.018, 0.032, 1.0)
    bg_node.inputs[1].default_value = 0.5

# 讀取 18 輛公車即時數據
data_path = "/Users/chenchunchih/Documents/ChatGPT/黑客松-南投/6670_bus_data/6670_realtime_bus_positions.json"
with open(data_path, "r", encoding="utf-8") as f:
    buses = json.load(f)

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

mat_bus_white = make_mat("BusWhite", (0.94, 0.95, 0.97, 1.0), roughness=0.15, metallic=0.1)
mat_bus_orange = make_mat("BusOrange", (0.98, 0.44, 0.02, 1.0), roughness=0.2)
mat_bus_green = make_mat("BusGreen", (0.06, 0.68, 0.36, 1.0), roughness=0.2)
mat_glass = make_mat("BusGlass", (0.04, 0.08, 0.14, 1.0), roughness=0.05, metallic=0.4)
mat_rubber = make_mat("TireRubber", (0.03, 0.03, 0.03, 1.0), roughness=0.7)
mat_rim = make_mat("WheelRim", (0.85, 0.88, 0.9, 1.0), roughness=0.2, metallic=0.9)
mat_floor = make_mat("CyberFloor", (0.04, 0.06, 0.1, 1.0), roughness=0.4, metallic=0.5)

mat_led_amber = make_mat("LedAmber", (1.0, 0.68, 0.05, 1.0), emission_color=(1.0, 0.68, 0.05, 1.0), emission_strength=10.0)
mat_headlight = make_mat("Headlight", (1.0, 1.0, 0.95, 1.0), emission_color=(1.0, 1.0, 0.95, 1.0), emission_strength=12.0)
mat_holo_cyan = make_mat("HoloCyan", (0.0, 0.95, 1.0, 1.0), emission_color=(0.0, 0.95, 1.0, 1.0), emission_strength=6.0)
mat_holo_emerald = make_mat("HoloEmerald", (0.0, 1.0, 0.55, 1.0), emission_color=(0.0, 1.0, 0.55, 1.0), emission_strength=8.0)
mat_holo_rose = make_mat("HoloRose", (1.0, 0.2, 0.4, 1.0), emission_color=(1.0, 0.2, 0.4, 1.0), emission_strength=8.0)

# 建立單一公車原型的函數
def create_bus_instance(idx, bus_info, loc_x, loc_y, rot_z):
    plate = bus_info.get("PlateNumb", "BUS")
    speed = bus_info.get("Speed", 0)
    sub = bus_info.get("SubRouteName", {}).get("Zh_tw", "6670")
    
    # 建立公車父群組
    parent_obj = bpy.data.objects.new(f"Bus_{idx}_{plate}", None)
    parent_obj.location = (loc_x, loc_y, 0)
    parent_obj.rotation_euler = (0, 0, rot_z)
    scene.collection.objects.link(parent_obj)
    
    # 1. 車體本體 (長 4.8, 寬 1.15, 高 1.4)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.88))
    body = bpy.context.active_object
    body.scale = (4.8, 1.15, 1.4)
    bpy.ops.object.transform_apply(scale=True)
    body.data.materials.append(mat_bus_white)
    body.parent = parent_obj
    
    # 2. 橘綠彩繪線條
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.1, 0, 0.58))
    stripe_o = bpy.context.active_object
    stripe_o.scale = (4.82, 1.17, 0.18)
    bpy.ops.object.transform_apply(scale=True)
    stripe_o.data.materials.append(mat_bus_orange)
    stripe_o.parent = parent_obj

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.2, 0, 0.44))
    stripe_g = bpy.context.active_object
    stripe_g.scale = (4.4, 1.175, 0.1)
    bpy.ops.object.transform_apply(scale=True)
    stripe_g.data.materials.append(mat_bus_green)
    stripe_g.parent = parent_obj

    # 3. 車窗
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.05, 0, 1.12))
    windows = bpy.context.active_object
    windows.scale = (4.0, 1.18, 0.55)
    bpy.ops.object.transform_apply(scale=True)
    windows.data.materials.append(mat_glass)
    windows.parent = parent_obj

    # 4. 前擋風玻璃
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(2.15, 0, 1.05))
    fg = bpy.context.active_object
    fg.scale = (0.55, 1.1, 0.72)
    fg.rotation_euler = (0, math.radians(-12), 0)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    fg.data.materials.append(mat_glass)
    fg.parent = parent_obj

    # 5. 車頭 LED 路線牌
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(2.38, 0, 1.42))
    led = bpy.context.active_object
    led.scale = (0.08, 0.9, 0.18)
    bpy.ops.object.transform_apply(scale=True)
    led.data.materials.append(mat_led_amber)
    led.parent = parent_obj

    # 6. 車頂冷氣盒
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.2, 0, 1.68))
    ac = bpy.context.active_object
    ac.scale = (2.0, 0.75, 0.18)
    bpy.ops.object.transform_apply(scale=True)
    ac.data.materials.append(mat_bus_white)
    ac.parent = parent_obj

    # 7. 四個輪胎
    for wx, wy in [(1.5, 0.52), (1.5, -0.52), (-1.5, 0.52), (-1.5, -0.52)]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.35, depth=0.22, location=(wx, wy, 0.35))
        tire = bpy.context.active_object
        tire.rotation_euler = (math.radians(90), 0, 0)
        bpy.ops.object.transform_apply(rotation=True)
        tire.data.materials.append(mat_rubber)
        tire.parent = parent_obj

        bpy.ops.mesh.primitive_cylinder_add(radius=0.2, depth=0.24, location=(wx, wy, 0.35))
        rim = bpy.context.active_object
        rim.rotation_euler = (math.radians(90), 0, 0)
        bpy.ops.object.transform_apply(rotation=True)
        rim.data.materials.append(mat_rim)
        rim.parent = parent_obj

    # 8. 頭燈
    for hy in [0.38, -0.38]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(2.41, hy, 0.45))
        hl = bpy.context.active_object
        hl.scale = (0.06, 0.18, 0.12)
        bpy.ops.object.transform_apply(scale=True)
        hl.data.materials.append(mat_headlight)
        hl.parent = parent_obj

    # 9. 地面全像雷達光環與車速指示
    speed_mat = mat_holo_rose if speed > 80 else (mat_holo_emerald if speed > 30 else mat_holo_cyan)
    bpy.ops.mesh.primitive_torus_add(major_radius=3.4, minor_radius=0.03, location=(0, 0, 0.03))
    radar = bpy.context.active_object
    radar.data.materials.append(speed_mat)
    radar.parent = parent_obj
    
    return parent_obj

# ========================================================
# 佈置 18 輛車：立體行控沙盤陣列展示 (3 行 x 6 列 高科技機棚/調度沙盤)
# ========================================================
cols = 6
spacing_x = 7.2
spacing_y = 4.2

for i, bus_info in enumerate(buses):
    row_idx = i // cols
    col_idx = i % cols
    
    # 根據其真實航向 (Azimuth) 微調角度，增加真實姿態
    az = bus_info.get("Azimuth", 0)
    rot_rad = math.radians(-az + 90) * 0.15 # 輕微角度偏擺
    
    pos_x = (col_idx - (cols - 1) / 2) * spacing_x
    pos_y = ((2 - row_idx) - 1) * spacing_y
    
    create_bus_instance(i + 1, bus_info, pos_x, pos_y, rot_rad)

# 地面科技格線網格
bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0, 0, 0.0))
floor = bpy.context.active_object
floor.name = "Fleet_Hangar_Floor"
floor.scale = (60.0, 30.0, 1.0)
bpy.ops.object.transform_apply(scale=True)
floor.data.materials.append(mat_floor)

# 科技網格線裝飾
for x in range(-25, 26, 7):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, 0, 0.01))
    line = bpy.context.active_object
    line.scale = (0.05, 28.0, 0.02)
    bpy.ops.object.transform_apply(scale=True)
    line.data.materials.append(mat_holo_cyan)

# 燈光配置
bpy.ops.object.light_add(type='SUN', location=(10, -15, 20))
sun = bpy.context.active_object
sun.data.energy = 4.0
sun.data.color = (0.95, 0.98, 1.0)
sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-30))

# 兩側賽博藍與琥珀色側光
bpy.ops.object.light_add(type='AREA', location=(-22, -10, 8))
blue_light = bpy.context.active_object
blue_light.data.energy = 800.0
blue_light.data.color = (0.0, 0.85, 1.0)
blue_light.data.size = 15.0

bpy.ops.object.light_add(type='AREA', location=(22, 10, 8))
amber_light = bpy.context.active_object
amber_light.data.energy = 600.0
amber_light.data.color = (1.0, 0.65, 0.1)
amber_light.data.size = 15.0

# 攝影機：宏偉廣角俯瞰 18 輛完整車隊
bpy.ops.object.camera_add(location=(0, -26, 17))
cam = bpy.context.active_object
cam.data.lens = 28 # 28mm 廣角鏡頭，完整收納 18 輛車隊
cam.rotation_euler = (math.radians(58), 0, 0)
scene.camera = cam

# 輸出
output_dir = "/Users/chenchunchih/Documents/ChatGPT/黑客松-南投"
render_img_path = os.path.join(output_dir, "blender_18_buses_fleet_render.png")
glb_file_path = os.path.join(output_dir, "6670_18_buses_fleet.glb")
blend_file_path = os.path.join(output_dir, "6670_18_buses_fleet.blend")

scene.render.filepath = render_img_path

print(f"[*] Rendering 18-bus fleet to: {render_img_path}")
bpy.ops.render.render(write_still=True)
print("[+] Render finished!")

print(f"[*] Saving 18-bus Blender scene to: {blend_file_path}")
bpy.ops.wm.save_as_mainfile(filepath=blend_file_path)

print(f"[*] Exporting 18-bus GLB to: {glb_file_path}")
bpy.ops.export_scene.gltf(filepath=glb_file_path, export_format='GLB')

print("[+] All 18 buses successfully generated!")
