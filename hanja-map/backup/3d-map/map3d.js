// 3D map of the words, drawn with three.js (lib/three.min.js, MIT License).
//
// Layout: Chinese, Japanese, and Vietnamese sit at the corners of a triangle on the ground. Each group of
// words is a cloud (a sphere whose volume is in proportion to its word count) placed over the languages that
// share it, at a height set by how many of them share it: one language lowest, "All three" at the top.
//
// Two ways of showing words:
//  - All words: every word is a dot. Close up, the nearest dots get a small label beside them.
//  - One group: its words slide out of their cloud into a few flat, stacked layers facing you, and every
//    word becomes a tile with the word written inside (Hangul above, Hanja below). The text for the group is
//    drawn once into a texture when the group opens; tiles close to the camera switch to crisp page text.
//
// createMap3D(wrap, opts) returns null when WebGL isn't available, so the page can fall back to the flat map.
// opts: words (array), catOf(i), groups (list of categories), groupName(cat), countOf(cat), langName(c),
//       labelOf(i) → [main, sub], hangulOf(i), hanjaOf(i), look(i) → 0 faded, 1 normal, 2 highlighted,
//       pickable(i), currentGroup(), onHover(i, x, y), onSelect(i), onOpen(i), onGroup(cat)

function createMap3D(wrap, opts) {
  if (!window.THREE) return null;
  let renderer;
  try {
    const test = document.createElement("canvas");
    if (!(test.getContext("webgl2") || test.getContext("webgl"))) return null;
    // No multisample smoothing: it mostly helps the thin guide lines but costs drawing time on every frame
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
  } catch (e) { return null; }

  const N = opts.words.length;
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gl = renderer.getContext();
  const isWebGL2 = renderer.capabilities.isWebGL2;
  const maxPoint = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) || [1, 64])[1];
  const maxTex = Math.min(renderer.capabilities.maxTextureSize || 4096, 8192);

  // ---------- Layout: clouds ----------
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
  const cloudPos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const g = groups[opts.catOf(i)];
    let x, y, z;
    do { x = rand() * 2 - 1; y = rand() * 2 - 1; z = rand() * 2 - 1; } while (x * x + y * y + z * z > 1);
    cloudPos[i * 3] = g.center.x + x * g.r;
    cloudPos[i * 3 + 1] = g.center.y + y * g.r;
    cloudPos[i * 3 + 2] = g.center.z + z * g.r;
  }
  const pos = cloudPos.slice();   // where each word is drawn right now

  // The words in each group (in words.js order: everyday words first), so work can be skipped for whole groups
  const members = {};
  opts.groups.forEach(cat => { members[cat] = []; });
  for (let i = 0; i < N; i++) members[opts.catOf(i)].push(i);
  Object.keys(members).forEach(cat => { members[cat] = Int32Array.from(members[cat]); });

  // ---------- Layout: a group, as layers from familiar to specialized ----------
  // Front to back: everyday words, advanced words, other two-character words, three-character words, and
  // words of four or more characters, every kind with any words getting its own layer; very large layers are split
  // into parts. Each layer is a flat sheet of tiles facing the viewer, in Korean alphabetical order, and the
  // layers stand one behind another. In a group's view you scroll through them.
  const FACE = new THREE.Vector3(Math.sin(0.6), 0, Math.cos(0.6)).normalize();   // toward the viewer
  const RIGHT = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), FACE).normalize();
  const UP = new THREE.Vector3(0, 1, 0);
  const TILE = 1.3, TILE_ASPECT = 0.4;              // tile width in map units, height ÷ width
  const CELL_W = 1.45, CELL_H = 0.68;   // a tile plus the gap around it
  // MAX_LAYER: words per layer, small enough that a whole layer is readable on screen at once.
  // MIN_LAYER: layers smaller than this would join the next (1 = never).
  const LAYER_SPACING = 26, MIN_LAYER = 1, MAX_LAYER = 80;
  const layerOf = new Float32Array(N);              // which layer of its group each word is in
  const collator = window.Intl ? new Intl.Collator("ko") : null;
  const stacks = {};
  function stackFor(cat) {
    if (stacks[cat]) return stacks[cat];
    const len = i => Array.from(opts.hanjaOf(i)).length;
    const lvl = i => opts.levelOf(i);
    // [name on its own, short name when joined with others, which words]
    const KINDS = [
      ["Everyday words", "everyday", i => lvl(i) === "beginner" || lvl(i) === "intermediate"],
      ["Advanced words", "advanced", i => lvl(i) === "advanced"],
      ["Other two-character words", "two-character", i => !lvl(i) && len(i) <= 2],
      ["Three-character words", "three-character", i => !lvl(i) && len(i) === 3],
      ["Words of four or more characters", "longer", i => !lvl(i) && len(i) >= 4]
    ];
    const all = Array.from(members[cat]);
    const parts = KINDS.map(([name, short, test]) => ({ name, shorts: [short], idx: all.filter(test) })).filter(q => q.idx.length);
    const joined = s => { const l = s.length < 3 ? s.join(" and ") : s.slice(0, -1).join(", ") + ", and " + s[s.length - 1];
                          return l.charAt(0).toUpperCase() + l.slice(1) + " words"; };
    // A layer with very few words joins the next one (the last joins the one before)
    let k = 0;
    while (k < parts.length && parts.length > 1) {
      if (parts[k].idx.length >= MIN_LAYER) { k++; continue; }
      const a = k < parts.length - 1 ? k : k - 1;
      const shorts = parts[a].shorts.concat(parts[a + 1].shorts);
      parts.splice(a, 2, { name: joined(shorts), shorts, idx: parts[a].idx.concat(parts[a + 1].idx) });
      k = a;
    }
    // Very large layers are split into parts, each still in alphabetical order
    const layers = [];
    const cmp = (a, b) => collator ? collator.compare(opts.hangulOf(a), opts.hangulOf(b)) : (opts.hangulOf(a) < opts.hangulOf(b) ? -1 : 1);
    parts.forEach(q => {
      const sorted = q.idx.slice().sort(cmp);
      const n = Math.ceil(sorted.length / MAX_LAYER), per = Math.ceil(sorted.length / n);
      for (let s = 0; s < n; s++) layers.push({ name: q.name + (n > 1 ? ` · part ${s + 1} of ${n}` : ""), idx: sorted.slice(s * per, (s + 1) * per) });
    });
    // Place each layer's tiles in a grid, a little uneven, each layer further back than the one before
    const c = groups[cat].center;
    const toByWord = new Map();
    layers.forEach((L, li) => {
      const n = L.idx.length;
      const cols = Math.max(1, Math.ceil(Math.sqrt((1.6 * n * CELL_H) / CELL_W)));
      const rows = Math.ceil(n / cols);
      L.width = cols * CELL_W + CELL_W;
      L.height = rows * CELL_H + CELL_H;
      L.center = c.clone();   // every layer is laid out here; how far back it appears depends on where you are (see relLayer)
      L.idx.forEach((i, j) => {
        const x = ((j % cols) - (cols - 1) / 2 + (rand() - 0.5) * 0.12) * CELL_W;
        const y = ((rows - 1) / 2 - Math.floor(j / cols) + (rand() - 0.5) * 0.16) * CELL_H;
        toByWord.set(i, [L.center.x + RIGHT.x * x, L.center.y + y, L.center.z + RIGHT.z * x]);
        layerOf[i] = li;
      });
    });
    const to = new Float32Array(all.length * 3);
    all.forEach((i, kk) => to.set(toByWord.get(i), kk * 3));
    return (stacks[cat] = { layers, to });
  }

  // ---------- Scene ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfaf8f3);   // the page's warm paper colour (--paper in style.css)
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.className = "map3d-canvas";
  renderer.domElement.setAttribute("aria-label", "3D map of Korean words grouped by which languages share them. Drag to rotate, scroll or pinch to zoom.");
  renderer.domElement.setAttribute("role", "img");
  wrap.appendChild(renderer.domElement);

  const ringTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"); g.strokeStyle = "#fff"; g.lineWidth = 5; g.strokeRect(3, 18, 58, 28);
    return new THREE.CanvasTexture(c);
  })();
  const dotRingTex = (() => {
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
  const kinds = new Float32Array(N);                 // 0 = dot, 1 = tile
  geom.setAttribute("aKind", new THREE.BufferAttribute(kinds, 1));
  const cells = new Float32Array(N * 2);             // where a tile's text sits in the texture
  geom.setAttribute("aCell", new THREE.BufferAttribute(cells, 2));
  geom.setAttribute("aLayer", new THREE.BufferAttribute(layerOf, 1));

  const DOT = 0.62;   // dot size, in map units
  const pointMat = new THREE.ShaderMaterial({
    uniforms: {
      uScale: { value: 400 }, uMaxDot: { value: 14 }, uMaxTile: { value: 120 },
      uAtlas: { value: null }, uCellUV: { value: new THREE.Vector2(0, 0) }, uHasAtlas: { value: 0 },
      uAspect: { value: TILE_ASPECT }, uLayer: { value: 0 }, uLayered: { value: 0 }, uLayerCount: { value: 1 },
      uFace: { value: FACE.clone() }, uSpacing: { value: LAYER_SPACING }, uDist: { value: 60 }
    },
    vertexShader: `
      attribute vec3 aColor; attribute float aSize; attribute float aKind; attribute vec2 aCell; attribute float aLayer;
      uniform float uScale; uniform float uMaxDot; uniform float uMaxTile; uniform float uLayer; uniform float uLayered;
      uniform float uLayerCount; uniform vec3 uFace; uniform float uSpacing; uniform float uDist;
      varying vec3 vColor; varying float vKind; varying vec2 vCell; varying float vPx; varying float vFade;
      void main() {
        vColor = aColor; vKind = aKind; vCell = aCell;
        // In a group's view: the layer being viewed is solid, the next ones fade with distance, passed ones fade out
        // Layers loop: after the last comes the first again. d = how many layers ahead this word's layer is.
        float fade = 1.0;
        vec3 p = position;
        if (uLayered > 0.5 && aKind > 0.5) {
          float d = uLayerCount > 1.5 ? mod(aLayer - uLayer, uLayerCount) : 0.0;
          if (d > uLayerCount - 1.0) d -= uLayerCount;
          // Layers ahead wait further back, fainter with distance. The layer you're leaving keeps coming toward you
          // (all the way to the camera by the time the next one is in focus) and fades only on the last stretch.
          fade = d < 0.0 ? smoothstep(0.0, 0.45, 1.0 + d) : (d > 3.6 ? 0.0 : pow(0.48, d));
          p -= uFace * (d < 0.0 ? d * uDist : d * uSpacing);
        }
        vFade = fade;
        if (aSize <= 0.0 || fade < 0.02) { gl_PointSize = 0.0; gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }   // hidden
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float s = aSize * uScale / -mv.z;
        gl_PointSize = min(s, aKind > 0.5 ? uMaxTile : uMaxDot);
        vPx = gl_PointSize;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uAtlas; uniform vec2 uCellUV; uniform float uHasAtlas; uniform float uAspect;
      varying vec3 vColor; varying float vKind; varying vec2 vCell; varying float vPx; varying float vFade;
      void main() {
        vec2 pc = gl_PointCoord;
        if (vKind < 0.5) {                       // a round dot
          vec2 c = pc - 0.5;
          if (dot(c, c) > 0.25) discard;
          gl_FragColor = vec4(vColor, 1.0);
          return;
        }
        float hh = 0.5 * uAspect;                // a tile: a white box with a thin border and the word inside
        float dy = pc.y - 0.5;
        if (abs(dy) > hh) discard;
        float px = 1.0 / max(vPx, 1.0);
        bool edge = pc.x < px || pc.x > 1.0 - px || abs(dy) > hh - px;
        vec2 local = vec2(pc.x, (dy + hh) / (2.0 * hh));
        float ink = uHasAtlas > 0.5 ? texture2D(uAtlas, vCell + local * uCellUV).r : 0.0;
        // Small, distant tiles: a soft block with a hint of its text, no outline (outlines shimmer at this size).
        // Larger tiles: a white box with an outline and the word in it.
        float near = smoothstep(14.0, 30.0, vPx);
        const vec3 CARD = vec3(1.0, 0.992, 0.976);    // tile fill, --card
        const vec3 PAPER = vec3(0.980, 0.973, 0.953); // background, --paper
        vec3 far = mix(mix(CARD, vColor, 0.35), vColor, ink * 0.8);
        vec3 close = edge ? vColor : mix(CARD, vColor * 0.8, ink);
        vec3 col = mix(mix(far, close, near), PAPER, 1.0 - vFade);   // fading toward the background
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  const points = new THREE.Points(geom, pointMat);
  points.frustumCulled = false;
  scene.add(points);

  const selGeom = new THREE.BufferGeometry();
  selGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
  const selMat = new THREE.PointsMaterial({ size: DOT * 4, color: 0x000000, map: dotRingTex, alphaTest: 0.5, sizeAttenuation: true });
  const selMarker = new THREE.Points(selGeom, selMat);
  selMarker.visible = false;
  scene.add(selMarker);

  // Guides: the triangle of languages on the ground, and a line from each cloud down to it (all-words view only)
  const guides = new THREE.Group();
  scene.add(guides);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xbbbbbb });
  const tri = ["z", "j", "v"].map(c => corner(c).setY(GROUND));
  guides.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(tri), new THREE.LineBasicMaterial({ color: 0x888888 })));
  Object.values(groups).forEach(g => {
    guides.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(g.center.x, g.center.y - g.r, g.center.z), new THREE.Vector3(g.center.x, GROUND, g.center.z)]), lineMat));
  });

  // ---------- Text for a group's tiles: drawn once into a texture (one gray level per pixel) ----------
  let atlas = null;   // { cat, texture } for the group being shown
  let atlasJob = 0;
  function buildAtlas(cat) {
    if (atlas && atlas.cat === cat) return;
    const job = ++atlasJob;
    if (atlas) { atlas.texture.dispose(); atlas = null; }
    pointMat.uniforms.uHasAtlas.value = 0;
    const idx = members[cat], n = idx.length;
    let cw = Math.min(80, Math.floor(maxTex * Math.sqrt(TILE_ASPECT / n)));
    cw = Math.max(32, cw - (cw % 2));
    const ch = Math.round(cw * TILE_ASPECT);
    const cols = Math.floor(maxTex / cw);
    const rows = Math.ceil(n / cols);
    const tw = cols * cw, th = rows * ch;
    const data = new Uint8Array(tw * th);
    const stripRows = Math.max(1, Math.floor(2048 / ch));
    const canvas = document.createElement("canvas");
    canvas.width = tw; canvas.height = stripRows * ch;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    const font = px => `500 ${px}px Inter, "Noto Sans KR", system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif`;
    const base = Math.round(ch * 0.36);
    let row0 = 0;
    function strip() {
      if (job !== atlasJob) return;   // a different group was opened meanwhile
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.fillStyle = "#000"; g.textAlign = "center"; g.textBaseline = "middle";
      const rowEnd = Math.min(rows, row0 + stripRows);
      for (let r = row0; r < rowEnd; r++) {
        for (let c = 0; c < cols; c++) {
          const k = r * cols + c;
          if (k >= n) break;
          const i = idx[k];
          const x = c * cw + cw / 2, y = (r - row0) * ch;
          [[opts.hangulOf(i), 0.3], [opts.hanjaOf(i), 0.72]].forEach(([text, at]) => {
            g.font = font(base);
            const w = g.measureText(text).width, room = cw * 0.9;
            if (w > room) g.font = font(Math.max(5, Math.floor(base * room / w)));
            g.fillText(text, x, y + ch * at);
          });
        }
      }
      const img = g.getImageData(0, 0, tw, (rowEnd - row0) * ch).data;
      const offset = row0 * ch * tw;
      for (let p = 0, q = 3; q < img.length; p++, q += 4) data[offset + p] = img[q];
      row0 = rowEnd;
      if (row0 < rows) { setTimeout(strip, 0); return; }
      // Done: hand the texture to the tiles
      const tex = new THREE.DataTexture(data, tw, th, isWebGL2 ? THREE.RedFormat : THREE.LuminanceFormat, THREE.UnsignedByteType);
      tex.unpackAlignment = 1;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = isWebGL2 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      tex.generateMipmaps = isWebGL2;
      tex.needsUpdate = true;
      for (let k = 0; k < n; k++) {
        const i = idx[k];
        cells[i * 2] = ((k % cols) * cw) / tw;
        cells[i * 2 + 1] = (Math.floor(k / cols) * ch) / th;
      }
      geom.attributes.aCell.needsUpdate = true;
      pointMat.uniforms.uAtlas.value = tex;
      pointMat.uniforms.uCellUV.value.set(cw / tw, ch / th);
      pointMat.uniforms.uHasAtlas.value = 1;
      atlas = { cat, texture: tex };
      needs = true;
    }
    setTimeout(strip, 0);
  }

  // ---------- Overlay: labels for groups, languages, and nearby words ----------
  const overlay = document.createElement("div");
  overlay.className = "map3d-overlay";
  wrap.appendChild(overlay);

  const groupLabels = opts.groups.map(cat => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "map3d-group";
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

  // In a group's view: a name above each layer, and a guide listing the layers (click one to go there)
  let layerLabels = [];
  const guide = document.createElement("nav");
  guide.className = "map3d-guide";
  guide.setAttribute("aria-label", "Layers");
  guide.hidden = true;
  wrap.appendChild(guide);
  function buildGuide(layers) {
    layerLabels.forEach(el => el.remove());
    layerLabels = [];
    guide.innerHTML = "";
    guide.hidden = true;   // the layer list is turned off for now (it's still built, so it can come back by showing it here)
    if (!layers) return;
    const title = document.createElement("p");
    title.textContent = "Layers";
    guide.appendChild(title);
    layers.forEach((L, li) => {
      const b = document.createElement("button");
      b.type = "button";
      const num = document.createElement("span"); num.className = "num"; num.textContent = li + 1;
      const name = document.createElement("span"); name.className = "name"; name.textContent = L.name;
      const count = document.createElement("span"); count.className = "count"; count.textContent = L.idx.length.toLocaleString();
      b.append(num, name, count);
      b.addEventListener("click", () => { Object.assign(view, { panX: 0, panY: 0, zoom: 1 }); goToLayer(li); viewDirty = true; });
      guide.appendChild(b);
      const label = document.createElement("div");
      label.className = "map3d-layer-name";
      label.textContent = (li + 1) + " · " + L.name + " · " + L.idx.length.toLocaleString() + " words";
      overlay.appendChild(label);
      layerLabels.push(label);
    });
    updateGuide();
  }
  function updateGuide() {
    const current = currentIndex();
    Array.from(guide.querySelectorAll("button")).forEach((b, li) => b.setAttribute("aria-current", li === current ? "true" : "false"));
  }

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
  const halfFov = () => (camera.fov * Math.PI) / 360;
  function homeDistance() {
    const radius = Math.max(R * 1.3, (3 * H + groups.zjv.r - GROUND) / 2) + 14;
    const halfH = Math.atan(Math.tan(halfFov()) * Math.min(1, camera.aspect));   // the narrower of the two directions
    return radius / Math.sin(halfH);
  }

  let anim = null, needs = true;
  function flyFrom(toPos, toT, ms) {
    controls.autoRotate = false;
    if (reduceMotion || !ms) { camera.position.copy(toPos); controls.target.copy(toT); needs = true; return; }
    anim = { t0: performance.now(), ms, fromPos: camera.position.clone(), toPos, fromT: controls.target.clone(), toT: toT.clone() };
  }
  function home(ms) {
    flyFrom(HOME_TARGET.clone().add(HOME_DIR.clone().multiplyScalar(homeDistance())), HOME_TARGET, ms);
  }
  function flyTo(target, distance, ms = 800) {
    const dir = camera.position.clone().sub(controls.target).normalize();
    flyFrom(target.clone().add(dir.multiplyScalar(distance)), target, ms);
  }
  // In a group's view the camera faces the layers straight on. view.layer is how far through the layers you are
  // (1.5 = halfway between the second and third); pan and zoom are relative to the layer in front of you.
  const view = { layer: 0, zoom: 1, panX: 0, panY: 0 };
  let viewDirty = false;
  let targetLayer = 0;   // scrolling sets where to go; the view glides there (see the render loop)
  const wrapIndex = k => { const n = layerCount(); return n ? ((Math.round(k) % n) + n) % n : 0; };
  const currentIndex = () => wrapIndex(view.layer);
  // How many layers ahead of you layer k is, looping (between -1 and the number of layers - 1)
  function relLayer(k) {
    const n = layerCount();
    if (n < 2) return 0;
    let d = (((k - view.layer) % n) + n) % n;
    if (d > n - 1) d -= n;
    return d;
  }
  // How far back a layer d layers ahead is drawn (negative: one you're leaving, on its way toward you)
  // The gap between layers grows with the viewing distance, so it looks the same whatever the layer size
  const spacing = () => groupFit() * 0.55;
  const backOf = d => d < 0 ? d * groupFit() * view.zoom : d * spacing();
  function groupFit() { return Math.max(...stackFor(mode).layers.map(fitDistance)); }
  function fitDistance(L) {
    const t = Math.tan(halfFov());
    return Math.max(L.height / 2 / t, L.width / 2 / (t * camera.aspect)) * 1.03 + 1;
  }
  function viewPose() {
    // Every layer is seen from the same distance (the one that fits the group's largest layer), so words keep one size
    const dist = groupFit() * view.zoom;
    const target = groups[mode].center.clone().addScaledVector(RIGHT, view.panX).addScaledVector(UP, view.panY);
    return { pos: target.clone().addScaledVector(FACE, dist), target };
  }
  // Keeps the view over the layer: at full size it's centered; zoomed in, it can sit anywhere the layer still fills it
  function clampView() {
    const L = stackFor(mode).layers[currentIndex()];
    const halfH = groupFit() * view.zoom * Math.tan(halfFov()), halfW = halfH * camera.aspect;   // half the area on screen
    const roomX = Math.max(0, L.width / 2 - halfW), roomY = Math.max(0, L.height / 2 - halfH);
    view.panX = Math.max(-roomX, Math.min(roomX, view.panX));
    view.panY = Math.max(-roomY, Math.min(roomY, view.panY));
  }
  // Zooms by a factor, keeping the spot under the pointer (in screen pixels from the map's top left) where it is
  function zoomAt(f, x, y) {
    const before = view.zoom;
    view.zoom = Math.max(0.05, Math.min(1, view.zoom * f));
    const real = view.zoom / before;
    const dist = camera.position.distanceTo(controls.target);
    const perPx = (2 * dist * Math.tan(halfFov())) / Hpx;
    view.panX += (x - W / 2) * perPx * (1 - real);
    view.panY -= (y - Hpx / 2) * perPx * (1 - real);
    clampView();
    viewDirty = true;
  }
  function applyView() {
    clampView();
    const p = viewPose();
    camera.position.copy(p.pos);
    controls.target.copy(p.target);
    camera.lookAt(p.target);
    pointMat.uniforms.uLayer.value = view.layer;
    pointMat.uniforms.uDist.value = groupFit() * view.zoom;
    pointMat.uniforms.uSpacing.value = spacing();
    viewDirty = false;
    needs = true;
  }
  function layerCount() { return mode === null ? 0 : stackFor(mode).layers.length; }
  // Glides to layer k the short way round
  function goToLayer(k) {
    const n = layerCount();
    if (!n) return;
    let delta = ((((k - targetLayer) % n) + n) % n);
    if (delta > n / 2) delta -= n;
    targetLayer = Math.round(targetLayer + delta);
    if (reduceMotion) { view.layer = targetLayer; viewDirty = true; }
  }
  function flyToView(ms = 900) {
    const p = viewPose();
    pointMat.uniforms.uLayer.value = view.layer;
    pointMat.uniforms.uDist.value = groupFit() * view.zoom;
    pointMat.uniforms.uSpacing.value = spacing();
    updateGuide();
    flyFrom(p.pos, p.target, ms);
  }
  function stepAnim(now) {
    const k = Math.min(1, (now - anim.t0) / anim.ms);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(anim.fromPos, anim.toPos, e);
    controls.target.lerpVectors(anim.fromT, anim.toT, e);
    if (k >= 1) anim = null;
  }

  // ---------- Words sliding between their cloud and a group's layers ----------
  let morphs = [];   // { idx, from, to, t0, ms }
  function slide(idx, to) {
    const from = new Float32Array(idx.length * 3);
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k];
      from[k * 3] = pos[i * 3]; from[k * 3 + 1] = pos[i * 3 + 1]; from[k * 3 + 2] = pos[i * 3 + 2];
    }
    morphs = morphs.filter(mo => mo.idx !== idx);
    morphs.push({ idx, from, to, t0: performance.now(), ms: reduceMotion ? 0 : 750 });
  }
  function stepMorphs(now) {
    morphs = morphs.filter(mo => {
      const k = mo.ms ? Math.min(1, (now - mo.t0) / mo.ms) : 1;
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      for (let j = 0; j < mo.idx.length; j++) {
        const i = mo.idx[j];
        for (let a = 0; a < 3; a++) pos[i * 3 + a] = mo.from[j * 3 + a] + (mo.to[j * 3 + a] - mo.from[j * 3 + a]) * e;
      }
      return k < 1;
    });
    geom.attributes.position.needsUpdate = true;
  }
  const cloudOf = idx => {
    const out = new Float32Array(idx.length * 3);
    for (let k = 0; k < idx.length; k++) for (let a = 0; a < 3; a++) out[k * 3 + a] = cloudPos[idx[k] * 3 + a];
    return out;
  };

  // ---------- Projection of words to the screen, for picking and labels ----------
  let W = 1, Hpx = 1;
  const sx = new Float32Array(N), sy = new Float32Array(N), depth = new Float32Array(N);
  let projected = false;
  const m = new THREE.Matrix4();
  // Only the groups that are in the current filter and at least partly on screen are worked out;
  // the rest are still drawn (faded or off-screen), but skipped for picking and labels.
  const frustum = new THREE.Frustum(), sphere = new THREE.Sphere();
  let live = [];
  let mode = null;   // null = all words (dots), otherwise the category shown as tiles
  function boundsOf(cat) {
    if (mode === cat) {
      const L = stackFor(cat).layers, depthAll = Math.min(L.length - 1, 3.6) * spacing();
      const w = Math.max(...L.map(l => l.width)), h = Math.max(...L.map(l => l.height));
      return [groups[cat].center.clone().addScaledVector(FACE, -depthAll / 2), Math.hypot(w, h, depthAll) / 2 + 2];
    }
    return [groups[cat].center, groups[cat].r + 1];
  }
  // Calls fn for each word worth working out: in the all-words view, the words of the groups on screen;
  // in a group's view, only the layer you're on (and the next, while scrolling between them)
  function forEachNear(fn) {
    if (mode === null) { for (const cat of live) for (const i of members[cat]) fn(i); return; }
    if (!live.includes(mode)) return;
    const L = stackFor(mode).layers, a = wrapIndex(Math.floor(view.layer)), b = wrapIndex(Math.ceil(view.layer));
    for (const k of a === b ? [a] : [a, b]) for (const i of L[k].idx) fn(i);
  }
  function project() {
    if (projected) return;
    camera.updateMatrixWorld();
    m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(m);
    const only = opts.currentGroup();
    live = opts.groups.filter(cat => {
      if (only !== null && only !== cat) return false;
      const [c, r] = boundsOf(cat);
      return frustum.intersectsSphere(sphere.set(c, r));
    });
    const e = m.elements;
    const layered = mode !== null;
    forEachNear(i => {
      let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (layered) { const back = backOf(relLayer(layerOf[i])); x -= FACE.x * back; z -= FACE.z * back; }
      const w = e[3] * x + e[7] * y + e[11] * z + e[15];
      if (w <= 0.1) { depth[i] = -1; return; }
      const cx = (e[0] * x + e[4] * y + e[8] * z + e[12]) / w;
      const cy = (e[1] * x + e[5] * y + e[9] * z + e[13]) / w;
      sx[i] = (cx + 1) / 2 * W;
      sy[i] = (1 - cy) / 2 * Hpx;
      depth[i] = (cx < -1.1 || cx > 1.1 || cy < -1.1 || cy > 1.1) ? -1 : w;
    });
    projected = true;
  }
  const pxPerUnit = d => (Hpx / 2) / Math.tan(halfFov()) / d;
  const maxTileCss = () => pointMat.uniforms.uMaxTile.value / renderer.getPixelRatio();

  function pick(x, y) {
    project();
    let best = -1, bestScore = Infinity;
    forEachNear(i => {
      const d = depth[i];
      if (d < 0 || !opts.pickable(i)) return;
      if (mode !== null && Math.abs(relLayer(layerOf[i])) > 0.5) return;
      const dx = sx[i] - x, dy = sy[i] - y;
      let score;
      if (kinds[i] > 0.5) {   // a tile: inside its rectangle, nearest to the camera wins
        const w = Math.min(TILE * pxPerUnit(d), maxTileCss()), h = w * TILE_ASPECT;
        if (Math.abs(dx) > Math.max(w / 2, 5) || Math.abs(dy) > Math.max(h / 2, 4)) return;
        score = d;
      } else {                // a dot: nearest to the pointer, then to the camera
        const r = Math.max(7, Math.min(10, DOT * pxPerUnit(d) * 0.6) + 3);
        const dist2 = dx * dx + dy * dy;
        if (dist2 > r * r) return;
        score = Math.sqrt(dist2) * 10 + d * 0.02;
      }
      if (score < bestScore) { bestScore = score; best = i; }
    });
    return best;
  }

  // ---------- Look: colors and sizes from the page's state ----------
  const SHADE = [[0.88, 0.865, 0.835], [0.4, 0.39, 0.37], [0.03, 0.03, 0.03]];   // faded greys warmed to match the paper
  const TILE_SHADE = [[0.82, 0.80, 0.77], [0.32, 0.31, 0.29], [0.0, 0.0, 0.0]];
  const DOT_SIZE = [DOT * 0.55, DOT, DOT * 1.15];
  let selected = -1;
  function restyle() {
    for (let i = 0; i < N; i++) {
      const k = opts.look(i);
      const tile = mode !== null && opts.catOf(i) === mode;
      const c = tile ? TILE_SHADE[k] : SHADE[k];
      colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
      sizes[i] = tile ? TILE : mode !== null ? 0 : DOT_SIZE[k];   // in a group's view, only that group is shown
      kinds[i] = tile ? 1 : 0;
    }
    geom.attributes.aColor.needsUpdate = true;
    geom.attributes.aSize.needsUpdate = true;
    geom.attributes.aKind.needsUpdate = true;
    needs = true;
  }

  // ---------- Labels ----------
  let labelTimer = 0;
  const place = (el, v, below) => {
    const p = v.clone().project(camera);
    const vis = p.z < 1 && p.x > -1.1 && p.x < 1.1 && p.y > -1.1 && p.y < 1.1;
    el.style.display = vis ? "" : "none";
    if (vis) el.style.transform = `translate(${(p.x + 1) / 2 * W}px, ${(1 - p.y) / 2 * Hpx}px) translate(-50%, ${below ? "0" : "-100%"})`;
    return vis ? [(p.x + 1) / 2 * W, (1 - p.y) / 2 * Hpx] : null;
  };

  function makeWordEl() {
    const el = document.createElement("button");
    el.type = "button";
    el.tabIndex = -1;
    const word = () => Number(el.dataset.i);
    el.addEventListener("click", () => opts.onSelect(word()));
    el.addEventListener("dblclick", () => opts.onOpen(word()));
    el.addEventListener("mouseenter", () => opts.onHover(word(), sx[word()], sy[word()]));
    el.addEventListener("mouseleave", () => opts.onHover(-1));
    wordLayer.appendChild(el);
    wordPool.push(el);
    return el;
  }

  // Shows page-text elements for the chosen words, reusing each word's element between frames
  function showWords(chosen, style) {
    const want = new Set(chosen);
    const keep = new Map();
    wordPool.forEach(el => { if (el.style.display !== "none" && want.has(Number(el.dataset.i)) && el.dataset.kind === style.kind) keep.set(Number(el.dataset.i), el); });
    const free = wordPool.filter(el => !keep.has(Number(el.dataset.i)) || el.style.display === "none");
    for (const i of chosen) {
      const el = keep.get(i) || free.shift() || makeWordEl();
      if (el.dataset.i !== String(i) || el.dataset.kind !== style.kind) {
        el.dataset.i = i;
        el.dataset.kind = style.kind;
        el.className = style.kind === "box" ? "map3d-box" : "map3d-word";
        el.innerHTML = "";
        if (style.kind === "box") {
          const a = document.createElement("span"); a.textContent = opts.hangulOf(i);
          const b = document.createElement("span"); b.textContent = opts.hanjaOf(i);
          el.append(a, b);
          el.title = opts.labelOf(i).join(" · ");
        } else {
          const [main, sub] = opts.labelOf(i);
          el.append(main);
          if (sub) { const s = document.createElement("small"); s.textContent = sub; el.appendChild(s); }
          el.title = "";
        }
      }
      el.style.display = "";
      style.apply(el, i);
      el.classList.toggle("is-selected", i === selected);
      el.classList.toggle("is-strong", opts.look(i) === 2);
      el.classList.toggle("is-faded", opts.look(i) === 0);
    }
    wordPool.forEach(el => { if (!want.has(Number(el.dataset.i)) || el.dataset.kind !== style.kind) el.style.display = "none"; });
  }

  function placeLabels() {
    project();
    const only = opts.currentGroup();

    // Group names: in the all-words view, under each cloud (nearer ones win when they overlap);
    // in a group's view, only that group's name, above its layers
    const boxes = [];
    groupLabels
      .map(g => ({ g, d: camera.position.distanceTo(g.at) }))
      .sort((a, b) => a.d - b.d)
      .forEach(({ g }) => {
        g.el.setAttribute("aria-pressed", String(only === g.cat));
        if (mode !== null) { g.el.style.display = "none"; return; }
        const xy = place(g.el, g.at, true);
        if (!xy) return;
        const w = g.el.offsetWidth || 120, h = g.el.offsetHeight || 30;
        const box = [xy[0] - w / 2, xy[1], xy[0] + w / 2, xy[1] + h];
        const hit = boxes.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
        g.el.style.opacity = hit ? "0" : "";
        g.el.style.pointerEvents = hit ? "none" : "";
        if (!hit) boxes.push(box);
      });
    if (mode === null) {
      langLabels.forEach(l => place(l.el, l.at, true));
      place(groundLabel, groundAt, true);
    } else {
      langLabels.forEach(l => { l.el.style.display = "none"; });
      groundLabel.style.display = "none";
    }

    if (mode === null) {
      // All words: the nearest dots get a small label beside them
      const cand = [];
      for (const cat of live) {
        if (camera.position.distanceTo(groups[cat].center) - groups[cat].r > 34) continue;
        for (const i of members[cat]) {
          const d = depth[i];
          if (d < 0 || d > 34 || !opts.pickable(i)) continue;
          cand.push(i);
        }
      }
      cand.sort((a, b) => depth[a] - depth[b]);
      if (selected >= 0 && live.includes(opts.catOf(selected)) && depth[selected] > 0) cand.unshift(selected);
      const taken = new Set();
      const cell = (x, y) => Math.floor(x / 90) + "," + Math.floor(y / 22);
      const chosen = [];
      for (const i of cand) {
        if (chosen.length >= 70) break;
        if (chosen.includes(i)) continue;
        const a = cell(sx[i], sy[i]), b = cell(sx[i] + 45, sy[i]);
        if (i !== selected && (taken.has(a) || taken.has(b))) continue;
        taken.add(a); taken.add(b);
        chosen.push(i);
      }
      showWords(chosen, {
        kind: "tag",
        apply(el, i) {
          const scale = Math.max(0.75, Math.min(1.25, 14 / depth[i]));
          el.style.fontSize = (13 * scale).toFixed(1) + "px";
          el.style.opacity = Math.max(0.35, Math.min(1, 30 / depth[i] - 0.1)).toFixed(2);
          el.style.width = ""; el.style.height = ""; el.style.zIndex = "";
          el.style.transform = `translate(${sx[i] + 6}px, ${sy[i] - 9}px)`;
        }
      });
    } else {
      // Only the layer in focus shows its name; it fades in as the layer settles and out as you move on
      const L = stackFor(mode).layers;
      layerLabels.forEach((el, li) => {
        const d = relLayer(li), show = Math.max(0, 1 - Math.abs(d) / 0.12);
        if (show <= 0) { el.style.display = "none"; el.style.opacity = "0"; return; }
        place(el, L[li].center.clone().addScaledVector(FACE, -backOf(d)).addScaledVector(UP, L[li].height / 2 + 0.2), false);
        el.style.opacity = show.toFixed(2);
      });
      // A group's tiles: once a tile on the current layer is big enough on screen, it switches to crisp page text
      const chosen = [];
      const settled = !anim && Math.abs(targetLayer - view.layer) < 0.002 && Math.abs(view.layer - Math.round(view.layer)) < 0.02;
      if (settled && live.includes(mode)) {
        const L = stackFor(mode).layers[currentIndex()];
        for (const i of L.idx) {
          const d = depth[i];
          if (d > 0 && TILE * pxPerUnit(d) >= 64) chosen.push(i);
        }
        chosen.length = Math.min(chosen.length, 180);
      }
      showWords(chosen, {
        kind: "box",
        apply(el, i) {
          const w = TILE * pxPerUnit(depth[i]), h = w * TILE_ASPECT;
          el.style.width = w.toFixed(1) + "px";
          el.style.height = h.toFixed(1) + "px";
          el.style.fontSize = (h * 0.37).toFixed(1) + "px";
          el.style.opacity = "";
          el.style.zIndex = String(10000 - Math.round(depth[i] * 20));   // nearer tiles on top
          el.style.transform = `translate(${sx[i]}px, ${sy[i]}px) translate(-50%, -50%)`;
        }
      });
    }
  }

  // ---------- Render loop: draws only when something changed ----------
  let lastLabels = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (anim) {
      stepAnim(now);
      if (mode !== null) camera.lookAt(controls.target);   // the orbit controls aim the camera only in the all-words view
    }
    const sliding = morphs.length > 0;
    if (sliding) stepMorphs(now);
    const dt = Math.min(0.1, (now - (frame.last || now)) / 1000);
    frame.last = now;
    let moved = false;
    if (mode === null) moved = controls.update();
    else if (!anim) {
      const gap = targetLayer - view.layer;
      if (Math.abs(gap) > 0.0005) {
        view.layer += gap * Math.min(1, dt * 9);                 // ease toward the target: smooth, never overshooting
        if (Math.abs(targetLayer - view.layer) < 0.0005) {
          view.layer = targetLayer;
          setTimeout(() => { projected = false; placeLabels(); }, 0);   // settled: show crisp text right away
        }
        viewDirty = true;
      }
      if (viewDirty) { applyView(); moved = true; updateGuide(); }
    }
    if (selected >= 0 && (sliding || needs || moved)) {
      let x = pos[selected * 3], y = pos[selected * 3 + 1], z = pos[selected * 3 + 2];
      if (mode !== null && kinds[selected] > 0.5) { const back = backOf(relLayer(layerOf[selected])); x -= FACE.x * back; z -= FACE.z * back; }
      selGeom.attributes.position.array.set([x, y, z]);
      selGeom.attributes.position.needsUpdate = true;
    }
    if (moved || needs || anim || sliding) {
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
    pointMat.uniforms.uMaxDot.value = 14 * dpr;
    pointMat.uniforms.uMaxTile.value = Math.min(maxPoint, 400 * dpr);
    camera.aspect = W / Hpx;
    camera.updateProjectionMatrix();
    if (mode !== null && !anim) viewDirty = true;   // in a group's view, re-frame the layers for the new size
    needs = true;
  }
  new ResizeObserver(resize).observe(wrap);
  resize();
  home(0);

  // ---------- Pointer: hover, click to select, double-click to open ----------
  const canvasEl = renderer.domElement;
  let down = null;
  const local = e => { const r = canvasEl.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvasEl.addEventListener("pointermove", e => {
    if (down && e.buttons) { opts.onHover(-1); return; }
    const [x, y] = local(e);
    const i = pick(x, y);
    canvasEl.style.cursor = i >= 0 ? "pointer" : "grab";
    opts.onHover(i, x, y);
  });
  canvasEl.addEventListener("pointerleave", () => opts.onHover(-1));
  canvasEl.addEventListener("pointerdown", e => {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    controls.autoRotate = false;
  });
  canvasEl.addEventListener("pointerup", e => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 500;
    down = null;
    if (moved > 5 || !quick) return;
    const [x, y] = local(e);
    const i = pick(x, y);
    if (i >= 0) opts.onSelect(i);
  });
  canvasEl.addEventListener("dblclick", e => {
    const [x, y] = local(e);
    const i = pick(x, y);
    if (i >= 0) opts.onOpen(i);
  });
  controls.addEventListener("start", () => { controls.autoRotate = false; anim = null; });

  // ---------- Trackpad: two-finger swipe turns, Shift + swipe moves, pinch zooms; a mouse wheel zooms ----------
  // Handled on the whole map area (labels included), before the orbit controls see the event.
  const spherical = new THREE.Spherical();
  function turn(dx, dy) {
    const offset = camera.position.clone().sub(controls.target);
    spherical.setFromVector3(offset);
    spherical.theta -= (2 * Math.PI * dx) / Hpx;
    spherical.phi = Math.max(0.08, Math.min(Math.PI - 0.08, spherical.phi - (2 * Math.PI * dy) / Hpx));
    offset.setFromSpherical(spherical);
    camera.position.copy(controls.target).add(offset);
    camera.lookAt(controls.target);
  }
  function move(dx, dy) {
    const dist = camera.position.distanceTo(controls.target);
    const perPx = (2 * dist * Math.tan(halfFov())) / Hpx;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).multiplyScalar(-dx * perPx);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1).multiplyScalar(dy * perPx);
    const shift = right.add(up);
    camera.position.add(shift);
    controls.target.add(shift);
  }
  function dolly(amount) {
    const offset = camera.position.clone().sub(controls.target);
    const d = Math.min(controls.maxDistance, Math.max(controls.minDistance, offset.length() * Math.exp(amount)));
    camera.position.copy(controls.target).add(offset.setLength(d));
  }
  let snapTimer = 0, scrollDir = 1;
  wrap.addEventListener("wheel", e => {
    if (e.target.closest && (e.target.closest(".map-tools") || e.target.closest(".map3d-guide"))) return;
    e.preventDefault();
    e.stopPropagation();
    controls.autoRotate = false;
    anim = null;
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? Hpx : 1;
    const dx = e.deltaX * scale, dy = e.deltaY * scale;
    if (mode !== null) {
      if (e.ctrlKey) {                                                                  // pinch zooms toward the pointer
        const r = wrap.getBoundingClientRect();
        zoomAt(Math.exp(dy * 0.012), e.clientX - r.left, e.clientY - r.top);
      } else if (dy) {                                                                  // scrolling moves through layers (they loop)
        const notch = e.deltaX === 0 && (e.deltaMode === 1 ||
          (e.wheelDeltaY !== undefined && e.wheelDeltaY !== 0 && Math.abs(e.wheelDeltaY) % 120 === 0));
        scrollDir = Math.sign(dy);
        if (notch) targetLayer = Math.round(targetLayer) + scrollDir;                   // a mouse wheel: one layer per notch
        else targetLayer += dy * 0.003;
        clearTimeout(snapTimer);
        snapTimer = setTimeout(() => {                                                  // stopped: settle on the next layer
          const fl = Math.floor(targetLayer), fr = targetLayer - fl;                   // in the direction you were going
          targetLayer = scrollDir > 0 ? (fr > 0.08 ? fl + 1 : fl) : (fr < 0.92 ? fl : fl + 1);
          if (reduceMotion) view.layer = targetLayer;
          viewDirty = true;
        }, 140);
        if (reduceMotion) view.layer = targetLayer;
      }
      viewDirty = true;
      return;
    }
    // A mouse wheel moves in whole notches (wheelDelta in steps of 120, or whole lines in Firefox) and never sideways
    const notch = e.deltaX === 0 && (e.deltaMode === 1 ||
      (e.wheelDeltaY !== undefined && e.wheelDeltaY !== 0 && Math.abs(e.wheelDeltaY) % 120 === 0));
    if (e.ctrlKey) dolly(dy * 0.012);                     // pinch (the browser reports it as Ctrl + scroll)
    else if (notch) dolly(dy * 0.0015);                   // mouse wheel zooms
    else if (e.shiftKey) move(-dx, -dy);                  // Shift + two-finger swipe moves
    else turn(-dx * 0.6, -dy * 0.6);                      // two-finger swipe turns
    needs = true;
  }, { capture: true, passive: false });

  requestAnimationFrame(frame);

  // ---------- Switching between all words and one group ----------
  function setMode(cat) {
    if (cat === mode) return;
    if (mode !== null) slide(members[mode], cloudOf(members[mode]));    // the old group goes back into its cloud
    mode = cat;
    guides.visible = mode === null;
    if (mode !== null) {
      const stack = stackFor(mode);
      geom.attributes.aLayer.needsUpdate = true;
      slide(members[mode], stack.to);                                    // the new group opens into layers
      buildAtlas(mode);
      Object.assign(view, { layer: 0, zoom: 1, panX: 0, panY: 0 });
      targetLayer = 0;
      pointMat.uniforms.uLayerCount.value = stack.layers.length;
      buildGuide(stack.layers);
      selMat.map = ringTex; selMat.size = TILE * 1.25;
    } else {
      selMat.map = dotRingTex; selMat.size = DOT * 4;
      buildGuide(null);
    }
    pointMat.uniforms.uLayered.value = mode === null ? 0 : 1;
    controls.enabled = mode === null;
    selMat.needsUpdate = true;
    const hint = wrap.querySelector(".map-hint");
    if (hint) hint.textContent = mode === null
      ? "Trackpad: swipe with two fingers to turn, hold Shift to move, pinch to zoom · Mouse: drag to turn, scroll to zoom, right-drag to move"
      : "Scroll to move through the layers · Pinch to zoom in on part of a layer";
  }

  // ---------- What the page calls ----------
  let lastGroup;
  const finalPos = i => {
    if (mode !== null && opts.catOf(i) === mode) {
      const k = members[mode].indexOf(i), to = stackFor(mode).to;
      return new THREE.Vector3(to[k * 3], to[k * 3 + 1], to[k * 3 + 2]);
    }
    return new THREE.Vector3(cloudPos[i * 3], cloudPos[i * 3 + 1], cloudPos[i * 3 + 2]);
  };
  return {
    // state: { group, selected, flyToSelected }
    update(st) {
      selected = st.selected;
      if (st.group !== lastGroup) {
        const first = lastGroup === undefined;
        lastGroup = st.group;
        setMode(st.group);
        if (!first) {
          if (st.group === null) home(900);
          else flyToView(900);
        } else if (st.group !== null) flyToView(0);   // the page started on a group: begin facing its layers
      }
      restyle();
      selMarker.visible = selected >= 0;
      if (st.flyToSelected && selected >= 0) {
        if (mode !== null) {
          // Go to the word's layer, centered on it, close enough to read
          const li = layerOf[selected], L = stackFor(mode).layers[li], p = finalPos(selected);
          const off = p.clone().sub(L.center);
          goToLayer(li);
          view.layer = targetLayer;
          Object.assign(view, { panX: off.dot(RIGHT), panY: off.y, zoom: Math.min(1, 16 / groupFit()) });
          flyToView(800);
        } else flyTo(finalPos(selected), 13);
      }
      needs = true;
    },
    zoom(f) {
      if (mode !== null) { zoomAt(f, W / 2, Hpx / 2); return; }
      const d = camera.position.distanceTo(controls.target);
      flyTo(controls.target.clone(), Math.min(controls.maxDistance, Math.max(controls.minDistance, d * f)), 350);
    },
    home() {
      controls.autoRotate = false;
      if (mode !== null) { Object.assign(view, { zoom: 1, panX: 0, panY: 0 }); flyToView(600); } else home(800);
    },
    resize,
    render() { resize(); needs = true; }
  };
}
