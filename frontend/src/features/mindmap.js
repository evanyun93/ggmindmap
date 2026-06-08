import { apiFetch } from '../services/api.js';
import { getMindmapHTML } from '../components/mindmap.js';
import { contextMenu } from '../utils/context-menu.js';
import { syncService, SYNC_DATA_TYPES } from '../services/sync.js';

// ── 노드 색상 팔레트 ──────────────────────────────────────────────
const NODE_COLORS = [
    { fill: 'rgba(139,92,246,0.18)',  stroke: '#a78bfa', glow: 'rgba(139,92,246,0.55)' }, // purple
    { fill: 'rgba(6,182,212,0.18)',   stroke: '#22d3ee', glow: 'rgba(6,182,212,0.55)'  }, // cyan
    { fill: 'rgba(244,63,94,0.18)',   stroke: '#fb7185', glow: 'rgba(244,63,94,0.55)'  }, // rose
    { fill: 'rgba(16,185,129,0.18)',  stroke: '#34d399', glow: 'rgba(16,185,129,0.55)' }, // emerald
    { fill: 'rgba(245,158,11,0.18)',  stroke: '#fbbf24', glow: 'rgba(245,158,11,0.55)' }, // amber
    { fill: 'rgba(99,102,241,0.18)',  stroke: '#818cf8', glow: 'rgba(99,102,241,0.55)' }, // indigo
    { fill: 'rgba(236,72,153,0.18)',  stroke: '#f472b6', glow: 'rgba(236,72,153,0.55)' }, // pink
];
const MAIN_COLOR = { fill: 'rgba(139,92,246,0.22)', stroke: '#8B5CF6', glow: 'rgba(139,92,246,0.7)' };

let nodeColorIndex = 0;

function getNodeColor(node) {
    if (node.isMain && node.colorIdx == null) return MAIN_COLOR;
    const idx = node.colorIdx ?? (node.id % NODE_COLORS.length);
    return NODE_COLORS[idx % NODE_COLORS.length];
}

let nodes = [];
let links = [];
let selectedNodeId = null;

// ── 위젯 모드 (위젯 편집 모드일 때 widgetId/settings 보관) ─────────
let _widgetId       = null;
let _widgetSettings = null; // 위젯 전체 settings (레이아웃 등 보존용)

// ── 상태 ────────────────────────────────────────────────────────
let draggingNodeId = null;
let dragOffsetX = 0, dragOffsetY = 0;
let connectSourceId = null;

// ── 캔버스 팬 상태 ───────────────────────────────────────────────
let canvasPanX = 0, canvasPanY = 0;
let isPanning = false, panSX = 0, panSY = 0;

// 더블클릭 감지
let lastClickNodeId = null;
let lastClickTime   = 0;
const DBLCLICK_MS   = 350;

// ── 리사이즈 상태 ──────────────────────────────────────────────
let resizingNodeId   = null;   // 리사이즈 모드 중인 노드 ID
let resizeDragHandle = null;   // 현재 드래그 중인 핸들 키 ('n','s','e','w','nw','ne','sw','se')
let resizeDragStartX = 0, resizeDragStartY = 0;
let resizeDragStartDims = null; // 핸들 드래그 시작 시점 치수
let resizeOriginalDims  = null; // ESC 취소용 원래 치수
let _hintBarOrigHTML    = null; // 리사이즈 모드 전 힌트바 복원용

// ── 줌 상태 ──────────────────────────────────────────────────────
let canvasZoom = 1;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 4;

// ── 터치 상태 ────────────────────────────────────────────────────
let touchNodeDragId  = null, touchNodeOffX = 0, touchNodeOffY = 0;
let touchPanActive   = false, touchPanStartX = 0, touchPanStartY = 0;
let touchPanCanvasX  = 0, touchPanCanvasY = 0;

// ── 그리기 상태 ──────────────────────────────────────────────────
let isDrawingMode  = false;
let drawingStrokes = [];
let currentStroke  = null;
let currentDrawingColorIdx = 0; // 현재 선택된 그리기 색상 인덱스

// ── 텍스트 핸들 조작 상태 ────────────────────────────────────────
let textDraggingNodeId = null;
let textDragStartOffX  = 0;
let textDragStartOffY  = 0;
let textDragStartX     = 0;
let textDragStartY     = 0;
let pinchActive      = false, pinchStartDist = 0, pinchStartZoom = 1;
let pinchStartMidX   = 0, pinchStartMidY = 0;
let pinchStartPanX   = 0, pinchStartPanY = 0;
let mobileConnectMode = false;

// ── 텍스트 이동 모드 상태 ────────────────────────────────────────
let textMoveModeNodeId  = null;  // 텍스트 이동 모드 중인 노드 ID
let textLongPressTimer  = null;  // 모바일 텍스트 꾹 누르기 타이머

// ── 다중 선택 상태 ───────────────────────────────────────────────
let selectedNodeIds   = new Set(); // 다중 선택된 노드 ID 집합
let isRectSelecting   = false;     // 영역 선택 드래그 중
let rectSX = 0, rectSY = 0;       // 선택 영역 시작점 (SVG canvas 좌표)
let rectEX = 0, rectEY = 0;       // 선택 영역 끝점 (SVG canvas 좌표)
let multiDragOffsets  = new Map(); // nodeId → { offX, offY } — 다중 드래그 오프셋
let isMobileSelectMode = false;    // 모바일 영역 선택 모드 토글

// ── Undo / Redo 히스토리 ────────────────────────────────────────
const MAX_HISTORY = 50;
let undoStack = [];
let redoStack = [];

// ── 클립보드 (복사/붙여넣기) ────────────────────────────────────
let _clipboard = []; // 복사된 노드 배열 (딥카피)

function saveSnapshot() {
    undoStack.push({
        nodes: JSON.parse(JSON.stringify(nodes)),
        links: JSON.parse(JSON.stringify(links))
    });
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
    updateUndoRedoButtons();
}

function undo() {
    if (undoStack.length === 0) return;
    redoStack.push({
        nodes: JSON.parse(JSON.stringify(nodes)),
        links: JSON.parse(JSON.stringify(links))
    });
    const snap = undoStack.pop();
    nodes = snap.nodes;
    links = snap.links;
    selectedNodeId = null;
    renderMindmap();
    saveMindmap();
    updateUndoRedoButtons();
}

function redo() {
    if (redoStack.length === 0) return;
    undoStack.push({
        nodes: JSON.parse(JSON.stringify(nodes)),
        links: JSON.parse(JSON.stringify(links))
    });
    const snap = redoStack.pop();
    nodes = snap.nodes;
    links = snap.links;
    selectedNodeId = null;
    renderMindmap();
    saveMindmap();
    updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('mmMobUndo');
    const redoBtn = document.getElementById('mmMobRedo');
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

// ── 다중 선택 헬퍼 ──────────────────────────────────────────────

/** SVG canvas 좌표 기준으로 사각형 안에 걸치는 노드 ID 배열 반환 */
function getNodesInRect(x1, y1, x2, y2) {
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    return nodes.filter(node => {
        const hw = node.type === 'circle' ? (node.radius || 50)    : (node.width  || 120) / 2;
        const hh = node.type === 'circle' ? (node.radius || 50)    : (node.height ||  80) / 2;
        // 노드 bounding box가 선택 영역과 겹치면 포함
        return node.x + hw >= minX && node.x - hw <= maxX &&
               node.y + hh >= minY && node.y - hh <= maxY;
    }).map(n => n.id);
}

/** 영역 선택 사각형 SVG 요소를 그리거나 지운다 */
function renderSelectionRect() {
    const g = document.getElementById('selectionRect');
    if (!g) return;
    if (!isRectSelecting) { g.innerHTML = ''; return; }
    const x = Math.min(rectSX, rectEX);
    const y = Math.min(rectSY, rectEY);
    const w = Math.abs(rectEX - rectSX);
    const h = Math.abs(rectEY - rectSY);
    g.innerHTML = `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="mm-select-rect"/>`;
}

/** 다중 선택 전체 해제 */
function clearMultiSelection() {
    if (selectedNodeIds.size === 0) return;
    selectedNodeIds.clear();
    renderMindmap();
    updateHintBar();
}

/** 다중 선택된 노드 일괄 삭제 (isMain 제외) */
function deleteMultiSelected() {
    const toDelete = [...selectedNodeIds].filter(id => {
        const n = nodes.find(n => n.id === id);
        return n && !n.isMain;
    });
    if (toDelete.length === 0) return;
    saveSnapshot();
    toDelete.forEach(id => {
        nodes = nodes.filter(n => n.id !== id);
        links = links.filter(l => l.source !== id && l.target !== id);
    });
    selectedNodeIds.clear();
    selectedNodeId = null;
    renderMindmap();
    saveMindmap();
    updateHintBar();
}

/** 다중 드래그 중 모든 노드 DOM 위치를 갱신하고 링크를 재렌더 */
function updateMultiDragDOM() {
    multiDragOffsets.forEach((_, id) => {
        const node = nodes.find(n => n.id === id);
        if (!node) return;
        const g = document.querySelector(`.node-group[data-node-id="${id}"]`);
        if (g) g.setAttribute('transform', `translate(${node.x},${node.y})`);
    });
    const lg = document.getElementById('linksGroup');
    if (lg) {
        lg.innerHTML = links.map(link => {
            const s = nodes.find(n => n.id === link.source);
            const t = nodes.find(n => n.id === link.target);
            if (!s || !t) return '';
            const sp = edgePoint(s, t), tp = edgePoint(t, s);
            const cx = (sp.x + tp.x) / 2, cy = (sp.y + tp.y) / 2 - 30;
            return `<path d="M${sp.x},${sp.y} Q${cx},${cy} ${tp.x},${tp.y}" class="mindmap-link" marker-end="url(#arrowhead)"/>`;
        }).join('');
    }
}

/** 모바일 영역 선택 모드 토글 */
function toggleMobileSelectMode() {
    isMobileSelectMode = !isMobileSelectMode;
    if (!isMobileSelectMode) {
        isRectSelecting = false;
        renderSelectionRect();
        clearMultiSelection();
    }
    document.getElementById('mmMobSelect')?.classList.toggle('active', isMobileSelectMode);
    updateHintBar();
}

// ── 유틸리티 ────────────────────────────────────────────────────
function getEventSVGCoords(e) {
    const svg = document.getElementById('mindmapSVG');
    const rect = svg.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    
    return {
        x: (t.clientX - rect.left - canvasPanX) / canvasZoom,
        y: (t.clientY - rect.top  - canvasPanY) / canvasZoom
    };
}

// ── 초기화 ──────────────────────────────────────────────────────
// widgetId: 위젯 편집 모드일 때 위젯 ID, null이면 전역 마인드맵
// widgetSettings: 위젯의 전체 settings 객체 (저장 시 레이아웃 등 보존)
export async function initMindmap(widgetId = null, widgetSettings = null) {
    _widgetId       = widgetId       ?? null;
    _widgetSettings = widgetSettings ?? null;

    const appRoot = document.getElementById('app-root');
    appRoot.innerHTML = getMindmapHTML();

    if (_widgetId !== null) {
        // 위젯 모드: settings.mindmapData 사용
        const saved = _widgetSettings?.mindmapData;
        if (saved && Array.isArray(saved.nodes) && saved.nodes.length > 0) {
            nodes = saved.nodes;
            links = saved.links || [];
        } else {
            nodes = [];
            links = [];
        }
    } else {
        await loadMindmapData();
    }

    if (nodes.length === 0) {
        nodes.push({
            id: Date.now(), text: '중심 생각',
            x: window.innerWidth / 2, y: window.innerHeight / 2,
            type: 'circle', radius: 60, isMain: true
        });
    }

    renderMindmap();
    setupEvents();
    initEditorEvents();

    // 마인드맵 컨테이너에 맞게 컨텍스트 메뉴 초기화
    contextMenu.init();
    contextMenu.bindGlobalListeners('#mindmapCanvasContainer');

    // 모바일: 모바일 바 표시, 화면에 노드 맞추기 (힌트바는 유지)
    if (window.innerWidth <= 1024) {
        document.getElementById('mmMobileBar')?.classList.add('mm-mobile-bar--visible');
        fitView();
        updateZoomIndicator();
    }

    updateHintBar(); // 환경에 맞게 힌트 바 텍스트 갱신

    // 실시간 동기화 리스너 (위젯 모드는 해당 위젯 ID, 전역 모드는 ID 0 사용)
    const watchId = _widgetId !== null ? _widgetId : 0;
    syncService.watchWidget(watchId, async () => {
        if (_widgetId !== null) return; // 위젯 모드에서는 외부 푸시 무시 (본인이 편집 중)
        console.log('[Mindmap] 실시간 데이터 업데이트 감지 - 데이터 재로드');
        await loadMindmapData();
        renderMindmap();
    });
}

// ── 편집기 이벤트 ─────────────────────────────────────────────
function initEditorEvents() {
    const input = document.getElementById('nodeTextInput');
    if (!input) return;

    window._applyNodeEdit = () => {
        const id = window._editNodeId;
        if (id == null) return;
        
        // input element might not be directly available, fetch it just in case
        const currentInput = document.getElementById('nodeTextInput');
        if (!currentInput) return;
        
        const node = nodes.find(n => n.id === id);
        if (node && node.text !== currentInput.value) { saveSnapshot(); node.text = currentInput.value; renderMindmap(); saveMindmap(); }
        closeEditor();
    };

    input.addEventListener('keydown', e => {
        // Shift+Enter → 편집 완료
        if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); window._applyNodeEdit(); return; }
        // Enter 단독 → 개행 (기본 textarea 동작, 높이 자동 조정)
        if (e.key === 'Enter') {
            requestAnimationFrame(() => autoResizeTextarea(input));
            return;
        }
        if (e.key === 'Escape') { e.preventDefault(); closeEditor(); }
        // Backspace: 완전히 비어있을 때만 노드 삭제
        if ((e.key === 'Delete' || e.key === 'Backspace') && input.value === '') {
            const id = window._editNodeId;
            if (id == null) return;
            const node = nodes.find(n => n.id === id);
            if (!node || node.isMain) { if (node?.isMain) window.appAlert('중심 노드는 삭제할 수 없습니다.'); return; }
            saveSnapshot();
            nodes = nodes.filter(n => n.id !== id);
            links = links.filter(l => l.source !== id && l.target !== id);
            renderMindmap(); saveMindmap(); closeEditor();
        }
    });

    // textarea 높이 자동 조정
    input.addEventListener('input', () => autoResizeTextarea(input));

    // 조작 안지지(pointer-events 다운)  → 외부 클릭 시 저장 후 닫기
    input.addEventListener('blur', () => {
        setTimeout(() => { if (window._editNodeId != null) window._applyNodeEdit(); }, 100);
    });
}

