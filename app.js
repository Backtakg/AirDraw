const video = document.querySelector("#video");
const drawCanvas = document.querySelector("#drawCanvas");
const cursorCanvas = document.querySelector("#cursorCanvas");
const drawCtx = drawCanvas.getContext("2d");
const cursorCtx = cursorCanvas.getContext("2d");
const stage = document.querySelector("#stage");
const welcome = document.querySelector("#welcome");
const welcomeMessage = document.querySelector("#welcomeMessage");
const loading = document.querySelector("#loading");
const loadingText = document.querySelector("#loadingText");
const hint = document.querySelector("#hint");
const startButton = document.querySelector("#startButton");
const statusPill = document.querySelector("#statusPill");
const statusText = document.querySelector("#statusText");
const undoButton = document.querySelector("#undoButton");
const redoButton = document.querySelector("#redoButton");
const clearButton = document.querySelector("#clearButton");
const saveButton = document.querySelector("#saveButton");
const sizeUpButton = document.querySelector("#sizeUpButton");
const sizeDisplay = document.querySelector("#sizeDisplay");
const sizeSlider = document.querySelector("#sizeSlider");
const effectButton = document.querySelector("#effectButton");
const galleryButton = document.querySelector("#galleryButton");
const galleryModal = document.querySelector("#galleryModal");
const galleryClose = document.querySelector("#galleryClose");
const galleryGrid = document.querySelector("#galleryGrid");
const opacityUpButton = document.querySelector("#opacityUpButton");
const opacityDisplay = document.querySelector("#opacityDisplay");
const opacitySlider = document.querySelector("#opacitySlider");
const shapeButton = document.querySelector("#shapeButton");
const gestureToast = document.querySelector("#gestureToast");
const snapshotButton = document.querySelector("#snapshotButton");
const recordButton = document.querySelector("#recordButton");
const textButton = document.querySelector("#textButton");
const textModal = document.querySelector("#textModal");
const textClose = document.querySelector("#textClose");
const recognizeTextButton = document.querySelector("#recognizeTextButton");
const recognizedText = document.querySelector("#recognizedText");
const textStatus = document.querySelector("#textStatus");
const backgroundButton = document.querySelector("#backgroundButton");
const backgroundInput = document.querySelector("#backgroundInput");
const customColorButton = document.querySelector("#customColorButton");
const customColorInput = document.querySelector("#customColorInput");
const rainbowColorButton = document.querySelector("#rainbowColorButton");
const gradientColorButton = document.querySelector("#gradientColorButton");
const particleButton = document.querySelector("#particleButton");
const recentColors = document.querySelector("#recentColors");
const layersPanel = document.querySelector("#layersPanel");
const layersList = document.querySelector("#layersList");
const addLayerButton = document.querySelector("#addLayerButton");
const layerCount = document.querySelector("#layerCount");
const symmetryButton = document.querySelector("#symmetryButton");
const gridButton = document.querySelector("#gridButton");
const twoHandButton = document.querySelector("#twoHandButton");
const ar3dButton = document.querySelector("#ar3dButton");

let hands = null;
let stream = null;
let trackingReady = false;
let trackingStarting = false;
let animationId = 0;
let processing = false;
let tool = "brush";
let color = "#ffffff";
let colorMode = "solid";
let gradientPreset = "sunset";
const GRADIENTS = {
  sunset: ["#ff3b81", "#ff8a3d", "#ffd43b"],
  ocean: ["#22d3ee", "#43b5ff", "#5865f2"],
  candy: ["#ff4fd8", "#a978ff", "#43b5ff"],
  forest: ["#9be15d", "#42e8a0", "#22d3ee"]
};
const RECENT_COLORS_KEY = "airdraw-recent-colors";
let brushSize = 7;
let brushEffect = "neon";
let opacity = 1;
let shapeMode = "freehand";
let shapeStart = null;
let gestureCooldownUntil = 0;
let lastGestureName = "";
const EFFECTS = ["normal", "glow", "neon", "marker", "pencil"];
const SHAPES = ["freehand", "line", "rectangle", "circle"];
let eraserSize = 38;
const LAYERS_KEY = "airdraw-layers";
let layers = [];
let activeLayerId = null;
let layerCounter = 0;
let strokes = [];
let redoStack = [];
let activeStroke = null;
let smoothedPoint = null;
let started = false;
let selectedAirControl = null;
let fistHeld = false;
let drawPaused = false;
let uiInteractionLock = false;
let recording = false;
let mediaRecorder = null;
let recordingChunks = [];
let recordingCanvas = null;
let recordingCtx = null;
let recordingFrameId = 0;
let tesseractLoading = null;
const GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_KEY_STORAGE = "airdraw-gemini-api-key";
let backgroundMode = "camera";
let customBackgroundImage = null;
const BACKGROUNDS = ["camera", "black", "white", "custom", "transparent"];
let symmetryMode = false, gridMode = false, twoHandMode = false, ar3dMode = false;
let controlHand = null, lastControlColorAt = 0;

function setStatus(text, live = false) {
  statusText.textContent = text;
  statusPill.classList.toggle("live", live);
}

function recentColorItems() {
  try {
    const items = JSON.parse(localStorage.getItem(RECENT_COLORS_KEY) || "[]");
    return Array.isArray(items) ? items.filter(value => /^#[0-9a-f]{6}$/i.test(value)) : [];
  } catch {
    return [];
  }
}

function rememberColor(value) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return;
  const items = [value.toLowerCase(), ...recentColorItems().filter(item => item.toLowerCase() !== value.toLowerCase())].slice(0, 8);
  try { localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(items)); } catch {}
  renderRecentColors();
}

function syncColorModeButtons() {
  rainbowColorButton?.classList.toggle("active", colorMode === "rainbow");
  gradientColorButton?.classList.toggle("active", colorMode === "gradient");
  customColorButton?.classList.toggle("active", colorMode === "solid");
}

function setSolidColor(value, announce = true) {
  color = value;
  colorMode = "solid";
  if (customColorInput) customColorInput.value = value;
  rememberColor(value);
  syncColorModeButtons();
  if (announce) showGesture("🎨 Custom color selected");
}

function setRainbowMode() {
  stopDrawingForUI();
  colorMode = colorMode === "rainbow" ? "solid" : "rainbow";
  syncColorModeButtons();
  showGesture(colorMode === "rainbow" ? "🌈 Rainbow mode" : "🎨 Solid color mode");
}

function cycleGradient() {
  stopDrawingForUI();
  const names = Object.keys(GRADIENTS);
  const index = names.indexOf(gradientPreset);
  gradientPreset = names[(index + 1) % names.length];
  colorMode = "gradient";
  syncColorModeButtons();
  showGesture("🌈 " + gradientPreset.charAt(0).toUpperCase() + gradientPreset.slice(1) + " gradient");
}

function renderRecentColors() {
  if (!recentColors) return;
  recentColors.innerHTML = "";
  const items = recentColorItems();
  items.forEach(value => {
    const button = document.createElement("button");
    button.className = "recent-color";
    button.type = "button";
    button.style.setProperty("--c", value);
    button.title = "Recent color " + value;
    button.setAttribute("aria-label", "Recent color " + value);
    button.addEventListener("click", () => {
      stopDrawingForUI();
      setSolidColor(value);
    });
    recentColors.appendChild(button);
  });
}

function getGradientPaint(ctx, stroke) {
  const points = stroke.points || [];
  let minX = 0, maxX = Math.max(stage.clientWidth, 1);
  if (points.length) {
    minX = Math.min(...points.map(point => point.x));
    maxX = Math.max(...points.map(point => point.x));
    if (maxX - minX < 2) maxX = minX + Math.max(stage.clientWidth * 0.25, 80);
  }
  const gradient = ctx.createLinearGradient(minX, 0, maxX, 0);
  const stops = stroke.colorMode === "rainbow"
    ? ["#ff3b81","#ff8a3d","#ffd43b","#42e8a0","#43b5ff","#5865f2","#a978ff","#ff4fd8"]
    : (GRADIENTS[stroke.gradient] || GRADIENTS.sunset);
  stops.forEach((stop, index) => gradient.addColorStop(index / (stops.length - 1), stop));
  return gradient;
}

