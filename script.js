const { ipcRenderer } = require('electron');

// ==========================================
// 1. Whiteboard Core & Canvas Setup
// ==========================================
const workspace = document.getElementById('workspace');
const colorPicker = document.getElementById('colorPicker');
const bgColorPicker = document.getElementById('bgColorPicker');
const sizePicker = document.getElementById('sizePicker');

const canvas = new fabric.Canvas('whiteboard', {
  width: workspace.clientWidth,
  height: workspace.clientHeight,
  backgroundColor: '#ffffff',
  preserveObjectStacking: true
});

function resizeCanvas() {
  const width = workspace.clientWidth;
  const height = workspace.clientHeight;
  canvas.setWidth(width);
  canvas.setHeight(height);
  if (canvas.backgroundImage) {
    const bg = canvas.backgroundImage;
    bg.scaleToWidth(width);
    bg.scaleToHeight(height);
  }
  canvas.renderAll();
}
window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 50);

// --- Multi-Page State ---
let pages = [{ bgImage: null, bgColor: '#ffffff', json: null, thumbnail: null, history: [], redoList: [] }];
let currentPageIndex = 0;
let isHistoryLocked = false;

function recordState() {
  if (isHistoryLocked) return;
  const curPage = pages[currentPageIndex];
  curPage.bgImage = canvas.backgroundImage ? canvas.backgroundImage.toDataURL() : null;
  curPage.bgColor = canvas.backgroundColor || '#ffffff';
  curPage.json = canvas.toJSON(['backgroundImage']);
  curPage.history.push(JSON.stringify(curPage.json));
  curPage.redoList = [];
}

canvas.on('object:added', () => recordState());
canvas.on('object:modified', () => { recordState(); updateFloatingMenu(); });
canvas.on('object:removed', () => recordState());

document.getElementById('btnUndo').addEventListener('click', () => {
  const page = pages[currentPageIndex];
  if (page.history.length > 1) {
    isHistoryLocked = true;
    page.redoList.push(page.history.pop());
    const previous = JSON.parse(page.history[page.history.length - 1]);
    canvas.loadFromJSON(previous, () => {
      canvas.renderAll();
      isHistoryLocked = false;
    });
  }
});

document.getElementById('btnRedo').addEventListener('click', () => {
  const page = pages[currentPageIndex];
  if (page.redoList.length > 0) {
    isHistoryLocked = true;
    const next = JSON.parse(page.redoList.pop());
    page.history.push(JSON.stringify(next));
    canvas.loadFromJSON(next, () => {
      canvas.renderAll();
      isHistoryLocked = false;
    });
  }
});

bgColorPicker.addEventListener('input', (e) => {
  const newBg = e.target.value;
  canvas.backgroundColor = newBg;
  pages[currentPageIndex].bgColor = newBg;
  canvas.renderAll();
  recordState();
});

const toolbar = document.getElementById('toolbar');
function toggleToolbar() {
  toolbar.classList.toggle('hidden');
  setTimeout(resizeCanvas, 220);
}
ipcRenderer.on('toggle-toolbar-from-menu', toggleToolbar);

function resetTools() {
  canvas.isDrawingMode = false;
  document.querySelectorAll('.btn-group .btn').forEach(b => b.classList.remove('active'));
  document.getElementById('shapeDropdown').style.display = 'none';
}

document.getElementById('btnSelect').addEventListener('click', function() {
  resetTools();
  this.classList.add('active');
});

document.getElementById('btnPen').addEventListener('click', function() {
  resetTools();
  this.classList.add('active');
  canvas.isDrawingMode = true;
  canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
  canvas.freeDrawingBrush.color = colorPicker.value;
  canvas.freeDrawingBrush.width = parseInt(sizePicker.value, 10);
});

document.getElementById('btnEraser').addEventListener('click', function() {
  resetTools();
  this.classList.add('active');
  canvas.isDrawingMode = true;
  canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
  canvas.freeDrawingBrush.color = canvas.backgroundColor || '#ffffff';
  canvas.freeDrawingBrush.width = parseInt(sizePicker.value, 10) * 4;
});

colorPicker.addEventListener('input', (e) => {
  if (canvas.isDrawingMode && !document.getElementById('btnEraser').classList.contains('active')) {
    canvas.freeDrawingBrush.color = e.target.value;
  }
});

sizePicker.addEventListener('input', (e) => {
  if (canvas.isDrawingMode) canvas.freeDrawingBrush.width = parseInt(e.target.value, 10);
});

// Shapes Dropdown
const shapeDropdown = document.getElementById('shapeDropdown');
document.getElementById('btnShapes').addEventListener('click', () => {
  shapeDropdown.style.display = shapeDropdown.style.display === 'flex' ? 'none' : 'flex';
});

shapeDropdown.querySelectorAll('button').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const type = e.target.getAttribute('data-shape');
    let shape;
    const stroke = colorPicker.value;
    const strokeWidth = parseInt(sizePicker.value, 10);

    if (type === 'rect') shape = new fabric.Rect({ width: 140, height: 90, fill: 'transparent', stroke, strokeWidth, left: 150, top: 150 });
    if (type === 'circle') shape = new fabric.Circle({ radius: 55, fill: 'transparent', stroke, strokeWidth, left: 150, top: 150 });
    if (type === 'triangle') shape = new fabric.Triangle({ width: 120, height: 100, fill: 'transparent', stroke, strokeWidth, left: 150, top: 150 });
    if (type === 'line') shape = new fabric.Line([50, 50, 250, 50], { stroke, strokeWidth, left: 150, top: 150 });

    if (shape) {
      canvas.add(shape);
      canvas.setActiveObject(shape);
      canvas.renderAll();
    }
    shapeDropdown.style.display = 'none';
  });
});

// Floating Menu
const floatingMenu = document.getElementById('floatingMenu');
const btnCropImg = document.getElementById('btnCropImg');

function updateFloatingMenu() {
  if (cropRect) {
    floatingMenu.style.display = 'none';
    return;
  }
  const activeObj = canvas.getActiveObject();
  if (activeObj) {
    const bound = activeObj.getBoundingRect();
    const menuWidth = 110;
    const menuHeight = 130;
    const gap = 20;

    let leftPos = bound.left + bound.width + gap;
    if (leftPos + menuWidth > workspace.clientWidth) leftPos = bound.left - menuWidth - gap;

    let topPos = bound.top + (bound.height / 2) - (menuHeight / 2);
    topPos = Math.max(10, Math.min(topPos, workspace.clientHeight - menuHeight - 10));

    floatingMenu.style.top = `${topPos}px`;
    floatingMenu.style.left = `${leftPos}px`;
    floatingMenu.style.display = 'flex';
    btnCropImg.style.display = (activeObj.type === 'image') ? 'inline-flex' : 'none';
  } else {
    floatingMenu.style.display = 'none';
  }
}

canvas.on('selection:created', updateFloatingMenu);
canvas.on('selection:updated', updateFloatingMenu);
canvas.on('selection:cleared', () => { floatingMenu.style.display = 'none'; });
canvas.on('object:moving', updateFloatingMenu);
canvas.on('object:scaling', updateFloatingMenu);
canvas.on('object:rotating', updateFloatingMenu);

