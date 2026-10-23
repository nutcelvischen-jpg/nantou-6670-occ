"""司機排班精確解（CP-SAT）：每班一位司機；司機在端點接下一班（同端點、間隔 >= 折返）。
規則與網頁一致：值勤（首班發車→末班到站）<= SPAN 時、駕駛合計 <= DRIVE 時、連續駕駛 <= CONT 時（中間休息 >= REST 分才重置）。
目標：最少司機。用法：python3 crew_cpsat.py trips.json"""
import json, sys
from ortools.sat.python import cp_model
SPAN, DRIVE, CONT, REST, TURN = 12*60, 10*60, 4*60, 30, 10
T = [tuple(x) for x in json.load(open(sys.argv[1]))]
n = len(T); dur = [int(round(a - d)) for d, a, _, _ in T]; dep = [int(round(d)) for d, *_ in T]; arr = [int(round(a)) for _, a, *_ in T]
m = cp_model.CpModel()
arcs = {}
for i in range(n):
    for j in range(n):
        if i != j and T[i][3] == T[j][2] and dep[j] >= arr[i] + TURN and arr[j] - dep[i] <= SPAN:
            arcs[(i, j)] = m.NewBoolVar(f'x{i}_{j}')
start = [m.NewBoolVar(f's{i}') for i in range(n)]
end = [m.NewBoolVar(f'e{i}') for i in range(n)]
for j in range(n): m.AddExactlyOne([start[j]] + [v for (i, k), v in arcs.items() if k == j])
for i in range(n): m.AddExactlyOne([end[i]] + [v for (k, j), v in arcs.items() if k == i])
S = [m.NewIntVar(0, 2000, f'S{i}') for i in range(n)]       # 值勤開始（首班發車）
D = [m.NewIntVar(0, DRIVE, f'D{i}') for i in range(n)]      # 累計駕駛
C = [m.NewIntVar(0, CONT, f'C{i}') for i in range(n)]       # 連續駕駛
for i in range(n):
    m.Add(S[i] == dep[i]).OnlyEnforceIf(start[i]); m.Add(D[i] == dur[i]).OnlyEnforceIf(start[i]); m.Add(C[i] == dur[i]).OnlyEnforceIf(start[i])
    m.Add(arr[i] - S[i] <= SPAN)
for (i, j), x in arcs.items():
    m.Add(S[j] == S[i]).OnlyEnforceIf(x); m.Add(D[j] == D[i] + dur[j]).OnlyEnforceIf(x)
    if dep[j] - arr[i] >= REST: m.Add(C[j] == dur[j]).OnlyEnforceIf(x)
    else: m.Add(C[j] == C[i] + dur[j]).OnlyEnforceIf(x)
m.Minimize(sum(start))
s = cp_model.CpSolver(); s.parameters.max_time_in_seconds = 120; s.parameters.num_workers = 8
r = s.Solve(m)
print(sys.argv[1], 'trips', n, 'arcs', len(arcs), s.StatusName(r), 'drivers', int(s.ObjectiveValue()), 'bound', int(s.BestObjectiveBound()), 'time', round(s.WallTime(), 1))
