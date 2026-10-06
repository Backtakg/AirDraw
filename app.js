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
const sizeDownButton = document.querySelector("#sizeDownButton");
const sizeUpButton = document.querySelector("#sizeUpButton");
const sizeDisplay = document.querySelector("#sizeDisplay");
const effectButton = document.querySelector("#effectButton");
const galleryButton = document.querySelector("#galleryButton");
const galleryModal = document.querySelector("#galleryModal");
const galleryClose = document.querySelector("#galleryClose");
const galleryGrid = document.querySelector("#galleryGrid");
const opacityDownButton = document.querySelector("#opacityDownButton");
const opacityUpButton = document.querySelector("#opacityUpButton");
const opacityDisplay = document.querySelector("#opacityDisplay");
const shapeButton = document.querySelector("#shapeButton");
const gestureToast = document.querySelector("#gestureToast");

let hands = null;
let stream = null;
let trackingReady = false;
let trackingStarting = false;
let animationId = 0;
let processing = false;
let tool = "brush";
let color = "#ffffff";
let brushSize = 7;
let brushEffect = "neon";
let opacity = 1;
let shapeMode = "freehand";
let shapeStart = null;
let gestureCooldownUntil = 0;
const EFFECTS = ["neon", "normal", "soft"];
const SHAPES = ["freehand", "line", "rectangle", "circle"];
let eraserSize = 38;
let strokes = [];
let redoStack = [];
let activeStroke = null;
let smoothedPoint = null;
let started = false;
let selectedAirControl = null;
let fistHeld = false;
let drawPaused = false;
let uiInteractionLock = false;