document.getElementById('btnDuplicateObj').addEventListener('click', () => {
  const activeObj = canvas.getActiveObject();
  if (activeObj) {
    activeObj.clone((cloned) => {
      cloned.set({ left: activeObj.left + 25, top: activeObj.top + 25 });
      canvas.add(cloned);
      canvas.setActiveObject(cloned);
      canvas.renderAll();
      recordState();
    });
  }
});

document.getElementById('btnDeleteObj').addEventListener('click', () => {
  const activeObj = canvas.getActiveObject();
  if (activeObj) {
    canvas.remove(activeObj);
    floatingMenu.style.display = 'none';
    canvas.renderAll();
    recordState();
  }
});

// In-place Image Crop
let cropRect = null;
let croppingImage = null;
let cropActionsContainer = null;

function removeCropUI() {
  if (cropRect) { canvas.remove(cropRect); cropRect = null; }
  if (cropActionsContainer) { cropActionsContainer.remove(); cropActionsContainer = null; }
  if (croppingImage) {
    croppingImage.selectable = true;
    croppingImage.evented = true;
    croppingImage = null;
  }
  canvas.renderAll();
  updateFloatingMenu();
}

function updateCropUIButtonsPosition() {
  if (!cropRect || !cropActionsContainer) return;
  const bound = cropRect.getBoundingRect();
  cropActionsContainer.style.left = `${bound.left + (bound.width / 2) - 60}px`;
  cropActionsContainer.style.top = `${bound.top + bound.height + 12}px`;
}

btnCropImg.addEventListener('click', () => {
  const activeObj = canvas.getActiveObject();
  if (!activeObj || activeObj.type !== 'image') return;

  floatingMenu.style.display = 'none';
  croppingImage = activeObj;
  croppingImage.selectable = false;
  croppingImage.evented = false;

  const imgBound = croppingImage.getBoundingRect();
  const boxW = imgBound.width * 0.7;
  const boxH = imgBound.height * 0.7;

  cropRect = new fabric.Rect({
    left: imgBound.left + (imgBound.width - boxW) / 2,
    top: imgBound.top + (imgBound.height - boxH) / 2,
    width: boxW,
    height: boxH,
    fill: 'rgba(0, 180, 255, 0.25)',
    stroke: '#00ffff',
    strokeWidth: 2,
    strokeDashArray: [6, 6],
    cornerColor: '#ffffff',
    cornerStrokeColor: '#007acc',
    cornerSize: 12,
    transparentCorners: false,
    hasRotatingPoint: false,
    lockRotation: true
  });

  canvas.add(cropRect);
  canvas.setActiveObject(cropRect);
  canvas.renderAll();

  cropActionsContainer = document.createElement('div');
  cropActionsContainer.id = 'inplaceCropBar';
  cropActionsContainer.innerHTML = `
    <button class="btn" id="btnInplaceApply" style="background:#238636; font-weight:bold;">✔ Apply</button>
    <button class="btn" id="btnInplaceCancel">✖ Cancel</button>
  `;
  document.getElementById('workspace').appendChild(cropActionsContainer);
  updateCropUIButtonsPosition();

  cropRect.on('moving', updateCropUIButtonsPosition);
  cropRect.on('scaling', updateCropUIButtonsPosition);

  document.getElementById('btnInplaceApply').addEventListener('click', () => {
    if (!croppingImage || !cropRect) return;
    const origElement = croppingImage.getElement();
    const naturalW = origElement.naturalWidth || origElement.width;
    const naturalH = origElement.naturalHeight || origElement.height;
    const imgScaleX = croppingImage.scaleX || 1;
    const imgScaleY = croppingImage.scaleY || 1;

    const relLeft = cropRect.left - croppingImage.left;
    const relTop = cropRect.top - croppingImage.top;
    const cropX = Math.max(0, relLeft / imgScaleX);
    const cropY = Math.max(0, relTop / imgScaleY);
    const cropW = Math.min(naturalW - cropX, cropRect.getScaledWidth() / imgScaleX);
    const cropH = Math.min(naturalH - cropY, cropRect.getScaledHeight() / imgScaleY);

    if (cropW <= 0 || cropH <= 0) { removeCropUI(); return; }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropW;
    tempCanvas.height = cropH;
    tempCanvas.getContext('2d').drawImage(origElement, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    fabric.Image.fromURL(tempCanvas.toDataURL(), (newImg) => {
      newImg.set({
        left: cropRect.left,
        top: cropRect.top,
        scaleX: imgScaleX,
        scaleY: imgScaleY,
        cornerColor: '#007acc',
        cornerSize: 10,
        transparentCorners: false
      });
      canvas.remove(croppingImage);
      canvas.add(newImg);
      canvas.setActiveObject(newImg);
      removeCropUI();
      recordState();
    });
  });

  document.getElementById('btnInplaceCancel').addEventListener('click', removeCropUI);
});

// Import Image
document.getElementById('imgUpload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (f) => {
    fabric.Image.fromURL(f.target.result, (img) => {
      img.scaleToWidth(300);
      img.set({ left: 100, top: 100, cornerColor: '#007acc', cornerSize: 10, transparentCorners: false });
      canvas.add(img);
      canvas.setActiveObject(img);
      recordState();
    });
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});

// Import PDF
document.getElementById('pdfUpload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const fileReader = new FileReader();
  fileReader.onload = async function () {
    const typedarray = new Uint8Array(this.result);
    const pdf = await pdfjsLib.getDocument(typedarray).promise;

    for (let i = 1; i <= pdf.numPages; i++) {
      const pdfPage = await pdf.getPage(i);
      const viewport = pdfPage.getViewport({ scale: 2.0 });

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = viewport.width;
      tempCanvas.height = viewport.height;
      await pdfPage.render({ canvasContext: tempCanvas.getContext('2d'), viewport }).promise;
      const dataUrl = tempCanvas.toDataURL('image/png');

      if (i === 1) {
        fabric.Image.fromURL(dataUrl, (img) => {
          img.scaleToWidth(canvas.getWidth() * 0.8);
          img.set({ left: 40, top: 40, cornerColor: '#007acc', cornerSize: 10, transparentCorners: false });
          canvas.add(img);
          canvas.setActiveObject(img);
          canvas.renderAll();
          recordState();
        });
      } else {
        const offscreenCanvas = new fabric.Canvas(null, { width: canvas.getWidth(), height: canvas.getHeight(), backgroundColor: '#ffffff' });
        await new Promise((resolve) => {
          fabric.Image.fromURL(dataUrl, (img) => {
            img.scaleToWidth(canvas.getWidth() * 0.8);
            img.set({ left: 40, top: 40, cornerColor: '#007acc', cornerSize: 10, transparentCorners: false });
            offscreenCanvas.add(img);
            offscreenCanvas.renderAll();

            pages.push({
              bgColor: '#ffffff',
              json: offscreenCanvas.toJSON(),
              thumbnail: null,
              history: [JSON.stringify(offscreenCanvas.toJSON())],
              redoList: []
            });
            resolve();
          });
        });
      }
    }
    updatePageUI();
  };
  fileReader.readAsArrayBuffer(file);
  e.target.value = '';
});

