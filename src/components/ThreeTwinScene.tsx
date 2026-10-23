import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Activity, BusFront, MapPin, RefreshCw, RotateCcw, Route as RouteIcon, Zap } from "lucide-react";
import { loadTdxRouteMap, type TdxRouteMapResponse } from "../dataClient";
import type { VehicleState } from "../simulation";

type TwinRoute = {
  name: string;
  shapes: Map<1 | -1, THREE.CatmullRomCurve3>;
  stops: Array<{ name: string; sequence: number; position: THREE.Vector3 }>;
  bounds: THREE.Box3;
  official: boolean;
};

const fallbackRoute = (): TwinRoute => {
  const stopNames = ["臺中", "高鐵臺中站", "埔里", "暨南大學", "日月潭", "向山"];
  const points = [
    [-14, 0, 4], [-11, 0, 1], [-8, 0.15, 0.5], [-5, 0.2, -0.5],
    [-2, 0.25, -2], [1, 0.35, -3], [4, 0.55, -4], [7, 0.7, -5],
    [10, 1.0, -6], [13, 1.1, -7],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const reverse = [...points].reverse();
  const bounds = new THREE.Box3().setFromPoints(points);
  return {
    name: "6670 路廊示意",
    shapes: new Map([
      [1, new THREE.CatmullRomCurve3(points)],
      [-1, new THREE.CatmullRomCurve3(reverse)],
    ]),
    stops: [0, 2, 4, 6, 8, 9].map((i, index) => ({
      name: stopNames[index],
      sequence: i + 1,
      position: points[i],
    })),
    bounds,
    official: false,
  };
};

const routeFromTdx = (data: TdxRouteMapResponse, routeName: string): TwinRoute | null => {
  const shapeFeatures = data.shapes.features.filter((feature) =>
    String(feature.properties.sub_route_name ?? "6670") === routeName,
  );
  if (!shapeFeatures.length) return null;
  const coordinates = shapeFeatures.flatMap((feature) => feature.geometry.coordinates);
  const longitudes = coordinates.map((p) => p[0]);
  const latitudes = coordinates.map((p) => p[1]);
  const minLon = Math.min(...longitudes), maxLon = Math.max(...longitudes);
  const minLat = Math.min(...latitudes), maxLat = Math.max(...latitudes);
  const centerLon = (minLon + maxLon) / 2, centerLat = (minLat + maxLat) / 2;
  // Preserve a geographic scale: one scene unit represents approximately one kilometre.
  // This keeps the GIS route proportional to the terrain instead of stretching each route
  // family to an arbitrary fixed width.
  const project = (coordinate: number[]) => new THREE.Vector3(
    (coordinate[0] - centerLon) * 111.32 * Math.cos(centerLat * Math.PI / 180),
    0,
    -(coordinate[1] - centerLat) * 111.32,
  );
  const shapes = new Map<1 | -1, THREE.CatmullRomCurve3>();
  for (const feature of shapeFeatures) {
    const direction: 1 | -1 = Number(feature.properties.direction) === 1 ? -1 : 1;
    if (shapes.has(direction)) continue;
    // Keep the measured line geometry but simplify the rendering mesh to a stable vertex budget.
    const raw = feature.geometry.coordinates;
    const stride = Math.max(1, Math.floor(raw.length / 240));
    const selected = raw.filter((_, index) => index % stride === 0);
    if (selected.length < 2 || selected[selected.length - 1] !== raw[raw.length - 1]) selected.push(raw[raw.length - 1]);
    const points = selected.map(project);
    shapes.set(direction, new THREE.CatmullRomCurve3(points, false, "centripetal", 0.35));
  }
  if (!shapes.has(-1) && shapes.has(1)) {
    const first = shapes.get(1)!;
    shapes.set(-1, new THREE.CatmullRomCurve3(first.getPoints(220).reverse(), false, "centripetal", 0.35));
  }
  const allPoints = [...shapes.values()].flatMap((curve) => curve.getPoints(160));
  const bounds = new THREE.Box3().setFromPoints(allPoints);
  const stopRows = data.stops.features
    .filter((feature) => String(feature.properties.sub_route_name ?? "6670") === routeName && Number(feature.properties.direction) === 0)
    .sort((a, b) => Number(a.properties.stop_sequence) - Number(b.properties.stop_sequence));
  const stride = Math.max(1, Math.ceil(stopRows.length / 48));
  const stops = stopRows.filter((_, i) => i % stride === 0 || i === stopRows.length - 1).map((feature) => ({
    name: String(feature.properties.stop_name ?? "公車站"),
    sequence: Number(feature.properties.stop_sequence ?? 0),
    position: project(feature.geometry.coordinates),
  }));
  return { name: routeName, shapes, stops, bounds, official: true };
};

// Deterministic procedural relief is only a visual placeholder until a licensed DEM is connected.
const latticeNoise = (x: number, z: number) => {
  const hash = (ix: number, iz: number) => {
    let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + 0x51ed270b;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 2147483647.5 - 1;
  };
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx0 = x - ix, fz0 = z - iz;
  const fx = fx0 * fx0 * (3 - 2 * fx0), fz = fz0 * fz0 * (3 - 2 * fz0);
  const a = THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), fx);
  const b = THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), fx);
  return THREE.MathUtils.lerp(a, b, fz);
};