function setStatus(text, live = false) {
  statusText.textContent = text;
  statusPill.classList.toggle("live", live);
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
const CONTROL_DWELL_MS = 650;

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

function drawCursor(point, active) {
  const rect = stage.getBoundingClientRect();
  cursorCtx.clearRect(0, 0, rect.width, rect.height);
  if (!point) return;
  const size = tool === "eraser" ? eraserSize : brushSize;
  cursorCtx.beginPath();
  cursorCtx.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
  cursorCtx.fillStyle = active
    ? (tool === "eraser" ? "rgba(255,255,255,.12)" : color + "33")
    : "rgba(255,255,255,.05)";
  cursorCtx.fill();
  cursorCtx.lineWidth = 2;
  cursorCtx.strokeStyle = active
    ? (tool === "eraser" ? "#fff" : color)
    : "rgba(255,255,255,.55)";
  cursorCtx.stroke();
}

function beginStroke(point) {
  activeStroke = {
    tool,
    color,
    size: tool === "eraser" ? eraserSize : brushSize,
    effect: brushEffect,
    opacity,
    shape: shapeMode,
    points: [point]
  };
  strokes.push(activeStroke);
  redoStack = [];
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
  const rect = stage.getBoundingClientRect();
  drawCtx.clearRect(0, 0, rect.width, rect.height);
  for (const stroke of strokes) {
    if (!stroke.points.length) continue;
    drawCtx.save();
    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";
    drawCtx.lineWidth = stroke.size;
    drawCtx.globalAlpha = stroke.opacity ?? 1;
    if (stroke.tool === "eraser") {
      drawCtx.globalCompositeOperation = "destination-out";
      drawCtx.strokeStyle = "#000";
    } else {
      drawCtx.globalCompositeOperation = "source-over";
      drawCtx.strokeStyle = stroke.color;
      if (stroke.effect === "neon") {
        drawCtx.shadowColor = stroke.color;
        drawCtx.shadowBlur = Math.min(stroke.size * 2.2, 28);
      } else if (stroke.effect === "soft") {
        drawCtx.shadowColor = stroke.color;
        drawCtx.shadowBlur = Math.min(stroke.size * 0.9, 12);
      } else {
        drawCtx.shadowBlur = 0;
      }
    }
    if (stroke.shape && stroke.shape !== "freehand" && stroke.points.length >= 2) {
      drawShape(drawCtx, stroke);
    } else if (stroke.points.length === 1) {
      const p = stroke.points[0];
      drawCtx.beginPath();
      drawCtx.arc(p.x, p.y, stroke.size / 2, 0, Math.PI * 2);
      drawCtx.fillStyle = stroke.tool === "eraser" ? "#000" : stroke.color;
      drawCtx.fill();
    } else {
      drawSmoothStroke(drawCtx, stroke.points);
    }
    drawCtx.restore();
  }
}

function updateHistoryButtons() {
  undoButton.disabled = strokes.length === 0;
  redoButton.disabled = redoStack.length === 0;
}

function undo() {
  endStroke();
  if (!strokes.length) return;
  redoStack.push(strokes.pop());
  redraw();
  updateHistoryButtons();
}

function redo() {
  endStroke();
  if (!redoStack.length) return;
  strokes.push(redoStack.pop());
  redraw();
  updateHistoryButtons();
}

function clearDrawing() {
  endStroke();
  if (!strokes.length) return;
  redoStack = strokes.slice();
  strokes = [];
  redraw();
  updateHistoryButtons();
}

function savePng() {
  endStroke();
  const rect = stage.getBoundingClientRect();
  const out = document.createElement("canvas");
  out.width = Math.round(rect.width * 2);
  out.height = Math.round(rect.height * 2);
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#05070d";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.save();
  ctx.scale(2, 2);
  for (const stroke of strokes) {
    if (!stroke.points.length) continue;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = stroke.size;
    ctx.globalAlpha = stroke.opacity ?? 1;
    ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = stroke.tool === "eraser" ? "#000" : stroke.color;
    if (stroke.tool !== "eraser") {
      ctx.shadowColor = stroke.color;
      ctx.shadowBlur = Math.min(stroke.size * 2.2, 28);
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
  ctx.restore();
  const dataUrl = out.toDataURL("image/png");
  const link = document.createElement("a");
  link.download = "airdraw.png";
  link.href = dataUrl;
  link.click();
  saveToGallery(dataUrl);
}

function updateSizeDisplay() {
  sizeDisplay.textContent = brushSize;
}

function updateOpacityDisplay() {
  opacityDisplay.textContent = Math.round(opacity * 100);
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
  effectButton.textContent = brushEffect === "neon" ? "✦" : brushEffect === "normal" ? "•" : "◌";
  effectButton.title = `Effect: ${brushEffect}`;
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
  items.unshift({ id: Date.now(), dataUrl });
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
    card.innerHTML = `<img src="${item.dataUrl}" alt="Saved AirDraw drawing"><div class="gallery-card-actions"><button data-index="${index}" class="gallery-download">Download</button><button data-remove="${index}" class="gallery-delete">Delete</button></div>`;
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
  const items = galleryItems();
  if (download) {
    const item = items[Number(download.dataset.index)];
    if (!item) return;
    const link = document.createElement("a");
    link.download = "airdraw-gallery.png";
    link.href = item.dataUrl;
    link.click();
  }
  if (remove) {
    items.splice(Number(remove.dataset.remove), 1);
    localStorage.setItem("airdraw-gallery", JSON.stringify(items));
    renderGallery();
  }
});

function handleGesture(hand) {
  const now = performance.now();
  if (now < gestureCooldownUntil) return;
  // Thumb-up: undo. Two-finger V: cycle brush effect.
  const wrist = hand[0], thumb = hand[4], index = hand[8], middle = hand[12];
  const palm = Math.max(distance(wrist, hand[9]), 0.001);
  const thumbUp = thumb.y < hand[3].y && thumb.y < hand[6].y && distance(thumb, wrist) / palm > 1.25;
  const indexUp = distance(index, wrist) / palm > 1.45;
  const middleUp = distance(middle, wrist) / palm > 1.45;
  if (thumbUp && !indexUp && !middleUp) {
    stopDrawingForUI(); undo(); showGesture("Gesture: Undo"); gestureCooldownUntil = now + 900; return;
  }
  if (indexUp && middleUp) {
    stopDrawingForUI(); cycleEffect(); showGesture("Gesture: Effect changed"); gestureCooldownUntil = now + 900;
  }
}

function processResults(results) {
  cursorCtx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);
  const hand = results.multiHandLandmarks?.[0];
  if (hand) setStatus("Hand detected", true);
  else if (trackingReady) setStatus("Tracking ready — show your hand", true);

  if (!hand) {
    smoothedPoint = null;
    endStroke();
    clearAirControlHover();
    return;
  }

  const raw = canvasPoint(hand[8]);
  smoothedPoint = raw;

  const control = getAirControlAt(smoothedPoint);
  updateAirControlHover(control);

  const fist = isFist(hand);
  if (!getAirControlAt(smoothedPoint)) handleGesture(hand);
  if (fist) {
    fistHeld = true;
    drawPaused = true;
    endStroke();
  } else if (fistHeld) {
    fistHeld = false;
    drawPaused = false;
  }

  const selected = updateAirControlDwell(control);
  drawCursor(smoothedPoint, Boolean(control));

  // A control interaction is a strict pen-up zone. After a control has
  // been selected, keep drawing disabled until the fingertip has completely
  // left the controls. This prevents the next tracking frame from joining
  // the old stroke to the newly selected tool/color.
  if (control || drawPaused || fist) {
    endStroke();
    return;
  }

  if (uiInteractionLock) {
    endStroke();
    smoothedPoint = null;
    uiInteractionLock = false;
    return;
  }

  if (!activeStroke) beginStroke(smoothedPoint);
  else addPoint(smoothedPoint);

  if (selected) clearAirControlHover();
}

function loadHandsLibrary() {
  if (window.Hands) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-mediapipe-hands]');
    if (existing) {
      if (existing.dataset.loaded === "true" && window.Hands) {
        resolve();
        return;
      }
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("Hand tracking library could not be loaded.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js";
    script.crossOrigin = "anonymous";
    script.dataset.mediapipeHands = "true";
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("Hand tracking library could not be loaded. Check your internet connection."));
    };
    document.head.appendChild(script);
  });
}