// Page Organizer
const pageSidebar = document.getElementById('pageSidebar');
const pageListContainer = document.getElementById('pageListContainer');

function updatePageUI() {
  document.getElementById('pageIndicator').innerText = `📄 Page ${currentPageIndex + 1} / ${pages.length}`;
  renderSidebarList();
}

function saveCurrentPage() {
  const curPage = pages[currentPageIndex];
  curPage.bgImage = canvas.backgroundImage ? canvas.backgroundImage.toDataURL() : curPage.bgImage;
  curPage.bgColor = canvas.backgroundColor || '#ffffff';
  curPage.json = canvas.toJSON();
  curPage.thumbnail = canvas.toDataURL({ format: 'png', multiplier: 0.2 });
}

function loadPage(index) {
  if (index < 0 || index >= pages.length) return;
  saveCurrentPage();
  currentPageIndex = index;
  isHistoryLocked = true;
  floatingMenu.style.display = 'none';
  canvas.clear();

  const targetPage = pages[currentPageIndex];
  const pageBg = targetPage.bgColor || '#ffffff';
  canvas.backgroundColor = pageBg;
  bgColorPicker.value = pageBg;

  if (targetPage.json) {
    canvas.loadFromJSON(targetPage.json, () => {
      canvas.renderAll();
      isHistoryLocked = false;
    });
  } else {
    canvas.renderAll();
    isHistoryLocked = false;
    recordState();
  }
  updatePageUI();
}

function insertPageAfterCurrent() {
  saveCurrentPage();
  pages.splice(currentPageIndex + 1, 0, { bgImage: null, bgColor: '#ffffff', json: null, thumbnail: null, history: [], redoList: [] });
  loadPage(currentPageIndex + 1);
}

document.getElementById('btnNextPage').addEventListener('click', () => {
  if (currentPageIndex < pages.length - 1) loadPage(currentPageIndex + 1);
  else {
    saveCurrentPage();
    pages.push({ bgImage: null, bgColor: '#ffffff', json: null, thumbnail: null, history: [], redoList: [] });
    loadPage(pages.length - 1);
  }
});
document.getElementById('btnPrevPage').addEventListener('click', () => {
  if (currentPageIndex > 0) loadPage(currentPageIndex - 1);
});

function togglePageSidebar() {
  saveCurrentPage();
  const isVisible = pageSidebar.style.display === 'flex';
  pageSidebar.style.display = isVisible ? 'none' : 'flex';
  if (!isVisible) renderSidebarList();
}
document.getElementById('pageIndicator').addEventListener('click', togglePageSidebar);
document.getElementById('btnCloseSidebar').addEventListener('click', () => { pageSidebar.style.display = 'none'; });

function renderSidebarList() {
  pageListContainer.innerHTML = '';
  pages.forEach((page, idx) => {
    const card = document.createElement('div');
    card.className = `page-card ${idx === currentPageIndex ? 'active' : ''}`;
    const thumbSrc = page.thumbnail || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="70"><rect width="100%" height="100%" fill="white"/></svg>';
    card.innerHTML = `
      <div class="page-card-header">
        <strong>Page ${idx + 1}</strong>
        <button class="btn delete-thumb-btn" style="padding: 2px 6px; background:#a12626; font-size:10px;">🗑</button>
      </div>
      <img class="page-thumb-preview" src="${thumbSrc}">
    `;
    card.addEventListener('click', (e) => {
      if (!e.target.classList.contains('delete-thumb-btn')) {
        loadPage(idx);
        pageSidebar.style.display = 'none';
      }
    });
    card.querySelector('.delete-thumb-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (pages.length === 1) {
        canvas.clear();
        canvas.backgroundColor = '#ffffff';
        pages[0] = { bgImage: null, bgColor: '#ffffff', json: null, thumbnail: null, history: [], redoList: [] };
        recordState();
        updatePageUI();
        return;
      }
      pages.splice(idx, 1);
      if (currentPageIndex >= pages.length) currentPageIndex = pages.length - 1;
      loadPage(currentPageIndex);
    });
    pageListContainer.appendChild(card);
  });
}

// Embedded Web Browser & Window Dragger
const browserModal = document.getElementById('browserModal');
const browserFrame = document.getElementById('browserFrame');
const browserUrl = document.getElementById('browserUrl');
const browserHeader = document.getElementById('browserHeader');

document.getElementById('btnOpenBrowser').addEventListener('click', () => { browserModal.style.display = 'flex'; });
document.getElementById('btnCloseBrowser').addEventListener('click', () => { browserModal.style.display = 'none'; });

function navigateBrowser() {
  let query = browserUrl.value.trim();
  if (!query) return;
  if (/^(https?:\/\/)/i.test(query)) browserFrame.src = query;
  else if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(query)) browserFrame.src = 'https://' + query;
  else browserFrame.src = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
document.getElementById('btnGoBrowser').addEventListener('click', navigateBrowser);
browserUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') navigateBrowser(); });

let isDraggingModal = false, dragOffsetX = 0, dragOffsetY = 0;
browserHeader.addEventListener('mousedown', (e) => {
  if (['input', 'button'].includes(e.target.tagName.toLowerCase())) return;
  isDraggingModal = true;
  dragOffsetX = e.clientX - browserModal.offsetLeft;
  dragOffsetY = e.clientY - browserModal.offsetTop;
});
window.addEventListener('mousemove', (e) => {
  if (!isDraggingModal) return;
  let newX = Math.max(0, Math.min(e.clientX - dragOffsetX, window.innerWidth - browserModal.offsetWidth));
  let newY = Math.max(0, Math.min(e.clientY - dragOffsetY, window.innerHeight - browserModal.offsetHeight));
  browserModal.style.left = `${newX}px`;
  browserModal.style.top = `${newY}px`;
});
window.addEventListener('mouseup', () => { isDraggingModal = false; });

document.getElementById('btnCaptureBrowser').addEventListener('click', () => {
  const rect = browserFrame.getBoundingClientRect();
  ipcRenderer.send('capture-browser-window', {
    x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height)
  });
});
ipcRenderer.on('browser-captured', (event, dataUrl) => {
  fabric.Image.fromURL(dataUrl, (img) => {
    img.scaleToWidth(Math.min(450, canvas.width * 0.7));
    img.set({ left: 100, top: 100, cornerColor: '#007acc', cornerSize: 10, transparentCorners: false });
    canvas.add(img);
    canvas.setActiveObject(img);
    browserModal.style.display = 'none';
    recordState();
  });
});

// Shortcuts Modal
const shortcutsModal = document.getElementById('shortcutsModal');
ipcRenderer.on('show-shortcuts-modal', () => { shortcutsModal.style.display = 'flex'; });
document.getElementById('btnCloseShortcuts').addEventListener('click', () => { shortcutsModal.style.display = 'none'; });