function closeEditor() {
    window._editNodeId = null;
    const ed = document.getElementById('nodeEditor');
    if (ed) ed.classList.add('hidden');
}

function openEditor(nodeId) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    window._editNodeId = nodeId;
    const editor = document.getElementById('nodeEditor');
    const input  = document.getElementById('nodeTextInput');
    if (!editor || !input) return;

    const svg     = document.getElementById('mindmapSVG');
    const svgRect = svg.getBoundingClientRect();
    const sx = svgRect.left + canvasPanX + node.x * canvasZoom;
    const sy = svgRect.top  + canvasPanY + node.y * canvasZoom;

    const nW = (node.type === 'rect' || node.type === 'triangle' || node.type === 'freehand') ? (node.width  || 120) : (node.radius || 50) * 2;
    const nH = (node.type === 'rect' || node.type === 'triangle' || node.type === 'freehand') ? (node.height || 60)  : (node.radius || 50) * 2;

    const isMob = window.innerWidth <= 1024;
    const edW   = Math.min(Math.max(nW * canvasZoom + 24, isMob ? 200 : 160), window.innerWidth - 16);
    const edH   = Math.max(nH * canvasZoom, isMob ? 52 : 44);
    const topH  = isMob ? 48 : 54;
    const botH  = isMob ? 130 : 0;
    const clampL = Math.max(8, Math.min(sx - edW / 2, window.innerWidth  - edW - 8));
    const clampT = Math.max(topH + 8, Math.min(sy - edH / 2, window.innerHeight - edH - botH - 8));

    editor.classList.remove('hidden');
    Object.assign(editor.style, {
        position:  'fixed',
        left:      `${clampL}px`,
        top:       `${clampT}px`,
        width:     `${edW}px`,
        minHeight: `${edH}px`,
        height:    'auto',
        transform: 'none',
    });

    input.style.fontSize = node.isMain ? '17px' : '14px';
    input.value = node.text || '';
    requestAnimationFrame(() => {
        autoResizeTextarea(input);
        input.focus();
        input.select();
    });
}

// ── 유틸 ────────────────────────────────────────────────────────
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function autoResizeTextarea(ta) {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
}

// ── 캔버스 팬 / 줌 헬퍼 ─────────────────────────────────────────
function applyCanvasPan() {
    const g = document.getElementById('mm-pan-group');
    if (g) g.setAttribute('transform', `translate(${canvasPanX},${canvasPanY}) scale(${canvasZoom})`);
    updateZoomIndicator();
}

function updateZoomIndicator() {
    const el = document.getElementById('mmZoomLevel');
    if (el) el.textContent = `${Math.round(canvasZoom * 100)}%`;
}

function updateHintBar() {
    const guide = document.getElementById('mindmapGuide');
    if (!guide) return;

    // 다중 선택 중 (PC/모바일 공통)
    if (selectedNodeIds.size > 1) {
        guide.innerHTML =
            `<span class="mm-hint-item" style="color:#a78bfa"><kbd>${selectedNodeIds.size}개 선택됨</kbd></span>` +
            `<span class="mm-hint-sep">·</span>` +
            `<span class="mm-hint-item"><kbd>드래그</kbd> 일괄 이동</span>` +
            `<span class="mm-hint-sep">·</span>` +
            `<span class="mm-hint-item"><kbd>Del</kbd> 일괄 삭제</span>` +
            `<span class="mm-hint-sep">·</span>` +
            `<span class="mm-hint-item"><kbd>ESC</kbd> 선택 해제</span>`;
        return;
    }

    // PC환경이 아닐 경우 (모바일/태블릿)
    if (window.innerWidth <= 1024) {
        // 모바일 선택 모드
        if (isMobileSelectMode) {
            guide.innerHTML = `<span class="mm-hint-item" style="color:#F59E0B"><kbd>선택 모드</kbd> 드래그로 영역 선택 · 삭제버튼으로 일괄 삭제</span>`;
            return;
        }
        if (mobileConnectMode) {
            if (connectSourceId) {
                guide.innerHTML = `<span class="mm-hint-item" style="color:#10B981"><kbd>연결 모드</kbd> 연결할 두 번째 노드를 탭하세요</span>`;
            } else {
                guide.innerHTML = `<span class="mm-hint-item" style="color:#F59E0B"><kbd>연결 모드</kbd> 기준이 될 첫 번째 노드를 탭하세요</span>`;
            }
        } else {
            guide.innerHTML =
                `<span class="mm-hint-item"><kbd>메뉴</kbd> 꾹 누르기</span>` +
                `<span class="mm-hint-sep">·</span>` +
                `<span class="mm-hint-item"><kbd>이동</kbd> 드래그</span>` +
                `<span class="mm-hint-sep">·</span>` +
                `<span class="mm-hint-item"><kbd>편집</kbd> 두번 탭</span>` +
                `<span class="mm-hint-sep">·</span>` +
                `<span class="mm-hint-item"><kbd>연결</kbd> 연결버튼</span>` +
                `<span class="mm-hint-sep">·</span>` +
                `<span class="mm-hint-item"><kbd>줌</kbd> 핀치</span>`;
        }
    } else {
        guide.innerHTML =
            `<span class="mm-hint-item"><kbd>우클릭</kbd> 도형 추가</span>` +
            `<span class="mm-hint-sep">·</span>` +
            `<span class="mm-hint-item"><kbd>Shift+드래그</kbd> 영역 선택</span>` +
            `<span class="mm-hint-sep">·</span>` +
            `<span class="mm-hint-item"><kbd>더블클릭</kbd> 편집</span>` +
            `<span class="mm-hint-sep">·</span>` +
            `<span class="mm-hint-item"><kbd>Shift+클릭</kbd> 연결</span>` +
            `<span class="mm-hint-sep">·</span>` +
            `<span class="mm-hint-item"><kbd>휠</kbd> 줌</span>`;
    }
}

function fitView() {
    if (nodes.length === 0) return;
    const PADDING = 80;
    const topbarH  = window.innerWidth <= 1024 ? 48 : 54;
    const bottomH  = window.innerWidth <= 1024 ? 122 : 0;
    const canvasW  = window.innerWidth;
    const canvasH  = window.innerHeight - topbarH - bottomH;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(n => {
        const hw = n.type === 'circle' ? (n.radius || 50) : (n.width  || 120) / 2;
        const hh = n.type === 'circle' ? (n.radius || 50) : (n.height || 80)  / 2;
        minX = Math.min(minX, n.x - hw);
        maxX = Math.max(maxX, n.x + hw);
        minY = Math.min(minY, n.y - hh);
        maxY = Math.max(maxY, n.y + hh);
    });

    const contentW = maxX - minX + PADDING * 2;
    const contentH = maxY - minY + PADDING * 2;
    const newZoom  = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(canvasW / contentW, canvasH / contentH)));

    canvasZoom = newZoom;
    canvasPanX = canvasW / 2 - ((minX + maxX) / 2) * newZoom;
    canvasPanY = canvasH / 2 - ((minY + maxY) / 2) * newZoom;
    applyCanvasPan();
}

function zoomAt(factor, screenX, screenY) {
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, canvasZoom * factor));
    canvasPanX = screenX - (screenX - canvasPanX) * (newZoom / canvasZoom);
    canvasPanY = screenY - (screenY - canvasPanY) * (newZoom / canvasZoom);
    canvasZoom = newZoom;
    applyCanvasPan();
}

function addNodeAtCenter(type) {
    const topbarH = window.innerWidth <= 1024 ? 48 : 54;
    const bottomH = window.innerWidth <= 1024 ? 122 : 0;
    const cx = window.innerWidth  / 2;
    const cy = topbarH + (window.innerHeight - topbarH - bottomH) / 2;
    addNode(type, cx, cy);
}

function toggleMobileConnect() {
    mobileConnectMode = !mobileConnectMode;
    if (!mobileConnectMode) { connectSourceId = null; renderMindmap(); }
    document.getElementById('mmMobConnect')?.classList.toggle('active', mobileConnectMode);
    updateHintBar();
}

function mobileDeleteSelected() {
    // 다중 선택 일괄 삭제
    if (selectedNodeIds.size > 0) { deleteMultiSelected(); return; }
    if (selectedNodeId == null) return;
    const node = nodes.find(n => n.id === selectedNodeId);
    if (!node || node.isMain) { if (node?.isMain) window.appAlert('중심 노드는 삭제할 수 없습니다.'); return; }
    deleteNode(selectedNodeId);
}

// ── 노드 추가 ────────────────────────────────────────────────────
function addNode(type, clientX, clientY) {
    const svg = document.getElementById('mindmapSVG');
    const rect = svg.getBoundingClientRect();
    nodeColorIndex = (nodeColorIndex + 1) % NODE_COLORS.length;
    const newNode = {
        id: Date.now(), text: '',
        x: (clientX - rect.left - canvasPanX) / canvasZoom,
        y: (clientY - rect.top  - canvasPanY) / canvasZoom,
        type,
        radius: type === 'circle'   ? 50  : undefined,
        width:  type !== 'circle'   ? 120 : undefined,
        height: type === 'rect'     ? 60  : type === 'triangle' ? 100 : undefined,
        colorIdx: nodeColorIndex
    };
    saveSnapshot();
    nodes.push(newNode);
    renderMindmap();
    openEditor(newNode.id);
}

// ── 렌더링 ──────────────────────────────────────────────────────
async function loadMindmapData() {
    try {
        // SyncService에서 마인맵 데이터 가져오기
        const savedData = await syncService.getData('mindmap_data');
        if (savedData) {
            const data = typeof savedData === 'string' ? JSON.parse(savedData) : savedData;
            nodes = data.nodes || [];
            links = data.links || [];
            return;
        }
        
        // 폴백: 기존 API 사용
        const res  = await apiFetch('/api/mindmap');
        const data = await res.json();
        if (data.success && data.data) {
            nodes = data.data.nodes || [];
            links = data.data.links || [];
        }
    } catch (e) { console.error('[Mindmap] 로드 실패', e); }
}

function edgePoint(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const d  = Math.hypot(dx, dy);
    if (d === 0) return { x: from.x, y: from.y };
    const nx = dx / d, ny = dy / d;
    if (from.type === 'rect' || from.type === 'freehand') {
        const hw = (from.width  || 120) / 2;
        const hh = (from.height || 60)  / 2;
        const t  = Math.min(nx ? hw / Math.abs(nx) : Infinity,
                            ny ? hh / Math.abs(ny) : Infinity);
        return { x: from.x + nx * t, y: from.y + ny * t };
    }
    if (from.type === 'triangle') {
        const w = from.width || 120;
        const h = from.height || 100;
        const hw = w * 0.4; 
        const hh = h * 0.4;
        const t  = Math.min(nx ? hw / Math.abs(nx) : Infinity,
                            ny ? hh / Math.abs(ny) : Infinity);
        return { x: from.x + nx * t, y: from.y + ny * t };
    }
    const r = from.radius || 50;
    return { x: from.x + nx * r, y: from.y + ny * r };
}

function generateFreehandPath(node) {
    if (!node.strokes || !node.strokes.length) return '';
    const bw = node.baseWidth || node.width;
    const bh = node.baseHeight || node.height;
    const scaleX = node.width / bw;
    const scaleY = node.height / bh;

    return node.strokes.map(stroke => {
        if (!stroke.length) return '';
        const pts = stroke.map(p => `${p.x * scaleX},${p.y * scaleY}`);
        return `M${pts[0]} L${pts.slice(1).join(' L')}`;
    }).join(' ');
}

