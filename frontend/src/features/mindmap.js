import { apiFetch } from '../services/api.js';
import { getMindmapHTML } from '../components/mindmap.js';
import { mindmapEngine } from './mindmap-engine.js';
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
    if (node.isMain) return MAIN_COLOR;
    const idx = node.colorIdx ?? (node.id % NODE_COLORS.length);
    return NODE_COLORS[idx % NODE_COLORS.length];
}

let nodes = [];
let links = [];
let ctx   = null;
let selectedNodeId = null;

// ── 상태 ────────────────────────────────────────────────────────
let draggingNodeId = null;
let dragOffsetX = 0, dragOffsetY = 0;
let isDrawing = false;
let connectSourceId = null;

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

// ── 초기화 ──────────────────────────────────────────────────────
export async function initMindmap() {
    const appRoot = document.getElementById('app-root');
    appRoot.innerHTML = getMindmapHTML();

    const canvas = document.getElementById('drawingCanvas');
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    await loadMindmapData();

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

    // 실시간 동기화 리스너 (범용 아키텍처 적용 - 전역 마인드맵은 ID 0 사용)
    syncService.watchWidget(0, async () => {
        console.log('[Mindmap] 실시간 데이터 업데이트 감지 - 데이터 재로드');
        await loadMindmapData();
        renderMindmap();
    });
}