// ==========================================
// 2. Classroom Overlay & WebRTC Core Engine
// ==========================================
const classroomContainer = document.getElementById('classroomContainer');
const btnToggleClassroom = document.getElementById('btnToggleClassroom');
const btnFloatingBackToBoard = document.getElementById('btnFloatingBackToBoard');

function toggleClassroomView() {
  const isOpen = classroomContainer.classList.toggle('active');
  if (!isOpen) resizeCanvas();
}
btnToggleClassroom.addEventListener('click', toggleClassroomView);
btnFloatingBackToBoard.addEventListener('click', toggleClassroomView);
ipcRenderer.on('toggle-classroom-view', toggleClassroomView);

// --- WebRTC & Socket Connection ---
const socket = io("https://webrtc-project-k0jx.onrender.com", {
  transports: ["websocket", "polling"]
});

let localStream;
let screenStream;
let boardStream = null;
let mediaRecorder;
let isScreenSharing = false;
let isBoardSharing = false;
let isLiveStreaming = false;
let isChatPanelOpen = false;
let overlayTimeout;
const peerConnections = {};
const studentMicStatus = {};
const studentNames = {};
const servers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};
let currentCamFacingMode = "user";
let activeSwappedStudentId = null;

const studentCamSwitchBtn = document.getElementById('studentCamSwitchBtn');
const btnSnapStudent = document.getElementById('btnSnapStudent');
const cameraMirror = document.getElementById('cameraMirror');
const camSwitchBtn = document.getElementById('camSwitchBtn');
const mainDisplayLabel = document.getElementById('mainDisplayLabel');
const chatPanel = document.getElementById('chatPanel');
const masterChatBtn = document.getElementById('masterChatBtn');
const participantCounter = document.getElementById('participantCounter');
const localVideo = document.getElementById('localVideo');
const meetingContainer = document.getElementById('meetingContainer');
const welcomeScreen = document.getElementById('welcomeScreen');
const toggleAudioBtn = document.getElementById('toggleAudioBtn');
const toggleVideoBtn = document.getElementById('toggleVideoBtn');
const pendingBox = document.getElementById('pendingBox');
const pendingBadge = document.getElementById('pendingBadge');
const pendingListItems = document.getElementById('pendingListItems');
const shareBoardOnlyBtn = document.getElementById('shareBoardOnlyBtn');
const shareBtn = document.getElementById('shareBtn');

let isAudioMuted = false;
let isVideoStopped = false;

// Overlay controls & timeout management
function showOverlayControls() {
  const overlayControls = document.querySelector('.cam-controls-overlay');
  if (overlayControls) {
    overlayControls.style.display = 'flex';
    mainDisplayLabel.style.display = 'block';
    
    // Soayed state check kore button display thik rakha
    if (activeSwappedStudentId) {
      studentCamSwitchBtn.style.display = 'flex';
      btnSnapStudent.style.display = 'flex'; // <--- যোগ করুন
      camSwitchBtn.style.display = 'none';
    } else {
      camSwitchBtn.style.display = 'flex';
      studentCamSwitchBtn.style.display = 'none';
      btnSnapStudent.style.display = 'none'; // <--- যোগ করুন
    }
  }
  resetOverlayTimeout();
}

function resetOverlayTimeout() {
  clearTimeout(overlayTimeout);
  overlayTimeout = setTimeout(() => {
    const overlayControls = document.querySelector('.cam-controls-overlay');
    if (overlayControls) {
      overlayControls.style.display = 'none';
      mainDisplayLabel.style.display = 'none';
    }
  }, 5000);
}

// Touch & Click Event Handlers on Main Area
let touchTimer = null;
localVideo.addEventListener("click", function (e) {
  if (touchTimer === null) {
    touchTimer = setTimeout(() => {
      touchTimer = null;
      const overlayControls = document.querySelector('.cam-controls-overlay');
      if (!overlayControls || overlayControls.style.display === 'none' || overlayControls.style.display === '') {
        showOverlayControls();
      } else {
        overlayControls.style.display = 'none';
        mainDisplayLabel.style.display = 'none';
        clearTimeout(overlayTimeout);
      }
    }, 300);
  }
});

function toggleMeetingFullscreen() {
  if (!document.fullscreenElement) {
    meetingContainer.requestFullscreen().catch(err => console.error("Fullscreen error:", err));
  } else {
    document.exitFullscreen();
  }
}

localVideo.addEventListener("dblclick", function (e) {
  clearTimeout(touchTimer);
  touchTimer = null;
  toggleMeetingFullscreen();
});

let lastTapTime = 0;
localVideo.addEventListener("touchend", function (e) {
  const currentTime = new Date().getTime();
  const tapLength = currentTime - lastTapTime;
  if (tapLength < 300 && tapLength > 0) {
    e.preventDefault();
    clearTimeout(touchTimer);
    touchTimer = null;
    toggleMeetingFullscreen();
  } else {
    touchTimer = setTimeout(() => {
      touchTimer = null;
      const overlayControls = document.querySelector('.cam-controls-overlay');
      if (!overlayControls || overlayControls.style.display === 'none' || overlayControls.style.display === '') {
        showOverlayControls();
      } else {
        overlayControls.style.display = 'none';
        mainDisplayLabel.style.display = 'none';
        clearTimeout(overlayTimeout);
      }
    }, 300);
  }
  lastTapTime = currentTime;
});

function updateCountUI(count) {
  if (count !== undefined && participantCounter) {
    participantCounter.innerText = count;
    participantCounter.style.display = 'flex';
  }
}

function createDummyStream() {
  const dummyCanvas = document.createElement('canvas');
  dummyCanvas.width = 640;
  dummyCanvas.height = 480;
  const ctx = dummyCanvas.getContext('2d');
  let x = 0;
  function draw() {
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, dummyCanvas.width, dummyCanvas.height);
    ctx.fillStyle = '#2ea44f';
    ctx.font = '24px Arial';
    ctx.fillText('Virtual Classroom - Camera Inactive', 50, 100);
    ctx.fillStyle = '#007fff';
    ctx.fillRect(x, 200, 100, 100);
    x = (x + 2) % dummyCanvas.width;
    requestAnimationFrame(draw);
  }
  draw();
  return dummyCanvas.captureStream(30);
}

