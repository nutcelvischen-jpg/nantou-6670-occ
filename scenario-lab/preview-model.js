// Prediction illustration has its own clock; no reference to LIVE or dispatch state.
export function previewClock(state, seconds, end) {
  if (state.paused || !Number.isFinite(seconds) || seconds < 0) return {...state};
  const minute = Math.min(end, state.minute + seconds * state.speed / 60);
  return {...state, minute, paused: minute >= end};
}
// Camera-space corners [right, up, towards-camera]; fit all corners with safe margins.
export function previewFitDistance(corners, fov, aspect, padding = .82) {
  const tangent = Math.tan(fov * Math.PI / 360);
  return Math.max(1, ...corners.map(([x,y,z]) => z + Math.max(Math.abs(x)/(tangent*Math.max(.1,aspect)*padding),Math.abs(y)/(tangent*padding)))) + 2;
}