const fractalRelief = (x: number, z: number) => {
  let value = 0, amplitude = 0.58, frequency = 1, total = 0;
  for (let octave = 0; octave < 4; octave++) {
    value += latticeNoise(x * frequency, z * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.48;
    frequency *= 2.03;
  }
  return value / total;
};

const visualRelief = (x: number, z: number) => {
  const peak = (cx: number, cz: number, rx: number, rz: number, height: number) =>
    height * Math.exp(-(((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2));
  const massif = peak(-21, -9, 13, 16, 3.2) + peak(13, 17, 19, 11, 4.1) + peak(27, -9, 10, 15, 2.4) + peak(-5, -30, 23, 10, 1.8) + peak(0, -24, 36, 10, 5.5);
  const rolling = fractalRelief(x * 0.052 + 7.3, z * 0.052 - 3.1) * 1.05;
  const detail = fractalRelief(x * 0.14 - 2.7, z * 0.14 + 5.9) * 0.22;
  const valley = 0.65 * Math.exp(-(((z - x * 0.24 + 3) / 3.4) ** 2));
  return Math.max(-0.05, massif + rolling + detail - valley) * 1.55;
};

const liftedCurve = (curve: THREE.CatmullRomCurve3, lift: number) =>
  new THREE.CatmullRomCurve3(curve.getPoints(520).map((point) => new THREE.Vector3(point.x, visualRelief(point.x, point.z) + lift, point.z)), false, "centripetal", 0.35);

function makeBus(color: number) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.16 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x7fa9ac, roughness: 0.17, metalness: 0.15, transmission: 0.12 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf3f5ef, roughness: 0.32 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x263531, roughness: 0.65 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.4, 0.43), paint);
  body.position.y = 0.43; body.castShadow = true; group.add(body);
  const lower = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.12, 0.44), dark);
  lower.position.set(0.01, 0.25, 0); group.add(lower);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.11, 0.39), white);
  roof.position.set(-0.04, 0.69, 0); roof.castShadow = true; group.add(roof);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.24, 0.36), glass);
  windshield.position.set(0.595, 0.48, 0); group.add(windshield);
  for (const side of [-1, 1]) {
    for (const x of [-0.34, -0.04, 0.27]) {
      const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.018), glass);
      windowMesh.position.set(x, 0.51, side * 0.22); group.add(windowMesh);
    }
    for (const x of [-0.39, 0.39]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.06, 18), dark);
      wheel.rotation.x = Math.PI / 2; wheel.position.set(x, 0.18, side * 0.22); group.add(wheel);
    }
  }
  const destination = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.065, 0.21), new THREE.MeshBasicMaterial({ color: 0x8ff0c3 }));
  destination.position.set(0.614, 0.7, 0); group.add(destination);
  const headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xfff0bb });
  for (const z of [-0.13, 0.13]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.045, 0.055), headlightMaterial);
    lamp.position.set(0.603, 0.31, z); group.add(lamp);
  }
  group.userData.body = body;
  group.userData.pickable = true;
  return group;
}