function setStrokePaint(ctx, stroke) {
  const paint = stroke.colorMode === "solid" || !stroke.colorMode ? (stroke.color || "#ffffff") : getGradientPaint(ctx, stroke);
  ctx.strokeStyle = paint;
  ctx.fillStyle = paint;
  return paint;
}

function colorWithAlpha(value, alphaHex = "33") {
  if (/^#[0-9a-f]{6}$/i.test(value || "")) return value + alphaHex;
  return value || "#ffffff";
}

function withTimeout(promise, milliseconds, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function showLoading(text) {
  loadingText.textContent = text;
  loading.style.display = "grid";
  loading.hidden = false;
}

function hideLoading() {
  loading.hidden = true;
  loading.style.display = "none";
}

function applyBackgroundMode() {
  const stageClass = `background-${backgroundMode}`;
  stage.classList.remove("background-camera","background-black","background-white","background-custom","background-transparent");
  stage.classList.add(stageClass);
  if (backgroundMode === "custom" && customBackgroundImage) {
    stage.style.setProperty("--custom-background-image", `url("${customBackgroundImage}")`);
  } else {
    stage.style.removeProperty("--custom-background-image");
  }
  if (video) video.style.visibility = backgroundMode === "camera" ? "visible" : "hidden";
}

function updateBackgroundButton() {
  const labels = {camera:"📷", black:"⬛", white:"⬜", custom:"🖼️", transparent:"▧"};
  const names = {camera:"Camera", black:"Black background", white:"White canvas", custom:"Custom image", transparent:"Transparent canvas"};
  backgroundButton.textContent = labels[backgroundMode];
  backgroundButton.title = `Background: ${names[backgroundMode]}`;
  backgroundButton.setAttribute("aria-label", `Background: ${names[backgroundMode]}`);
}

function cycleBackground() {
  stopDrawingForUI();
  const index = BACKGROUNDS.indexOf(backgroundMode);
  backgroundMode = BACKGROUNDS[(index + 1) % BACKGROUNDS.length];
  if (backgroundMode === "custom" && !customBackgroundImage) {
    applyBackgroundMode();
    updateBackgroundButton();
    backgroundInput?.click();
    return;
  }
  applyBackgroundMode();
  updateBackgroundButton();
  showGesture(`🖼️ ${backgroundButton.title.replace("Background: ","")}`);
}

function selectCustomBackground() {
  stopDrawingForUI();
  backgroundInput?.click();
}

function handleBackgroundButton() {
  cycleBackground();
}

function updateModeButtons() {
  [[symmetryButton,symmetryMode,"Symmetry"],[gridButton,gridMode,"Grid / Guide"],[twoHandButton,twoHandMode,"Two-hand controls"],[ar3dButton,ar3dMode,"AR 3D mode"]].forEach(([b,on,n])=>{if(!b)return;b.classList.toggle("active",on);b.title=n+(on?" (on)":" (off)");b.setAttribute("aria-label",n+(on?" on":" off"));});
  stage.classList.toggle("grid-mode",gridMode); stage.classList.toggle("ar3d-mode",ar3dMode);
}
function toggleSymmetry(){stopDrawingForUI();symmetryMode=!symmetryMode;updateModeButtons();redrawAllLayers();showGesture(symmetryMode?"✦ Symmetry on":"✦ Symmetry off");}
function toggleGrid(){stopDrawingForUI();gridMode=!gridMode;updateModeButtons();showGesture(gridMode?"▦ Grid guide on":"▦ Grid guide off");}
function toggleTwoHand(){stopDrawingForUI();twoHandMode=!twoHandMode;updateModeButtons();showGesture(twoHandMode?"👐 Two-hand controls on":"👐 Two-hand controls off");}
function toggleAR3D(){stopDrawingForUI();ar3dMode=!ar3dMode;updateModeButtons();redrawAllLayers();showGesture(ar3dMode?"🧊 AR 3D depth mode on":"🧊 AR 3D depth mode off");}
function projectPoint3D(p){if(!ar3dMode)return p;const d=Math.max(-.08,Math.min(.08,Number(p.z||0))),s=1-d*1.8,r=stage.getBoundingClientRect();return{x:r.width/2+(p.x-r.width/2)*s-d*180,y:r.height/2+(p.y-r.height/2)*s+d*90,z:p.z||0};}
function applyTwoHandControls(hand){if(!twoHandMode||!hand)return;const palm=Math.max(distance(hand[0],hand[9]),.001),pd=distance(hand[4],hand[8])/palm;if(pd<.8){brushSize=Math.max(2,Math.min(32,2+Math.round(Math.max(0,Math.min(1,1-(hand[8].y-.12)/.76))*30)));if(sizeSlider)sizeSlider.value=brushSize;updateSizeDisplay();}if(performance.now()-lastControlColorAt>180&&pd<1.1){const hue=Math.round((1-Math.max(0,Math.min(1,hand[8].x)))*360);colorMode="solid";color=`hsl(${hue},100%,65%)`;lastControlColorAt=performance.now();syncColorModeButtons();}if(isFist(hand)&&performance.now()>gestureCooldownUntil){const ts=["brush","eraser"],next=ts[(ts.indexOf(tool)+1)%ts.length];document.querySelector(`[data-tool="${next}"]`)?.click();gestureCooldownUntil=performance.now()+900;}}
function resizeCanvases() {
  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const canvas of [drawCanvas, cursorCanvas]) {
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
  }
  drawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cursorCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redraw();
}

function canvasPoint(landmark) {
  const rect = stage.getBoundingClientRect();
  const videoWidth = video.videoWidth || rect.width;
  const videoHeight = video.videoHeight || rect.height;

  const scale = Math.max(rect.width / videoWidth, rect.height / videoHeight);
  const displayedWidth = videoWidth * scale;
  const displayedHeight = videoHeight * scale;
  const offsetX = (rect.width - displayedWidth) / 2;
  const offsetY = (rect.height - displayedHeight) / 2;

  const cameraX = landmark.x * displayedWidth + offsetX;
  const cameraY = landmark.y * displayedHeight + offsetY;

  return {
    x: rect.width - cameraX,
    y: cameraY
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isFist(hand) {
  const wrist = hand[0];
  const palm = Math.max(distance(wrist, hand[9]), 0.001);
  const fingertips = [8, 12, 16, 20];
  const folded = fingertips.every(i => distance(hand[i], wrist) / palm < 1.35);
  const thumbFolded = distance(hand[4], hand[5]) / palm < 0.85;
  return folded && thumbFolded;
}

function isPointInsideRect(point, rect) {
  return point.x >= rect.left && point.x <= rect.right &&
    point.y >= rect.top && point.y <= rect.bottom;
}

let hoveredControl = null;
let dwellControl = null;
let dwellStartedAt = 0;
let lastAirSelectionAt = 0;
const CONTROL_DWELL_MS = 650; // Gesture controls: index, fist, peace, thumb-up, pinch, open palm

function getAirControlAt(point) {
  const controls = document.querySelectorAll(".controls button");
  const stageRect = stage.getBoundingClientRect();

  for (const button of controls) {
    if (button.disabled || button.offsetParent === null) continue;
    const rect = button.getBoundingClientRect();
    const localRect = {
      left: rect.left - stageRect.left,
      right: rect.right - stageRect.left,
      top: rect.top - stageRect.top,
      bottom: rect.bottom - stageRect.top
    };
    if (isPointInsideRect(point, localRect)) return button;
  }
  return null;
}

function updateAirControlHover(button) {
  if (hoveredControl === button) return;
  if (hoveredControl) hoveredControl.classList.remove("air-hover");
  hoveredControl = button;
  if (hoveredControl) hoveredControl.classList.add("air-hover");
}

function clearAirControlHover() {
  if (hoveredControl) hoveredControl.classList.remove("air-hover");
  hoveredControl = null;
  dwellControl = null;
  dwellStartedAt = 0;
}

function activateAirControl(button) {
  if (!button || button.disabled) return;
  const now = performance.now();
  if (now - lastAirSelectionAt < 500) return;

  // Selecting a control is always a hard pen-up event.
  endStroke();
  smoothedPoint = null;
  uiInteractionLock = true;

  lastAirSelectionAt = now;
  button.click();
  button.classList.remove("air-hover");
  button.classList.add("air-selected");
  setTimeout(() => button.classList.remove("air-selected"), 180);
}

function updateAirControlDwell(control) {
  if (!control) {
    dwellControl = null;
    dwellStartedAt = 0;
    selectedAirControl = null;
    return false;
  }

  if (selectedAirControl === control) return false;

  if (dwellControl !== control) {
    dwellControl = control;
    dwellStartedAt = performance.now();
    return false;
  }

  if (performance.now() - dwellStartedAt >= CONTROL_DWELL_MS) {
    activateAirControl(control);
    selectedAirControl = control;
    dwellControl = null;
    return true;
  }

  return false;
}

function createLayer(name) {
  layerCounter += 1;
  return { id: "layer-" + Date.now() + "-" + layerCounter, name: name || `Layer ${layerCounter}`, visible: true, strokes: [] };
}

function ensureLayers() {
  if (!layers.length) {
    const layer = createLayer("Layer 1");
    layers = [layer];
    activeLayerId = layer.id;
  }
  if (!layers.some(layer => layer.id === activeLayerId)) activeLayerId = layers[layers.length - 1].id;
  syncLayerState();
}

function syncLayerState() {
  const active = layers.find(layer => layer.id === activeLayerId) || layers[layers.length - 1];
  strokes = active ? active.strokes : [];
  renderLayers();
}

function persistLayers() {
  try {
    localStorage.setItem(LAYERS_KEY, JSON.stringify(layers));
  } catch {}
}

function loadLayers() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYERS_KEY) || "null");
    if (Array.isArray(saved) && saved.length) {
      layers = saved.filter(layer => layer && layer.id && Array.isArray(layer.strokes));
      if (layers.length) activeLayerId = layers[layers.length - 1].id;
    }
  } catch {}
  ensureLayers();
}

