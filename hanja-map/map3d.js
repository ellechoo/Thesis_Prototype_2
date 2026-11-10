// 3D map of the words, drawn with three.js (lib/three.min.js, MIT License).
//
// Layout: Chinese, Japanese, and Vietnamese sit at the corners of a triangle on the ground. Each group of
// words is a cloud (a sphere whose volume is in proportion to its word count) placed over the languages that
// share it, at a height set by how many of them share it: "Not shared" at the bottom, "All three" at the top.
//
// createMap3D(wrap, opts) returns null when WebGL isn't available, so the page can fall back to the flat map.
// opts: words (array), catOf(i), groups (list of categories), groupName(cat), countOf(cat), langName(c),
//       labelOf(i) → [main, sub], look(i) → 0 hidden-ish, 1 normal, 2 highlighted, pickable(i),
//       onHover(i, x, y), onSelect(i), onOpen(i), onGroup(cat)

function createMap3D(wrap, opts) {
  if (!window.THREE) return null;
  let renderer;
  try {
    const test = document.createElement("canvas");
    if (!(test.getContext("webgl2") || test.getContext("webgl"))) return null;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch (e) { return null; }

  const N = opts.words.length;
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Layout ----------
  const R = 72, H = 40, S = 1.0;   // triangle radius, height per shared language, cloud scale
  const ANGLE = { z: -Math.PI / 2, j: Math.PI / 6, v: (5 * Math.PI) / 6 };
  const corner = c => new THREE.Vector3(Math.cos(ANGLE[c]) * R, 0, Math.sin(ANGLE[c]) * R);
  const GROUND = -32;
  const groups = {};
  opts.groups.forEach(cat => {
    const langs = Array.from(cat);
    const c = new THREE.Vector3();
    langs.forEach(l => c.add(corner(l)));
    if (langs.length) c.divideScalar(langs.length);
    c.y = langs.length * H;
    groups[cat] = { center: c, r: S * Math.cbrt(Math.max(1, opts.countOf(cat))) };
  });

  // Seeded random spot inside each word's cloud, so positions are the same every visit
  let seed = 11;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const g = groups[opts.catOf(i)];
    let x, y, z;
    do { x = rand() * 2 - 1; y = rand() * 2 - 1; z = rand() * 2 - 1; } while (x * x + y * y + z * z > 1);
    pos[i * 3] = g.center.x + x * g.r;
    pos[i * 3 + 1] = g.center.y + y * g.r;
    pos[i * 3 + 2] = g.center.z + z * g.r;
  }

  // ---------- Scene ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.className = "map3d-canvas";
  renderer.domElement.setAttribute("aria-label", "3D map of Korean words grouped by which languages share them. Drag to rotate, scroll or pinch to zoom.");
  renderer.domElement.setAttribute("role", "img");
  wrap.appendChild(renderer.domElement);

  // Round dots: a small circle texture
  const dotTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
    const t = new THREE.CanvasTexture(c); return t;
  })();
  const ringTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"); g.strokeStyle = "#fff"; g.lineWidth = 7; g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.stroke();
    return new THREE.CanvasTexture(c);
  })();

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const colors = new Float32Array(N * 3);
  geom.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  const sizes = new Float32Array(N);
  geom.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  const DOT = 0.62;
  // Round dots that grow as you get closer, up to a limit
  const pointMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 }, uMax: { value: 14 } },
    vertexShader: `
      attribute vec3 aColor; attribute float aSize; uniform float uScale; uniform float uMax; varying vec3 vColor;
      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(aSize * uScale / -mv.z, uMax);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        if (dot(c, c) > 0.25) discard;
        gl_FragColor = vec4(vColor, 1.0);
      }`
  });
  const points = new THREE.Points(geom, pointMat);
  scene.add(points);

  const selGeom = new THREE.BufferGeometry();
  selGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
  const selMarker = new THREE.Points(selGeom, new THREE.PointsMaterial({ size: DOT * 4, color: 0x000000, map: ringTex, alphaTest: 0.5, sizeAttenuation: true }));
  selMarker.visible = false;
  scene.add(selMarker);

  // Guides: the triangle of languages on the ground, and a line from each cloud down to it
  const lineMat = new THREE.LineBasicMaterial({ color: 0xbbbbbb });
  const tri = ["z", "j", "v"].map(c => corner(c).setY(GROUND));
  scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(tri), new THREE.LineBasicMaterial({ color: 0x888888 })));
  Object.values(groups).forEach(g => {
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(g.center.x, g.center.y - g.r, g.center.z), new THREE.Vector3(g.center.x, GROUND, g.center.z)]), lineMat));
  });

  // ---------- Overlay: labels for groups, languages, and nearby words ----------
  const overlay = document.createElement("div");
  overlay.className = "map3d-overlay";
  wrap.appendChild(overlay);

  const groupLabels = opts.groups.map(cat => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "map3d-group";
    b.innerHTML = "";
    b.append(opts.groupName(cat));
    const n = document.createElement("span");
    n.textContent = opts.countOf(cat).toLocaleString() + " words";
    b.appendChild(n);
    b.title = "View " + opts.groupName(cat) + " by itself";
    b.addEventListener("click", () => opts.onGroup(cat));
    overlay.appendChild(b);
    return { cat, el: b, at: new THREE.Vector3(groups[cat].center.x, groups[cat].center.y - groups[cat].r - 1.5, groups[cat].center.z) };
  });
  const langLabels = ["z", "j", "v"].map(c => {
    const d = document.createElement("div");
    d.className = "map3d-lang";
    d.textContent = opts.langName(c);
    overlay.appendChild(d);
    return { el: d, at: corner(c).multiplyScalar(1.12).setY(GROUND) };
  });
  const groundLabel = document.createElement("div");
  groundLabel.className = "map3d-lang map3d-note";
  groundLabel.textContent = "Higher = shared by more languages";
  overlay.appendChild(groundLabel);
  const groundAt = new THREE.Vector3(0, GROUND, R * 0.62);

  const wordLayer = document.createElement("div");
  wordLayer.className = "map3d-words";
  overlay.appendChild(wordLayer);
  const wordPool = [];

  // ---------- Camera and controls ----------
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !reduceMotion;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.minDistance = 2.5;
  controls.maxDistance = 700;
  controls.zoomSpeed = 1.1;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.35;

  const HOME_TARGET = new THREE.Vector3(0, (GROUND + 3 * H + groups.zjv.r) / 2 - 10, 0);
  // Seen from the front, turned a little so no cloud hides directly behind another, and from above so the triangle reads
  const HOME_DIR = new THREE.Vector3(Math.sin(0.6), 0.62, Math.cos(0.6)).normalize();
  function homeDistance() {
    const radius = Math.max(R * 1.3, (3 * H + groups.zjv.r - GROUND) / 2) + 14;
    const half = (camera.fov * Math.PI) / 360;
    const halfH = Math.atan(Math.tan(half) * Math.min(1, camera.aspect));   // the narrower of the two directions
    return radius / Math.sin(halfH);
  }
  function home(ms) {
    const target = HOME_TARGET.clone();
    const toPos = target.clone().add(HOME_DIR.clone().multiplyScalar(homeDistance()));
    if (reduceMotion || !ms) { camera.position.copy(toPos); controls.target.copy(target); needs = true; return; }
    anim = { t0: performance.now(), ms, fromPos: camera.position.clone(), toPos, fromT: controls.target.clone(), toT: target };
  }

  let anim = null, needs = true;
  function flyTo(target, distance, ms = 800) {
    controls.autoRotate = false;
    const dir = camera.position.clone().sub(controls.target).normalize();
    const toPos = target.clone().add(dir.multiplyScalar(distance));
    if (reduceMotion || ms === 0) {
      camera.position.copy(toPos); controls.target.copy(target); needs = true; return;
    }
    anim = { t0: performance.now(), ms, fromPos: camera.position.clone(), toPos, fromT: controls.target.clone(), toT: target.clone() };
  }
  function stepAnim(now) {
    const k = Math.min(1, (now - anim.t0) / anim.ms);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(anim.fromPos, anim.toPos, e);
    controls.target.lerpVectors(anim.fromT, anim.toT, e);
    if (k >= 1) anim = null;
  }

  // ---------- Projection of every word to the screen, for picking and labels ----------
  let W = 1, Hpx = 1;
  const sx = new Float32Array(N), sy = new Float32Array(N), depth = new Float32Array(N);
  let projected = false;
  const m = new THREE.Matrix4();
  function project() {
    if (projected) return;
    camera.updateMatrixWorld();
    m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const e = m.elements;
    for (let i = 0; i < N; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const w = e[3] * x + e[7] * y + e[11] * z + e[15];
      if (w <= 0.1) { depth[i] = -1; continue; }
      const cx = (e[0] * x + e[4] * y + e[8] * z + e[12]) / w;
      const cy = (e[1] * x + e[5] * y + e[9] * z + e[13]) / w;
      sx[i] = (cx + 1) / 2 * W;
      sy[i] = (1 - cy) / 2 * Hpx;
      depth[i] = (cx < -1.05 || cx > 1.05 || cy < -1.05 || cy > 1.05) ? -1 : w;
    }
    projected = true;
  }
  const pxPerUnit = d => (Hpx / 2) / Math.tan((camera.fov * Math.PI) / 360) / d;

  function pick(x, y) {
    project();
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < N; i++) {
      const d = depth[i];
      if (d < 0 || !opts.pickable(i)) continue;
      const dx = sx[i] - x, dy = sy[i] - y;
      const r = Math.max(7, Math.min(10, DOT * pxPerUnit(d) * 0.6) + 3);
      const dist2 = dx * dx + dy * dy;
      if (dist2 > r * r) continue;
      const score = Math.sqrt(dist2) + d * 0.02;   // nearer to the pointer, then nearer to the camera
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  // ---------- Look: colors from the page's state ----------
  const SHADE = [[0.9, 0.9, 0.9], [0.4, 0.4, 0.4], [0.03, 0.03, 0.03]];
  const SIZE = [DOT * 0.55, DOT, DOT * 1.15];
  let selected = -1;
  function recolor() {
    for (let i = 0; i < N; i++) {
      const k = opts.look(i), c = SHADE[k];
      colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
      sizes[i] = SIZE[k];
    }
    geom.attributes.aColor.needsUpdate = true;
    geom.attributes.aSize.needsUpdate = true;
    needs = true;
  }

  // ---------- Labels ----------
  let labelTimer = 0;
  function placeLabels() {
    project();
    const place = (el, v) => {
      const p = v.clone().project(camera);
      const vis = p.z < 1 && p.x > -1.1 && p.x < 1.1 && p.y > -1.1 && p.y < 1.1;
      el.style.display = vis ? "" : "none";
      if (vis) el.style.transform = `translate(${(p.x + 1) / 2 * W}px, ${(1 - p.y) / 2 * Hpx}px) translate(-50%, 0)`;
      return vis;
    };
    const camDist = camera.position.distanceTo(controls.target);
    const boxes = [];
    groupLabels
      .map(g => ({ g, d: camera.position.distanceTo(g.at) }))
      .sort((a, b) => a.d - b.d)   // nearer labels win
      .forEach(({ g }) => {
        const vis = place(g.el, g.at);
        g.el.setAttribute("aria-pressed", String(opts.currentGroup() === g.cat));
        if (!vis) return;
        const p = g.at.clone().project(camera);
        const x = (p.x + 1) / 2 * W, y = (1 - p.y) / 2 * Hpx;
        const w = g.el.offsetWidth || 120, h = g.el.offsetHeight || 30;
        const box = [x - w / 2, y, x + w / 2, y + h];
        const hit = boxes.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
        const inside = camDist < groups[g.cat].r * 1.4 && controls.target.distanceTo(groups[g.cat].center) < groups[g.cat].r;
        g.el.style.opacity = hit ? "0" : inside ? "0.25" : "";
        g.el.style.pointerEvents = hit ? "none" : "";
        if (!hit) boxes.push(box);
      });
    langLabels.forEach(l => place(l.el, l.at));
    place(groundLabel, groundAt);

    // Words: the nearest ones get a readable label once you're close enough to read them
    const cand = [];
    for (let i = 0; i < N; i++) {
      const d = depth[i];
      if (d < 0 || d > 34 || !opts.pickable(i)) continue;
      cand.push(i);
    }
    cand.sort((a, b) => depth[a] - depth[b]);
    if (selected >= 0 && depth[selected] > 0) cand.unshift(selected);
    const taken = new Set();
    const cell = (x, y) => Math.floor(x / 90) + "," + Math.floor(y / 22);
    const chosen = [];
    for (const i of cand) {
      if (chosen.length >= 70) break;
      if (chosen.includes(i)) continue;
      const k = cell(sx[i], sy[i]);
      if (i !== selected && (taken.has(k) || taken.has(cell(sx[i] + 45, sy[i])))) continue;
      taken.add(k); taken.add(cell(sx[i] + 45, sy[i]));
      chosen.push(i);
    }
    const keep = new Map();
    wordPool.forEach(el => { if (el.style.display !== "none" && chosen.includes(Number(el.dataset.i))) keep.set(Number(el.dataset.i), el); });
    const free = wordPool.filter(el => !keep.has(Number(el.dataset.i)) || el.style.display === "none");
    let used = 0;
    for (const i of chosen) {
      let el = keep.get(i) || free.shift();
      used++;
      if (!el) {
        el = document.createElement("button");
        el.type = "button";
        el.className = "map3d-word";
        el.tabIndex = -1;
        el.addEventListener("click", () => opts.onSelect(Number(el.dataset.i)));
        el.addEventListener("dblclick", () => opts.onOpen(Number(el.dataset.i)));
        el.addEventListener("mouseenter", () => opts.onHover(Number(el.dataset.i), sx[Number(el.dataset.i)], sy[Number(el.dataset.i)]));
        el.addEventListener("mouseleave", () => opts.onHover(-1));
        el.addEventListener("wheel", e => { renderer.domElement.dispatchEvent(new WheelEvent("wheel", e)); e.preventDefault(); }, { passive: false });
        wordLayer.appendChild(el);
        wordPool.push(el);
      }
      if (el.dataset.i !== String(i)) {
        const [main, sub] = opts.labelOf(i);
        el.dataset.i = i;
        el.innerHTML = "";
        el.append(main);
        if (sub) { const s = document.createElement("small"); s.textContent = sub; el.appendChild(s); }
      }
      const scale = Math.max(0.75, Math.min(1.25, 14 / depth[i]));
      el.style.display = "";
      el.style.fontSize = (13 * scale).toFixed(1) + "px";
      el.style.opacity = Math.max(0.35, Math.min(1, 30 / depth[i] - 0.1)).toFixed(2);
      el.classList.toggle("is-selected", i === selected);
      el.classList.toggle("is-strong", opts.look(i) === 2);
      el.style.transform = `translate(${sx[i] + 7}px, ${sy[i] - 9}px)`;
      el.dataset.live = "1";
    }
    wordPool.forEach(el => { if (!chosen.includes(Number(el.dataset.i))) { el.style.display = "none"; } });
  }

  // ---------- Render loop: draws only when something changed ----------
  let lastLabels = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (anim) stepAnim(now);
    const moved = controls.update();
    if (moved || needs || anim) {
      renderer.render(scene, camera);
      needs = false;
      projected = false;
      if (now - lastLabels > 90) { lastLabels = now; placeLabels(); }
      else { clearTimeout(labelTimer); labelTimer = setTimeout(placeLabels, 100); }
    }
  }

  function resize() {
    W = wrap.clientWidth; Hpx = wrap.clientHeight;
    if (!W || !Hpx) return;
    renderer.setSize(W, Hpx);
    const dpr = renderer.getPixelRatio();
    pointMat.uniforms.uScale.value = (Hpx * dpr) / 2;
    pointMat.uniforms.uMax.value = 14 * dpr;
    camera.aspect = W / Hpx;
    camera.updateProjectionMatrix();
    needs = true;
  }
  new ResizeObserver(resize).observe(wrap);
  resize();
  home(0);

  // ---------- Pointer: hover, click to select, double-click to open ----------
  const el = renderer.domElement;
  let down = null;
  const local = e => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  el.addEventListener("pointermove", e => {
    if (down && e.buttons) { opts.onHover(-1); return; }
    const [x, y] = local(e);
    const i = pick(x, y);
    el.style.cursor = i >= 0 ? "pointer" : "grab";
    opts.onHover(i, x, y);
  });
  el.addEventListener("pointerleave", () => opts.onHover(-1));
  el.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; controls.autoRotate = false; });
  el.addEventListener("pointerup", e => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 500;
    down = null;
    if (moved > 5 || !quick) return;
    const [x, y] = local(e);
    const i = pick(x, y);
    if (i >= 0) opts.onSelect(i);
  });
  el.addEventListener("dblclick", e => {
    const [x, y] = local(e);
    const i = pick(x, y);
    if (i >= 0) opts.onOpen(i);
  });
  controls.addEventListener("start", () => { controls.autoRotate = false; anim = null; });

  requestAnimationFrame(frame);

  // ---------- What the page calls ----------
  let lastGroup;
  const pointAt = i => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  return {
    // state: { group, selected, flyToSelected }
    update(st) {
      recolor();
      selected = st.selected;
      if (selected >= 0) {
        selGeom.attributes.position.array.set([pos[selected * 3], pos[selected * 3 + 1], pos[selected * 3 + 2]]);
        selGeom.attributes.position.needsUpdate = true;
        selMarker.visible = true;
      } else selMarker.visible = false;
      if (st.group !== lastGroup) {
        const first = lastGroup === undefined;
        lastGroup = st.group;
        if (!first) {
          if (st.group === null) home(900);
          else flyTo(groups[st.group].center, Math.max(18, groups[st.group].r * 3.4));
        }
      }
      if (st.flyToSelected && selected >= 0) flyTo(pointAt(selected), 13);
      needs = true;
    },
    zoom(f) {
      const d = camera.position.distanceTo(controls.target);
      flyTo(controls.target.clone(), Math.min(controls.maxDistance, Math.max(controls.minDistance, d * f)), 350);
    },
    home() { controls.autoRotate = false; home(800); },
    resize,
    render() { resize(); needs = true; }
  };
}