// ── 편집기 이벤트 ─────────────────────────────────────────────
function initEditorEvents() {
    const input = document.getElementById('nodeTextInput');
    if (!input) return;

    const applyEdit = () => {
        const id = window._editNodeId;
        if (id == null) return;
        const node = nodes.find(n => n.id === id);
        if (node) { node.text = input.value; renderMindmap(); saveMindmap(); }
        closeEditor();
    };

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter')  { e.preventDefault(); applyEdit(); }
        if (e.key === 'Escape') { e.preventDefault(); closeEditor(); }
        // Delete: 입력 비어있을 때만 노드 삭제
        if (e.key === 'Delete' && input.value === '') {
            const id = window._editNodeId;
            if (id == null) return;
            const node = nodes.find(n => n.id === id);
            if (!node || node.isMain) { if (node?.isMain) window.appAlert('중심 노드는 삭제할 수 없습니다.'); return; }
            nodes = nodes.filter(n => n.id !== id);
            links = links.filter(l => l.source !== id && l.target !== id);
            renderMindmap(); saveMindmap(); closeEditor();
        }
    });

    // 조작 안지지(pointer-events 다운)  → 외부 클릭 시 저장 후 닫기
    input.addEventListener('blur', () => {
        // 짧은 지연 후 저장 (다른 노드 클릭 시보다 뒤에 실행되도록)
        setTimeout(() => { if (window._editNodeId != null) applyEdit(); }, 100);
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
    const sx = svgRect.left + node.x;
    const sy = svgRect.top  + node.y;

    const nW = node.type === 'rect' || node.type === 'triangle' ? (node.width  || 120) : (node.radius || 50) * 2;
    const nH = node.type === 'rect' || node.type === 'triangle' ? (node.height || 60)  : (node.radius || 50) * 2;

    const edW = Math.max(nW + 24, 160);
    const edH = Math.max(nH, 44);

    editor.classList.remove('hidden');
    Object.assign(editor.style, {
        position:  'fixed',
        left:      `${sx - edW / 2}px`,
        top:       `${sy - edH / 2}px`,
        width:     `${edW}px`,
        height:    `${edH}px`,
        transform: 'none',
    });

    input.style.fontSize = node.isMain ? '17px' : '14px';
    input.value = node.text || '';
    requestAnimationFrame(() => { input.focus(); input.select(); });
}

// ── 렌더링 ──────────────────────────────────────────────────────
function resizeCanvas() {
    const c = document.getElementById('drawingCanvas');
    if (c) { c.width = window.innerWidth; c.height = window.innerHeight; }
}

async function loadMindmapData() {
    try {
        // SyncService에서 마인드맵 데이터 가져오기
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
    if (from.type === 'rect') {
        const hw = (from.width  || 120) / 2;
        const hh = (from.height || 60)  / 2;
        const t  = Math.min(nx ? hw / Math.abs(nx) : Infinity,
                            ny ? hh / Math.abs(ny) : Infinity);
        return { x: from.x + nx * t, y: from.y + ny * t };
    }
    if (from.type === 'triangle') {
        // 삼각형 경계점 계산 (이등변 삼각형 근사)
        const w = from.width || 120;
        const h = from.height || 100;
        // 단순화된 사각형 바운딩 박스 기반 경계점 (삼각형의 경우 조금 더 안쪽으로 들어오게 유도)
        const hw = w * 0.4; 
        const hh = h * 0.4;
        const t  = Math.min(nx ? hw / Math.abs(nx) : Infinity,
                            ny ? hh / Math.abs(ny) : Infinity);
        return { x: from.x + nx * t, y: from.y + ny * t };
    }
    const r = from.radius || 50;
    return { x: from.x + nx * r, y: from.y + ny * r };
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
        const isSelected = selectedNodeId === node.id;
        const color = getNodeColor(node);

        const selectionOverlay = isSelected
            ? (node.type === 'rect'
                ? `<rect x="${-(node.width||120)/2-5}" y="${-(node.height||60)/2-5}" width="${(node.width||120)+10}" height="${(node.height||60)+10}" rx="13" fill="none" stroke="${color.stroke}" stroke-width="1.5" stroke-dasharray="5 3" opacity="0.8"/>`
                : (node.type === 'triangle'
                    ? `<polygon points="0,${-(node.height||100)/2-8} ${-(node.width||120)/2-8},${(node.height||100)/2+5} ${(node.width||120)/2+8},${(node.height||100)/2+5}" fill="none" stroke="${color.stroke}" stroke-width="1.5" stroke-dasharray="5 3" opacity="0.8"/>`
                    : `<circle r="${(node.radius||50)+5}" fill="none" stroke="${color.stroke}" stroke-width="1.5" stroke-dasharray="5 3" opacity="0.8"/>`))
            : '';

        const shape = node.type === 'rect'
            ? `<rect x="${-(node.width||120)/2}" y="${-(node.height||60)/2}" width="${node.width||120}" height="${node.height||60}" rx="12" class="node-shape" fill="${color.fill}" stroke="${color.stroke}" stroke-width="${node.isMain?3:2}" filter="url(#glass-shadow)"/>`
            : (node.type === 'triangle'
                ? `<polygon points="0,${-(node.height||100)/2} ${-(node.width||120)/2},${(node.height||100)/2} ${(node.width||120)/2},${(node.height||100)/2}" class="node-shape" fill="${color.fill}" stroke="${color.stroke}" stroke-width="${node.isMain?3:2}" filter="url(#glass-shadow)"/>`
                : `<circle r="${node.radius||50}" class="node-shape" fill="${color.fill}" stroke="${color.stroke}" stroke-width="${node.isMain?3:2}" filter="url(#glass-shadow)"/>`);

        const isConnSrc = connectSourceId === node.id;
        const cls = `node-group${node.isMain?' main':''}${isConnSrc?' connecting-source':''}${isSelected?' selected':''}`;

        // 긴 텍스트 두 줄 처리
        const txt = node.text || '';
        const MAX = 10;
        const textEl = txt.length > MAX
            ? `<text text-anchor="middle" class="node-text"><tspan x="0" dy="-7">${txt.slice(0,MAX)}</tspan><tspan x="0" dy="18">${txt.slice(MAX,MAX*2)}${txt.length>MAX*2?'…':''}</tspan></text>`
            : `<text text-anchor="middle" dy="${node.isMain?'6':'5'}" class="node-text">${txt}</text>`;

        return `<g class="${cls}" transform="translate(${node.x},${node.y})" style="--node-glow:${color.glow}" onmousedown="window._nodeMouseDown(event,${node.id})" oncontextmenu="window._nodeContextMenu(event,${node.id})">${selectionOverlay}${shape}${textEl}</g>`;
    }).join('');
}