function renderNodeText(node) {
    let maxW = 100, maxH = 50;
    if (node.type === 'rect') {
        maxW = (node.width || 120) - 16;
        maxH = (node.height || 60) - 16;
    } else if (node.type === 'circle') {
        const r = node.radius || 50;
        maxW = r * 1.7;
        maxH = r * 1.7;
    } else if (node.type === 'triangle') {
        maxW = (node.width || 120) * 0.6;
        maxH = (node.height || 100) * 0.6;
    } else if (node.type === 'freehand') {
        maxW = (node.width || 120) - 20;
        maxH = (node.height || 80) - 20;
    }

    const CHAR_WIDTH = node.isMain ? 15 : 13;
    const LINE_H     = node.isMain ? 22 : 18;
    const CB_SIZE    = 12; // 체크박스 크기(px)
    const CB_GAP     = 4;  // 체크박스↔텍스트 간격

    const MAX_CHARS  = Math.max(5, Math.floor(maxW / CHAR_WIDTH));
    const MAX_LINES  = Math.max(2, Math.floor(maxH / LINE_H));

    // ── 텍스트를 종류별 라인으로 파싱 ──────────────────────────
    // kind: 'text' | 'checkbox' | 'url'
    const rawLines = (node.text || '').split('\n');
    const parsedLines = [];

    rawLines.forEach((rawLine, rawIdx) => {
        // 체크박스: [] 또는 [x] 또는 [ ] 로 시작하는 줄
        const cbMatch = rawLine.match(/^\[([ xX]?)\](.*)/);
        if (cbMatch) {
            const checked = /[xX]/.test(cbMatch[1]);
            const rest = cbMatch[2].startsWith(' ') ? cbMatch[2].slice(1) : cbMatch[2];
            const effMax = Math.max(3, MAX_CHARS - 3);
            if (rest.length <= effMax) {
                parsedLines.push({ kind: 'checkbox', text: rest, checked, rawIdx });
            } else {
                parsedLines.push({ kind: 'checkbox', text: rest.slice(0, effMax), checked, rawIdx });
                for (let i = effMax; i < rest.length; i += MAX_CHARS)
                    parsedLines.push({ kind: 'text', text: rest.slice(i, i + MAX_CHARS), rawIdx });
            }
            return;
        }
        // URL: http:// 또는 https:// 로 시작하는 줄
        const trimmed = rawLine.trim();
        if (/^https?:\/\/\S/.test(trimmed)) {
            const display = trimmed.length > MAX_CHARS ? trimmed.slice(0, MAX_CHARS - 1) + '…' : trimmed;
            parsedLines.push({ kind: 'url', text: display, url: trimmed, rawIdx });
            return;
        }
        // 일반 텍스트 (자동 줄바꿈)
        if (rawLine.length <= MAX_CHARS) {
            parsedLines.push({ kind: 'text', text: rawLine, rawIdx });
        } else {
            for (let i = 0; i < rawLine.length; i += MAX_CHARS)
                parsedLines.push({ kind: 'text', text: rawLine.slice(i, i + MAX_CHARS), rawIdx });
        }
    });

    const displayLines = parsedLines.slice(0, MAX_LINES);
    if (parsedLines.length > MAX_LINES) {
        const last = displayLines[MAX_LINES - 1];
        last.text = last.text.slice(0, Math.max(1, MAX_CHARS - 1)) + '…';
    }

    const n = Math.max(1, displayLines.length);
    const tx = node.textOffsetX || 0;
    const ty = node.textOffsetY || 0;

    // ── 텍스트 정렬 ──────────────────────────────────────────
    const align = node.textAlign || 'center';
    const textAnchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
    const baseX = align === 'left' ? -(maxW / 2) + 4 : align === 'right' ? (maxW / 2) - 4 : 0;

    // ── 배경 박스 ─────────────────────────────────────────────
    const longestChars = Math.max(1, ...displayLines.map(l => (l.text || '').length));
    const hasCheckbox  = displayLines.some(l => l.kind === 'checkbox');
    const boxW = Math.min(maxW, longestChars * CHAR_WIDTH * 0.9 + 16 + (hasCheckbox ? CB_SIZE + CB_GAP : 0));
    const boxH = n * LINE_H + 8;
    const boxHTML = `<rect class="mm-text-box" x="${-boxW/2}" y="${-boxH/2+5}" width="${boxW}" height="${boxH}" rx="4" fill="transparent" stroke="transparent" stroke-width="1.5" stroke-dasharray="4 2" />`;

    // ── 첫 줄 Y (수직 중앙 정렬) ─────────────────────────────
    const firstY = n <= 1 ? (node.isMain ? 6 : 5) : -(((n - 1) / 2) * LINE_H) + 5;

    // ── 각 줄 렌더링 ──────────────────────────────────────────
    const lineEls = displayLines.map((line, i) => {
        const y = firstY + i * LINE_H;

        // 체크박스 줄
        if (line.kind === 'checkbox') {
            const textW   = (line.text?.length || 0) * CHAR_WIDTH * 0.5;
            const totalW  = CB_SIZE + CB_GAP + textW;
            const cbX = align === 'left'  ? baseX
                      : align === 'right' ? baseX - totalW
                      : -totalW / 2; // center
            const cbY = y - CB_SIZE + 2;
            const cbRect = `<rect x="${cbX}" y="${cbY}" width="${CB_SIZE}" height="${CB_SIZE}" rx="2" fill="transparent" stroke="rgba(160,160,185,0.8)" stroke-width="1.5" style="cursor:pointer" class="mm-checkbox-rect" data-raw-idx="${line.rawIdx}"/>`;
            const chk = line.checked
                ? `<polyline points="${cbX+2},${y-4} ${cbX+5},${y-1} ${cbX+10},${y-9}" stroke="#a78bfa" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>`
                : '';
            const txt = line.text
                ? `<text text-anchor="start" x="${cbX + CB_SIZE + CB_GAP}" y="${y}" class="node-text">${escapeHtml(line.text)}</text>`
                : '';
            return cbRect + chk + txt;
        }

        // URL 줄
        if (line.kind === 'url') {
            return `<text text-anchor="${textAnchor}" x="${baseX}" y="${y}" class="node-text node-text--url" data-href="${escapeHtml(line.url)}">${escapeHtml(line.text)}</text>`;
        }

        // 일반 텍스트 줄
        return `<text text-anchor="${textAnchor}" x="${baseX}" y="${y}" class="node-text">${escapeHtml(line.text ?? '')}</text>`;
    }).join('');

    return `<g class="node-text-group" transform="translate(${tx}, ${ty})" style="pointer-events: all;" onmousedown="window._nodeTextMouseDown(event, ${node.id})" ontouchstart="window._nodeTextTouchStart(event, ${node.id})" oncontextmenu="window._nodeTextContextMenu(event, ${node.id})">${boxHTML}${lineEls}</g>`;
}

function renderMindmap() {
    const ng = document.getElementById('nodesGroup');
    const lg = document.getElementById('linksGroup');
    if (!ng || !lg) return;

    lg.innerHTML = links.map(link => {
        const s = nodes.find(n => n.id === link.source);
        const t = nodes.find(n => n.id === link.target);
        if (!s || !t) return '';
        const sp = edgePoint(s, t), tp = edgePoint(t, s);
        const cx = (sp.x + tp.x) / 2, cy = (sp.y + tp.y) / 2 - 30;
        return `<path d="M${sp.x},${sp.y} Q${cx},${cy} ${tp.x},${tp.y}" class="mindmap-link" marker-end="url(#arrowhead)"/>`;
    }).join('');

    ng.innerHTML = nodes.map(node => {
        const isSelected      = selectedNodeId === node.id;
        const isMultiSelected = selectedNodeIds.has(node.id);
        const showOverlay     = isSelected || isMultiSelected;
        const color           = getNodeColor(node);
        const overlayStroke   = isMultiSelected ? '#fbbf24' : color.stroke;

        const selectionOverlay = showOverlay
            ? (node.type === 'rect' || node.type === 'freehand'
                ? `<rect class="selection-overlay" x="${-(node.width||120)/2-5}" y="${-(node.height||60)/2-5}" width="${(node.width||120)+10}" height="${(node.height||60)+10}" rx="${node.type==='freehand'?0:13}" fill="none" stroke="${overlayStroke}" stroke-width="1.5" stroke-dasharray="5 3" opacity="0.8"/>`
                : (node.type === 'triangle'
                    ? `<polygon class="selection-overlay" points="0,${-(node.height||100)/2-8} ${-(node.width||120)/2-8},${(node.height||100)/2+5} ${(node.width||120)/2+8},${(node.height||100)/2+5}" fill="none" stroke="${overlayStroke}" stroke-width="1.5" stroke-dasharray="5 3" opacity="0.8"/>`
                    : `<circle class="selection-overlay" r="${(node.radius||50)+5}" fill="none" stroke="${overlayStroke}" stroke-width="1.5" stroke-dasharray="5 3" opacity="0.8"/>`))
            : '';

        const shape = node.type === 'rect'
            ? `<rect x="${-(node.width||120)/2}" y="${-(node.height||60)/2}" width="${node.width||120}" height="${node.height||60}" rx="12" class="node-shape" fill="${color.fill}" stroke="${color.stroke}" stroke-width="${node.isMain?3:2}" filter="url(#glass-shadow)"/>`
            : (node.type === 'triangle'
                ? `<polygon points="0,${-(node.height||100)/2} ${-(node.width||120)/2},${(node.height||100)/2} ${(node.width||120)/2},${(node.height||100)/2}" class="node-shape" fill="${color.fill}" stroke="${color.stroke}" stroke-width="${node.isMain?3:2}" filter="url(#glass-shadow)"/>`
                : (node.type === 'freehand'
                    ? `<path d="${generateFreehandPath(node)}" class="node-shape" fill="${color.fill}" stroke="${color.stroke}" stroke-width="2" filter="url(#glass-shadow)"/>`
                    : `<circle r="${node.radius||50}" class="node-shape" fill="${color.fill}" stroke="${color.stroke}" stroke-width="${node.isMain?3:2}" filter="url(#glass-shadow)"/>`));

        const isConnSrc = connectSourceId === node.id;
        const cls = `node-group${node.isMain?' main':''}${isConnSrc?' connecting-source':''}${isSelected?' selected':''}${isMultiSelected?' multi-selected':''}`;

        const textEl = renderNodeText(node);

        return `<g class="${cls}" data-node-id="${node.id}" transform="translate(${node.x},${node.y})" style="--node-glow:${color.glow}" onmousedown="window._nodeMouseDown(event,${node.id})" oncontextmenu="window._nodeContextMenu(event,${node.id})">${selectionOverlay}${shape}${textEl}</g>`;
    }).join('');

    let inkHTML = '';
    if (drawingStrokes.length || currentStroke) {
        const all = [...drawingStrokes];
        if (currentStroke) all.push(currentStroke);
        const paths = all.map(stroke => {
            if (!stroke.length) return '';
            return `M${stroke[0].x},${stroke[0].y} L${stroke.slice(1).map(p => `${p.x},${p.y}`).join(' L')}`;
        }).join(' ');
        const color = NODE_COLORS[currentDrawingColorIdx];
        inkHTML = `<g class="mm-draw-ink"><path d="${paths}" stroke="${color.stroke}"/></g>`;
    }
    ng.insertAdjacentHTML('beforeend', inkHTML);
}

// ── 성능 개선을 위한 DOM 직접 업데이트 헬퍼 ────────────────────────
function setSelectedNodeDOM(nodeId) {
    if (selectedNodeId === nodeId && selectedNodeIds.size === 0) return;
    selectedNodeId = nodeId;

    // 단일 선택 전환 시 다중 선택 해제
    if (nodeId != null && selectedNodeIds.size > 0) {
        selectedNodeIds.clear();
        updateHintBar();
    }

    document.querySelectorAll('.node-group .selection-overlay').forEach(el => el.remove());
    document.querySelectorAll('.node-group.selected').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.node-group.multi-selected').forEach(el => el.classList.remove('multi-selected'));

    if (nodeId == null) return;
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    const g = document.querySelector(`.node-group[data-node-id="${nodeId}"]`);
    if (g) {
        g.classList.add('selected');
        const color = getNodeColor(node);
        let overlay = '';
        if (node.type === 'rect' || node.type === 'freehand') {
            overlay = `<rect class="selection-overlay" x="${-(node.width||120)/2-5}" y="${-(node.height||60)/2-5}" width="${(node.width||120)+10}" height="${(node.height||60)+10}" rx="${node.type==='freehand'?0:13}" fill="none" stroke="${color.stroke}" stroke-width="1.5" stroke-dasharray="5 3" opacity="0.8"/>`;
        } else if (node.type === 'triangle') overlay = `<polygon class="selection-overlay" points="0,${-(node.height||100)/2-8} ${-(node.width||120)/2-8},${(node.height||100)/2+5} ${(node.width||120)/2+8},${(node.height||100)/2+5}" fill="none" stroke="${color.stroke}" stroke-width="1.5" stroke-dasharray="5 3" opacity="0.8"/>`;
        else overlay = `<circle class="selection-overlay" r="${(node.radius||50)+5}" fill="none" stroke="${color.stroke}" stroke-width="1.5" stroke-dasharray="5 3" opacity="0.8"/>`;
        g.insertAdjacentHTML('afterbegin', overlay);
    }
}

