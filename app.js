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

let hands = null;
let stream = null;
let animationId = 0;
let processing = false;
let tool = "brush";
let color = "#ffffff";
let brushSize = 7;
let eraserSize = 38;
let strokes = [];
let redoStack = [];
let activeStroke = null;
let smoothedPoint = null;
let started = false;

function setStatus(text, live = false) {
  statusText.textContent = text;
  statusPill.classList.toggle("live", live);
}

function showLoading(text) {
  loadingText.textContent = text;
  loading.hidden = false;
}

function hideLoading() {
  loading.hidden = true;
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
  return { x: (1 - landmark.x) * rect.width, y: landmark.y * rect.height };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isPinching(hand) {
  const wrist = hand[0];
  const thumb = hand[4];
  const index = hand[8];
  const middleMcp = hand[9];
  const palm = Math.max(distance(wrist, middleMcp), 0.001);
  return distance(thumb, index) / palm < 0.42;
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
  activeStroke = { tool, color, size: tool === "eraser" ? eraserSize : brushSize, points: [point] };
  strokes.push(activeStroke);
  redoStack = [];
  updateHistoryButtons();
}

function addPoint(point) {
  if (!activeStroke) return;
  const last = activeStroke.points[activeStroke.points.length - 1];
  if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 1.5) {
    activeStroke.points.push(point);
    redraw();
  }
}

function endStroke() { activeStroke = null; }

function redraw() {
  const rect = stage.getBoundingClientRect();
  drawCtx.clearRect(0, 0, rect.width, rect.height);
  for (const stroke of strokes) {
    if (!stroke.points.length) continue;
    drawCtx.save();
    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";
    drawCtx.lineWidth = stroke.size;
    if (stroke.tool === "eraser") {
      drawCtx.globalCompositeOperation = "destination-out";
      drawCtx.strokeStyle = "#000";
    } else {
      drawCtx.globalCompositeOperation = "source-over";
      drawCtx.strokeStyle = stroke.color;
      drawCtx.shadowColor = stroke.color;
      drawCtx.shadowBlur = Math.min(stroke.size * 2.2, 28);
    }
    if (stroke.points.length === 1) {
      const p = stroke.points[0];
      drawCtx.beginPath();
      drawCtx.arc(p.x, p.y, stroke.size / 2, 0, Math.PI * 2);
      drawCtx.fillStyle = stroke.tool === "eraser" ? "#000" : stroke.color;
      drawCtx.fill();
    } else {
      drawCtx.beginPath();
      drawCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) drawCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
      drawCtx.stroke();
    }
    drawCtx.restore();
  }
}

function updateHistoryButtons() {
  undoButton.disabled = strokes.length === 0;
  redoButton.disabled = redoStack.length === 0;
}

function undo() {
  if (!strokes.length) return;
  redoStack.push(strokes.pop());
  activeStroke = null;
  redraw();
  updateHistoryButtons();
}

function redo() {
  if (!redoStack.length) return;
  strokes.push(redoStack.pop());
  redraw();
  updateHistoryButtons();
}

function clearDrawing() {
  if (!strokes.length) return;
  redoStack = strokes.slice();
  strokes = [];
  activeStroke = null;
  redraw();
  updateHistoryButtons();
}

function savePng() {
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
    ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = stroke.tool === "eraser" ? "#000" : stroke.color;
    if (stroke.tool !== "eraser") {
      ctx.shadowColor = stroke.color;
      ctx.shadowBlur = Math.min(stroke.size * 2.2, 28);
    }
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    if (stroke.points.length === 1) {
      ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  const link = document.createElement("a");
  link.download = "airdraw.png";
  link.href = out.toDataURL("image/png");
  link.click();
}

function processResults(results) {
  cursorCtx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);
  const hand = results.multiHandLandmarks?.[0];
  if (!hand) {
    smoothedPoint = null;
    endStroke();
    return;
  }

  const raw = canvasPoint(hand[8]);
  const alpha = 0.42;
  smoothedPoint = smoothedPoint
    ? {
        x: smoothedPoint.x + (raw.x - smoothedPoint.x) * alpha,
        y: smoothedPoint.y + (raw.y - smoothedPoint.y) * alpha
      }
    : raw;

  const pinching = isPinching(hand);
  drawCursor(smoothedPoint, pinching);

  if (pinching) {
    if (!activeStroke) beginStroke(smoothedPoint);
    else addPoint(smoothedPoint);
  } else {
    endStroke();
  }
}

function loadHandsLibrary() {
  if (window.Hands) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-mediapipe-hands]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', () => reject(new Error("Hand tracking library could not be loaded.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js";
    script.crossOrigin = "anonymous";
    script.dataset.mediapipeHands = "true";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Hand tracking library could not be loaded. Check your internet connection."));
    document.head.appendChild(script);
  });
}

function setupHands() {
  if (!window.Hands) throw new Error("Hand tracking library did not load.");
  hands = new window.Hands({
    locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.55,
    minTrackingConfidence: 0.55
  });
  hands.onResults(processResults);
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
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
  if (started && stream && hands) return;

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

    // Camera is requested BEFORE any external hand-tracking code.
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });

      video.srcObject = stream;
      await video.play();
      resizeCanvases();

      // Camera is now visible and usable independently of hand tracking.
      hideLoading();
      hint.hidden = false;
      setStatus("Camera live", true);
    }

    if (!hands) {
      showLoading("Loading hand tracking…");
      try {
        await withTimeout(loadHandsLibrary(), 10000, "Hand tracking library timed out.");
        setupHands();
        await withTimeout(hands.send({ image: video }), 15000, "Hand tracking model timed out.");
        hideLoading();
        setStatus("AirDraw ready", true);
      } catch (trackingError) {
        console.error("Hand tracking startup error:", trackingError);
        hideLoading();
        hint.hidden = false;
        setStatus("Camera live", true);
        welcome.hidden = false;
        welcomeMessage.textContent = "Camera is ON. Hand tracking could not load. Check your internet connection and tap Retry.";
        startButton.textContent = "Retry tracking";
        startButton.disabled = false;
        started = true;
        return;
      }
    }

    animationId = requestAnimationFrame(loop);
  } catch (error) {
    console.error("AirDraw camera error:", error);
    cancelAnimationFrame(animationId);

    if (error?.name === "NotAllowedError") {
      welcomeMessage.textContent = "Camera permission was blocked. Allow camera access for this site, then tap Start AirDraw again.";
    } else if (error?.name === "NotFoundError") {
      welcomeMessage.textContent = "No camera was found on this device.";
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
    setStatus("Camera unavailable");
  }
}
function stop() {
  cancelAnimationFrame(animationId);
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
  if (video) video.srcObject = null;
  setStatus("Camera off");
}

document.querySelectorAll(".tool").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tool").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    tool = button.dataset.tool;
  });
});

document.querySelectorAll(".color").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".color").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    color = button.dataset.color;
    if (tool === "eraser") document.querySelector('[data-tool="brush"]').click();
  });
});

startButton.addEventListener("click", start);
undoButton.addEventListener("click", undo);
redoButton.addEventListener("click", redo);
clearButton.addEventListener("click", clearDrawing);
saveButton.addEventListener("click", savePng);
window.addEventListener("resize", resizeCanvases);
window.addEventListener("beforeunload", stop);