// --- Join & Initialize Room ---
document.getElementById('createBtn').onclick = async function () {
  const roomId = document.getElementById('customRoomIdInput').value.trim();
  if (!roomId) return alert("Please Enter a room id");

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (err) {
    console.warn("Camera fallback used:", err);
    localStream = createDummyStream();
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStream.getAudioTracks().forEach(track => localStream.addTrack(track));
    } catch (e) {}
  }

  localVideo.srcObject = localStream;
  localVideo.muted = true;

  const joinLink = `https://webrtc-project-k0jx.onrender.com/index.html?room=${roomId}`;
  let linkDisplay = document.getElementById('shareLinkDisplay');
  if (!linkDisplay) {
    linkDisplay = document.createElement('div');
    linkDisplay.id = 'shareLinkDisplay';
    linkDisplay.style.cssText = "width: 100%; margin-top: 5px;";
    document.querySelector('.sidebar .tools-bar .controls').appendChild(linkDisplay);
  }
  linkDisplay.innerHTML = `
    <input type="text" id="copyLinkInput" value="${joinLink}" readonly style="display:none;">
    <button id="copyLinkBtn" style="width: 100%; height: 42px; background: #2ea44f; color: white; font-weight: bold; border-radius: 6px; border: none; cursor: pointer;">📤 Share Join Link</button>
  `;

  document.getElementById('copyLinkBtn').onclick = () => {
    navigator.clipboard.writeText(joinLink).then(() => {
      document.getElementById('copyLinkBtn').innerText = "✅ Copied!";
      setTimeout(() => { document.getElementById('copyLinkBtn').innerText = "📤 Share Join Link"; }, 2000);
    });
  };

  socket.emit('join-room', { roomId, role: 'teacher' });

  welcomeScreen.classList.add('hide');
  setTimeout(() => { welcomeScreen.style.display = 'none'; }, 400);
  meetingContainer.style.display = 'flex';

  shareBoardOnlyBtn.style.display = 'flex';
  shareBtn.style.display = 'flex';
  document.getElementById('youtubeStreamBtn').style.display = 'flex';
  document.getElementById('muteAllBtn').style.display = 'flex';
  document.getElementById('unmuteAllBtn').style.display = 'flex';
  toggleAudioBtn.style.display = 'flex';
  toggleVideoBtn.style.display = 'flex';
  camSwitchBtn.style.display = 'flex';
  studentCamSwitchBtn.style.display = 'none';
  masterChatBtn.style.display = 'flex';
  if (participantCounter) participantCounter.style.display = 'flex';
  mainDisplayLabel.style.display = 'block';
  cameraMirror.style.display = 'flex';
  resetOverlayTimeout();
};


// ==========================================
// 3. Real-Time Composite Canvas Sharing Engine
// ==========================================
let compositeCanvas = null;
let compositeCtx = null;
let boardStreamAnimFrame = null;

shareBoardOnlyBtn.onclick = function () {
  if (!isBoardSharing) {
    try {
      if (isScreenSharing) stopScreenShare();

      // ১. Fabric এর Lower ও Upper ক্যানভাস দুটোই রেফারেন্স নেওয়া
      const lowerCanvas = document.getElementById('whiteboard');
      const upperCanvas = workspace.querySelector('.upper-canvas');

      // ২. অফস্ক্রিন কম্পোজিট ক্যানভাস তৈরি
      if (!compositeCanvas) {
        compositeCanvas = document.createElement('canvas');
        compositeCtx = compositeCanvas.getContext('2d');
      }

      compositeCanvas.width = lowerCanvas.width;
      compositeCanvas.height = lowerCanvas.height;

      // ৩. রিয়েল-টাইম ফ্রেম লুপ (প্রতি ফ্রেমে লোয়ার + লাইভ আপার ড্রয়িং মার্জ করা)
      function renderCompositeFrame() {
        if (!isBoardSharing) return;

        // সাইজ পরিবর্তন হলে সিঙ্ক রাখা
        if (compositeCanvas.width !== lowerCanvas.width || compositeCanvas.height !== lowerCanvas.height) {
          compositeCanvas.width = lowerCanvas.width;
          compositeCanvas.height = lowerCanvas.height;
        }

        // ক্লিয়ার করে প্রথমে লোয়ার ক্যানভাস ড্র করা
        compositeCtx.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height);
        compositeCtx.drawImage(lowerCanvas, 0, 0);

        // ড্রয়িং চলাকালীন আপার ক্যানভাসের লাইভ পেন মুভমেন্ট ড্র করা
        if (upperCanvas) {
          compositeCtx.drawImage(upperCanvas, 0, 0);
        }

        boardStreamAnimFrame = requestAnimationFrame(renderCompositeFrame);
      }

      isBoardSharing = true;
      renderCompositeFrame();

      // ৪. কম্পোজিট ক্যানভাস থেকে 30 FPS লাইভ স্ট্রিম তৈরি
      boardStream = compositeCanvas.captureStream(30);
      const boardVideoTrack = boardStream.getVideoTracks()[0];

      // ৫. সমস্ত কানেক্টেড স্টুডেন্টদের কাছে লাইভ ট্র্যাক প্রতিস্থাপন করা
      for (let userId in peerConnections) {
        const sender = peerConnections[userId].getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(boardVideoTrack);
      }

      localVideo.srcObject = boardStream;
      localVideo.classList.remove('mirror');

      this.innerText = "Stop Board Share ❌";
      this.style.background = "#ea4335";

      // সরাসরি ক্লাসরুম হাইড করে বোর্ডে ফিরে যাওয়া
      classroomContainer.classList.remove('active');
      resizeCanvas();

      if (isLiveStreaming && mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        mediaRecorder = new MediaRecorder(boardStream, { mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: 2500000 });
        mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) socket.emit('stream-chunk', e.data); };
        mediaRecorder.start(1000);
      }

    } catch (err) {
      console.error("Board share error:", err);
      isBoardSharing = false;
    }
  } else {
    stopBoardShare();
  }
};

function stopBoardShare() {
  if (!isBoardSharing) return;

  // রেন্ডার লুপ বন্ধ করা
  if (boardStreamAnimFrame) {
    cancelAnimationFrame(boardStreamAnimFrame);
    boardStreamAnimFrame = null;
  }

  const videoTrack = localStream.getVideoTracks()[0];
  for (let userId in peerConnections) {
    const sender = peerConnections[userId].getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender) sender.replaceTrack(videoTrack);
  }

  localVideo.srcObject = localStream;
  if (currentCamFacingMode === "user") localVideo.classList.add('mirror');

  shareBoardOnlyBtn.innerText = "Share WhiteBoard Only 🖥️";
  shareBoardOnlyBtn.style.background = "#2ea44f";

  if (boardStream) {
    boardStream.getTracks().forEach(t => t.stop());
    boardStream = null;
  }
  isBoardSharing = false;

  if (isLiveStreaming && mediaRecorder) {
    mediaRecorder.stop();
    mediaRecorder = new MediaRecorder(localStream, { mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: 2500000 });
    mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) socket.emit('stream-chunk', e.data); };
    mediaRecorder.start(1000);
  }
}

// স্টুডেন্টের লাইভ ভিডিও ফ্রেম ক্যাপচার করে হোয়াইটবোর্ডে অবজেক্ট হিসেবে প্লেস করা
btnSnapStudent.onclick = () => {
  if (!activeSwappedStudentId) {
    alert("Please select a student in the main display first!");
    return;
  }

  // মেইন ডিসপ্লেতে সোয়াপ থাকা লাইভ ভিডিও এলিমেন্ট
  const videoEl = document.getElementById('localVideo');
  if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) {
    alert("Student video feed is not active or ready yet.");
    return;
  }

  // অফস্ক্রিন মেমোরি ক্যানভাসে ফুল রেজোলিউশনে ফ্রেম রেন্ডার করা
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = videoEl.videoWidth;
  tempCanvas.height = videoEl.videoHeight;
  const ctx = tempCanvas.getContext('2d');

  ctx.drawImage(videoEl, 0, 0, tempCanvas.width, tempCanvas.height);
  const snapshotDataUrl = tempCanvas.toDataURL('image/png');

  // Fabric.js হোয়াইটবোর্ডে অ্যাড করা
  fabric.Image.fromURL(snapshotDataUrl, (img) => {
    img.scaleToWidth(Math.min(400, canvas.width * 0.5));
    img.set({
      left: Math.max(50, (canvas.width - 400) / 2),
      top: 80,
      cornerColor: '#007acc',
      cornerSize: 10,
      transparentCorners: false
    });

    canvas.add(img);
    canvas.setActiveObject(img);
    canvas.renderAll();
    recordState();

    // ক্লাসরুম বন্ধ করে স্বয়ংক্রিয়ভাবে হোয়াইটবোর্ড ক্যানভাসে ফেরত যাওয়া
    classroomContainer.classList.remove('active');
    resizeCanvas();
  });
};