function updateNodePositionDOM(nodeId) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const g = document.querySelector(`.node-group[data-node-id="${nodeId}"]`);
    if (g) g.setAttribute('transform', `translate(${node.x},${node.y})`);
    
    const lg = document.getElementById('linksGroup');
    if (lg) {
        lg.innerHTML = links.map(link => {
            const s = nodes.find(n => n.id === link.source);
            const t = nodes.find(n => n.id === link.target);
            if (!s || !t) return '';
            const sp = edgePoint(s, t), tp = edgePoint(t, s);
            const cx = (sp.x + tp.x) / 2, cy = (sp.y + tp.y) / 2 - 30;
            return `<path d="M${sp.x},${sp.y} Q${cx},${cy} ${tp.x},${tp.y}" class="mindmap-link" marker-end="url(#arrowhead)"/>`;
        }).join('');
    }
}

// ── 이벤트 설정 ──────────────────────────────────────────────────
function setupEvents() {
    const svg = document.getElementById('mindmapSVG');
    // canvas는 pointer-events:none 유지 → SVG가 항상 이벤트 수신

    // ─ 빈 곳 좌클릭 mousedown → 팬 시작 ─
    svg.style.cursor = 'grab';
    svg.addEventListener('mousedown', e => {
        if (e.button !== 0) return; // 좌클릭만
        if (e.target.classList.contains('resize-handle')) return;
        if (resizingNodeId) { exitResizeMode(false); return; }

        // 그리기 모드 처리
        if (isDrawingMode) {
            e.preventDefault();
            const pt = getEventSVGCoords(e);
            currentStroke = [pt];
            drawingStrokes.push(currentStroke);
            renderMindmap();
            return;
        }

        if (e.target.closest('.node-group')) return;
        if (window._editNodeId != null) { window._applyNodeEdit(); return; }
        if (connectSourceId != null) return;

        setSelectedNodeDOM(null);

        // 텍스트 이동 모드 해제 (빈 캔버스 클릭)
        if (textMoveModeNodeId != null) {
            document.querySelector(`.node-group[data-node-id="${textMoveModeNodeId}"] .node-text-group`)?.classList.remove('text-move-active');
            textMoveModeNodeId = null;
        }

        // PC: Shift+드래그 → 영역 선택 모드
        if (e.shiftKey) {
            e.preventDefault();
            const pt = getEventSVGCoords(e);
            isRectSelecting = true;
            rectSX = rectEX = pt.x;
            rectSY = rectEY = pt.y;
            svg.style.cursor = 'crosshair';
            return;
        }

        isPanning = true;
        panSX = e.clientX - canvasPanX;
        panSY = e.clientY - canvasPanY;
        svg.style.cursor = 'grabbing';
    });

    // ─ 빈 곳 우클릭 → 도형 추가 메뉴 ─
    svg.addEventListener('contextmenu', e => {
        if (e.target.closest('.node-group')) return; // 노드 우클릭은 _nodeContextMenu가 처리
        e.preventDefault();
        e.stopPropagation(); // document의 contextmenu 리스너가 메뉴를 hide()하는 방지
        if (resizingNodeId) return;
        const cx = e.clientX, cy = e.clientY;
        contextMenu.show(cx, cy, [
            { label: '⭕ 원 추가',    action: () => addNode('circle',   cx, cy) },
            { label: '▭ 사각형 추가', action: () => addNode('rect',     cx, cy) },
            { label: '△ 삼각형 추가', action: () => addNode('triangle', cx, cy) },
            { type: 'separator' },
            { label: '✍️ 캔버스 바탕 그리기', action: () => startDrawingMode() },
        ]);
    });

    // ─ mousemove: 노드 드래그 or 리사이즈 or 팬 or 텍스트 or 그리기 ─
    document.addEventListener('mousemove', e => {
        if (textDraggingNodeId) {
            const node = nodes.find(n => n.id === textDraggingNodeId);
            if (node) {
                let offX = textDragStartOffX + (e.clientX - textDragStartX) / canvasZoom;
                let offY = textDragStartOffY + (e.clientY - textDragStartY) / canvasZoom;
                
                let hw, hh;
                if (node.type === 'circle') { hw = hh = (node.radius || 50) * 0.7; }
                else if (node.type === 'triangle') { hw = (node.width || 120) * 0.35; hh = (node.height || 100) * 0.35; }
                else if (node.type === 'rect') { hw = (node.width || 120) * 0.45; hh = (node.height || 60) * 0.45; }
                else { hw = (node.width || 120) * 0.45; hh = (node.height || 80) * 0.45; }
                
                node.textOffsetX = Math.max(-hw, Math.min(hw, offX));
                node.textOffsetY = Math.max(-hh, Math.min(hh, offY));
                renderMindmap();
            }
            return;
        }

        if (isDrawingMode && currentStroke) {
            currentStroke.push(getEventSVGCoords(e));
            renderMindmap();
            return;
        }

        if (resizingNodeId && resizeDragHandle) {
            const node = nodes.find(n => n.id === resizingNodeId);
            if (node) {
                applyResize(node, resizeDragHandle,
                    (e.clientX - resizeDragStartX) / canvasZoom,
                    (e.clientY - resizeDragStartY) / canvasZoom);
                renderMindmap();
                updateResizeOverlay();
            }
            return;
        }

        // 영역 선택 드래그 업데이트
        if (isRectSelecting) {
            const pt = getEventSVGCoords(e);
            rectEX = pt.x;
            rectEY = pt.y;
            renderSelectionRect();
            return;
        }

        // 다중 노드 드래그
        if (multiDragOffsets.size > 0) {
            multiDragOffsets.forEach((off, id) => {
                const node = nodes.find(n => n.id === id);
                if (node) {
                    node.x = (e.clientX - canvasPanX - off.offX) / canvasZoom;
                    node.y = (e.clientY - canvasPanY - off.offY) / canvasZoom;
                }
            });
            updateMultiDragDOM();
            return;
        }

        if (draggingNodeId) {
            const node = nodes.find(n => n.id === draggingNodeId);
            if (node) {
                node.x = (e.clientX - canvasPanX - dragOffsetX) / canvasZoom;
                node.y = (e.clientY - canvasPanY - dragOffsetY) / canvasZoom;
                updateNodePositionDOM(draggingNodeId);
            }
        } else if (isPanning) {
            canvasPanX = e.clientX - panSX;
            canvasPanY = e.clientY - panSY;
            applyCanvasPan();
        }
    });

    // ─ mouseup: 드래그 / 팬 / 그리기 종료 ─
    document.addEventListener('mouseup', () => {
        if (textDraggingNodeId) {
            const nodeG = document.querySelector(`.node-group[data-node-id="${textDraggingNodeId}"]`);
            if (nodeG) nodeG.classList.remove('text-dragging');
            // 텍스트 이동 완료 → 이동 모드 해제
            if (textMoveModeNodeId === textDraggingNodeId) {
                nodeG?.querySelector('.node-text-group')?.classList.remove('text-move-active');
                textMoveModeNodeId = null;
            }
            textDraggingNodeId = null;
            saveMindmap();
            return;
        }

        if (isDrawingMode && currentStroke) {
            currentStroke = null; // 하나의 획 마무리
            return;
        }

        if (resizeDragHandle) {
            resizeDragHandle    = null;
            resizeDragStartDims = null;
            return;
        }

        // 영역 선택 완료
        if (isRectSelecting) {
            isRectSelecting = false;
            svg.style.cursor = 'grab';
            if (Math.abs(rectEX - rectSX) > 4 || Math.abs(rectEY - rectSY) > 4) {
                const ids = getNodesInRect(rectSX, rectSY, rectEX, rectEY);
                if (ids.length > 0) {
                    selectedNodeIds = new Set(ids);
                    selectedNodeId  = null;
                    renderMindmap();
                    updateHintBar();
                }
            }
            renderSelectionRect(); // 사각형 제거
            return;
        }

        // 다중 드래그 완료
        if (multiDragOffsets.size > 0) {
            multiDragOffsets.clear();
            saveMindmap();
            return;
        }

        if (draggingNodeId) {
            draggingNodeId = null;
            saveMindmap();
        }
        if (isPanning) {
            isPanning = false;
            svg.style.cursor = 'grab';
        }
    });

    // ─ ESC & Delete: 액션 취소 및 삭제 ─
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (isDrawingMode) { cancelDrawingMode(); return; }
            if (resizingNodeId) { exitResizeMode(true); return; } // 리사이즈 취소
            let changed = false;

            // 영역 선택 드래그 취소
            if (isRectSelecting) {
                isRectSelecting = false;
                renderSelectionRect();
                changed = true;
            }

            // 다중 선택 해제
            if (selectedNodeIds.size > 0) {
                selectedNodeIds.clear();
                changed = true;
                updateHintBar();
            }

            // 모바일 선택 모드 해제
            if (isMobileSelectMode) {
                isMobileSelectMode = false;
                document.getElementById('mmMobSelect')?.classList.remove('active');
                changed = true;
                updateHintBar();
            }

            // 텍스트 이동 모드 해제
            if (textMoveModeNodeId != null) {
                document.querySelector(`.node-group[data-node-id="${textMoveModeNodeId}"] .node-text-group`)?.classList.remove('text-move-active');
                textMoveModeNodeId = null;
            }

            if (connectSourceId != null) {
                connectSourceId = null;
                changed = true;
            }
            if (draggingNodeId != null) {
                draggingNodeId = null;
            }
            if (multiDragOffsets.size > 0) {
                multiDragOffsets.clear();
            }

            if (selectedNodeId != null) {
                selectedNodeId = null;
                changed = true;
            }
            if (window._editNodeId != null) window._applyNodeEdit();
            if (changed) renderMindmap();
            return;
        }

        if (e.key === 'Enter' && resizingNodeId && window._editNodeId == null) {
            exitResizeMode(false); // 리사이즈 완료
            return;
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            // 텍스트 편집 중이면 처리 안 함 (기존 로직 유지)
            if (window._editNodeId != null) return;

            // 다중 선택 일괄 삭제
            if (selectedNodeIds.size > 0) {
                deleteMultiSelected();
                return;
            }

            if (selectedNodeId != null) {
                const node = nodes.find(n => n.id === selectedNodeId);
                if (!node || node.isMain) {
                    if (node?.isMain) window.appAlert('중심 노드는 삭제할 수 없습니다.');
                    return;
                }
                deleteNode(selectedNodeId);
            }
        }

        // ─ Ctrl+Z : Undo ─
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            if (window._editNodeId != null) return;
            e.preventDefault();
            undo();
            return;
        }

        // ─ Ctrl+Shift+Z / Ctrl+Y / Ctrl+R : Redo ─
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'r' || (e.key === 'z' && e.shiftKey))) {
            if (window._editNodeId != null) return;
            e.preventDefault();
            redo();
            return;
        }

        // ─ Ctrl+C : 복사 ─
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
            if (window._editNodeId != null) return;
            const targets = selectedNodeIds.size > 0
                ? nodes.filter(n => selectedNodeIds.has(n.id))
                : selectedNodeId != null ? [nodes.find(n => n.id === selectedNodeId)] : [];
            const valid = targets.filter(Boolean).filter(n => !n.isMain);
            if (valid.length === 0) return;
            e.preventDefault();
            _clipboard = JSON.parse(JSON.stringify(valid));
            return;
        }

        // ─ Ctrl+V : 붙여넣기 ─
        if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
            if (window._editNodeId != null) return;
            if (_clipboard.length === 0) return;
            e.preventDefault();
            saveSnapshot();
            const PASTE_OFFSET = 24;
            const idMap = new Map();
            const newNodes = _clipboard.map(orig => {
                const newId = Date.now() + Math.floor(Math.random() * 100000);
                idMap.set(orig.id, newId);
                return { ...JSON.parse(JSON.stringify(orig)), id: newId, x: orig.x + PASTE_OFFSET, y: orig.y + PASTE_OFFSET };
            });
            nodes.push(...newNodes);
            // 복사된 노드 간 링크도 재생성
            _clipboard.forEach(orig => {
                links.forEach(lk => {
                    if (lk.source === orig.id && idMap.has(lk.target)) {
                        links.push({ source: idMap.get(orig.id), target: idMap.get(lk.target) });
                    }
                });
            });
            selectedNodeIds.clear();
            newNodes.forEach(n => selectedNodeIds.add(n.id));
            selectedNodeId = newNodes.length === 1 ? newNodes[0].id : null;
            renderMindmap();
            saveMindmap();
            return;
        }
    });


    svg.addEventListener('wheel', e => {
        e.preventDefault();
        const rect   = svg.getBoundingClientRect();
        const factor = e.deltaY < 0 ? 1.12 : 0.88;
        zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    // ─ 터치 이벤트 ─
    setupTouchEvents(svg);

    // ─ 모바일 버튼 바인딩 ─
    document.getElementById('mmMobCircle')?.addEventListener('click',   () => addNodeAtCenter('circle'));
    document.getElementById('mmMobRect')?.addEventListener('click',     () => addNodeAtCenter('rect'));
    document.getElementById('mmMobTriangle')?.addEventListener('click', () => addNodeAtCenter('triangle'));
    document.getElementById('mmMobFreehand')?.addEventListener('click', () => startDrawingMode());
    document.getElementById('mmMobConnect')?.addEventListener('click',  toggleMobileConnect);
    document.getElementById('mmMobSelect')?.addEventListener('click',   toggleMobileSelectMode);
    document.getElementById('mmMobDelete')?.addEventListener('click',   mobileDeleteSelected);
    document.getElementById('mmMobFit')?.addEventListener('click',      fitView);
    document.getElementById('mmMobUndo')?.addEventListener('click',     undo);
    document.getElementById('mmMobRedo')?.addEventListener('click',     redo);
    updateUndoRedoButtons(); // 초기 버튼 비활성화 상태 설정
    document.getElementById('mmDrawCancel')?.addEventListener('click',  cancelDrawingMode);
    document.getElementById('mmDrawDone')?.addEventListener('click',    doneDrawingMode);
    document.getElementById('mmDrawColorBtn')?.addEventListener('click', () => {
        currentDrawingColorIdx = (currentDrawingColorIdx + 1) % NODE_COLORS.length;
        const swatch = document.getElementById('mmDrawColorSwatch');
        if (swatch) swatch.style.backgroundColor = NODE_COLORS[currentDrawingColorIdx].stroke;
        renderMindmap(); // 잉크 색상 즉시 반영을 위해
    });
    document.getElementById('mmZoomIn')?.addEventListener('click', () => {
        const cx = window.innerWidth / 2;
        const cy = (window.innerHeight - (window.innerWidth <= 1024 ? 48 : 54)) / 2;
        zoomAt(1.25, cx, cy);
    });
    document.getElementById('mmZoomOut')?.addEventListener('click', () => {
        const cx = window.innerWidth / 2;
        const cy = (window.innerHeight - (window.innerWidth <= 1024 ? 48 : 54)) / 2;
        zoomAt(0.8, cx, cy);
    });

    document.getElementById('saveMindmapBtn').onclick        = saveMindmap;
    document.getElementById('backToDashFromMindmap').onclick = () => location.reload();

    // 내보내기 드롭다운
    const exportBtn      = document.getElementById('mmExportBtn');
    const exportDropdown = document.getElementById('mmExportDropdown');
    if (exportBtn && exportDropdown) {
        exportBtn.onclick = (e) => {
            e.stopPropagation();
            exportDropdown.classList.toggle('hidden');
        };
        document.getElementById('mmExportPng').onclick = (e) => {
            e.stopPropagation();
            exportDropdown.classList.add('hidden');
            exportMindmap('png');
        };
        document.getElementById('mmExportJpg').onclick = (e) => {
            e.stopPropagation();
            exportDropdown.classList.add('hidden');
            exportMindmap('jpg');
        };
        document.addEventListener('click', () => exportDropdown.classList.add('hidden'));
    }

    // 도움말 모달 (드래그 가능)
    const helpBtn   = document.getElementById('mmHelpBtn');
    const helpModal = document.getElementById('mmHelpModal');
    const helpClose = document.getElementById('mmHelpClose');
    const dragHandle = document.getElementById('mmHelpDragHandle');
    
    if (helpBtn && helpModal) {
        helpBtn.onclick = () => {
            helpModal.classList.toggle('hidden');
        };
        if (helpClose) helpClose.onclick = () => helpModal.classList.add('hidden');
        
        if (dragHandle) {
            let isDraggingHelp = false;
            let startX = 0, startY = 0;
            let startLeft = 0, startTop = 0;

            dragHandle.addEventListener('mousedown', e => {
                if (e.target.closest('#mmHelpClose')) return; // 닫기 버튼 클릭 무시
                isDraggingHelp = true;
                startX = e.clientX;
                startY = e.clientY;
                
                const rect = helpModal.getBoundingClientRect();
                helpModal.style.right = 'auto'; // CSS의 right 초기화
                helpModal.style.left = rect.left + 'px';
                helpModal.style.top = rect.top + 'px';
                helpModal.style.bottom = 'auto';
                
                startLeft = rect.left;
                startTop = rect.top;
                
                document.body.style.userSelect = 'none';
            });
            
            document.addEventListener('mousemove', e => {
                if (!isDraggingHelp) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                
                let newLeft = startLeft + dx;
                let newTop = startTop + dy;
                
                const maxX = window.innerWidth - helpModal.offsetWidth;
                const maxY = window.innerHeight - 30; // 상단바 정도 남기기
                
                helpModal.style.left = Math.max(0, Math.min(newLeft, maxX)) + 'px';
                helpModal.style.top = Math.max(0, Math.min(newTop, maxY)) + 'px';
            });
            
            document.addEventListener('mouseup', () => {
                if (isDraggingHelp) {
                    isDraggingHelp = false;
                    document.body.style.userSelect = '';
                }
            });
        }
    }
}

// ── 터치 이벤트 ──────────────────────────────────────────────────
function setupTouchEvents(svg) {
    const LONG_PRESS_MS  = 600;
    const DBTAP_MS       = 350;
    const MOVE_THRESHOLD = 8;
    let longPressTimer   = null;
    let lastTapNodeId    = null;
    let lastTapTime      = 0;
    let touchStartX      = 0, touchStartY = 0;

    svg.addEventListener('touchstart', e => {
        e.preventDefault();

        if (e.touches.length === 2) {
            // 핀치 줌 시작
            clearTimeout(longPressTimer);
            touchNodeDragId = null;
            touchPanActive  = false;
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            pinchActive    = true;
            pinchStartDist = Math.hypot(dx, dy);
            
            if (resizingNodeId) {
                const node = nodes.find(n => n.id === resizingNodeId);
                if (node) {
                    resizeDragStartDims = {
                        width:  node.width  || 120,
                        height: node.height || (node.type === 'triangle' ? 100 : 60),
                        radius: node.radius || 50,
                    };
                }
            } else {
                pinchStartZoom = canvasZoom;
                pinchStartMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                pinchStartMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                pinchStartPanX = canvasPanX;
                pinchStartPanY = canvasPanY;
            }
            return;
        }

        if (e.touches.length !== 1) return;
        pinchActive = false;

        const t  = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;

        // 그리기 모드 처리 (모바일)
        if (isDrawingMode) {
            const pt = getEventSVGCoords(e);
            currentStroke = [pt];
            drawingStrokes.push(currentStroke);
            renderMindmap();
            return;
        }

        const el        = document.elementFromPoint(t.clientX, t.clientY);
        const nodeGroup = el?.closest('[data-node-id]');

        if (nodeGroup) {
            const nodeId = parseInt(nodeGroup.dataset.nodeId);

            // 편집기 열려 있으면 저장 후 닫기
            if (window._editNodeId != null && window._editNodeId !== nodeId) {
                window._applyNodeEdit();
                return;
            }

            // 더블탭 감지
            const now = Date.now();
            if (lastTapNodeId === nodeId && now - lastTapTime < DBTAP_MS) {
                lastTapNodeId = null;
                clearTimeout(longPressTimer);
                openEditor(nodeId);
                return;
            }
            lastTapNodeId = nodeId;
            lastTapTime   = now;

            // 다중 선택 상태 — 선택된 노드 터치 → 일괄 이동
            if (selectedNodeIds.size > 1 && selectedNodeIds.has(nodeId) && !mobileConnectMode) {
                clearTimeout(longPressTimer);
                saveSnapshot();
                multiDragOffsets.clear();
                selectedNodeIds.forEach(nid => {
                    const n = nodes.find(n => n.id === nid);
                    if (n) multiDragOffsets.set(nid, {
                        offX: t.clientX - canvasPanX - n.x * canvasZoom,
                        offY: t.clientY - canvasPanY - n.y * canvasZoom,
                    });
                });
                return;
            }

            // 연결 모드
            if (mobileConnectMode) {
                if (connectSourceId != null && connectSourceId !== nodeId) {
                    const exactIdx = links.findIndex(l => l.source === connectSourceId && l.target === nodeId);
                    const revIdx   = links.findIndex(l => l.source === nodeId && l.target === connectSourceId);
                    
                    if (exactIdx !== -1) {
                        // 이미 같은 방향이면 연결 해제
                        links.splice(exactIdx, 1);
                    } else if (revIdx !== -1) {
                        // 역방향이면 방향 전환
                        links[revIdx] = { source: connectSourceId, target: nodeId };
                    } else {
                        // 신규 연결
                        links.push({ source: connectSourceId, target: nodeId });
                    }
                    connectSourceId = null;
                    renderMindmap();
                    saveMindmap();
                    mobileConnectMode = false;
                    document.getElementById('mmMobConnect')?.classList.remove('active');
                } else {
                    connectSourceId = connectSourceId === nodeId ? null : nodeId;
                    renderMindmap();
                }
                updateHintBar();
                return;
            }

            // 노드 드래그 시작
            setSelectedNodeDOM(nodeId);
            const node = nodes.find(n => n.id === nodeId);
            if (node) {
                touchNodeDragId = nodeId;
                touchNodeOffX   = t.clientX - canvasPanX - node.x * canvasZoom;
                touchNodeOffY   = t.clientY - canvasPanY - node.y * canvasZoom;
            }

            // 꾹 누르기 → 노드 컨텍스트 메뉴
            longPressTimer = setTimeout(() => {
                touchNodeDragId = null;
                window._nodeContextMenu(
                    { clientX: t.clientX, clientY: t.clientY, preventDefault: () => {}, stopPropagation: () => {} },
                    nodeId
                );
            }, LONG_PRESS_MS);

        } else {
            // 빈 캔버스 터치
            clearTimeout(longPressTimer);
            if (window._editNodeId != null) { window._applyNodeEdit(); return; }
            if (resizingNodeId) { exitResizeMode(false); return; }

            // 모바일 선택 모드 → 영역 선택 시작
            if (isMobileSelectMode) {
                const pt = getEventSVGCoords(e);
                isRectSelecting = true;
                rectSX = rectEX = pt.x;
                rectSY = rectEY = pt.y;
                return;
            }

            // 다중 선택 해제 (빈 캔버스 터치)
            if (selectedNodeIds.size > 0) {
                selectedNodeIds.clear();
                renderMindmap();
                updateHintBar();
            }

            touchPanActive  = true;
            touchNodeDragId = null;
            touchPanStartX  = t.clientX;
            touchPanStartY  = t.clientY;
            touchPanCanvasX = canvasPanX;
            touchPanCanvasY = canvasPanY;

            // 꾹 누르기 → 도형 추가 메뉴
            const cx = t.clientX, cy = t.clientY;
            longPressTimer = setTimeout(() => {
                touchPanActive = false;
                contextMenu.show(cx, cy, [
                    { label: '⭕ 원 추가',    action: () => addNode('circle',   cx, cy) },
                    { label: '▭ 사각형 추가', action: () => addNode('rect',     cx, cy) },
                    { label: '△ 삼각형 추가', action: () => addNode('triangle', cx, cy) },
                    { type: 'separator' },
                    { label: '✍️ 자유 그리기', action: () => startDrawingMode() },
                ]);
            }, LONG_PRESS_MS);
        }
    }, { passive: false });

    svg.addEventListener('touchmove', e => {
        e.preventDefault();

        if (pinchActive && e.touches.length === 2) {
            const dx   = e.touches[0].clientX - e.touches[1].clientX;
            const dy   = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            if (pinchStartDist === 0) return;

            if (resizingNodeId && resizeDragStartDims) {
                // 노드 크기 조절 (캔버스 줌 대신)
                const node = nodes.find(n => n.id === resizingNodeId);
                if (node) {
                    const scale = dist / pinchStartDist;
                    const d = resizeDragStartDims;
                    const MIN_W = 60, MIN_H = 40, MIN_R = 28;
                    
                    if (node.type === 'circle') {
                        node.radius = Math.max(MIN_R, d.radius * scale);
                    } else {
                        node.width  = Math.max(MIN_W, d.width * scale);
                        node.height = Math.max(MIN_H, d.height * scale);
                    }
                    
                    renderMindmap();
                    updateResizeOverlay();
                }
            } else {
                const midX    = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const midY    = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchStartZoom * (dist / pinchStartDist)));

                // 시작 midpoint의 캔버스 좌표를 고정
                const startCX = (pinchStartMidX - pinchStartPanX) / pinchStartZoom;
                const startCY = (pinchStartMidY - pinchStartPanY) / pinchStartZoom;
                canvasPanX = midX - startCX * newZoom;
                canvasPanY = midY - startCY * newZoom;
                canvasZoom = newZoom;
                applyCanvasPan();
            }
            return;
        }

        if (e.touches.length !== 1) return;
        const t = e.touches[0];

        // 제스처 텍스트 위치 드래그
        if (textDraggingNodeId) {
            const node = nodes.find(n => n.id === textDraggingNodeId);
            if (node) {
                let offX = textDragStartOffX + (t.clientX - textDragStartX) / canvasZoom;
                let offY = textDragStartOffY + (t.clientY - textDragStartY) / canvasZoom;
                
                let hw, hh;
                if (node.type === 'circle') { hw = hh = (node.radius || 50) * 0.7; }
                else if (node.type === 'triangle') { hw = (node.width || 120) * 0.35; hh = (node.height || 100) * 0.35; }
                else if (node.type === 'rect') { hw = (node.width || 120) * 0.45; hh = (node.height || 60) * 0.45; }
                else { hw = (node.width || 120) * 0.45; hh = (node.height || 80) * 0.45; }
                
                node.textOffsetX = Math.max(-hw, Math.min(hw, offX));
                node.textOffsetY = Math.max(-hh, Math.min(hh, offY));
                renderMindmap();
            }
            return;
        }

        // 그리기 모드
        if (isDrawingMode && currentStroke) {
            currentStroke.push(getEventSVGCoords(e));
            renderMindmap();
            return;
        }

        // 이동 감지 → 꾹 누르기 취소
        if (Math.abs(t.clientX - touchStartX) > MOVE_THRESHOLD ||
            Math.abs(t.clientY - touchStartY) > MOVE_THRESHOLD) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        // 영역 선택 드래그 (모바일 선택 모드)
        if (isRectSelecting) {
            const pt = getEventSVGCoords(e);
            rectEX = pt.x;
            rectEY = pt.y;
            renderSelectionRect();
            return;
        }

        // 다중 노드 터치 드래그
        if (multiDragOffsets.size > 0) {
            multiDragOffsets.forEach((off, id) => {
                const node = nodes.find(n => n.id === id);
                if (node) {
                    node.x = (t.clientX - canvasPanX - off.offX) / canvasZoom;
                    node.y = (t.clientY - canvasPanY - off.offY) / canvasZoom;
                }
            });
            updateMultiDragDOM();
            return;
        }

        if (touchNodeDragId) {
            const node = nodes.find(n => n.id === touchNodeDragId);
            if (node) {
                node.x = (t.clientX - canvasPanX - touchNodeOffX) / canvasZoom;
                node.y = (t.clientY - canvasPanY - touchNodeOffY) / canvasZoom;
                updateNodePositionDOM(touchNodeDragId);
            }
        } else if (touchPanActive) {
            canvasPanX = touchPanCanvasX + (t.clientX - touchPanStartX);
            canvasPanY = touchPanCanvasY + (t.clientY - touchPanStartY);
            applyCanvasPan();
        }
    }, { passive: false });

    svg.addEventListener('touchend', e => {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        clearTimeout(textLongPressTimer);
        textLongPressTimer = null;

        if (textDraggingNodeId) {
            const nodeG = document.querySelector(`.node-group[data-node-id="${textDraggingNodeId}"]`);
            if (nodeG) nodeG.classList.remove('text-dragging');
            // 텍스트 이동 완료 → 이동 모드 해제
            if (textMoveModeNodeId === textDraggingNodeId) {
                nodeG?.querySelector('.node-text-group')?.classList.remove('text-move-active');
                textMoveModeNodeId = null;
            }
            textDraggingNodeId = null;
            saveMindmap();
            return;
        }

        if (isDrawingMode && currentStroke) {
            currentStroke = null; // 하나의 획 마무리, 다음 획 대기
            return;
        }

        // 영역 선택 완료 (모바일)
        if (isRectSelecting) {
            isRectSelecting = false;
            if (Math.abs(rectEX - rectSX) > 4 || Math.abs(rectEY - rectSY) > 4) {
                const ids = getNodesInRect(rectSX, rectSY, rectEX, rectEY);
                if (ids.length > 0) {
                    selectedNodeIds = new Set(ids);
                    selectedNodeId  = null;
                    renderMindmap();
                    updateHintBar();
                }
            }
            renderSelectionRect();
            return;
        }

        // 다중 드래그 완료 (모바일)
        if (multiDragOffsets.size > 0) {
            multiDragOffsets.clear();
            saveMindmap();
            return;
        }

        if (touchNodeDragId) {
            saveMindmap();
            touchNodeDragId = null;
        }
        if (e.touches.length < 2) pinchActive = false;
        if (e.touches.length === 0) touchPanActive = false;
    }, { passive: false });

    svg.addEventListener('touchcancel', () => {
        clearTimeout(longPressTimer);
        clearTimeout(textLongPressTimer);
        textLongPressTimer = null;
        touchNodeDragId = null;
        touchPanActive  = false;
        pinchActive     = false;
        if (isRectSelecting) {
            isRectSelecting = false;
            renderSelectionRect();
        }
        multiDragOffsets.clear();
    }, { passive: true });
}

