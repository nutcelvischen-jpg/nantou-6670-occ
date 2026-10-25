import bpy
import math
import os

# 清理預設場景
bpy.ops.wm.read_factory_settings(use_empty=True)

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT' if hasattr(bpy.types, 'RenderEngine') and 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.film_transparent = False

# 背景世界顏色 (深邃暮色/科技夜景)
world = bpy.data.worlds.new("World_OCC")
scene.world = world
world.use_nodes = True
bg_node = world.node_tree.nodes.get("Background")
if bg_node:
    bg_node.inputs[0].default_value = (0.015, 0.025, 0.045, 1.0) # 深夜藍黑
    bg_node.inputs[1].default_value = 0.6

# 輔助材質建立函數
def make_mat(name, base_color, roughness=0.3, metallic=0.0, emission_color=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = base_color
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['Metallic'].default_value = metallic
        if emission_color and emission_strength > 0:
            # Blender 4/5 emission inputs
            if 'Emission Color' in bsdf.inputs:
                bsdf.inputs['Emission Color'].default_value = emission_color
                bsdf.inputs['Emission Strength'].default_value = emission_strength
            elif 'Emission' in bsdf.inputs:
                bsdf.inputs['Emission'].default_value = emission_color
    return mat

mat_bus_white = make_mat("BusWhite", (0.92, 0.93, 0.95, 1.0), roughness=0.15, metallic=0.1)
mat_bus_orange = make_mat("BusOrange", (0.98, 0.42, 0.02, 1.0), roughness=0.2, metallic=0.1)
mat_bus_green = make_mat("BusGreen", (0.05, 0.65, 0.35, 1.0), roughness=0.2, metallic=0.1)
mat_glass = make_mat("BusGlass", (0.05, 0.1, 0.15, 1.0), roughness=0.05, metallic=0.3)
mat_rubber = make_mat("TireRubber", (0.04, 0.04, 0.04, 1.0), roughness=0.7, metallic=0.0)
mat_rim = make_mat("WheelRim", (0.8, 0.82, 0.85, 1.0), roughness=0.2, metallic=0.9)
mat_asphalt = make_mat("RoadAsphalt", (0.08, 0.08, 0.09, 1.0), roughness=0.8, metallic=0.0)
mat_road_line = make_mat("RoadLine", (0.95, 0.75, 0.05, 1.0), roughness=0.4, emission_color=(0.95, 0.75, 0.05, 1.0), emission_strength=1.5)
mat_lake = make_mat("LakeWater", (0.02, 0.15, 0.28, 1.0), roughness=0.1, metallic=0.2)
mat_mountain = make_mat("MountainTerrain", (0.08, 0.16, 0.1, 1.0), roughness=0.9, metallic=0.0)

# 發光部件材質
mat_led_sign = make_mat("LedSign", (0.98, 0.65, 0.05, 1.0), emission_color=(1.0, 0.68, 0.05, 1.0), emission_strength=8.0)
mat_headlight = make_mat("Headlight", (1.0, 1.0, 0.9, 1.0), emission_color=(1.0, 1.0, 0.95, 1.0), emission_strength=15.0)
mat_taillight = make_mat("Taillight", (0.95, 0.05, 0.05, 1.0), emission_color=(1.0, 0.05, 0.05, 1.0), emission_strength=10.0)
mat_hologram_cyan = make_mat("HoloCyan", (0.0, 0.94, 1.0, 1.0), emission_color=(0.0, 0.94, 1.0, 1.0), emission_strength=5.0)

# ==========================================
# 1. 建模：台灣好行 6670 客運大巴 (Bus Model)
# ==========================================
# 車體本體 (長 6.0, 寬 1.4, 高 1.8)
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1.05))
bus_body = bpy.context.active_object
bus_body.name = "Bus_Body"
bus_body.scale = (5.8, 1.35, 1.65)
bpy.ops.object.transform_apply(scale=True)
bus_body.data.materials.append(mat_bus_white)

# 車頂冷氣空調艙
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.2, 0, 1.95))
ac_unit = bpy.context.active_object
ac_unit.name = "Bus_AC_Unit"
ac_unit.scale = (2.4, 0.9, 0.22)
bpy.ops.object.transform_apply(scale=True)
ac_unit.data.materials.append(mat_bus_white)

# 台灣好行彩繪飾條 (橘色與綠色飄逸流線)
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.1, 0, 0.7))
stripe_orange = bpy.context.active_object
stripe_orange.name = "Bus_Stripe_Orange"
stripe_orange.scale = (5.82, 1.37, 0.22)
bpy.ops.object.transform_apply(scale=True)
stripe_orange.data.materials.append(mat_bus_orange)

bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.3, 0, 0.52))
stripe_green = bpy.context.active_object
stripe_green.name = "Bus_Stripe_Green"
stripe_green.scale = (5.2, 1.375, 0.12)
bpy.ops.object.transform_apply(scale=True)
stripe_green.data.materials.append(mat_bus_green)

# 前擋風玻璃 (傾斜前窗)
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(2.6, 0, 1.25))
front_glass = bpy.context.active_object
front_glass.name = "Bus_Front_Glass"
front_glass.scale = (0.65, 1.28, 0.85)
front_glass.rotation_euler = (0, math.radians(-14), 0)
bpy.ops.object.transform_apply(scale=True, rotation=True)
front_glass.data.materials.append(mat_glass)

# 車頭 LED 路線牌 ("6670 日月潭")
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(2.85, 0, 1.68))
led_sign = bpy.context.active_object
led_sign.name = "Bus_LED_Sign"
led_sign.scale = (0.1, 1.05, 0.2)
bpy.ops.object.transform_apply(scale=True)
led_sign.data.materials.append(mat_led_sign)

# 兩側大車窗玻璃
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.1, 0, 1.3))
side_windows = bpy.context.active_object
side_windows.name = "Bus_Side_Windows"
side_windows.scale = (4.6, 1.38, 0.65)
bpy.ops.object.transform_apply(scale=True)
side_windows.data.materials.append(mat_glass)

# 車頭大燈
for side, y in [("L", 0.48), ("R", -0.48)]:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(2.88, y, 0.52))
    hl = bpy.context.active_object
    hl.name = f"Headlight_{side}"
    hl.scale = (0.08, 0.22, 0.15)
    bpy.ops.object.transform_apply(scale=True)
    hl.data.materials.append(mat_headlight)

# 車尾煞車燈
for side, y in [("L", 0.52), ("R", -0.52)]:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-2.88, y, 0.65))
    tl = bpy.context.active_object
    tl.name = f"Taillight_{side}"
    tl.scale = (0.08, 0.18, 0.35)
    bpy.ops.object.transform_apply(scale=True)
    tl.data.materials.append(mat_taillight)

# 車牌 "990-FX" (車頭與車尾)
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(2.91, 0, 0.38))
plate = bpy.context.active_object
plate.name = "Plate_Front"
plate.scale = (0.05, 0.45, 0.16)
bpy.ops.object.transform_apply(scale=True)
plate.data.materials.append(make_mat("PlateMat", (0.9, 0.9, 0.9, 1.0), roughness=0.3, emission_color=(0.9,0.9,0.9,1.0), emission_strength=1.0))

# 車輪製作 (前後左右四個輪胎)
wheel_coords = [
    ("FL", 1.85, 0.62),
    ("FR", 1.85, -0.62),
    ("RL", -1.85, 0.62),
    ("RR", -1.85, -0.62)
]

for name, x, y in wheel_coords:
    # 輪胎橡膠
    bpy.ops.mesh.primitive_cylinder_add(radius=0.42, depth=0.28, location=(x, y, 0.42))
    tire = bpy.context.active_object
    tire.name = f"Tire_{name}"
    tire.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(rotation=True)
    tire.data.materials.append(mat_rubber)

    # 鋼圈輪轂
    bpy.ops.mesh.primitive_cylinder_add(radius=0.24, depth=0.3, location=(x, y, 0.42))
    rim = bpy.context.active_object
    rim.name = f"Rim_{name}"
    rim.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(rotation=True)
    rim.data.materials.append(mat_rim)

# ==========================================
# 2. 建模：台21線公路、山體與日月潭湖景
# ==========================================
# 蜿蜒公路 (S型路面)
bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0, 0, 0.01))
road = bpy.context.active_object
road.name = "Highway_21"
road.scale = (36.0, 4.0, 1.0)
road.rotation_euler = (0, 0, math.radians(-10))
bpy.ops.object.transform_apply(scale=True, rotation=True)
road.data.materials.append(mat_asphalt)

# 道路中央分向黃線
bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0, 0, 0.02))
yellow_line = bpy.context.active_object
yellow_line.name = "Road_Center_Line"
yellow_line.scale = (36.0, 0.16, 1.0)
yellow_line.rotation_euler = (0, 0, math.radians(-10))
bpy.ops.object.transform_apply(scale=True, rotation=True)
yellow_line.data.materials.append(mat_road_line)