function addRoad(scene: THREE.Group, curve: THREE.CatmullRomCurve3, color: number, width = 0.72) {
  const raised = liftedCurve(curve, 0.1);
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const segmentCount = 520;
  for (let i = 0; i <= segmentCount; i++) {
    const t = i / segmentCount;
    const point = raised.getPointAt(t);
    const tangent = raised.getTangentAt(t).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const left = point.clone().addScaledVector(side, width / 2);
    const right = point.clone().addScaledVector(side, -width / 2);
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    uvs.push(0, t, 1, t);
    if (i < segmentCount) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
  }
  const roadGeometry = new THREE.BufferGeometry();
  roadGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  roadGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  roadGeometry.setIndex(indices); roadGeometry.computeVertexNormals();
  const road = new THREE.Mesh(roadGeometry, new THREE.MeshStandardMaterial({ color, roughness: 0.92, side: THREE.DoubleSide }));
  road.receiveShadow = true; scene.add(road);
  const lanePoints = liftedCurve(curve, 0.12).getPoints(520);
  const laneGeometry = new THREE.BufferGeometry().setFromPoints(lanePoints);
  const laneMarking = new THREE.Line(laneGeometry, new THREE.LineDashedMaterial({ color: 0xf2f1e9, dashSize: 0.16, gapSize: 0.13, transparent: true, opacity: 0.62 }));
  laneMarking.computeLineDistances(); scene.add(laneMarking);
}