function renderLayers() {
  if (!layersList) return;
  layersList.innerHTML = "";
  [...layers].reverse().forEach(layer => {
    const row = document.createElement("div");
    row.className = "layer-row" + (layer.id === activeLayerId ? " active" : "");
    row.dataset.layerId = layer.id;
    row.innerHTML = `
      <button class="layer-select" type="button" title="Select ${layer.name}">
        <span class="layer-thumb"></span><span class="layer-name">${layer.name}</span>
      </button>
      <button class="layer-visibility" type="button" title="${layer.visible ? "Hide layer" : "Show layer"}" aria-label="${layer.visible ? "Hide layer" : "Show layer"}">${layer.visible ? "◉" : "○"}</button>
      <button class="layer-up" type="button" title="Move layer up" aria-label="Move layer up">↑</button>
      <button class="layer-down" type="button" title="Move layer down" aria-label="Move layer down">↓</button>
      <button class="layer-delete" type="button" title="Delete layer" aria-label="Delete layer">×</button>`;
    const thumb = row.querySelector(".layer-thumb");
    const last = layer.strokes[layer.strokes.length - 1];
    if (last?.color) thumb.style.background = last.color;
    row.querySelector(".layer-select").addEventListener("click", () => selectLayer(layer.id));
    row.querySelector(".layer-visibility").addEventListener("click", () => toggleLayer(layer.id));
    row.querySelector(".layer-up").addEventListener("click", () => moveLayer(layer.id, 1));
    row.querySelector(".layer-down").addEventListener("click", () => moveLayer(layer.id, -1));
    row.querySelector(".layer-delete").addEventListener("click", () => deleteLayer(layer.id));
    layersList.appendChild(row);
  });
  if (layerCount) layerCount.textContent = layers.length + (layers.length === 1 ? " layer" : " layers");
}

function selectLayer(id) {
  stopDrawingForUI();
  if (!layers.some(layer => layer.id === id)) return;
  activeLayerId = id;
  syncLayerState();
  redrawAllLayers();
  showGesture("Layer selected");
}

function addLayer() {
  stopDrawingForUI();
  const layer = createLayer(`Layer ${layers.length + 1}`);
  layers.push(layer);
  activeLayerId = layer.id;
  redoStack = [];
  syncLayerState();
  redrawAllLayers();
  persistLayers();
  showGesture("➕ " + layer.name);
}

function toggleLayer(id) {
  stopDrawingForUI();
  const layer = layers.find(item => item.id === id);
  if (!layer) return;
  layer.visible = !layer.visible;
  persistLayers();
  renderLayers();
  redrawAllLayers();
  showGesture(layer.visible ? "Layer shown" : "Layer hidden");
}

function moveLayer(id, direction) {
  stopDrawingForUI();
  const index = layers.findIndex(item => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= layers.length) return;
  [layers[index], layers[target]] = [layers[target], layers[index]];
  persistLayers();
  renderLayers();
  redrawAllLayers();
}

function deleteLayer(id) {
  stopDrawingForUI();
  if (layers.length <= 1) {
    clearDrawing();
    showGesture("Keep at least one layer");
    return;
  }
  const index = layers.findIndex(item => item.id === id);
  if (index < 0) return;
  layers.splice(index, 1);
  if (activeLayerId === id) activeLayerId = layers[Math.max(0, index - 1)].id;
  syncLayerState();
  redrawAllLayers();
  persistLayers();
  showGesture("Layer deleted");
}

function redrawAllLayers() {
  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  drawCtx.save();
  drawCtx.setTransform(1, 0, 0, 1, 0, 0);
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  drawCtx.restore();
  drawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const layer of layers) {
    if (!layer.visible) continue;
    if (layer.snapshot) {
      const image = new Image();
      image.onload = () => {
        const r = stage.getBoundingClientRect();
        drawCtx.drawImage(image, 0, 0, r.width, r.height);
      };
      image.src = layer.snapshot;
    } else {
      drawStrokes(drawCtx, layer.strokes);
    }
  }
}

function drawStrokes(ctx, strokeList) {
  const render = (source, mirror=false) => {
    const r=stage.getBoundingClientRect();
    const stroke={...source,points:source.points.map(p=>{const q=projectPoint3D(p);return{x:mirror?r.width-q.x:q.x,y:q.y,z:q.z};})};
    ctx.save();ctx.lineCap="round";ctx.lineJoin="round";ctx.lineWidth=stroke.size;ctx.globalAlpha=stroke.opacity??1;
    if(stroke.tool==="eraser"){ctx.globalCompositeOperation="destination-out";ctx.strokeStyle="#000";}
    else{ctx.globalCompositeOperation="source-over";setStrokePaint(ctx,stroke);
      if(stroke.effect==="neon"){ctx.shadowColor=stroke.color;ctx.shadowBlur=Math.min(stroke.size*2.6,34);}
      else if(stroke.effect==="glow"){ctx.shadowColor=stroke.color;ctx.shadowBlur=Math.min(stroke.size*1.35,20);}
      else if(stroke.effect==="marker"){ctx.lineWidth=stroke.size*1.35;ctx.globalAlpha*=.82;}
      else if(stroke.effect==="pencil"){ctx.lineWidth=Math.max(1.2,stroke.size*.55);ctx.globalAlpha*=.78;}
      else ctx.shadowBlur=0;
      if(stroke.particle&&stroke.particle!=="none")drawParticleEffect(ctx,stroke);
    }
    if(stroke.shape&&stroke.shape!=="freehand"&&stroke.points.length>=2)drawShape(ctx,stroke);
    else if(stroke.points.length===1){const p=stroke.points[0];ctx.beginPath();ctx.arc(p.x,p.y,stroke.size/2,0,Math.PI*2);ctx.fillStyle=stroke.tool==="eraser"?"#000":(stroke.color||"#fff");ctx.fill();}
    else drawSmoothStroke(ctx,stroke.points);
    ctx.restore();
  };
  for(const stroke of strokeList){if(!stroke.points?.length)continue;render(stroke,false);if(symmetryMode&&stroke.tool!=="eraser")render(stroke,true);}
}