async function saveMindmap() {
    const indicator = document.getElementById('saveStatus');
    if (indicator) { indicator.textContent = '저장 중…'; indicator.className = 'mm-save-indicator saving'; }
    try {
        if (_widgetId !== null) {
            // 위젯 모드: 위젯 settings의 mindmapData만 업데이트 (나머지 settings 보존)
            const mergedSettings = { ...(_widgetSettings || {}), mindmapData: { nodes, links } };
            await apiFetch(`/api/widgets/${_widgetId}`, {
                method: 'PATCH',
                body: JSON.stringify({ settings: mergedSettings })
            });
            // 로컬 캐시 동기화
            if (_widgetSettings) _widgetSettings.mindmapData = { nodes, links };
        } else {
            await apiFetch('/api/mindmap', {
                method: 'POST',
                body: JSON.stringify({ data: { nodes, links } })
            });
        }
        if (indicator) {
            indicator.textContent = '저장됨';
            indicator.className = 'mm-save-indicator saved';
            setTimeout(() => { indicator.textContent = ''; indicator.className = 'mm-save-indicator'; }, 2000);
        }
    } catch (_) {
        if (indicator) { indicator.textContent = '저장 실패'; indicator.className = 'mm-save-indicator'; }
    }
}

async function exportMindmap(format = 'png') {
    if (nodes.length === 0) { window.appAlert?.('내보낼 노드가 없습니다.'); return; }

    const PAD = 70;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(node => {
        const hw = node.type === 'freehand'
            ? (node.width  || 120) / 2
            : (node.type === 'rect' ? (node.width  || 120) / 2 : (node.type === 'triangle' ? (node.width  || 120) / 2 : (node.radius || 50)));
        const hh = node.type === 'freehand'
            ? (node.height || 80)  / 2
            : (node.type === 'rect' ? (node.height || 60)  / 2 : (node.type === 'triangle' ? (node.height || 100) / 2 : (node.radius || 50)));
        minX = Math.min(minX, node.x - hw);
        minY = Math.min(minY, node.y - hh);
        maxX = Math.max(maxX, node.x + hw);
        maxY = Math.max(maxY, node.y + hh);
    });

    const vbX = minX - PAD, vbY = minY - PAD;
    const vbW = (maxX - minX) + PAD * 2;
    const vbH = (maxY - minY) + PAD * 2;
    const scale = 2;

    const origSvg = document.getElementById('mindmapSVG');
    const svgClone = origSvg.cloneNode(true);

    // 선택 오버레이·UI 요소 제거
    svgClone.querySelectorAll('.selection-overlay, .mm-select-rect, .mm-text-box').forEach(el => el.remove());
    svgClone.querySelectorAll('[onmousedown],[oncontextmenu],[ontouchstart]').forEach(el => {
        el.removeAttribute('onmousedown');
        el.removeAttribute('oncontextmenu');
        el.removeAttribute('ontouchstart');
    });

    // 팬/줌 transform 제거 (뷰박스로 제어)
    const panGroup = svgClone.querySelector('#mm-pan-group');
    if (panGroup) panGroup.removeAttribute('transform');

    // 크기 및 뷰박스 설정
    svgClone.setAttribute('width',   String(vbW * scale));
    svgClone.setAttribute('height',  String(vbH * scale));
    svgClone.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);

    // 배경 추가
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', String(vbX)); bg.setAttribute('y', String(vbY));
    bg.setAttribute('width', String(vbW)); bg.setAttribute('height', String(vbH));
    bg.setAttribute('fill', '#0f172a');
    if (panGroup) panGroup.insertBefore(bg, panGroup.firstChild);
    else svgClone.appendChild(bg);

    // 필수 CSS 인라인
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = `
        text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', sans-serif; }
        .node-text { fill: rgba(255,255,255,0.95); font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
        .node-group.main .node-text { font-size: 16px; font-weight: 700; }
        .node-text--url { fill: #60a5fa; }
        .mindmap-link { fill: none; stroke: rgba(139,92,246,0.4); stroke-width: 2; stroke-linecap: round; }
        .mm-draw-ink path { fill: none; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
        .node-shape { }
    `;
    svgClone.insertBefore(style, svgClone.firstChild);

    // SVG → Blob → Image → Canvas
    const svgStr = new XMLSerializer().serializeToString(svgClone);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    try {
        await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width  = vbW * scale;
                canvas.height = vbH * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(url);

                const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
                const dataUrl  = canvas.toDataURL(mimeType, format === 'jpg' ? 0.92 : undefined);
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = `mindmap_${Date.now()}.${format}`;
                a.click();
                resolve();
            };
            img.onerror = reject;
            img.src = url;
        });
    } catch (e) {
        URL.revokeObjectURL(url);
        console.error('[MindMap] 내보내기 실패:', e);
        window.appAlert?.('이미지 내보내기에 실패했습니다.');
    }
}