// ── 이벤트 설정 ──────────────────────────────────────────────────
function setupEvents() {
    const svg = document.getElementById('mindmapSVG');
    // canvas는 pointer-events:none 유지 → SVG가 항상 이벤트 수신

    // ─ 빈 곳 mousedown → 리사이즈 완료 or 그리기 시작 ─
    svg.addEventListener('mousedown', e => {
        // 리사이즈 핸들 클릭은 _resizeHandleDown이 처리
        if (e.target.classList.contains('resize-handle')) return;
        // 리사이즈 모드 중 빈 곳 클릭 → 완료
        if (resizingNodeId) { exitResizeMode(false); return; }
        if (e.target.closest('.node-group')) return;  // 노드 클릭은 _nodeMouseDown이 처리
        if (window._editNodeId != null) { closeEditor(); return; }
        if (connectSourceId != null) return; // 연결 대기 중엔 그리기 무시

        selectedNodeId = null; // 빈 곳 클릭 시 선택 해제
        renderMindmap();

        isDrawing = true;
        mindmapEngine.clearPoints();
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.beginPath();
        ctx.lineWidth = 3; ctx.strokeStyle = '#8B5CF6';
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.moveTo(e.clientX, e.clientY);
        mindmapEngine.addPoint(e.clientX, e.clientY);
    });

    // ─ mousemove: 드래그 이동 or 그리기 ─
    // document에 등록해야 SVG 범위 밖으로 이동해도 작동
    document.addEventListener('mousemove', e => {
        // 리사이즈 핸들 드래그 중
        if (resizingNodeId && resizeDragHandle) {
            const node = nodes.find(n => n.id === resizingNodeId);
            if (node) {
                applyResize(node, resizeDragHandle, e.clientX - resizeDragStartX, e.clientY - resizeDragStartY);
                renderMindmap();
                updateResizeOverlay();
            }
            return;
        }
        if (draggingNodeId) {
            const node = nodes.find(n => n.id === draggingNodeId);
            if (node) {
                node.x = e.clientX - dragOffsetX;
                node.y = e.clientY - dragOffsetY;
                renderMindmap();
            }
        } else if (isDrawing) {
            ctx.lineTo(e.clientX, e.clientY);
            ctx.stroke();
            mindmapEngine.addPoint(e.clientX, e.clientY);
        }
    });

    // ─ mouseup: 드래그 종료 or 도형 인식 ─
    document.addEventListener('mouseup', e => {
        // 핸들 드래그 종료 (리사이즈 모드는 유지, 핸들 드래그만 끝냄)
        if (resizeDragHandle) {
            resizeDragHandle    = null;
            resizeDragStartDims = null;
            return;
        }

        if (draggingNodeId) {
            draggingNodeId = null;
            saveMindmap();
        }

        if (isDrawing) {
            isDrawing = false;
            const shape = mindmapEngine.recognizeShape();
            if (shape) {
                nodeColorIndex = (nodeColorIndex + 1) % NODE_COLORS.length;
                const newNode = {
                    id: Date.now(), text: '',
                    x: shape.x, y: shape.y,
                    type: shape.type, radius: shape.radius,
                    width: shape.width, height: shape.height,
                    colorIdx: nodeColorIndex
                };
                nodes.push(newNode);
                renderMindmap();
                openEditor(newNode.id);
            }
            setTimeout(() => ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height), 300);
        }
    });

    // ─ ESC & Delete: 액션 취소 및 삭제 ─
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (resizingNodeId) { exitResizeMode(true); return; } // 리사이즈 취소
            let changed = false;
            if (connectSourceId != null) {
                connectSourceId = null;
                changed = true;
            }
            if (draggingNodeId != null) {
                draggingNodeId = null;
            }
            if (isDrawing) {
                isDrawing = false;
                ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            }
            if (selectedNodeId != null) {
                selectedNodeId = null;
                changed = true;
            }
            closeEditor();
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

            if (selectedNodeId != null) {
                const node = nodes.find(n => n.id === selectedNodeId);
                if (!node || node.isMain) {
                    if (node?.isMain) window.appAlert('중심 노드는 삭제할 수 없습니다.');
                    return;
                }
                deleteNode(selectedNodeId);
            }
        }
    });

    document.getElementById('saveMindmapBtn').onclick        = saveMindmap;
    document.getElementById('backToDashFromMindmap').onclick = () => location.reload();

    // 도움말 모달
    const helpBtn   = document.getElementById('mmHelpBtn');
    const helpModal = document.getElementById('mmHelpModal');
    const helpClose = document.getElementById('mmHelpClose');
    if (helpBtn && helpModal) {
        helpBtn.onclick = () => helpModal.classList.toggle('hidden');
        helpClose.onclick = () => helpModal.classList.add('hidden');
        // 배경 클릭 시 닫기
        helpModal.addEventListener('mousedown', e => {
            if (e.target === helpModal) helpModal.classList.add('hidden');
        });
    }
}