function drawCursor(point, active) {
  const rect = stage.getBoundingClientRect();
  cursorCtx.clearRect(0, 0, rect.width, rect.height);
  if (!point) return;
  const size = tool === "eraser" ? eraserSize : brushSize;
  cursorCtx.beginPath();
  cursorCtx.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
  cursorCtx.fillStyle = active
    ? (tool === "eraser" ? "rgba(255,255,255,.12)" : colorWithAlpha(color))
    : "rgba(255,255,255,.05)";
  cursorCtx.fill();
  cursorCtx.lineWidth = 2;
  cursorCtx.strokeStyle = active
    ? (tool === "eraser" ? "#fff" : color)
    : "rgba(255,255,255,.55)";
  cursorCtx.stroke();
}

function seededRandom(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function particleColor(stroke, index, alpha = 1) {
  if (stroke.colorMode === "rainbow") {
    const hue = (index * 47 + particleSeed * 13) % 360;
    return `hsla(${hue}, 100%, 65%, ${alpha})`;
  }
  if (stroke.colorMode === "gradient") {
    const stops = GRADIENTS[stroke.gradient] || GRADIENTS.sunset;
    return stops[index % stops.length];
  }
  return stroke.color;
}

function drawParticleEffect(ctx, stroke) {
  if (!stroke.particle || !stroke.points?.length) return;
  const points = stroke.points;
  const step = stroke.particle === "stars" ? 2 : 3;
  const maxParticles = stroke.particle === "confetti" ? 260 : 220;
  let index = 0;
  for (let i = 0; i < points.length; i += step) {
    const p = points[i];
    const next = points[Math.min(points.length - 1, i + 1)] || p;
    const dx = next.x - p.x, dy = next.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const count = stroke.particle === "smoke" ? 2 : 3;
    for (let j = 0; j < count && index < maxParticles; j++, index++) {
      const r1 = seededRandom(index + 1 + i * 17);
      const r2 = seededRandom(index + 91 + i * 23);
      const side = (r1 - .5) * stroke.size * (stroke.particle === "confetti" ? 2.8 : 2.2);
      const along = (r2 - .5) * stroke.size * 1.8;
      const x = p.x + nx * side + (dx / len) * along;
      const y = p.y + ny * side + (dy / len) * along;
      const size = Math.max(2, stroke.size * (.25 + r1 * .55));
      const alpha = stroke.opacity * (.35 + r2 * .65);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (stroke.particle === "sparks") {
        ctx.strokeStyle = particleColor(stroke, index, alpha);
        ctx.lineWidth = Math.max(1, size * .28);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + nx * size * 2 + dx / len * size * 1.4, y + ny * size * 2 + dy / len * size * 1.4);
        ctx.stroke();
      } else if (stroke.particle === "stars") {
        ctx.fillStyle = particleColor(stroke, index, alpha);
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = size * 2;
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const angle = -Math.PI / 2 + k * Math.PI / 5;
          const radius = k % 2 ? size * .42 : size;
          const px = x + Math.cos(angle) * radius;
          const py = y + Math.sin(angle) * radius;
          k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      } else if (stroke.particle === "smoke") {
        ctx.fillStyle = `rgba(190, 198, 215, ${alpha * .42})`;
        ctx.shadowColor = "rgba(160,170,190,.25)";
        ctx.shadowBlur = size * 2.5;
        ctx.beginPath();
        ctx.arc(x, y - size * 1.3, size * (1 + r1), 0, Math.PI * 2);
        ctx.fill();
      } else if (stroke.particle === "fire") {
        const warm = index % 3 === 0 ? "#fff2a8" : index % 2 ? "#ff8a24" : "#ff3b1f";
        ctx.fillStyle = warm;
        ctx.shadowColor = "#ff5a1f";
        ctx.shadowBlur = size * 2.8;
        ctx.beginPath();
        ctx.moveTo(x, y + size);
        ctx.quadraticCurveTo(x - size * .9, y, x, y - size * (1.3 + r1));
        ctx.quadraticCurveTo(x + size * .9, y, x, y + size);
        ctx.fill();
      } else if (stroke.particle === "confetti") {
        ctx.fillStyle = particleColor(stroke, index, alpha);
        ctx.translate(x, y);
        ctx.rotate((r1 * Math.PI * 2));
        ctx.fillRect(-size * .7, -size * .25, size * 1.4, size * .5);
      }
      ctx.restore();
    }
  }
}

function beginStroke(point) {
  activeStroke = {
    tool,
    color,
    colorMode,
    gradient: gradientPreset,
    size: tool === "eraser" ? eraserSize : brushSize,
    effect: brushEffect,
    particle: particleEffect,
    opacity,
    shape: shapeMode,
    points: [point]
  };
  const activeLayer = layers.find(layer => layer.id === activeLayerId);
  if (!activeLayer) ensureLayers();
  strokes.push(activeStroke);
  redraw();
  const currentLayer = layers.find(layer => layer.id === activeLayerId);
  if (currentLayer && currentLayer.strokes !== strokes) currentLayer.strokes = strokes;
  redoStack = [];
  persistLayers();
  renderLayers();
  updateHistoryButtons();
}

function addPoint(point) {
  if (!activeStroke) return;
  if (activeStroke.shape !== "freehand") {
    activeStroke.points = [activeStroke.points[0], point];
    redraw();
    return;
  }
  const last = activeStroke.points[activeStroke.points.length - 1];
  if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 1.5) {
    activeStroke.points.push(point);
    redraw();
  }
}

function endStroke() {
  activeStroke = null;
  shapeStart = null;
}

function drawSmoothStroke(ctx, points) {
  if (points.length === 1) {
    const p = points[0];
    ctx.beginPath();
    ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
    ctx.stroke();
    return;
  }

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
  ctx.stroke();
}

function drawShape(ctx, stroke) {
  const a = stroke.points[0], b = stroke.points[stroke.points.length - 1];
  ctx.beginPath();
  if (stroke.shape === "line") {
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  } else if (stroke.shape === "rectangle") {
    ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
  } else if (stroke.shape === "circle") {
    const radius = Math.hypot(b.x - a.x, b.y - a.y);
    ctx.arc(a.x, a.y, radius, 0, Math.PI * 2);
  }
  ctx.stroke();
}

function redraw() {
  redrawAllLayers();
}

function updateHistoryButtons() {
  undoButton.disabled = strokes.length === 0;
  redoButton.disabled = redoStack.length === 0;
}

function undo() {
  endStroke();
  if (!strokes.length) return;
  redoStack.push(strokes.pop());
  const activeLayer = layers.find(layer => layer.id === activeLayerId);
  if (activeLayer) activeLayer.strokes = strokes;
  persistLayers();
  redrawAllLayers();
  updateHistoryButtons();
}

function redo() {
  endStroke();
  if (!redoStack.length) return;
  strokes.push(redoStack.pop());
  const activeLayer = layers.find(layer => layer.id === activeLayerId);
  if (activeLayer) activeLayer.strokes = strokes;
  persistLayers();
  redrawAllLayers();
  updateHistoryButtons();
}

function clearDrawing() {
  endStroke();
  if (!strokes.length) return;
  redoStack = strokes.slice();
  strokes = [];
  const activeLayer = layers.find(layer => layer.id === activeLayerId);
  if (activeLayer) activeLayer.strokes = strokes;
  persistLayers();
  redrawAllLayers();
  renderLayers();
  updateHistoryButtons();
}