// Full Screen Share
shareBtn.onclick = async function () {
  if (!isScreenSharing) {
    try {
      if (isBoardSharing) stopBoardShare();

      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const videoTrack = screenStream.getVideoTracks()[0];

      for (let userId in peerConnections) {
        const sender = peerConnections[userId].getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
      }

      localVideo.srcObject = screenStream;
      localVideo.classList.remove('mirror');
      this.innerText = "Stop Sharing ❌";
      this.style.background = "#ea4335";
      isScreenSharing = true;

      classroomContainer.classList.remove('active');
      resizeCanvas();

      videoTrack.onended = stopScreenShare;
    } catch (error) {
      console.error("Screen share error:", error);
    }
  } else {
    stopScreenShare();
  }
};

function stopScreenShare() {
  if (!isScreenSharing) return;
  const videoTrack = localStream.getVideoTracks()[0];
  for (let userId in peerConnections) {
    const sender = peerConnections[userId].getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender) sender.replaceTrack(videoTrack);
  }
  localVideo.srcObject = localStream;
  localVideo.classList.add('mirror');

  shareBtn.innerText = "Share Screen 🖥️";
  shareBtn.style.background = "#007fff";

  if (screenStream) screenStream.getTracks().forEach(track => track.stop());
  isScreenSharing = false;
}

// Audio/Video Toggle
toggleAudioBtn.onclick = () => {
  if (!localStream) return;
  const audioTracks = localStream.getAudioTracks();
  if (!audioTracks.length) return;
  isAudioMuted = !isAudioMuted;
  audioTracks.forEach(t => t.enabled = !isAudioMuted);
  toggleAudioBtn.innerText = isAudioMuted ? "🔇 Unmute Audio" : "🎙️ Mute Audio";
  toggleAudioBtn.style.background = isAudioMuted ? "rgba(234, 67, 53, 0.85)" : "rgba(0, 0, 0, 0.7)";
};

toggleVideoBtn.onclick = () => {
  if (!localStream) return;
  const videoTracks = localStream.getVideoTracks();
  if (!videoTracks.length) return;
  isVideoStopped = !isVideoStopped;
  videoTracks.forEach(t => t.enabled = !isVideoStopped);
  toggleVideoBtn.innerText = isVideoStopped ? "📷 Turn On Video" : "📹 Turn Off Video";
  toggleVideoBtn.style.background = isVideoStopped ? "rgba(234, 67, 53, 0.85)" : "rgba(0, 0, 0, 0.7)";
};

cameraMirror.onclick = () => { localVideo.classList.toggle('mirror'); };

camSwitchBtn.onclick = async () => {
  try {
    if (localStream) localStream.getVideoTracks()[0]?.stop();
    currentCamFacingMode = (currentCamFacingMode === "user") ? "environment" : "user";
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: currentCamFacingMode },
      audio: true
    });
    const videoTrack = newStream.getVideoTracks()[0];
    for (let id in peerConnections) {
      const sender = peerConnections[id].getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) sender.replaceTrack(videoTrack);
    }
    localStream = newStream;
    if (!activeSwappedStudentId) {
      localVideo.srcObject = localStream;
      localVideo.classList.toggle('mirror', currentCamFacingMode === "user");
    }
  } catch (err) {
    alert("Teacher Camera switch failed: " + err.message);
  }
};

studentCamSwitchBtn.onclick = () => {
  if (activeSwappedStudentId) {
    socket.emit('switch-student-camera', { targetStudentId: activeSwappedStudentId });
  } else {
    alert("No student is currently selected in the main display!");
  }
};

// ==========================================
// 4. WebRTC Peer Connection & Media Sync
// ==========================================
function createPeerConnection(userId) {
  const pc = new RTCPeerConnection(servers);
  peerConnections[userId] = pc;
  studentMicStatus[userId] = 'muted';

  const currentStream = isBoardSharing ? boardStream : (isScreenSharing ? screenStream : localStream);
  if (currentStream) {
    currentStream.getVideoTracks().forEach(track => pc.addTrack(track, currentStream));
  }
  if (localStream) {
    localStream.getAudioTracks().forEach(track => pc.addTrack(track, localStream));
  }

  pc.ontrack = (event) => {
    let card = document.getElementById(`card-${userId}`);
    const displayName = studentNames[userId] || `Student (${userId.substring(0, 4)})`;

    if (!card) {
      const grid = document.getElementById('studentGrid');
      card = document.createElement('div');
      card.className = 'student-card';
      card.id = `card-${userId}`;

      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.srcObject = event.streams[0];

      const label = document.createElement('div');
      label.className = 'student-label';
      label.innerText = displayName;

      const micBtn = document.createElement('button');
      micBtn.className = 'mic-control-btn mic-off';
      micBtn.id = `mic-${userId}`;
      micBtn.innerText = "Muted 🔇";

      video.onclick = () => swapStudentToMain(userId);
      micBtn.onclick = (e) => {
        e.stopPropagation();
        if (studentMicStatus[userId] === 'muted') {
          socket.emit('allow-student', userId);
        } else {
          socket.emit('mute-student', userId);
        }
      };

      card.appendChild(video);
      card.appendChild(label);
      card.appendChild(micBtn);
      grid.appendChild(card);
    } else {
      const video = card.querySelector('video');
      if (video && video.srcObject !== event.streams[0]) {
        video.srcObject = event.streams[0];
      }
    }

    if (event.track) {
      event.track.onunmute = () => {
        const video = card ? card.querySelector('video') : null;
        if (video) video.play().catch(e => console.log("Auto-play error:", e));
        if (activeSwappedStudentId === userId) {
          localVideo.play().catch(e => console.log("Main video play error:", e));
        }
      };
    }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) socket.emit('signal', { target: userId, signal: { candidate: event.candidate } });
  };
  return pc;
}

async function initiateCall(pc, userId) {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('signal', { target: userId, signal: { offer } });
}

socket.on('start-call-with-student', ({ studentId, name }) => {
  if (name) studentNames[studentId] = name;
  let pc = peerConnections[studentId] || createPeerConnection(studentId);
  initiateCall(pc, studentId);
});