async function saveMindmap() {
    const indicator = document.getElementById('saveStatus');
    if (indicator) { indicator.textContent = '저장 중…'; indicator.className = 'mm-save-indicator saving'; }
    try {
        await apiFetch('/api/mindmap', {
            method: 'POST',
            body: JSON.stringify({ data: { nodes, links } })
        });
        if (indicator) {
            indicator.textContent = '저장됨';
            indicator.className = 'mm-save-indicator saved';
            setTimeout(() => { indicator.textContent = ''; indicator.className = 'mm-save-indicator'; }, 2000);
        }
    } catch (_) {
        if (indicator) { indicator.textContent = '저장 실패'; indicator.className = 'mm-save-indicator'; }
    }
}

function deleteNode(id) {
    const node = nodes.find(n => n.id === id);
    if (!node || node.isMain) return;

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
        // ESC → 원래 치수로 복원
        const node = nodes.find(n => n.id === resizingNodeId);
        if (node && resizeOriginalDims) {
            node.width  = resizeOriginalDims.width;
            node.height = resizeOriginalDims.height;
            node.radius = resizeOriginalDims.radius;
        }
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
    const PAD = 8; // 핸들 박스와 도형 사이 여백
    let border = '';
    let handleDefs = [];

    if (node.type === 'rect') {
        const hw = (node.width || 120) / 2;
        const hh = (node.height || 60) / 2;
        // border는 도형 외곽 기준 (핸들은 border 위에 위치)
        border = `<rect x="${x-hw-PAD}" y="${y-hh-PAD}" width="${hw*2+PAD*2}" height="${hh*2+PAD*2}" rx="16" class="resize-border"/>`;
        handleDefs = [
            { key: 'nw', cx: x-hw-PAD, cy: y-hh-PAD, cur: 'nw-resize' },
            { key: 'n',  cx: x,        cy: y-hh-PAD, cur: 'n-resize'  },
            { key: 'ne', cx: x+hw+PAD, cy: y-hh-PAD, cur: 'ne-resize' },
            { key: 'w',  cx: x-hw-PAD, cy: y,         cur: 'w-resize'  },
            { key: 'e',  cx: x+hw+PAD, cy: y,         cur: 'e-resize'  },
            { key: 'sw', cx: x-hw-PAD, cy: y+hh+PAD, cur: 'sw-resize' },
            { key: 's',  cx: x,        cy: y+hh+PAD, cur: 's-resize'  },
            { key: 'se', cx: x+hw+PAD, cy: y+hh+PAD, cur: 'se-resize' },
        ];
    } else if (node.type === 'circle') {
        const r = node.radius || 50;
        const rp = r + PAD; // 핸들을 원 바깥쪽으로 PAD만큼 밀어냄
        border = `<circle cx="${x}" cy="${y}" r="${rp}" class="resize-border"/>`;
        handleDefs = [
            { key: 'n', cx: x,    cy: y-rp, cur: 'n-resize' },
            { key: 's', cx: x,    cy: y+rp, cur: 's-resize' },
            { key: 'w', cx: x-rp, cy: y,    cur: 'w-resize' },
            { key: 'e', cx: x+rp, cy: y,    cur: 'e-resize' },
        ];
    } else { // triangle
        const hw = (node.width || 120) / 2;
        const hh = (node.height || 100) / 2;
        border = `<rect x="${x-hw-PAD}" y="${y-hh-PAD}" width="${hw*2+PAD*2}" height="${hh*2+PAD*2}" rx="8" class="resize-border"/>`;
        handleDefs = [
            { key: 'n',  cx: x,        cy: y-hh-PAD, cur: 'n-resize'  },
            { key: 's',  cx: x,        cy: y+hh+PAD, cur: 's-resize'  },
            { key: 'w',  cx: x-hw-PAD, cy: y,         cur: 'w-resize'  },
            { key: 'e',  cx: x+hw+PAD, cy: y,         cur: 'e-resize'  },
            { key: 'sw', cx: x-hw-PAD, cy: y+hh+PAD, cur: 'sw-resize' },
            { key: 'se', cx: x+hw+PAD, cy: y+hh+PAD, cur: 'se-resize' },
        ];
    }

    // 핸들 = 투명한 큰 히트 영역(28×28) + 보이는 작은 사각형(12×12)
    const HIT = 14; // 히트 영역 반경 (총 28×28)
    const VIS = 6;  // 보이는 핸들 반경 (총 12×12)
    const handles = handleDefs.map(h =>
        // ① 투명 히트 영역 - 실제 이벤트를 받음
        `<rect x="${h.cx-HIT}" y="${h.cy-HIT}" width="${HIT*2}" height="${HIT*2}"` +
        ` fill="transparent" style="cursor:${h.cur}"` +
        ` onmousedown="window._resizeHandleDown(event,'${h.key}')"/>` +
        // ② 보이는 핸들 - pointer-events 없음
        `<rect x="${h.cx-VIS}" y="${h.cy-VIS}" width="${VIS*2}" height="${VIS*2}" rx="3"` +
        ` class="resize-handle" pointer-events="none"/>`
    ).join('');

    rog.innerHTML = border + handles;
}