function savePng() {
  endStroke();
  const rect = stage.getBoundingClientRect();
  const out = document.createElement("canvas");
  out.width = Math.round(rect.width * 2);
  out.height = Math.round(rect.height * 2);
  const ctx = out.getContext("2d");
  drawExportBackground(ctx, out.width, out.height);
  ctx.save();
  ctx.scale(2, 2);
  for (const layer of layers) {
    if (!layer.visible) continue;
    for (const stroke of layer.strokes) {
    if (!stroke.points.length) continue;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = stroke.size;
    ctx.globalAlpha = stroke.opacity ?? 1;
    ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
    if (stroke.tool === "eraser") {
      ctx.strokeStyle = "#000";
      ctx.fillStyle = "#000";
    } else {
      setStrokePaint(ctx, stroke);
    }
    if (stroke.tool !== "eraser") {
      if (stroke.particle && stroke.particle !== "none") {
        drawParticleEffect(ctx, stroke);
      }
      if (stroke.effect === "neon") {
        ctx.shadowColor = stroke.color;
        ctx.shadowBlur = Math.min(stroke.size * 2.6, 34);
      } else if (stroke.effect === "glow") {
        ctx.shadowColor = stroke.color;
        ctx.shadowBlur = Math.min(stroke.size * 1.35, 20);
      } else if (stroke.effect === "marker") {
        ctx.lineWidth = stroke.size * 1.35;
        ctx.globalAlpha *= 0.82;
      } else if (stroke.effect === "pencil") {
        ctx.lineWidth = Math.max(1.2, stroke.size * 0.55);
        ctx.globalAlpha *= 0.78;
      }
    }
    if (stroke.shape && stroke.shape !== "freehand" && stroke.points.length >= 2) {
      drawShape(ctx, stroke);
    } else if (stroke.points.length === 1) {
      const p = stroke.points[0];
      ctx.beginPath();
      ctx.arc(p.x, p.y, stroke.size / 2, 0, Math.PI * 2);
      ctx.fillStyle = stroke.tool === "eraser" ? "#000" : stroke.color;
      ctx.fill();
    } else {
      drawSmoothStroke(ctx, stroke.points);
    }
    ctx.restore();
    }
  }
  ctx.restore();
  const dataUrl = out.toDataURL("image/png");
  const link = document.createElement("a");
  link.download = "airdraw.png";
  link.href = dataUrl;
  link.click();
  saveToGallery(dataUrl);
}

function drawExportBackground(ctx, width, height) {
  if (backgroundMode === "transparent") return;
  ctx.save();
  if (backgroundMode === "black") {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, width, height);
  } else if (backgroundMode === "white") {
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height);
  } else if (backgroundMode === "custom" && customBackgroundImage) {
    const scale = Math.max(width / customBackgroundImage.naturalWidth, height / customBackgroundImage.naturalHeight);
    const dw = customBackgroundImage.naturalWidth * scale, dh = customBackgroundImage.naturalHeight * scale;
    ctx.drawImage(customBackgroundImage, (width - dw) / 2, (height - dh) / 2, dw, dh);
  }
  ctx.restore();
}

function drawCompositeFrame(ctx, canvasWidth, canvasHeight, includeCursor = true) {
  if (!video.videoWidth || !video.videoHeight) return false;
  const vw = video.videoWidth, vh = video.videoHeight;
  const scale = Math.max(canvasWidth / vw, canvasHeight / vh);
  const dw = vw * scale, dh = vh * scale;
  const ox = (canvasWidth - dw) / 2, oy = (canvasHeight - dh) / 2;
  ctx.save();
  drawExportBackground(ctx, canvasWidth, canvasHeight);
  if (backgroundMode === "camera") {
    ctx.translate(canvasWidth, 0);
    ctx.scale(-1, 1);
    ctx.globalAlpha = 0.76;
    ctx.drawImage(video, ox, oy, dw, dh);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.drawImage(drawCanvas, 0, 0, canvasWidth, canvasHeight);
  if (includeCursor) ctx.drawImage(cursorCanvas, 0, 0, canvasWidth, canvasHeight);
  return true;
}

function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

function takeSnapshot() {
  stopDrawingForUI();
  const rect = stage.getBoundingClientRect();
  const out = document.createElement("canvas");
  out.width = Math.max(640, Math.round(rect.width * 2));
  out.height = Math.max(360, Math.round(rect.height * 2));
  const ctx = out.getContext("2d");
  if (!drawCompositeFrame(ctx, out.width, out.height, false)) {
    showGesture("📸 Camera not ready");
    return;
  }
  const dataUrl = out.toDataURL("image/png", 1);
  downloadDataUrl(dataUrl, "airdraw-snapshot.png");
  saveToGallery(dataUrl);
  showGesture("📸 Snapshot saved");
}

function recordingLoop() {
  if (!recording || !recordingCanvas || !recordingCtx) return;
  drawCompositeFrame(recordingCtx, recordingCanvas.width, recordingCanvas.height, true);
  recordingFrameId = requestAnimationFrame(recordingLoop);
}

function chooseRecordingMime() {
  const types = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return types.find(type => window.MediaRecorder?.isTypeSupported?.(type)) || "";
}

function startRecording() {
  stopDrawingForUI();
  if (recording) return;
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    showGesture("🎥 Recording is not supported here");
    return;
  }
  if (!stream || video.readyState < 2) {
    showGesture("🎥 Start the camera first");
    return;
  }
  const rect = stage.getBoundingClientRect();
  recordingCanvas = document.createElement("canvas");
  recordingCanvas.width = Math.max(640, Math.round(rect.width * 1.5));
  recordingCanvas.height = Math.max(360, Math.round(rect.height * 1.5));
  recordingCtx = recordingCanvas.getContext("2d");
  const capture = recordingCanvas.captureStream(30);
  const mimeType = chooseRecordingMime();
  try {
    mediaRecorder = mimeType
      ? new MediaRecorder(capture, { mimeType, videoBitsPerSecond: 7000000 })
      : new MediaRecorder(capture);
  } catch {
    showGesture("🎥 Could not start recording");
    recordingCanvas = null;
    recordingCtx = null;
    return;
  }
  recordingChunks = [];
  mediaRecorder.ondataavailable = event => {
    if (event.data?.size) recordingChunks.push(event.data);
  };
  mediaRecorder.onstop = () => {
    const type = mediaRecorder?.mimeType || mimeType || "video/webm";
    const blob = new Blob(recordingChunks, { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = "airdraw-session.webm";
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    recordingChunks = [];
  };
  mediaRecorder.start(1000);
  recording = true;
  recordButton.textContent = "■";
  recordButton.title = "Stop recording";
  recordButton.classList.add("recording");
  showGesture("🔴 Recording started");
  recordingLoop();
}

function stopRecording() {
  if (!recording || !mediaRecorder) return;
  recording = false;
  cancelAnimationFrame(recordingFrameId);
  mediaRecorder.stop();
  recordButton.textContent = "●";
  recordButton.title = "Record session";
  recordButton.classList.remove("recording");
  showGesture("🎥 Recording saved");
  mediaRecorder = null;
  recordingCanvas = null;
  recordingCtx = null;
}

function openAIUnderstanding() {
  stopDrawingForUI();
  const key = localStorage.getItem(GEMINI_KEY_STORAGE) || "";
  const input = document.querySelector("#aiApiKey");
  if (input) input.value = key;
  const output = document.querySelector("#aiOutput");
  const status = document.querySelector("#aiStatus");
  if (output) output.value = "";
  if (status) status.textContent = key
    ? "Ready. Ask AI to identify the drawing, read handwriting, or explain it."
    : "Add your Gemini API key. It is stored only in this browser.";
  document.querySelector("#aiModal").hidden = false;
}

function closeAIUnderstanding() {
  document.querySelector("#aiModal").hidden = true;
}

function canvasToJpegData() {
  const source = document.createElement("canvas");
  const rect = stage.getBoundingClientRect();
  source.width = Math.max(900, Math.round(rect.width * 1.5));
  source.height = Math.max(600, Math.round(rect.height * 1.5));
  const ctx = source.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, source.width, source.height);
  ctx.save();
  ctx.scale(source.width / Math.max(rect.width, 1), source.height / Math.max(rect.height, 1));
  for (const layer of layers) {
    if (!layer.visible || layer.snapshot) continue;
    drawStrokes(ctx, layer.strokes);
  }
  ctx.restore();
  return source.toDataURL("image/jpeg", 0.9).split(",")[1];
}

async function analyzeDrawingWithAI() {
  const keyInput = document.querySelector("#aiApiKey");
  const promptInput = document.querySelector("#aiPrompt");
  const output = document.querySelector("#aiOutput");
  const status = document.querySelector("#aiStatus");
  const key = (keyInput?.value || "").trim();
  if (!key) {
    status.textContent = "Enter your Gemini API key first.";
    keyInput?.focus();
    return;
  }
  if (!layers.some(layer => layer.strokes?.some(stroke => stroke.points?.length && stroke.tool !== "eraser"))) {
    status.textContent = "Draw something first.";
    return;
  }

  localStorage.setItem(GEMINI_KEY_STORAGE, key);
  const button = document.querySelector("#analyzeAIButton");
  if (button) button.disabled = true;
  status.textContent = "AI is looking at your drawing…";
  output.value = "";

  try {
    const imageData = canvasToJpegData();
    const prompt = (promptInput?.value || "").trim() ||
      "Understand this AirDraw canvas. Identify what is drawn, read any visible handwritten text, explain the drawing briefly, and distinguish text from shapes or objects. If handwriting is uncertain, say so instead of guessing.";

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key
        },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: prompt },
              { inline_data: { mime_type: "image/jpeg", data: imageData } }
            ]
          }]
        })
      }
    );

    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "Gemini API request failed.");
    const text = data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .filter(Boolean)
      .join("\n")
      .trim();
    if (!text) throw new Error("The AI returned no text.");
    output.value = text;
    status.textContent = "AI analysis complete.";
  } catch (error) {
    console.error("AirDraw AI error:", error);
    status.textContent = "AI error: " + (error?.message || "Could not analyze the drawing.");
  } finally {
    if (button) button.disabled = false;
  }
}