function deleteNode(id) {
    const node = nodes.find(n => n.id === id);
    if (!node || node.isMain) return;

    saveSnapshot();
    nodes = nodes.filter(n => n.id !== id);
    links = links.filter(l => l.source !== id && l.target !== id);
    if (selectedNodeId === id) selectedNodeId = null;

    renderMindmap();
    saveMindmap();
}

// ── 리사이즈 모드 ───────────────────────────────────────────────
function enterResizeMode(id) {
    const node = nodes.find(n => n.id === id);
    if (!node) return;

    saveSnapshot(); // 리사이즈 시작 전 스냅샷 저장
    resizingNodeId    = id;
    resizeDragHandle  = null;
    selectedNodeId    = id;
    resizeOriginalDims = {
        width: node.width, height: node.height, radius: node.radius
    };

    // 힌트바 변경
    const guide = document.getElementById('mindmapGuide');
    if (guide && !_hintBarOrigHTML) {
        _hintBarOrigHTML = guide.innerHTML;
        guide.innerHTML =
            `<span class="mm-hint-item"><kbd>핸들 드래그</kbd> 크기 조정</span>` +
            `<span class="mm-hint-sep">·</span>` +
            `<span class="mm-hint-item"><kbd>Enter</kbd> 완료</span>` +
            `<span class="mm-hint-sep">·</span>` +
            `<span class="mm-hint-item"><kbd>ESC</kbd> 취소</span>` +
            `<span class="mm-hint-sep">·</span>` +
            `<span class="mm-hint-item">빈 곳 클릭으로도 완료</span>`;
    }

    // 캔버스 커서 변경
    document.getElementById('mindmapCanvasContainer')?.classList.add('resizing');

    updateResizeOverlay();
}

function exitResizeMode(cancel = false) {
    if (!resizingNodeId) return;

    if (cancel) {
        // ESC → 원래 치수로 복원 (스냅샷 번복 시 undoStack에서 제거)
        const node = nodes.find(n => n.id === resizingNodeId);
        if (node && resizeOriginalDims) {
            node.width  = resizeOriginalDims.width;
            node.height = resizeOriginalDims.height;
            node.radius = resizeOriginalDims.radius;
        }
        undoStack.pop(); // enterResizeMode에서 저장한 스냅샷 취소
        updateUndoRedoButtons();
        renderMindmap();
    } else {
        saveMindmap();
    }

    resizingNodeId    = null;
    resizeDragHandle  = null;
    resizeDragStartDims = null;
    resizeOriginalDims  = null;

    // 힌트바 복원
    const guide = document.getElementById('mindmapGuide');
    if (guide && _hintBarOrigHTML) {
        guide.innerHTML = _hintBarOrigHTML;
        _hintBarOrigHTML = null;
    }

    // 캔버스 커서 복원
    document.getElementById('mindmapCanvasContainer')?.classList.remove('resizing');

    clearResizeOverlay();
}

function clearResizeOverlay() {
    const rog = document.getElementById('resizeOverlay');
    if (rog) rog.innerHTML = '';
}