function applyResize(node, handle, dx, dy) {
    const MIN_W = 60, MIN_H = 40, MIN_R = 28;
    const d = resizeDragStartDims;
    if (!d) return;

    if (node.type === 'circle') {
        // 각 방향 핸들이 반지름을 독립적으로 제어
        if (handle === 'e') node.radius = Math.max(MIN_R, d.radius + dx);
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

// ── 노드 mousedown 전역 핸들러 ───────────────────────────────────
window._nodeMouseDown = (e, id) => {
    e.stopPropagation(); // 빈 곳 SVG 이벤트로 버블 방지

    // 리사이즈 모드 중 → 완료 후 진행 (같은 노드 클릭이면 계속 리사이즈 유지)
    if (resizingNodeId) {
        if (resizingNodeId !== id) exitResizeMode(false);
        return;
    }

    // 편집기 열려 있을 때 다른 노드 클릭 → 편집기 닫기
    if (window._editNodeId != null) {
        if (window._editNodeId !== id) closeEditor();
        return;
    }

    // Shift + 클릭 → 연결 모드
    if (e.shiftKey) {
        if (connectSourceId != null && connectSourceId !== id) {
            const exists = links.some(l =>
                (l.source === connectSourceId && l.target === id) ||
                (l.target === connectSourceId && l.source === id));
            if (!exists) links.push({ source: connectSourceId, target: id });
            connectSourceId = null;
            renderMindmap();
            saveMindmap();
        } else {
            connectSourceId = id;
            renderMindmap();
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
    draggingNodeId = id;
    selectedNodeId = id; // 노드 클릭 시 선택 상태로 변경
    renderMindmap();

    const node = nodes.find(n => n.id === id);
    if (node) {
        dragOffsetX = e.clientX - node.x;
        dragOffsetY = e.clientY - node.y;
    }
};

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
        { label: '⇲ 크기 변경', action: () => enterResizeMode(id) },
    ];

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