# 日月潭湖面 (鏡面水體)
bpy.ops.mesh.primitive_plane_add(size=1.0, location=(-6.0, -18.0, -0.6))
lake = bpy.context.active_object
lake.name = "Sun_Moon_Lake"
lake.scale = (60.0, 35.0, 1.0)
bpy.ops.object.transform_apply(scale=True)
lake.data.materials.append(mat_lake)

# 日月潭群山地貌 (背景山脈)
mountain_positions = [
    ("Mountain_1", -18, -25, 4.0, 16.0, 10.0),
    ("Mountain_2", 8, -28, 5.5, 20.0, 12.0),
    ("Mountain_3", -5, 12, 3.2, 14.0, 8.0),
    ("Mountain_4", 18, 14, 4.2, 18.0, 9.0)
]

for m_name, x, y, z, r, depth in mountain_positions:
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=r, radius2=0.0, depth=depth, location=(x, y, z))
    mnt = bpy.context.active_object
    mnt.name = m_name
    mnt.data.materials.append(mat_mountain)

# 科技感 HUD 全像掃描圓環 (圍繞公車的數位孿生指示圈)
bpy.ops.mesh.primitive_torus_add(major_radius=4.2, minor_radius=0.04, location=(0, 0, 0.05))
radar_ring = bpy.context.active_object
radar_ring.name = "Holo_Radar_Ring"
radar_ring.data.materials.append(mat_hologram_cyan)

bpy.ops.mesh.primitive_torus_add(major_radius=6.0, minor_radius=0.02, location=(0, 0, 0.05))
radar_ring2 = bpy.context.active_object
radar_ring2.name = "Holo_Radar_Ring2"
radar_ring2.data.materials.append(mat_hologram_cyan)

# ==========================================
# 3. 燈光與攝影機配置 (Cinematic Lighting)
# ==========================================
# 主日照 (晨曦/薄暮暖金陽光)
bpy.ops.object.light_add(type='SUN', location=(15, 12, 25))
sun = bpy.context.active_object
sun.name = "Sun_Light"
sun.data.energy = 3.5
sun.data.color = (1.0, 0.92, 0.82)
sun.rotation_euler = (math.radians(45), math.radians(20), math.radians(-35))

# 科技青藍色補光 (Cyber Blue Fill Light)
bpy.ops.object.light_add(type='AREA', location=(-8, -6, 8))
fill_light = bpy.context.active_object
fill_light.name = "Cyber_Fill_Light"
fill_light.data.energy = 450.0
fill_light.data.color = (0.0, 0.85, 1.0)
fill_light.data.size = 10.0
fill_light.rotation_euler = (math.radians(-50), math.radians(15), math.radians(40))

# 車頭投射光束 (Spotlights on road)
for side, y in [("L", 0.48), ("R", -0.48)]:
    bpy.ops.object.light_add(type='SPOT', location=(2.9, y, 0.55))
    spot = bpy.context.active_object
    spot.name = f"Headlight_Spot_{side}"
    spot.data.energy = 250.0
    spot.data.spot_size = math.radians(55)
    spot.data.spot_blend = 0.4
    spot.data.color = (1.0, 0.98, 0.9)
    spot.rotation_euler = (0, math.radians(82), 0)

# 電影級運鏡攝影機 (Camera)
# 擺在公車右前方 45度、俯視湖面與車輛的前進動態
bpy.ops.object.camera_add(location=(7.5, -6.8, 3.8))
cam = bpy.context.active_object
cam.name = "OCC_Cinematic_Camera"
cam.data.lens = 42 # 42mm 電影透鏡
cam.rotation_euler = (math.radians(68), 0, math.radians(48))
scene.camera = cam

# 渲染與輸出
output_dir = "/Users/chenchunchih/Documents/ChatGPT/黑客松-南投"
render_img_path = os.path.join(output_dir, "blender_6670_render.png")
blend_file_path = os.path.join(output_dir, "6670_sunmoonlake_simulation.blend")
glb_file_path = os.path.join(output_dir, "6670_sunmoonlake_bus.glb")

scene.render.filepath = render_img_path

print(f"[*] Rendering high-res 3D simulation to: {render_img_path}")
bpy.ops.render.render(write_still=True)
print("[+] Render finished successfully!")

# 儲存 .blend 檔案
print(f"[*] Saving Blender project to: {blend_file_path}")
bpy.ops.wm.save_as_mainfile(filepath=blend_file_path)

# 導出 .glb 檔案 (供 WebGL/Three.js/行控中心使用)
print(f"[*] Exporting GLB 3D model to: {glb_file_path}")
bpy.ops.export_scene.gltf(filepath=glb_file_path, export_format='GLB')

print("[+] All Blender tasks completed successfully!")