function closeHands() {
  if (!hands) return;
  try {
    if (typeof hands.close === "function") hands.close();
  } catch (error) {
    console.warn("Could not close MediaPipe Hands cleanly:", error);
  }
  hands = null;
  trackingReady = false;
}

function setupHands(assetBase) {
  if (!window.Hands) throw new Error("Hand tracking library did not load.");

  hands = new window.Hands({
    locateFile: file => assetBase + file
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.55,
    minTrackingConfidence: 0.55
  });

  hands.onResults(processResults);
}

async function startHandTracking() {
  const assetBases = [
    "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/",
    "https://unpkg.com/@mediapipe/hands@0.4.1675469240/"
  ];

  let lastError = null;

  await withTimeout(
    loadHandsLibrary(),
    15000,
    "Hand tracking library timed out."
  );

  for (const assetBase of assetBases) {
    closeHands();
    try {
      setupHands(assetBase);
      await withTimeout(
        hands.send({ image: video }),
        20000,
        "Hand model initialization timed out."
      );

      trackingReady = true;
      return;
    } catch (error) {
      lastError = error;
      console.error("MediaPipe initialization failed:", assetBase, error);
      closeHands();
    }
  }

  throw lastError || new Error("Hand model could not be initialized.");
}

async function processFrame() {
  if (!hands || !stream || video.readyState < 2 || processing) return;
  processing = true;
  try {
    await hands.send({ image: video });
  } catch (error) {
    console.error("Hand tracking frame error:", error);
  } finally {
    processing = false;
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
    color = button.dataset.color;
    if (tool === "eraser") document.querySelector('[data-tool="brush"]').click();
  });
});

startButton.addEventListener("click", start);
undoButton.addEventListener("click", () => { stopDrawingForUI(); undo(); });
redoButton.addEventListener("click", () => { stopDrawingForUI(); redo(); });
clearButton.addEventListener("click", () => { stopDrawingForUI(); clearDrawing(); });
saveButton.addEventListener("click", () => { stopDrawingForUI(); savePng(); });
opacityDownButton.addEventListener("click", () => changeOpacity(-0.1));
opacityUpButton.addEventListener("click", () => changeOpacity(0.1));
shapeButton.addEventListener("click", cycleShape);
updateOpacityDisplay();
sizeDownButton.addEventListener("click", () => changeBrushSize(-2));
sizeUpButton.addEventListener("click", () => changeBrushSize(2));
effectButton.addEventListener("click", cycleEffect);
galleryButton.addEventListener("click", openGallery);
galleryClose.addEventListener("click", closeGallery);
galleryModal.addEventListener("click", event => {
  if (event.target === galleryModal) closeGallery();
});
updateSizeDisplay();

window.addEventListener("resize", resizeCanvases);
window.addEventListener("beforeunload", stop);

window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => start(), 250);
});