function updateResizeOverlay() {
    const rog = document.getElementById('resizeOverlay');
    if (!rog) return;
    const node = nodes.find(n => n.id === resizingNodeId);
    if (!node) { rog.innerHTML = ''; return; }

    const { x, y } = node;
    const PAD        = 8;  // 도형과 border 사이 여백
    const SIDE_HIT   = 16; // 변 전체 히트 두께
    const CORNER_HIT = 14; // 모서리 히트 반경 (총 28×28)

    // 모서리 핸들 생성 헬퍼 (투명 히트 영역만, 시각적 핸들 없음)
    const cornerEl = (key, cx, cy, cur) =>
        `<rect x="${cx-CORNER_HIT}" y="${cy-CORNER_HIT}" width="${CORNER_HIT*2}" height="${CORNER_HIT*2}" fill="transparent" style="cursor:${cur}" onmousedown="window._resizeHandleDown(event,'${key}')"/>`;

    // 변(side) 히트 라인 생성 헬퍼 (투명 두꺼운 선)
    const sideEl = (key, x1, y1, x2, y2, cur) =>
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width="${SIDE_HIT}" stroke-linecap="square" style="cursor:${cur}" onmousedown="window._resizeHandleDown(event,'${key}')"/>`;

    let svgContent = '';

    if (node.type === 'rect') {
        const hw = (node.width  || 120) / 2;
        const hh = (node.height || 60)  / 2;
        const bx  = x - hw - PAD, by  = y - hh - PAD;
        const bx2 = x + hw + PAD, by2 = y + hh + PAD;
        const bw  = bx2 - bx,     bh  = by2 - by;

        // 점선 border (시각)
        svgContent += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="16" class="resize-border"/>`;

        // 4개 변 히트 영역 (모서리보다 먼저 렌더 → 모서리가 위에 표시됨)
        svgContent += sideEl('n', bx, by,  bx2, by,  'n-resize');
        svgContent += sideEl('s', bx, by2, bx2, by2, 's-resize');
        svgContent += sideEl('w', bx, by,  bx,  by2, 'w-resize');
        svgContent += sideEl('e', bx2, by, bx2, by2, 'e-resize');

        // 4개 모서리 핸들 (변 히트보다 위에 렌더 → 클릭 우선)
        svgContent += cornerEl('nw', bx,  by,  'nw-resize');
        svgContent += cornerEl('ne', bx2, by,  'ne-resize');
        svgContent += cornerEl('sw', bx,  by2, 'sw-resize');
        svgContent += cornerEl('se', bx2, by2, 'se-resize');

    } else if (node.type === 'circle') {
        const r  = node.radius || 50;
        const rp = r + PAD;

        // 점선 border (시각, pointer-events:none)
        svgContent += `<circle cx="${x}" cy="${y}" r="${rp}" class="resize-border"/>`;

        // 전체 원 둘레 히트 영역 (두꺼운 투명 stroke)
        // 드래그 중 마우스-중심 거리로 반지름 직접 계산 → key='radial'
        svgContent += `<circle cx="${x}" cy="${y}" r="${rp}" fill="none" stroke="transparent" stroke-width="${SIDE_HIT}" style="cursor:nwse-resize" onmousedown="window._resizeHandleDown(event,'radial')"/>`;


    } else { // triangle
        const hw  = (node.width  || 120) / 2;
        const hh  = (node.height || 100) / 2;
        const tpX = x,         tpY = y - hh - PAD; // 꼭대기
        const blX = x - hw - PAD, blY = y + hh + PAD; // 왼쪽 아래
        const brX = x + hw + PAD, brY = y + hh + PAD; // 오른쪽 아래

        // 점선 border (삼각형 모양)
        svgContent += `<polygon points="${tpX},${tpY} ${blX},${blY} ${brX},${brY}" class="resize-border"/>`;

        // 3개 변 히트 영역
        svgContent += sideEl('w', tpX, tpY, blX, blY, 'w-resize');  // 왼쪽 변
        svgContent += sideEl('e', tpX, tpY, brX, brY, 'e-resize');  // 오른쪽 변
        svgContent += sideEl('s', blX, blY, brX, brY, 's-resize');  // 아래 변

        // 3개 꼭짓점 핸들
        svgContent += cornerEl('n',  tpX, tpY, 'n-resize');
        svgContent += cornerEl('sw', blX, blY, 'sw-resize');
        svgContent += cornerEl('se', brX, brY, 'se-resize');
    }

    rog.innerHTML = svgContent;
}

function applyResize(node, handle, dx, dy) {
    const MIN_W = 60, MIN_H = 40, MIN_R = 28;
    const d = resizeDragStartDims;
    if (!d) return;

    if (node.type === 'circle') {
        if (handle === 'radial') {
            // dx, dy are already in canvas units; convert start point to canvas space
            const startCX = (resizeDragStartX - canvasPanX) / canvasZoom;
            const startCY = (resizeDragStartY - canvasPanY) / canvasZoom;
            node.radius = Math.max(MIN_R, Math.hypot(startCX + dx - node.x, startCY + dy - node.y));
        } else if (handle === 'e') node.radius = Math.max(MIN_R, d.radius + dx);
        else if (handle === 'w') node.radius = Math.max(MIN_R, d.radius - dx);
        else if (handle === 's') node.radius = Math.max(MIN_R, d.radius + dy);
        else if (handle === 'n') node.radius = Math.max(MIN_R, d.radius - dy);
    } else {
        let newW = d.width  || 120;
        let newH = d.height || (node.type === 'triangle' ? 100 : 60);

        // 중심 고정: 한쪽 핸들 1px 이동 → 양쪽 대칭으로 늘어나므로 2배
        if (handle.includes('e')) newW = Math.max(MIN_W, d.width  + dx * 2);
        if (handle.includes('w')) newW = Math.max(MIN_W, d.width  - dx * 2);
        if (handle.includes('s')) newH = Math.max(MIN_H, d.height + dy * 2);
        if (handle.includes('n')) newH = Math.max(MIN_H, d.height - dy * 2);

        node.width  = newW;
        node.height = newH;
    }
}

// 리사이즈 핸들 mousedown 전역 핸들러
window._resizeHandleDown = (e, handleKey) => {
    e.stopPropagation();
    e.preventDefault();
    if (!resizingNodeId) return;

    resizeDragHandle  = handleKey;
    resizeDragStartX  = e.clientX;
    resizeDragStartY  = e.clientY;
    const node = nodes.find(n => n.id === resizingNodeId);
    if (node) {
        resizeDragStartDims = {
            width:  node.width  || 120,
            height: node.height || (node.type === 'triangle' ? 100 : 60),
            radius: node.radius || 50,
        };
    }
};

// ── URL 새 탭 열기 ────────────────────────────────────────────────
window._openUrl = (event, el) => {
    event.stopPropagation();
    const url = el.getAttribute('data-href');
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
};

// ── 텍스트 그룹 우클릭 컨텍스트 메뉴 ────────────────────────────
window._nodeTextContextMenu = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    contextMenu.show(e.clientX, e.clientY, [
        { label: '✏️ 텍스트 편집', action: () => openEditor(id) },
        {
            label: '✥ 텍스트 상자 이동',
            action: () => {
                textMoveModeNodeId = id;
                const tg = document.querySelector(`.node-group[data-node-id="${id}"] .node-text-group`);
                if (tg) tg.classList.add('text-move-active');
            }
        },
    ]);
};

// ── 텍스트 mousedown 전역 핸들러 ─────────────────────────────────
window._nodeTextMouseDown = (e, id) => {
    e.stopPropagation();
    
    // 특수 요소(링크, 체크박스) 클릭 처리
    const urlEl = e.target.closest('.node-text--url');
    if (urlEl) {
        window._openUrl(e, urlEl);
        return;
    }
    const cbEl = e.target.closest('.mm-checkbox-rect');
    if (cbEl) {
        window._toggleCheckbox(e, id, parseInt(cbEl.dataset.rawIdx));
        return;
    }

    if (resizingNodeId || window._editNodeId != null) return;

    const now     = Date.now();
    const elapsed = now - lastClickTime;

    // 더블클릭 → 편집기 열기
    if (id === lastClickNodeId && elapsed < DBLCLICK_MS) {
        lastClickNodeId    = null;
        lastClickTime      = 0;
        draggingNodeId     = null;
        textDraggingNodeId = null;
        if (textMoveModeNodeId === id) {
            document.querySelector(`.node-group[data-node-id="${id}"] .node-text-group`)?.classList.remove('text-move-active');
            textMoveModeNodeId = null;
        }
        openEditor(id);
        return;
    }
    lastClickNodeId = id;
    lastClickTime   = now;

    // 텍스트 이동 모드 활성화 → 텍스트 위치 드래그
    if (textMoveModeNodeId === id) {
        const node = nodes.find(n => n.id === id);
        if (node) {
            saveSnapshot();
            textDraggingNodeId = id;
            textDragStartOffX  = node.textOffsetX || 0;
            textDragStartOffY  = node.textOffsetY || 0;
            textDragStartX     = e.clientX;
            textDragStartY     = e.clientY;
            document.querySelector(`.node-group[data-node-id="${id}"]`)?.classList.add('text-dragging');
        }
        return;
    }

    // 다중 선택된 노드의 텍스트 클릭 → 일괄 노드 이동
    if (selectedNodeIds.size > 1 && selectedNodeIds.has(id) && !e.shiftKey) {
        saveSnapshot();
        multiDragOffsets.clear();
        selectedNodeIds.forEach(nid => {
            const n = nodes.find(n => n.id === nid);
            if (n) multiDragOffsets.set(nid, {
                offX: e.clientX - canvasPanX - n.x * canvasZoom,
                offY: e.clientY - canvasPanY - n.y * canvasZoom,
            });
        });
        return;
    }

    // 기본: 텍스트 클릭 → 노드 이동 시작
    saveSnapshot();
    draggingNodeId = id;
    setSelectedNodeDOM(id);
    const node = nodes.find(n => n.id === id);
    if (node) {
        dragOffsetX = e.clientX - canvasPanX - node.x * canvasZoom;
        dragOffsetY = e.clientY - canvasPanY - node.y * canvasZoom;
    }
};

window._nodeTextTouchStart = (e, id) => {
    e.stopPropagation();
    if (e.touches.length !== 1 || resizingNodeId || window._editNodeId != null) return;

    const t = e.touches[0];

    // 특수 요소(링크, 체크박스) 클릭 처리
    const urlEl = e.target.closest('.node-text--url');
    if (urlEl) {
        window._openUrl(e, urlEl);
        return;
    }
    const cbEl = e.target.closest('.mm-checkbox-rect');
    if (cbEl) {
        window._toggleCheckbox(e, id, parseInt(cbEl.dataset.rawIdx));
        return;
    }

    e.preventDefault(); // 일반 텍스트 영역만 고스트 클릭 방지
    const now     = Date.now();
    const elapsed = now - lastClickTime;

    // 더블탭 → 편집기 열기
    if (id === lastClickNodeId && elapsed < DBLCLICK_MS) {
        lastClickNodeId    = null;
        lastClickTime      = 0;
        textDraggingNodeId = null;
        touchNodeDragId    = null;
        clearTimeout(textLongPressTimer);
        if (textMoveModeNodeId === id) {
            document.querySelector(`.node-group[data-node-id="${id}"] .node-text-group`)?.classList.remove('text-move-active');
            textMoveModeNodeId = null;
        }
        openEditor(id);
        return;
    }
    lastClickNodeId = id;
    lastClickTime   = now;

    // 텍스트 이동 모드 활성화 → 텍스트 위치 드래그
    if (textMoveModeNodeId === id) {
        clearTimeout(textLongPressTimer);
        const node = nodes.find(n => n.id === id);
        if (node) {
            saveSnapshot();
            textDraggingNodeId = id;
            textDragStartOffX  = node.textOffsetX || 0;
            textDragStartOffY  = node.textOffsetY || 0;
            textDragStartX     = t.clientX;
            textDragStartY     = t.clientY;
            document.querySelector(`.node-group[data-node-id="${id}"]`)?.classList.add('text-dragging');
        }
        return;
    }

    // 다중 선택된 노드의 텍스트 터치 → 일괄 노드 이동
    if (selectedNodeIds.size > 1 && selectedNodeIds.has(id) && !mobileConnectMode) {
        clearTimeout(textLongPressTimer);
        saveSnapshot();
        multiDragOffsets.clear();
        selectedNodeIds.forEach(nid => {
            const n = nodes.find(n => n.id === nid);
            if (n) multiDragOffsets.set(nid, {
                offX: t.clientX - canvasPanX - n.x * canvasZoom,
                offY: t.clientY - canvasPanY - n.y * canvasZoom,
            });
        });
        return;
    }

    // 기본: 텍스트 터치 → 노드 이동 시작
    setSelectedNodeDOM(id);
    const node = nodes.find(n => n.id === id);
    if (node) {
        touchNodeDragId = id;
        touchNodeOffX   = t.clientX - canvasPanX - node.x * canvasZoom;
        touchNodeOffY   = t.clientY - canvasPanY - node.y * canvasZoom;
    }

    // 꾹 누르기 → 텍스트 컨텍스트 메뉴 (모바일)
    textLongPressTimer = setTimeout(() => {
        textLongPressTimer = null;
        touchNodeDragId = null; // 꾹 누르기면 노드 드래그 취소
        window._nodeTextContextMenu(
            { clientX: t.clientX, clientY: t.clientY, preventDefault: () => {}, stopPropagation: () => {} },
            id
        );
    }, 600);
};