socket.on('signal', async (data) => {
  let pc = peerConnections[data.sender];
  if (!pc) return;
  if (data.signal.answer) await pc.setRemoteDescription(new RTCSessionDescription(data.signal.answer));
  else if (data.signal.candidate) {
    try { await pc.addIceCandidate(new RTCIceCandidate(data.signal.candidate)); } catch (e) {}
  }
});

// ==========================================
// Video Swapping (Teacher & Student)
// ==========================================
function swapStudentToMain(studentId) {
  const studentCard = document.getElementById(`card-${studentId}`);
  if (!studentCard) return;

  const studentVideo = studentCard.querySelector('video');
  const studentLabel = studentCard.querySelector('.student-label');
  const displayName = studentNames[studentId] || `Student (${studentId.substring(0, 4)})`;

  // Jodi already ei student-i swap thake, tobe reset hobe
  if (activeSwappedStudentId === studentId) {
    resetMainDisplay();
    return;
  }

  // Jodi onno kono student swap thake, age setake reset kore new take swap korbo
  if (activeSwappedStudentId && activeSwappedStudentId !== studentId) {
    resetMainDisplay();
  }

  const studentStream = studentVideo.srcObject;
  const teacherStream = localVideo.srcObject;

  localVideo.srcObject = studentStream;
  localVideo.muted = false;
  localVideo.classList.remove('mirror');

  studentVideo.srcObject = teacherStream;
  studentVideo.classList.add('mirror');

  activeSwappedStudentId = studentId;
  studentCard.classList.add('swapped-teacher');
  if (studentLabel) studentLabel.innerText = "Teacher (You)";
  mainDisplayLabel.innerText = displayName;

  // Student Camera button dekhano ebong Teacher button hide kora
  studentCamSwitchBtn.style.display = 'flex';
  btnSnapStudent.style.display = 'flex'; // <--- যোগ করুন
  camSwitchBtn.style.display = 'none';
  showOverlayControls();
}

function resetMainDisplay() {
  if (!activeSwappedStudentId) return;

  const studentCard = document.getElementById(`card-${activeSwappedStudentId}`);
  if (studentCard) {
    const studentVideo = studentCard.querySelector('video');
    const studentLabel = studentCard.querySelector('.student-label');
    const displayName = studentNames[activeSwappedStudentId] || `Student (${activeSwappedStudentId.substring(0, 4)})`;

    // Stream-gulo ke thikbhabe swap-back kora
    const currentMainStream = localVideo.srcObject;
    const currentCardStream = studentVideo.srcObject;

    localVideo.srcObject = currentCardStream;
    localVideo.muted = true;
    localVideo.classList.add('mirror');

    studentVideo.srcObject = currentMainStream;
    studentVideo.classList.remove('mirror');

    studentCard.classList.remove('swapped-teacher');
    if (studentLabel) studentLabel.innerText = displayName;
  }

  activeSwappedStudentId = null;
  mainDisplayLabel.innerText = "Teacher (You)";
  camSwitchBtn.style.display = 'flex';
  studentCamSwitchBtn.style.display = 'none';
  btnSnapStudent.style.display = 'none'; // <--- যোগ করুন
  showOverlayControls();
}

socket.on('user-left', (userId) => {
  if (activeSwappedStudentId === userId) resetMainDisplay();
  if (peerConnections[userId]) peerConnections[userId].close();
  delete peerConnections[userId];
  delete studentMicStatus[userId];
  delete studentNames[userId];
  document.getElementById(`card-${userId}`)?.remove();
});

// ==========================================
// 5. Mute / Unmute & Hand-Raise Handlers
// ==========================================
document.getElementById('muteAllBtn').onclick = () => socket.emit('mute-all-students');
document.getElementById('unmuteAllBtn').onclick = () => socket.emit('unmute-all-students');

socket.on('student-raised-hand', (data) => {
            // Handle both object payload { studentId, name } and legacy raw ID string
            const studentId = typeof data === 'object' ? data.studentId : data;
            const studentName = (typeof data === 'object' && data.name) 
                ? data.name 
                : (studentNames[studentId] || `Student (${studentId.substring(0,4)})`);

            // Play alert sound and display system notification
            playHandRaiseChime();
            showHandRaiseNotification(studentName);

            const btn = document.getElementById(`mic-${studentId}`);
            const card = document.getElementById(`card-${studentId}`);
            const grid = document.getElementById('studentGrid');
            
            if (btn && studentMicStatus[studentId] !== 'unmuted') { 
                btn.innerText = "✋ Hand Raised"; 
                btn.className = "mic-control-btn hand-raised"; 
                if (card && grid) {
                    grid.prepend(card); // Brings the student to the top of the teacher's list
                }
            }
        });
        

socket.on('single-student-unmuted-ui', (studentId) => {
  studentMicStatus[studentId] = 'unmuted';
  const btn = document.getElementById(`mic-${studentId}`);
  if (btn) { btn.innerText = "Live 🎙️"; btn.className = "mic-control-btn mic-on"; }
});

socket.on('single-student-muted-ui', (studentId) => {
  studentMicStatus[studentId] = 'muted';
  const btn = document.getElementById(`mic-${studentId}`);
  if (btn) { btn.innerText = "Muted 🔇"; btn.className = "mic-control-btn mic-off"; }
});

socket.on('all-students-muted-ui', () => {
  for (let userId in studentMicStatus) {
    studentMicStatus[userId] = 'muted';
    const btn = document.getElementById(`mic-${userId}`);
    if (btn) { btn.innerText = "Muted 🔇"; btn.className = "mic-control-btn mic-off"; }
  }
});

socket.on('all-students-unmuted-ui', () => {
  for (let userId in studentMicStatus) {
    studentMicStatus[userId] = 'unmuted';
    const btn = document.getElementById(`mic-${userId}`);
    if (btn) { btn.innerText = "Live 🎙️"; btn.className = "mic-control-btn mic-on"; }
  }
});

             function showStudentNotification(studentName) {
                if ("Notification" in window && Notification.permission === "granted") {
                    new Notification("New Student Join Request 🎓", {
                        body: `${studentName} wants to enter the class.`
                    });
                }
            }

        socket.on('student-join-request', ({ id, name }) => {
            playJoinChime();
            showStudentNotification(name);
        });
// notification for the raise hand