function openTextRecognition() {
  stopDrawingForUI();
  recognizedText.value = "";
  textStatus.textContent = "Draw a letter or word with ☝️, then press Recognize.";
  textModal.hidden = false;
}

function closeTextRecognition() {
  textModal.hidden = true;
}

function renderWritingCanvas() {
  const source = document.createElement("canvas");
  const rect = stage.getBoundingClientRect();
  source.width = Math.max(900, Math.round(rect.width * 2));
  source.height = Math.max(500, Math.round(rect.height * 2));
  const ctx = source.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, source.width, source.height);
  ctx.save();
  ctx.scale(2, 2);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    if (!stroke.points?.length || stroke.tool === "eraser") continue;
    ctx.save();
    ctx.lineWidth = Math.max(stroke.size, 8);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#111";
    ctx.shadowBlur = 0;
    if (stroke.shape && stroke.shape !== "freehand" && stroke.points.length >= 2) {
      drawShape(ctx, stroke);
    } else if (stroke.points.length === 1) {
      const p = stroke.points[0];
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(stroke.size / 2, 4), 0, Math.PI * 2);
      ctx.fillStyle = "#111";
      ctx.fill();
    } else {
      drawSmoothStroke(ctx, stroke.points);
    }
    ctx.restore();
  }
  ctx.restore();
  return source;
}

async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  if (tesseractLoading) return tesseractLoading;
  tesseractLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.crossOrigin = "anonymous";
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error("Text recognition library could not be loaded."));
    document.head.appendChild(script);
  });
  return tesseractLoading;
}

async function recognizeAirText() {
  stopDrawingForUI();
  if (!strokes.some(stroke => stroke.points?.length && stroke.tool !== "eraser")) {
    textStatus.textContent = "Draw something first.";
    return;
  }
  recognizeTextButton.disabled = true;
  textStatus.textContent = "Loading handwriting recognition…";
  try {
    const Tesseract = await loadTesseract();
    const source = renderWritingCanvas();
    const result = await Tesseract.recognize(source, "eng", {
      logger: info => {
        if (info.status === "recognizing text" && typeof info.progress === "number") {
          textStatus.textContent = "Recognizing… " + Math.round(info.progress * 100) + "%";
        } else if (info.status) {
          textStatus.textContent = "Recognizing… " + info.status;
        }
      }
    });
    const text = (result?.data?.text || "").replace(/\s+/g, " ").trim();
    recognizedText.value = text || "No text recognized. Try larger, clearer block letters.";
    textStatus.textContent = text ? "Recognition complete — you can edit or copy the result." : "No text recognized. Try larger, clearer block letters.";
  } catch (error) {
    console.error("Air writing recognition error:", error);
    textStatus.textContent = "Recognition could not load. Check your internet connection and try again.";
  } finally {
    recognizeTextButton.disabled = false;
  }
}

renderRecentColors();

function updateSizeDisplay() {
  sizeDisplay.textContent = brushSize;
  if (sizeSlider) sizeSlider.value = brushSize;
}

function updateOpacityDisplay() {
  const value = Math.round(opacity * 100);
  opacityDisplay.textContent = value;
  if (opacitySlider) opacitySlider.value = value;
}

function changeOpacity(delta) {
  stopDrawingForUI();
  opacity = Math.max(0.1, Math.min(1, opacity + delta));
  updateOpacityDisplay();
}

function cycleShape() {
  stopDrawingForUI();
  shapeMode = SHAPES[(SHAPES.indexOf(shapeMode) + 1) % SHAPES.length];
  const labels = {freehand:"○", line:"╱", rectangle:"□", circle:"◯"};
  shapeButton.textContent = labels[shapeMode];
  shapeButton.title = `Shape: ${shapeMode}`;
  showGesture(`Shape: ${shapeMode}`);
}

function showGesture(message) {
  gestureToast.textContent = message;
  gestureToast.hidden = false;
  clearTimeout(showGesture.timer);
  showGesture.timer = setTimeout(() => gestureToast.hidden = true, 900);
}

function changeBrushSize(delta) {
  stopDrawingForUI();
  brushSize = Math.max(2, Math.min(32, brushSize + delta));
  updateSizeDisplay();
  redraw();
}

function cycleEffect() {
  stopDrawingForUI();
  const index = EFFECTS.indexOf(brushEffect);
  brushEffect = EFFECTS[(index + 1) % EFFECTS.length];
  const labels = {normal:"•", glow:"◌", neon:"✦", marker:"▰", pencil:"✎"};
  effectButton.textContent = labels[brushEffect];
  effectButton.title = `Brush style: ${brushEffect}`;
  effectButton.setAttribute("aria-label", `Brush style: ${brushEffect}`);
}

function cycleParticleEffect() {
  stopDrawingForUI();
  const index = PARTICLE_EFFECTS.indexOf(particleEffect);
  particleEffect = PARTICLE_EFFECTS[(index + 1) % PARTICLE_EFFECTS.length];
  const labels = {none:"•", sparks:"✧", stars:"★", smoke:"☁", fire:"🔥", confetti:"🎉"};
  particleButton.textContent = labels[particleEffect];
  particleButton.title = particleEffect === "none" ? "Particle effects: Off" : "Particle effect: " + particleEffect;
  particleButton.setAttribute("aria-label", particleButton.title);
  showGesture(particleEffect === "none" ? "Particles off" : "✨ " + particleEffect + " particles");
  redraw();
}

function galleryItems() {
  try {
    return JSON.parse(localStorage.getItem("airdraw-gallery") || "[]");
  } catch {
    return [];
  }
}

function saveToGallery(dataUrl) {
  const items = galleryItems();
  items.unshift({ id: Date.now(), name: "Drawing " + new Date().toLocaleString(), dataUrl });
  try {
    localStorage.setItem("airdraw-gallery", JSON.stringify(items.slice(0, 12)));
  } catch {
    // Storage can be full; PNG download still succeeds.
  }
}

function renderGallery() {
  const items = galleryItems();
  galleryGrid.innerHTML = "";
  if (!items.length) {
    galleryGrid.innerHTML = '<div class="gallery-empty">No saved drawings yet.<br>Save a drawing to add it here.</div>';
    return;
  }
  items.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "gallery-card";
    card.innerHTML = `<img src="${item.dataUrl}" alt="Saved AirDraw drawing"><div class="gallery-card-title">${item.name || "Saved drawing"}</div><div class="gallery-card-actions"><button data-index="${index}" class="gallery-download">Download</button><button data-load="${index}" class="gallery-load">Load</button><button data-remove="${index}" class="gallery-delete">Delete</button></div>`;
    galleryGrid.appendChild(card);
  });
}