export function ThreeTwinScene({
  vehicles,
  routeLengthKm,
  speedKph,
  paused,
  summary,
}: {
  vehicles: VehicleState[];
  routeLengthKm: number;
  speedKph: number;
  paused: boolean;
  summary: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<THREE.WebGLRenderer | null>(null);
  const scene = useRef<THREE.Scene | null>(null);
  const camera = useRef<THREE.PerspectiveCamera | null>(null);
  const controls = useRef<OrbitControls | null>(null);
  const busMeshes = useRef(new Map<string, THREE.Group>());
  const routeGroup = useRef<THREE.Group | null>(null);
  const vehiclesRef = useRef(vehicles);
  const routeRef = useRef<TwinRoute>(fallbackRoute());
  const selectedRef = useRef<string | null>(null);
  const motionRef = useRef({ paused, routeLengthKm, speedKph });
  const vehicleUpdateTime = useRef(performance.now());
  const [routeData, setRouteData] = useState<TdxRouteMapResponse | null>(null);
  const [routeName, setRouteName] = useState("6670");
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [routeError, setRouteError] = useState("");
  const [webglError, setWebglError] = useState("");
  vehiclesRef.current = vehicles;
  selectedRef.current = selectedVehicle;
  motionRef.current = { paused, routeLengthKm, speedKph };
  useEffect(() => { vehicleUpdateTime.current = performance.now(); }, [vehicles]);

  const routeOptions = useMemo(() => {
    if (!routeData) return ["6670"];
    return [...new Set(routeData.shapes.features.map((f) => String(f.properties.sub_route_name ?? "6670")))].sort((a, b) => a.localeCompare(b, "zh-TW", { numeric: true }));
  }, [routeData]);
  const activeRoute = useMemo(() => routeData ? routeFromTdx(routeData, routeName) : null, [routeData, routeName]);

  const fitRouteView = () => {
    const viewCamera = camera.current, orbit = controls.current;
    if (!viewCamera || !orbit) return;
    const bounds = routeRef.current.bounds;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z, 12);
    const distance = Math.max(22, span * 1.06);
    const target = new THREE.Vector3(center.x + span * 0.28, Math.max(center.y, 0.35), center.z);
    orbit.target.copy(target);
    viewCamera.position.set(target.x, target.y + distance * 0.62, target.z + distance * 0.88);
    viewCamera.lookAt(target);
    orbit.update();
  };

  const refreshOfficialRoute = async (isMounted: () => boolean = () => true) => {
    setLoading(true);
    setRouteError("");
    try {
      const payload = await loadTdxRouteMap();
      if (isMounted()) setRouteData(payload);
    } catch (error) {
      if (isMounted()) setRouteError(error instanceof Error ? error.message : "TDX 路線資料暫不可用，顯示示意場景。");
    } finally { if (isMounted()) setLoading(false); }
  };

  useEffect(() => {
    let live = true;
    void refreshOfficialRoute(() => live);
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (activeRoute) routeRef.current = activeRoute;
  }, [activeRoute]);

  useEffect(() => {
    if (!host.current) return;
    let r: THREE.WebGLRenderer;
    try {
      r = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch {
      setWebglError("此瀏覽器無法啟用 WebGL；請改用支援硬體加速的桌面瀏覽器。");
      return;
    }
    renderer.current = r;
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    r.setSize(host.current.clientWidth, host.current.clientHeight);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.02;
    host.current.appendChild(r.domElement);
    const s = new THREE.Scene(); s.background = new THREE.Color(0xf7f8f5); scene.current = s;
    const c = new THREE.PerspectiveCamera(37, host.current.clientWidth / host.current.clientHeight, 0.1, 240);
    c.position.set(0, 16.5, 22); camera.current = c;
    const orbit = new OrbitControls(c, r.domElement); orbit.enableDamping = true; orbit.dampingFactor = 0.075; orbit.target.set(0, 0, 0); orbit.maxPolarAngle = Math.PI * 0.48; orbit.minDistance = 9; orbit.maxDistance = 56; controls.current = orbit;
    s.add(new THREE.HemisphereLight(0xf8fbf5, 0x83927d, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0); sun.position.set(-12, 24, 12); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); s.add(sun);
    const fill = new THREE.DirectionalLight(0xdde8d6, 0.32); fill.position.set(14, 9, -12); s.add(fill);
    // A shaded continuous terrain sheet reads more naturally than floating hill primitives.
    const terrainGeometry = new THREE.PlaneGeometry(72, 64, 176, 152);
    const terrainPosition = terrainGeometry.attributes.position;
    const terrainColors: number[] = [];
    const lowland = new THREE.Color(0xd8dfd2), upland = new THREE.Color(0x8fa18a);
    for (let i = 0; i < terrainPosition.count; i++) {
      const x = terrainPosition.getX(i), z = -terrainPosition.getY(i), h = visualRelief(x, z);
      terrainPosition.setZ(i, h - 0.18);
      const color = lowland.clone().lerp(upland, THREE.MathUtils.clamp((h + 0.2) / 9.2, 0.04, 0.9));
      terrainColors.push(color.r, color.g, color.b);
    }
    terrainGeometry.setAttribute("color", new THREE.Float32BufferAttribute(terrainColors, 3)); terrainGeometry.computeVertexNormals();
    const ground = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0.04 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; s.add(ground);
    // Draw elevation isolines over the procedural surface so the relief reads at dashboard scale.
    const contourPositions: number[] = [];
    const contourMajorPositions: number[] = [];
    const gridX = 176, gridZ = 152;
    for (let level = 0.35; level < 7.2; level += 0.32) {
      const target = Math.abs((level / 1.6) - Math.round(level / 1.6)) < 0.07 ? contourMajorPositions : contourPositions;
      for (let iz = 0; iz < gridZ; iz++) {
        for (let ix = 0; ix < gridX; ix++) {
          const x0 = -36 + ix * 72 / gridX, x1 = -36 + (ix + 1) * 72 / gridX;
          const z0 = -32 + iz * 64 / gridZ, z1 = -32 + (iz + 1) * 64 / gridZ;
          const corners = [
            { x: x0, z: z0, h: visualRelief(x0, z0) },
            { x: x1, z: z0, h: visualRelief(x1, z0) },
            { x: x1, z: z1, h: visualRelief(x1, z1) },
            { x: x0, z: z1, h: visualRelief(x0, z1) },
          ];
          const crossings: Array<{ x: number; z: number }> = [];
          for (let edge = 0; edge < 4; edge++) {
            const a = corners[edge], b = corners[(edge + 1) % 4];
            if ((a.h < level && b.h >= level) || (b.h < level && a.h >= level)) {
              const t = (level - a.h) / (b.h - a.h);
              crossings.push({ x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t) });
            }
          }
          for (let i = 0; i + 1 < crossings.length; i += 2) {
            const a = crossings[i], b = crossings[i + 1], y = level + 0.012;
            target.push(a.x, y, a.z, b.x, y, b.z);
          }
        }
      }
    }
    const contours = new THREE.Group();
    const minorContour = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x7f8d79, transparent: true, opacity: 0.44, depthWrite: false }));
    minorContour.geometry.setAttribute("position", new THREE.Float32BufferAttribute(contourPositions, 3));
    const majorContour = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x66755f, transparent: true, opacity: 0.62, depthWrite: false }));
    majorContour.geometry.setAttribute("position", new THREE.Float32BufferAttribute(contourMajorPositions, 3));
    contours.add(minorContour, majorContour);
    contours.name = "illustrative-elevation-contours";
    s.add(contours);
    // Deterministic low-poly woodland provides terrain scale cues; it is illustrative, not a land-cover dataset.
    const treeGeometry = new THREE.ConeGeometry(0.065, 0.2, 5);
    const trees = new THREE.InstancedMesh(treeGeometry, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), 3200);
    trees.name = "illustrative-woodland";
    trees.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const treeColors = [new THREE.Color(0x8c9b80), new THREE.Color(0xa0aa91), new THREE.Color(0x748a75), new THREE.Color(0xb0b7a2)];
    const treeDummy = new THREE.Object3D();
    for (let i = 0; i < 3200; i++) {
      const seed = i * 7919 + 3571;
      const x = -34 + ((seed * 0.61803398875) % 1) * 68;
      const z = -30 + ((seed * 0.41421356237) % 1) * 60;
      if ((x - 19) ** 2 / 24 + (z + 11) ** 2 / 9 < 1) continue;
      const h = visualRelief(x, z);
      treeDummy.position.set(x, h + 0.12, z);
      const scale = 0.7 + ((seed * 0.137) % 1) * Math.min(1.2, 0.82 + h * 0.06);
      treeDummy.scale.setScalar(scale);
      treeDummy.rotation.y = (seed % 628) / 100;
      treeDummy.updateMatrix();
      trees.setMatrixAt(i, treeDummy.matrix);
      trees.setColorAt(i, treeColors[seed % treeColors.length]);
    }
    trees.instanceMatrix.needsUpdate = true;
    s.add(trees);
    const grid = new THREE.GridHelper(64, 64, 0xc4c9bd, 0xd7dbd1); grid.position.y = -0.12; grid.material.transparent = true; grid.material.opacity = 0.32; s.add(grid);
    const lake = new THREE.Mesh(new THREE.CircleGeometry(4.1, 48), new THREE.MeshPhysicalMaterial({ color: 0xb7cbd0, roughness: 0.42, metalness: 0.02, transparent: true, opacity: 0.92 }));
    lake.rotation.x = -Math.PI / 2; lake.scale.set(1.05, 0.64, 1); lake.position.set(19, visualRelief(19, -11) + 0.03, -11); s.add(lake);
    const routeLayer = new THREE.Group(); routeLayer.name = "official-route-layer"; s.add(routeLayer); routeGroup.current = routeLayer;
    const buildings = new THREE.Group(); buildings.name = "settlement-context"; s.add(buildings);
    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    const click = (event: PointerEvent) => {
      const rect = r.domElement.getBoundingClientRect(); pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, c);
      const hits = raycaster.intersectObjects([...busMeshes.current.values()], true);
      const hit = hits.find((item) => item.object.parent?.userData.pickable || item.object.parent?.parent?.userData.pickable);
      const bus = hit?.object.parent?.userData.pickable ? hit.object.parent : hit?.object.parent?.parent;
      if (bus?.userData.vehicleId) setSelectedVehicle(String(bus.userData.vehicleId));
    };
    r.domElement.addEventListener("pointerdown", click);
    r.setAnimationLoop(() => {
      orbit.update();
      const currentRoute = routeRef.current;
      const active = new Set(vehiclesRef.current.map((v) => v.id));
      for (const [id, mesh] of busMeshes.current) if (!active.has(id)) { s.remove(mesh); busMeshes.current.delete(id); }
      vehiclesRef.current.forEach((vehicle) => {
        let mesh = busMeshes.current.get(vehicle.id);
        if (!mesh) { mesh = makeBus(vehicle.electric ? 0x527bd2 : 0xd88f54); mesh.userData.vehicleId = vehicle.id; busMeshes.current.set(vehicle.id, mesh); s.add(mesh); }
        // Inactive fleet units are standby, not moving vehicles. Keep their stable
        // meshes available for later activation, but remove them from the live scene
        // and ray picking until the model marks them active.
        mesh.visible = vehicle.active;
        if (!vehicle.active) return;
        const routeCurve = currentRoute.shapes.get(vehicle.direction) ?? currentRoute.shapes.get(1)!;
        const motion = motionRef.current;
        const interpolatedSeconds = Math.min(0.45, Math.max(0, (performance.now() - vehicleUpdateTime.current) / 1000));
        const projectedAdvance = motion.paused ? 0 : Math.min(0.0045, ((motion.speedKph / 3600) * interpolatedSeconds) / Math.max(motion.routeLengthKm, 1));
        const routeProgress = vehicle.direction === 1 ? vehicle.progress : 1 - vehicle.progress;
        const p = THREE.MathUtils.clamp(routeProgress + projectedAdvance, 0, 1);
        const position = routeCurve.getPointAt(p);
        const tangent = routeCurve.getTangentAt(p);
        mesh.position.set(position.x, visualRelief(position.x, position.z), position.z);
        mesh.rotation.y = Math.atan2(tangent.x, tangent.z) + Math.PI / 2;
        mesh.userData.vehicleId = vehicle.id;
        const body = mesh.userData.body as THREE.Mesh;
        const material = body.material as THREE.MeshStandardMaterial;
        material.emissive.set(vehicle.electric ? 0x172d60 : 0x573116);
        material.emissiveIntensity = 0.1 + (vehicle.occupancy / vehicle.capacity) * 0.3;
        mesh.scale.setScalar(selectedRef.current === vehicle.id ? 1.16 : 1);
      });
      r.render(s, c);
    });
    const resize = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect; if (!box?.width || !box?.height) return;
      c.aspect = box.width / box.height; c.updateProjectionMatrix(); r.setSize(box.width, box.height);
    }); resize.observe(host.current);
    return () => {
      resize.disconnect(); r.domElement.removeEventListener("pointerdown", click); r.setAnimationLoop(null); orbit.dispose();
      s.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const material = object.material; if (Array.isArray(material)) material.forEach((m) => m.dispose()); else material.dispose(); } });
      r.dispose(); if (host.current?.contains(r.domElement)) host.current.removeChild(r.domElement);
      renderer.current = null; scene.current = null; busMeshes.current.clear(); routeGroup.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = routeGroup.current;
    if (!layer) return;
    while (layer.children.length) {
      const child = layer.children[0];
      layer.remove(child);
      child.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const material = object.material; if (Array.isArray(material)) material.forEach((m) => m.dispose()); else material.dispose(); } });
    }
    const active = activeRoute ?? fallbackRoute();
    routeRef.current = active;
    const curves = [...active.shapes.entries()];
    curves.forEach(([direction, curve]) => {
      addRoad(layer, curve, direction === 1 ? 0x858b87 : 0xa1a49c, 0.72);
      const routeLine = new THREE.Mesh(new THREE.TubeGeometry(liftedCurve(curve, 0.19), 520, 0.055, 7, false), new THREE.MeshStandardMaterial({ color: direction === 1 ? 0x527bd2 : 0xe48a47, emissive: direction === 1 ? 0x202f64 : 0x522b12, emissiveIntensity: 0.12 }));
      layer.add(routeLine);
    });
    // Deterministic instanced town blocks cluster around three positions on the active corridor.
    const primary = active.shapes.get(1) ?? curves[0]?.[1];
    if (primary) {
      const centers = [0.16, 0.5, 0.84].map((t) => primary.getPointAt(t));
      const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
      const blockMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0.02 });
      const blocks = new THREE.InstancedMesh(blockGeometry, blockMaterial, centers.length * 22);
      blocks.name = "procedural-town-blocks";
      blocks.castShadow = true; blocks.receiveShadow = true;
      const dummy = new THREE.Object3D();
      const palette = [new THREE.Color(0xc5c9bb), new THREE.Color(0xd2d4c9), new THREE.Color(0xb8c3c0), new THREE.Color(0xc7cdb6)];
      let index = 0;
      centers.forEach((center, townIndex) => {
        for (let i = 0; i < 22; i++) {
          const seed = (townIndex + 1) * 977 + i * 131;
          const angle = ((seed * 0.61803398875) % 1) * Math.PI * 2;
          const radius = 1.0 + ((seed * 0.113) % 1) * 3.2;
          const x = center.x + Math.cos(angle) * radius;
          const z = center.z + Math.sin(angle) * radius;
          const width = 0.24 + ((seed * 0.071) % 1) * 0.48;
          const depth = 0.24 + ((seed * 0.097) % 1) * 0.42;
          const height = 0.32 + ((seed * 0.137) % 1) * (i % 5 === 0 ? 1.15 : 0.72);
          dummy.position.set(x, visualRelief(x, z) - 0.08 + height / 2, z);
          dummy.rotation.set(0, (seed % 7) * 0.11, 0);
          dummy.scale.set(width, height, depth);
          dummy.updateMatrix(); blocks.setMatrixAt(index, dummy.matrix);
          blocks.setColorAt(index, palette[(seed >>> 2) % palette.length]);
          index++;
        }
      });
      layer.add(blocks);
    }
    let lastLabelPosition: THREE.Vector3 | null = null;
    const labelStride = Math.max(1, Math.ceil(active.stops.length / 6));
    active.stops.forEach((stop, index) => {
      const height = visualRelief(stop.position.x, stop.position.z);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.18, 8), new THREE.MeshStandardMaterial({ color: 0xe8f2ed })); stem.position.set(stop.position.x, height + 0.13, stop.position.z); layer.add(stem);
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), new THREE.MeshStandardMaterial({ color: index === 0 || index === active.stops.length - 1 ? 0xe29b45 : 0xeffaf2, emissive: 0x397c69, emissiveIntensity: 0.24 })); marker.position.set(stop.position.x, height + 0.27, stop.position.z); layer.add(marker);
      const labelCandidate = index === 0 || index === active.stops.length - 1 || index % labelStride === 0;
      const labelHasRoom = !lastLabelPosition || lastLabelPosition.distanceTo(stop.position) >= 3.6;
      if (labelCandidate && labelHasRoom) {
        const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 96;
        const ctx = canvas.getContext("2d"); if (ctx) { ctx.fillStyle = "rgba(255,255,255,.96)"; ctx.roundRect(0, 8, 512, 80, 20); ctx.fill(); ctx.strokeStyle = "rgba(213,219,207,.95)"; ctx.lineWidth = 3; ctx.roundRect(0, 8, 512, 80, 20); ctx.stroke(); ctx.fillStyle = "#45564b"; ctx.font = "bold 35px system-ui"; ctx.fillText(stop.name.slice(0, 16), 20, 62); }
        const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })); label.scale.set(2.3, 0.44, 1); label.position.set(stop.position.x, height + 0.82, stop.position.z); layer.add(label);
        lastLabelPosition = stop.position;
      }
    });
    fitRouteView();
  }, [activeRoute]);

  const picked = vehicles.find((vehicle) => vehicle.id === selectedVehicle) ?? vehicles[0] ?? null;
  const resetCamera = fitRouteView;
  const selectRoute = (value: string) => setRouteName(value);
  return (
      <div className="three-scene-wrap twin-world">
      <div ref={host} className="three-scene" aria-label="採用 TDX 官方線形的公車 3D 數位孿生" />
      {webglError && <div className="webgl-fallback">{webglError}</div>}
      <div className="twin-world-top">
        <div className="world-source-chip"><span className={routeData ? "source-dot official" : "source-dot"} />{routeData ? "TDX 官方路線幾何" : "示意場景"}<small>{loading ? "載入資料中" : routeError ? "TDX 暫不可用" : routeData?.cache_status === "stale" ? `官方快照 ${routeData.retrieved_at.slice(0, 10)} · 非即時` : routeData ? `TDX 靜態資料 ${routeData.retrieved_at.slice(0, 10)} · 非即時` : "合成模擬"}</small></div>
        <label className="world-route-select"><RouteIcon size={14} /><select aria-label="選擇 6670 子路線" value={routeName} onChange={(event) => selectRoute(event.target.value)}>{routeOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select><span>子路線</span></label>
        <button className="world-icon-button" onClick={() => void refreshOfficialRoute()} disabled={loading} aria-label="重新載入官方路線資料" title="重新載入官方路線資料"><RefreshCw size={14} /></button>
        <button className="world-icon-button" onClick={resetCamera} aria-label="重設 3D 視角" title="重設 3D 視角"><RotateCcw size={15} /></button>
      </div>
      {routeError && <div className="world-error">TDX 路線暫不可用，現在顯示示意路線。{routeError}</div>}
      <div className="world-route-label"><span>TAICHUNG</span><i /><b>{routeName}</b><i /><span>SUN MOON LAKE</span></div>
      <aside className="world-vehicle-card">
        {summary}
        <div className="world-card-heading"><div><span>車隊模擬狀態</span><b>{vehicles.filter((v) => v.active).length}<small> / {vehicles.length} 輛營運中</small></b></div><Activity size={15} /></div>
        <div className="world-bus-list">{vehicles.slice(0, 8).map((vehicle) => <button key={vehicle.id} className={`world-bus-row${picked?.id === vehicle.id ? " selected" : ""}${vehicle.active ? "" : " standby"}`} aria-label={`${vehicle.id.replace("bus-", "NT-")}，${vehicle.active ? "營運中" : "待命"}`} onClick={() => setSelectedVehicle(vehicle.id)}><span className={vehicle.electric ? "bus-type electric" : "bus-type diesel"}><BusFront size={14} /></span><span className="bus-id"><b>{vehicle.id.replace("bus-", "NT-")}</b><small>{vehicle.active ? (vehicle.direction === 1 ? "營運中 · 往日月潭" : "營運中 · 往臺中") : "待命"} · {vehicle.electric ? "電動低地板" : "柴油低底盤"}</small></span><span className="bus-load"><i><em style={{ width: `${Math.min(100, vehicle.occupancy / vehicle.capacity * 100)}%` }} /></i><small>{Math.round(vehicle.occupancy / vehicle.capacity * 100)}%</small></span></button>)}</div>
        {picked ? <div className="world-selected-bus"><div className="selected-bus-title"><span><BusFront size={15} /> 車輛詳情</span><b>{picked.active ? "營運中" : "待命"} · {picked.id.replace("bus-", "NT-")}</b></div><div className="selected-bus-stats"><span><small>載客</small><b>{picked.occupancy}<i> / {picked.capacity} 人</i></b></span><span><small>行駛方向</small><b>{picked.active ? (picked.direction === 1 ? "臺中 → 日月潭" : "日月潭 → 臺中") : "—"}</b></span><span><small>能源型式</small><b>{picked.electric ? <><Zap size={12} /> 電動巴士</> : "柴油巴士"}</b></span><span><small>本次車公里</small><b>{picked.vehicleKm.toFixed(1)} km</b></span></div>{picked.active ? <div className="selected-progress"><span>路線進度</span><i><em style={{ width: `${Math.round(picked.progress * 100)}%` }} /></i><b>{Math.round(picked.progress * 100)}%</b></div> : <div className="selected-progress"><span>待命中 · 未顯示於行駛路線</span></div>}</div> : <div className="world-empty">尚未配置營運車輛</div>}
      </aside>
      <div className="world-scene-footer"><span><MapPin size={12} /> {activeRoute?.stops.length ?? 0} 個代表站點</span><span><i className="route-legend official-line" /> 官方線形</span><span><i className="route-legend bus-dot" /> 模擬車輛位置</span><button onClick={() => setSelectedVehicle(picked ? null : (vehicles[0]?.id ?? null))}>點選場景中的巴士查看車況</button></div>
      <div className="scene-stamp"><span className="scene-live-dot" />{routeData ? "OFFICIAL ROUTE · SIMULATED VEHICLES" : "SIMULATION · NOT LIVE GPS"}</div>
    </div>
  );
}