function playHandRaiseChime() {
            try {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const now = audioCtx.currentTime;

                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();

                osc.type = 'triangle';
                osc.frequency.setValueAtTime(523.25, now);        // C5
                osc.frequency.setValueAtTime(659.25, now + 0.12); // E5
                osc.frequency.setValueAtTime(783.99, now + 0.24); // G5

                gain.gain.setValueAtTime(0.25, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

                osc.connect(gain);
                gain.connect(audioCtx.destination);

                osc.start(now);
                osc.stop(now + 0.5);
            } catch (e) {
                console.warn("Hand raise chime failed:", e);
            }
        }

        function showHandRaiseNotification(studentName) {
            if ("Notification" in window && Notification.permission === "granted") {
                new Notification("✋ Hand Raised!", {
                    body: `${studentName} raised their hand to ask a question.`,
                    icon: "/favicon.ico"
                });
            }
        }


        // --- NOTIFICATION & SOUND FOR STUDENT REQUESTS ---
 function playJoinChime() {
            try {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const now = audioCtx.currentTime;

                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(740, now);          // F#5
                osc.frequency.setValueAtTime(880, now + 0.12);     // A5

                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

                osc.connect(gain);
                gain.connect(audioCtx.destination);

                osc.start(now);
                osc.stop(now + 0.4);
            } catch (e) {
                console.warn("Audio chime failed:", e);
            }
        }


// ==========================================
// 6. Realtime Sync Chat & File Sharing
// ==========================================
masterChatBtn.onclick = () => {
  if (!isChatPanelOpen) {
    chatPanel.classList.add('open');
    masterChatBtn.innerText = "Close Chat ✖";
    masterChatBtn.style.background = "#ea4335";
    isChatPanelOpen = true;
    socket.emit('toggle-room-chat', { open: true });
  } else {
    chatPanel.classList.remove('open');
    masterChatBtn.innerText = "Chat Board 💬";
    masterChatBtn.style.background = "#ff9800";
    isChatPanelOpen = false;
    socket.emit('toggle-room-chat', { open: false });
  }
};

document.getElementById('sendMsgBtn').onclick = sendTextMessage;
document.getElementById('msgInput').onkeypress = (e) => { if (e.key === 'Enter') sendTextMessage(); };

function sendTextMessage() {
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  if (!text) return;
  const data = { sender: 'Teacher', text };
  socket.emit('send-message', data);
  appendMsg(data, 'msg-me');
  input.value = '';
}

document.getElementById('fileInput').onchange = function (e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) return alert("File size must be under 10MB");

  const reader = new FileReader();
  reader.onload = function (evt) {
    const fileData = {
      sender: 'Teacher',
      fileName: file.name,
      fileBuffer: evt.target.result
    };
    socket.emit('share-file', fileData);
    appendFile(fileData, 'msg-me');
  };
  reader.readAsDataURL(file);
};

function appendMsg(data, className) {
  const win = document.getElementById('chatWindow');
  const div = document.createElement('div');
  div.className = `msg-block ${className}`;
  div.innerHTML = `<strong>${data.sender}:</strong> ${data.text}`;
  win.appendChild(div);
  win.scrollTop = win.scrollHeight;
}

function appendFile(data, className) {
  const win = document.getElementById('chatWindow');
  const div = document.createElement('div');
  div.className = `msg-block ${className}`;
  div.innerHTML = `<strong>${data.sender} Shared:</strong> <a class="file-link" href="${data.fileBuffer}" download="${data.fileName}">📁 ${data.fileName}</a>`;
  win.appendChild(div);
  win.scrollTop = win.scrollHeight;
}

socket.on('receive-message', (data) => appendMsg(data, 'msg-other'));
socket.on('receive-file', (data) => appendFile(data, 'msg-other'));

// Room Info & User Tracking
socket.on('all-users', ({ users, count }) => {
  updateCountUI(count);
  users.forEach(u => { if (u.role === 'student' && u.name) studentNames[u.id] = u.name; });
});
socket.on('user-joined', ({ userId, role, name, count }) => {
  updateCountUI(count);
  if (role === 'student' && name) studentNames[userId] = name;
});
socket.on('room-count-update', ({ count }) => updateCountUI(count));

socket.on('pending-list-update', (list) => {
  pendingListItems.innerHTML = '';
  if (!list || !list.length) {
    pendingBox.style.display = 'none';
    return;
  }
  pendingBox.style.display = 'flex';
  pendingBadge.innerText = list.length;
  list.forEach(student => {
    const item = document.createElement('div');
    item.className = 'pending-item';
    item.innerHTML = `
      <div class="pending-item-name">👤 ${student.name}</div>
      <div class="pending-actions">
        <button class="btn-accept" onclick="acceptStudent('${student.id}')">Accept ✅</button>
        <button class="btn-reject" onclick="rejectStudent('${student.id}')">Reject ❌</button>
      </div>
    `;
    pendingListItems.appendChild(item);
  });
});

window.acceptStudent = (id) => socket.emit('accept-student', { studentId: id });
window.rejectStudent = (id) => socket.emit('reject-student', { studentId: id });

// ==========================================
// 7. Keyboard Shortcuts
// ==========================================
window.addEventListener('keydown', (e) => {
  const activeTag = document.activeElement.tagName.toLowerCase();
  if (activeTag === 'input' || activeTag === 'textarea') return;

  const isCtrlOrCmd = e.ctrlKey || e.metaKey;

  if (e.key === 'F2') {
    e.preventDefault();
    toggleClassroomView();
    return;
  }
  if (isCtrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 'i') {
    e.preventDefault();
    document.getElementById('imgUpload').click();
    return;
  }
  if (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    document.getElementById('pdfUpload').click();
    return;
  }
  if (e.key.toLowerCase() === 'w') {
    e.preventDefault();
    document.getElementById('btnOpenBrowser').click();
    return;
  }
  if (e.key.toLowerCase() === 'h' && !isCtrlOrCmd) {
    toggleToolbar();
    return;
  }
  if (isCtrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    document.getElementById('btnUndo').click();
    return;
  }
  if ((isCtrlOrCmd && e.key.toLowerCase() === 'y') || (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'z')) {
    e.preventDefault();
    document.getElementById('btnRedo').click();
    return;
  }
  if (isCtrlOrCmd && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    document.getElementById('btnDuplicateObj').click();
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (canvas.getActiveObject()) {
      e.preventDefault();
      document.getElementById('btnDeleteObj').click();
      return;
    }
  }
  if (e.shiftKey && e.key.toLowerCase() === 'b') {
    e.preventDefault();
    bgColorPicker.click();
    return;
  }
  if (e.key.toLowerCase() === 'o' || e.key === 'Tab') {
    e.preventDefault();
    togglePageSidebar();
    return;
  }
  if (e.key === 'ArrowRight' && isCtrlOrCmd) {
    e.preventDefault();
    insertPageAfterCurrent();
    return;
  }

  switch (e.key.toLowerCase()) {
    case 'm':
      e.preventDefault();
      resetTools();
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      const hex = colorPicker.value;
      canvas.freeDrawingBrush.color = `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, 0.4)`;
      canvas.freeDrawingBrush.width = parseInt(sizePicker.value, 10) * 4;
      break;
    case 'c':
      e.preventDefault();
      colorPicker.click();
      break;
    case 'v': document.getElementById('btnSelect').click(); break;
    case 'p':
    case 'b': document.getElementById('btnPen').click(); break;
    case 'e': document.getElementById('btnEraser').click(); break;
    case '[':
      sizePicker.value = Math.max(1, parseInt(sizePicker.value, 10) - 2);
      sizePicker.dispatchEvent(new Event('input'));
      break;
    case ']':
      sizePicker.value = Math.min(50, parseInt(sizePicker.value, 10) + 2);
      sizePicker.dispatchEvent(new Event('input'));
      break;
    case 'arrowright': document.getElementById('btnNextPage').click(); break;
    case 'arrowleft': document.getElementById('btnPrevPage').click(); break;
  }
});

// Initial Setup
recordState();
updatePageUI();