function openGallery() {
  stopDrawingForUI();
  renderGallery();
  galleryModal.hidden = false;
}

function closeGallery() {
  galleryModal.hidden = true;
}

galleryGrid.addEventListener("click", event => {
  const download = event.target.closest("[data-index]");
  const remove = event.target.closest("[data-remove]");
  const load = event.target.closest("[data-load]");
  const items = galleryItems();
  if (download) {
    const item = items[Number(download.dataset.index)];
    if (!item) return;
    const link = document.createElement("a");
    link.download = "airdraw-gallery.png";
    link.href = item.dataUrl;
    link.click();
  }
  if (load) {
    const item = items[Number(load.dataset.load)];
    if (item?.dataUrl) {
      const image = new Image();
      image.onload = () => {
        const activeLayer = layers.find(layer => layer.id === activeLayerId);
        if (!activeLayer) return;
        activeLayer.strokes = [];
        const scaleX = stage.clientWidth / image.naturalWidth;
        const scaleY = stage.clientHeight / image.naturalHeight;
        activeLayer.strokes.push({
          tool:"brush", color:"#ffffff", colorMode:"solid", gradient:"sunset",
          size:1, effect:"normal", particle:"none", opacity:1, shape:"freehand",
          points:[{x:stage.clientWidth/2,y:stage.clientHeight/2}]
        });
        // Gallery images are raster snapshots; preserve them as a background layer.
        activeLayer.snapshot = item.dataUrl;
        activeLayer.snapshotScale = {x:scaleX,y:scaleY};
        persistLayers();
        redrawAllLayers();
        closeGallery();
        showGesture("🖼️ Drawing loaded");
      };
      image.src = item.dataUrl;
    }
  }
  if (remove) {
    items.splice(Number(remove.dataset.remove), 1);
    localStorage.setItem("airdraw-gallery", JSON.stringify(items));
    renderGallery();
  }
});

function fingerExtended(hand, tip, pip, wrist = 0) {
  return distance(hand[tip], hand[wrist]) > distance(hand[pip], hand[wrist]) * 1.12;
}

function isPinch(hand) {
  const palm = Math.max(distance(hand[0], hand[9]), 0.001);
  return distance(hand[4], hand[8]) / palm < 0.42;
}

function isIndexOnly(hand) {
  // Be tolerant of natural finger movement: the index being extended is
  // enough to draw. Dedicated gestures are checked before this function.
  return fingerExtended(hand, 8, 6);
}

function isThumbUpGesture(hand) {
  const wrist = hand[0], thumb = hand[4];
  const palm = Math.max(distance(wrist, hand[9]), 0.001);
  const otherFingersDown =
    !fingerExtended(hand, 8, 6) &&
    !fingerExtended(hand, 12, 10) &&
    !fingerExtended(hand, 16, 14) &&
    !fingerExtended(hand, 20, 18);
  return thumb.y < hand[3].y &&
    thumb.y < hand[6].y &&
    distance(thumb, wrist) / palm > 1.25 &&
    otherFingersDown;
}

function handleGesture(hand) {
  const now = performance.now();

  if (isPinch(hand)) {
    return "pinch";
  }

  if (isFist(hand)) {
    return "fist";
  }

  if (now < gestureCooldownUntil) return lastGestureName;

  if (isThumbUpGesture(hand)) {
    stopDrawingForUI();
    undo();
    showGesture("👍 Undo");
    gestureCooldownUntil = now + 900;
    lastGestureName = "thumb";
    return "thumb";
  }

  if (isIndexOnly(hand)) {
    lastGestureName = "index";
    return "index";
  }

  lastGestureName = "";
  return "other";
}

function processResults(results){
  cursorCtx.clearRect(0,0,stage.clientWidth,stage.clientHeight);
  const hs=results?.multiHandLandmarks || results?.landmarks || []; if(hs.length)setStatus(hs.length>1?"Two hands detected":"Hand detected",true);else if(trackingReady)setStatus("Tracking ready — show your hand",true);
  if(!hs.length){smoothedPoint=null;controlHand=null;endStroke();clearAirControlHover();drawPaused=false;lastGestureName="";return;}
  let drawHand=hs[0];controlHand=null;if(twoHandMode&&hs.length>1){controlHand=hs[1];applyTwoHandControls(controlHand);}
  const raw=canvasPoint(drawHand[8]);
  // Always track the index fingertip when a hand is visible. Gesture recognition
  // only decides whether drawing is allowed; it must not hide the tracking cursor.
  smoothedPoint=raw;const control=getAirControlAt(smoothedPoint);updateAirControlHover(control);
  const gesture=handleGesture(drawHand),selecting=gesture==="pinch",selected=selecting?updateAirControlDwell(control):false;drawCursor(smoothedPoint,selecting||Boolean(control));
  if(!selecting){clearAirControlHover();dwellControl=null;dwellStartedAt=0;selectedAirControl=null;}
  if(gesture==="fist"||gesture==="thumb"){endStroke();drawPaused=true;return;}
  drawPaused=false;
  if(selecting||selected){endStroke();return;}
  // The fingertip cursor is already produced by the landmark model. Do not
  // require a second, fragile gesture classifier before drawing; that was
  // causing the cursor to move while strokes never started.
  if(uiInteractionLock){endStroke();smoothedPoint=null;uiInteractionLock=false;return;}
  if(!activeStroke)beginStroke(smoothedPoint);else addPoint(smoothedPoint);
}
let handLandmarker = null;
let handLandmarkerModule = null;
let lastVideoTime = -1;
let trackingFrameCount = 0;
let trackingErrorCount = 0;

async function loadHandLandmarkerLibrary() {
  if (handLandmarkerModule) return handLandmarkerModule;
  const module = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs");
  if (!module.FilesetResolver || !module.HandLandmarker) {
    throw new Error("MediaPipe Hand Landmarker library loaded without the required APIs.");
  }
  handLandmarkerModule = module;
  return module;
}

function closeHands() {
  if (!handLandmarker) return;
  try {
    if (typeof handLandmarker.close === "function") handLandmarker.close();
  } catch (error) {
    console.warn("Could not close Hand Landmarker cleanly:", error);
  }
  handLandmarker = null;
  hands = null;
  trackingReady = false;
  lastVideoTime = -1;
}

async function createHandLandmarker(delegate) {
  const { FilesetResolver, HandLandmarker } = await loadHandLandmarkerLibrary();
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm"
  );

  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.35,
    minHandPresenceConfidence: 0.35,
    minTrackingConfidence: 0.35
  });
}

async function startHandTracking() {
  let lastError = null;

  // GPU is faster on supported phones, but CPU is the reliable fallback.
  for (const delegate of ["GPU", "CPU"]) {
    closeHands();
    try {
      showLoading(delegate === "GPU"
        ? "Starting accelerated hand tracking…"
        : "Starting compatible hand tracking…");

      handLandmarker = await withTimeout(
        createHandLandmarker(delegate),
        30000,
        "Hand tracking model timed out."
      );

      trackingReady = true;
      trackingFrameCount = 0;
      trackingErrorCount = 0;
      lastVideoTime = -1;

      // Verify the model actually produces a result before declaring it ready.
      await processFrame(true);
      return;
    } catch (error) {
      lastError = error;
      console.error("Hand Landmarker initialization failed:", delegate, error);
      closeHands();
    }
  }

  throw lastError || new Error("Hand tracking could not be initialized.");
}

function processLandmarkerResults(result) {
  const handsFound = result?.landmarks || [];
  processResults({ multiHandLandmarks: handsFound });
}

async function processFrame(force = false) {
  if (!handLandmarker || !stream || video.readyState < 2) return false;

  const currentVideoTime = Number.isFinite(video.currentTime) ? video.currentTime : -1;
  if (!force && currentVideoTime >= 0 && currentVideoTime === lastVideoTime) return false;

  try {
    const timestamp = Math.max(
      performance.now(),
      (lastVideoTime < 0 ? 0 : lastVideoTime + 0.001)
    );
    const result = handLandmarker.detectForVideo(video, timestamp);
    lastVideoTime = currentVideoTime;
    trackingFrameCount += 1;
    processLandmarkerResults(result);
    return true;
  } catch (error) {
    trackingErrorCount += 1;
    console.error("Hand tracking frame error:", error);
    if (trackingErrorCount >= 8) {
      setStatus("Tracking error — retrying…", true);
    }
    return false;
  }
}

