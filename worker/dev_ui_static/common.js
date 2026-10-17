// Tiện ích dùng chung cho index.html và sensor.html. Mọi chuỗi từ người dùng hoặc
// backend đi qua esc() trước khi vào innerHTML.
const $ = (s, root = document) => root.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (v, d = 2) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : Number(v).toFixed(d).replace(".", ","));

async function api(url, opts = {}) {
  const res = await fetch(url, opts);
  let body = {};
  try { body = await res.json(); } catch { /* không phải JSON */ }
  if (!res.ok) throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { status: res.status, body });
  return body;
}

const ODD_LABELS = {
  highway: "Cao tốc", urban_straight: "Đường đô thị", intersection: "Giao lộ",
  clear: "Trời quang", rain: "Mưa", heavy_rain: "Mưa to", fog: "Sương mù",
  motorcycle: "Xe máy", car: "Ô tô", truck: "Xe tải", pedestrian: "Người đi bộ",
  cut_in: "Tạt đầu", sudden_brake: "Phanh gấp", lane_drift: "Lấn làn", stop_in_lane: "Dừng giữa làn",
  wrong_way: "Ngược chiều", run_red_light: "Vượt đèn đỏ", jaywalk: "Băng qua đường",
  day: "Ban ngày", dusk: "Chạng vạng", night: "Ban đêm",
};
const oddLabel = (v) => ODD_LABELS[v] || v;

function oddChips(odd = {}, tod) {
  const vals = [odd.road_type, odd.weather, odd.actor_type, odd.maneuver, tod].filter(Boolean);
  return vals.map((v) => `<span class="chip">${esc(oddLabel(v))}</span>`).join("");
}

// Thanh 4 bước. `done` là số bước đã xong, `active` là bước đang ở.
function renderSteps(el, active, done, runId) {
  const steps = [
    ["Mô tả kịch bản", "Câu tiếng Việt", "/"],
    ["Kịch bản .xosc", "Sinh & kiểm tra", "/#scenarios"],
    ["Chạy CARLA", "ScenarioRunner + sensor", runId ? `/?run=${encodeURIComponent(runId)}#result` : "/#result"],
    ["Dữ liệu sensor", "Radar, IMU, camera", runId ? `/sensor?run=${encodeURIComponent(runId)}` : null],
  ];
  el.innerHTML = steps
    .map(([t, s, href], i) => {
      const cls = [i + 1 === active ? "active" : "", i + 1 <= done ? "done" : ""].join(" ");
      const inner = `<span class="faint">Bước ${i + 1}</span><b>${t}</b><span>${s}</span>`;
      return `<li class="${cls}">${href ? `<a href="${href}">${inner}</a>` : inner}</li>`;
    })
    .join("");
}

async function renderStatus(el) {
  try {
    const s = await api("/api/status");
    el.innerHTML =
      `<span><span class="dot ${s.carla ? "on" : "off"}"></span>CARLA ${esc(s.host)}:${esc(s.port)}${s.carla ? "" : " — chưa bật"}</span>` +
      `<span><span class="dot ${s.backend_ok ? "on" : "off"}"></span>Backend ${s.backend_ok ? "" : "chưa bật"}</span>` +
      (s.busy ? `<span><span class="dot busy"></span>Đang chạy một kịch bản</span>` : "");
    return s;
  } catch {
    el.textContent = "Không gọi được /api/status";
    return null;
  }
}