// ── 노드 mousedown 전역 핸들러 ───────────────────────────────────
window._nodeMouseDown = (e, id) => {
    e.stopPropagation(); // 빈 곳 SVG 이벤트로 버블 방지

    // 리사이즈 모드 중 → 완료 후 진행 (같은 노드 클릭이면 계속 리사이즈 유지)
    if (resizingNodeId) {
        if (resizingNodeId !== id) exitResizeMode(false);
        return;
    }

    // 편집기 열려 있을 때 다른 노드 클릭 → 모서리 부분 등 저장 후 닫기
    if (window._editNodeId != null) {
        if (window._editNodeId !== id) window._applyNodeEdit();
        return;
    }

    // 다중 선택 상태 — 선택된 노드 클릭 시 일괄 이동 시작
    if (selectedNodeIds.size > 1 && selectedNodeIds.has(id) && !e.shiftKey && !mobileConnectMode) {
        e.preventDefault();
        saveSnapshot();
        multiDragOffsets.clear();
        selectedNodeIds.forEach(nid => {
            const n = nodes.find(n => n.id === nid);
            if (n) multiDragOffsets.set(nid, {
                offX: e.clientX - canvasPanX - n.x * canvasZoom,
                offY: e.clientY - canvasPanY - n.y * canvasZoom,
            });
        });
        return;
    }

    // 다중 선택 외부 노드 클릭 → 선택 해제
    if (selectedNodeIds.size > 0 && !e.shiftKey && !mobileConnectMode) {
        selectedNodeIds.clear();
        updateHintBar();
    }

    // 연결 모드 (모바일 하단 버튼 또는 Shift+클릭)
    if (mobileConnectMode || e.shiftKey) {
        if (connectSourceId != null && connectSourceId !== id) {
            const exactIdx = links.findIndex(l => l.source === connectSourceId && l.target === id);
            const revIdx   = links.findIndex(l => l.source === id && l.target === connectSourceId);

            saveSnapshot();
            if (exactIdx !== -1) {
                links.splice(exactIdx, 1);
            } else if (revIdx !== -1) {
                links[revIdx] = { source: connectSourceId, target: id };
            } else {
                links.push({ source: connectSourceId, target: id });
            }
            connectSourceId = null;
            renderMindmap();
            saveMindmap();
            // 모바일 연결 버튼 모드면 자동 해제
            if (mobileConnectMode) {
                mobileConnectMode = false;
                document.getElementById('mmMobConnect')?.classList.remove('active');
                updateHintBar();
            }
        } else {
            connectSourceId = id;
            renderMindmap();
            if (mobileConnectMode) updateHintBar();
        }
        return;
    }

    // 더블클릭 감지: 350ms 이내 같은 노드 재클릭
    const now = Date.now();
    const elapsed = now - lastClickTime;

    if (id === lastClickNodeId && elapsed < DBLCLICK_MS) {
        // ✅ 더블클릭 → 인라인 편집 열기 (드래그 시작 안 함)
        lastClickNodeId = null;
        lastClickTime   = 0;
        draggingNodeId  = null;  // 드래그 상태 초기화
        openEditor(id);
        return;
    }
    lastClickNodeId = id;
    lastClickTime   = now;

    // 드래그 이동 시작
    saveSnapshot(); // 노드 이동 시작 전 스냅샷
    draggingNodeId = id;
    setSelectedNodeDOM(id);

    const node = nodes.find(n => n.id === id);
    if (node) {
        dragOffsetX = e.clientX - canvasPanX - node.x * canvasZoom;
        dragOffsetY = e.clientY - canvasPanY - node.y * canvasZoom;
    }
};

// ── 체크박스 토글 전역 핸들러 ────────────────────────────────────
window._toggleCheckbox = (event, nodeId, rawLineIdx) => {
    event.stopPropagation();
    event.preventDefault();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const lines = (node.text || '').split('\n');
    if (rawLineIdx >= lines.length) return;
    const cbMatch = lines[rawLineIdx].match(/^\[([ xX]?)\](.*)/);
    if (!cbMatch) return;
    saveSnapshot();
    const wasChecked = /[xX]/.test(cbMatch[1]);
    lines[rawLineIdx] = (wasChecked ? '[ ]' : '[x]') + cbMatch[2];
    node.text = lines.join('\n');
    renderMindmap();
    saveMindmap();
};

// ── 색상 선택기 ──────────────────────────────────────────────────
let _colorPickerHandler = null;

function showColorPicker(nodeId, x, y) {
    closeColorPicker(); // 이미 열려 있으면 먼저 닫기

    const picker   = document.getElementById('mmColorPicker');
    const swatches = document.getElementById('mmColorSwatches');
    if (!picker || !swatches) return;

    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    const currentIdx = node.colorIdx ?? (node.isMain ? -1 : node.id % NODE_COLORS.length);

    swatches.innerHTML = NODE_COLORS.map((c, idx) => {
        const active = idx === currentIdx;
        return `<button class="mm-color-swatch${active ? ' active' : ''}"
            style="background:${c.fill}; border-color:${c.stroke}; --swatch-glow:${c.glow}"
            data-idx="${idx}" data-node="${nodeId}" title="색상 ${idx + 1}">
            ${active ? `<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><polyline points="1.5,5.5 4.5,8.5 9.5,2.5" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
        </button>`;
    }).join('');

    picker.classList.remove('hidden');
    picker.style.left = `${x}px`;
    picker.style.top  = `${y}px`;

    // 뷰포트 + 모바일 바 경계 안으로 위치 보정
    const isMob  = window.innerWidth <= 1024;
    const topSafe = isMob ? 56 : 8;
    const botSafe = isMob ? 134 : 8;
    requestAnimationFrame(() => {
        const r = picker.getBoundingClientRect();
        if (r.right  > window.innerWidth  - 8)       picker.style.left = `${window.innerWidth  - r.width  - 8}px`;
        if (r.bottom > window.innerHeight - botSafe)  picker.style.top  = `${window.innerHeight - r.height - botSafe}px`;
        if (r.left < 8)      picker.style.left = '8px';
        if (r.top < topSafe) picker.style.top  = `${topSafe}px`;
    });

    // 스와치 탭/클릭: pointerup으로 마우스·터치 통합 처리
    swatches.querySelectorAll('.mm-color-swatch').forEach(btn => {
        btn.addEventListener('pointerup', e => {
            e.stopPropagation();
            const n = nodes.find(n => n.id === parseInt(btn.dataset.node));
            if (n) { saveSnapshot(); n.colorIdx = parseInt(btn.dataset.idx); renderMindmap(); saveMindmap(); }
            closeColorPicker();
        });
    });

    // 외부 pointerdown 시 닫기 (picker 안쪽 탭은 제외)
    // — 100ms 지연: 색상 변경 메뉴 클릭의 pointerdown이 리스너에 걸리지 않도록
    setTimeout(() => {
        _colorPickerHandler = e => {
            if (!e.target.closest('#mmColorPicker')) closeColorPicker();
        };
        document.addEventListener('pointerdown', _colorPickerHandler);
    }, 100);
}

function closeColorPicker() {
    document.getElementById('mmColorPicker')?.classList.add('hidden');
    if (_colorPickerHandler) {
        document.removeEventListener('pointerdown', _colorPickerHandler);
        _colorPickerHandler = null;
    }
}

// ── 자유 그리기 모드 컨트롤 ────────────────────────────────────
function startDrawingMode() {
    isDrawingMode = true;
    drawingStrokes = [];
    currentStroke = null;
    setSelectedNodeDOM(null);
    closeEditor();
    
    document.getElementById('mmDrawToolbar')?.classList.remove('hidden');
    // 모바일 하단 액션바 등 기타 UI 숨기기
    document.getElementById('mmMobileBar')?.classList.remove('mm-mobile-bar--visible');

    // 색상 초기화 (첫 그리기 시)
    const swatch = document.getElementById('mmDrawColorSwatch');
    if (swatch) swatch.style.backgroundColor = NODE_COLORS[currentDrawingColorIdx].stroke;
    
    renderMindmap(); // 잉크 그룹 업데이트 등
}

function cancelDrawingMode() {
    isDrawingMode = false;
    drawingStrokes = [];
    currentStroke = null;
    
    document.getElementById('mmDrawToolbar')?.classList.add('hidden');
    if (window.innerWidth <= 1024) {
        document.getElementById('mmMobileBar')?.classList.add('mm-mobile-bar--visible');
    }
    
    renderMindmap();
}

function doneDrawingMode() {
    if (!drawingStrokes.length) {
        cancelDrawingMode();
        return;
    }
    
    // 전체 Bounding Box 계산
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    drawingStrokes.forEach(stroke => {
        stroke.forEach(pt => {
            if (pt.x < minX) minX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y > maxY) maxY = pt.y;
        });
    });
    
    if (minX === Infinity || maxX - minX < 5 || maxY - minY < 5) {
        // 너무 작으면 취소 (오작동 방지)
        cancelDrawingMode();
        return;
    }
    
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const baseW = maxX - minX + 20; // 패딩 추가
    const baseH = maxY - minY + 20;

    // 점들을 중심점(cx, cy) 기준으로 정규화
    const normalizedStrokes = drawingStrokes.map(stroke => 
        stroke.map(pt => ({
            x: pt.x - cx,
            y: pt.y - cy
        }))
    );

    const newNode = {
        id: Date.now(),
        type: 'freehand',
        text: '',
        x: cx,
        y: cy,
        width: baseW,
        height: baseH,
        baseWidth: baseW,
        baseHeight: baseH,
        strokes: normalizedStrokes,
        colorIdx: currentDrawingColorIdx,
        textOffsetX: 0,
        textOffsetY: 0
    };
    
    saveSnapshot();
    nodes.push(newNode);
    
    isDrawingMode = false;
    drawingStrokes = [];
    currentStroke = null;
    
    document.getElementById('mmDrawToolbar')?.classList.add('hidden');
    if (window.innerWidth <= 1024) {
        document.getElementById('mmMobileBar')?.classList.add('mm-mobile-bar--visible');
    }
    
    renderMindmap();
    saveMindmap();
    openEditor(newNode.id);
}

function changeNodeShape(id, newType) {
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    
    saveSnapshot();
    const prevType = node.type;
    node.type = newType;

    // 도형 전환 시 대략적인 형태 유지
    if (prevType === 'circle' && newType !== 'circle') {
        node.width = (node.radius || 50) * 2;
        node.height = (node.radius || 50) * 2;
        delete node.radius;
    } else if (prevType !== 'circle' && newType === 'circle') {
        node.radius = Math.max(node.width || 120, node.height || 60) / 2;
        delete node.width;
        delete node.height;
    }
    
    renderMindmap();
    saveMindmap();
}

// ── 노드 우클릭 전역 핸들러 ─────────────────────────────────────
window._nodeContextMenu = (e, id) => {
    e.preventDefault();
    e.stopPropagation();

    selectedNodeId = id;
    renderMindmap();

    const node = nodes.find(n => n.id === id);
    if (!node) return;

    const menuItems = [
        { label: '✏️ 이름 변경', action: () => openEditor(id) },
        { label: '🎨 색상 변경', action: () => showColorPicker(id, e.clientX, e.clientY) },
        { label: '⇲ 크기 변경', action: () => enterResizeMode(id) },
        { type: 'separator' },
        { label: '◀ 텍스트 좌측 정렬', action: () => { saveSnapshot(); node.textAlign = 'left';   renderMindmap(); saveMindmap(); } },
        { label: '◆ 텍스트 중앙 정렬', action: () => { saveSnapshot(); node.textAlign = 'center'; renderMindmap(); saveMindmap(); } },
        { label: '▶ 텍스트 우측 정렬', action: () => { saveSnapshot(); node.textAlign = 'right';  renderMindmap(); saveMindmap(); } },
    ];

    if (node && node.type !== 'freehand') {
        menuItems.push({ type: 'separator' });
        if (node.type !== 'circle') menuItems.push({ label: '⭕ 원형으로 변경', action: () => changeNodeShape(id, 'circle') });
        if (node.type !== 'rect') menuItems.push({ label: '▭ 사각형으로 변경', action: () => changeNodeShape(id, 'rect') });
        if (node.type !== 'triangle') menuItems.push({ label: '△ 삼각형으로 변경', action: () => changeNodeShape(id, 'triangle') });
    }

    if (!node.isMain) {
        menuItems.push({ type: 'separator' });
        menuItems.push({
            label: '🗑️ 노드 삭제',
            action: async () => {
                if (await window.appConfirm(`'${node.text || '이름 없음'}' 노드를 삭제하시겠습니까?`)) {
                    deleteNode(id);
                }
            }
        });
    }

    contextMenu.show(e.clientX, e.clientY, menuItems);
};