function loop() {
  processFrame();
  animationId = requestAnimationFrame(loop);
}

async function start() {
  if (trackingStarting) return;
  if (started && stream && trackingReady) return;

  if (!started) {
    started = true;
    startButton.disabled = true;
    welcome.hidden = true;
    showLoading("Requesting camera…");
    setStatus("Requesting camera…");
  }

  try {
    if (!window.isSecureContext && location.hostname !== "localhost") {
      throw new Error("Camera access requires HTTPS. Open the GitHub Pages address.");
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not provide camera access.");
    }

    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "user" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
      } catch (cameraError) {
        if (cameraError?.name === "OverconstrainedError" || cameraError?.name === "NotReadableError") {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw cameraError;
        }
      }

      video.srcObject = stream;
      video.muted = true;
      video.defaultMuted = true;
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute("muted", "");
      video.setAttribute("autoplay", "");
      video.setAttribute("playsinline", "");
      await new Promise((resolve, reject) => {
        if (video.readyState >= 1 && video.videoWidth > 0) return resolve();
        const timer = setTimeout(() => reject(new Error("Camera video did not become ready.")), 8000);
        video.addEventListener("loadedmetadata", () => { clearTimeout(timer); resolve(); }, { once: true });
        video.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Camera video failed to load.")); }, { once: true });
      });
      await video.play();
      resizeCanvases();

      hideLoading();
      hint.hidden = false;
      setStatus("Camera live", true);
    }

    if (!trackingReady) {
      trackingStarting = true;
      processing = false;
      showLoading("Loading hand tracking model…");
      try {
        await startHandTracking();
        hideLoading();
        hint.hidden = false;
        setStatus("Hand tracking ready — show your hand", true);
        startButton.textContent = "AirDraw running";
        startButton.disabled = true;
      } catch (trackingError) {
        console.error("Hand tracking startup error:", trackingError);
        closeHands();
        hideLoading();
        hint.hidden = false;
        setStatus("Camera live — tracking unavailable", true);
        startButton.textContent = "Retry tracking";
        startButton.disabled = false;
        started = true;
        return;
      } finally {
        trackingStarting = false;
      }
    }

    cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(loop);
  } catch (error) {
    console.error("AirDraw camera error:", error);
    cancelAnimationFrame(animationId);

    if (error?.name === "NotAllowedError") {
      welcomeMessage.textContent = "Camera permission was blocked. Allow camera access for this site, then tap Start AirDraw again.";
    } else if (error?.name === "NotFoundError") {
      welcomeMessage.textContent = "No camera was found on this device.";
    } else if (error?.name === "NotReadableError") {
      welcomeMessage.textContent = "The camera is busy or unavailable. Close other apps using the camera, then try again.";
    } else if (error?.name === "SecurityError") {
      welcomeMessage.textContent = "The browser blocked camera access. Open AirDraw directly from its HTTPS GitHub Pages address.";
    } else if (error?.name === "OverconstrainedError") {
      welcomeMessage.textContent = "The requested camera mode is unavailable. Tap Start AirDraw to retry with the device camera.";
    } else {
      welcomeMessage.textContent = `Could not start the camera: ${error?.message || "unknown error"}`;
    }

    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    video.srcObject = null;
    hideLoading();
    welcome.hidden = false;
    startButton.textContent = "Start AirDraw";
    startButton.disabled = false;
    started = false;
    trackingReady = false;
    trackingStarting = false;
    closeHands();
    setStatus("Camera unavailable");
  }
}

function stop() {
  cancelAnimationFrame(animationId);
  closeHands();
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
  if (video) video.srcObject = null;
  trackingReady = false;
  trackingStarting = false;
  setStatus("Camera off");
}

function stopDrawingForUI() {
  // Physical touch/mouse clicks on the toolbar must also break the stroke.
  endStroke();
  smoothedPoint = null;
  uiInteractionLock = true;
}

document.querySelectorAll(".tool").forEach(button => {
  button.addEventListener("click", () => {
    stopDrawingForUI();
    document.querySelectorAll(".tool").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    tool = button.dataset.tool;
  });
});

document.querySelectorAll(".color").forEach(button => {
  button.addEventListener("click", () => {
    stopDrawingForUI();
    document.querySelectorAll(".color").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    setSolidColor(button.dataset.color, false);
    showGesture("🎨 " + button.title);
    if (tool === "eraser") document.querySelector('[data-tool="brush"]').click();
  });
});

customColorButton?.addEventListener("click", () => {
  stopDrawingForUI();
  customColorInput?.click();
});
customColorInput?.addEventListener("input", event => {
  setSolidColor(event.target.value);
  if (tool === "eraser") document.querySelector('[data-tool="brush"]').click();
});
rainbowColorButton?.addEventListener("click", setRainbowMode);
gradientColorButton?.addEventListener("click", cycleGradient);
syncColorModeButtons();

snapshotButton.addEventListener("click", takeSnapshot);
recordButton.addEventListener("click", () => recording ? stopRecording() : startRecording());
textButton.addEventListener("click", openTextRecognition);
document.querySelector("#aiButton")?.addEventListener("click", openAIUnderstanding);
document.querySelector("#aiClose")?.addEventListener("click", closeAIUnderstanding);
document.querySelector("#analyzeAIButton")?.addEventListener("click", analyzeDrawingWithAI);
document.querySelector("#aiCloseSecondary")?.addEventListener("click", closeAIUnderstanding);
document.querySelector("#aiModal")?.addEventListener("click", event => {
  if (event.target.id === "aiModal") closeAIUnderstanding();
});
textClose.addEventListener("click", closeTextRecognition);
recognizeTextButton.addEventListener("click", recognizeAirText);
document.getElementById("copyTextButton").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(recognizedText.value);
    showGesture("📋 Text copied");
  } catch {
    recognizedText.select();
    document.execCommand("copy");
    showGesture("📋 Text copied");
  }
});
textModal.addEventListener("click", event => {
  if (event.target === textModal) closeTextRecognition();
});
startButton.addEventListener("click", start);
undoButton.addEventListener("click", () => { stopDrawingForUI(); undo(); });
redoButton.addEventListener("click", () => { stopDrawingForUI(); redo(); });
clearButton.addEventListener("click", () => { stopDrawingForUI(); clearDrawing(); });
saveButton.addEventListener("click", () => { stopDrawingForUI(); savePng(); });
opacityUpButton.addEventListener("click", () => changeOpacity(0.1));
opacitySlider?.addEventListener("input", event => {
  stopDrawingForUI();
  opacity = Number(event.target.value) / 100;
  updateOpacityDisplay();
});
shapeButton.addEventListener("click", cycleShape);
symmetryButton?.addEventListener("click",toggleSymmetry);gridButton?.addEventListener("click",toggleGrid);twoHandButton?.addEventListener("click",toggleTwoHand);ar3dButton?.addEventListener("click",toggleAR3D);updateModeButtons();
updateOpacityDisplay();
sizeSlider?.addEventListener("input", event => {
  stopDrawingForUI();
  brushSize = Number(event.target.value);
  updateSizeDisplay();
});
sizeUpButton.addEventListener("click", () => changeBrushSize(2));
effectButton.addEventListener("click", cycleEffect);
particleButton.addEventListener("click", cycleParticleEffect);
galleryButton.addEventListener("click", openGallery);
addLayerButton?.addEventListener("click", addLayer);
galleryClose.addEventListener("click", closeGallery);
galleryModal.addEventListener("click", event => {
  if (event.target === galleryModal) closeGallery();
});
updateSizeDisplay();

window.addEventListener("resize", resizeCanvases);
window.addEventListener("beforeunload", () => { try { if (recording) mediaRecorder?.stop(); } catch {} stop(); });

window.addEventListener("DOMContentLoaded", () => {
  loadLayers();
  setTimeout(() => start(), 250);
});
