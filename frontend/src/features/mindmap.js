import { apiFetch } from '../services/api.js';
import { getMindmapHTML } from '../components/mindmap.js';
import { mindmapEngine } from './mindmap-engine.js';
import { contextMenu } from '../utils/context-menu.js';
import { syncService, SYNC_DATA_TYPES } from '../services/sync.js';

let nodes = [];
let links = [];
let ctx   = null;
let selectedNodeId = null; // 선택된 노드 (Delete 키 삭제용)

// ── 상태 ────────────────────────────────────────────────────────
let draggingNodeId = null;
let dragOffsetX = 0, dragOffsetY = 0;
let isDrawing = false;
let connectSourceId = null;    // Shift+클릭 연결의 첫 번째 노드

// 더블클릭 감지
let lastClickNodeId = null;
let lastClickTime   = 0;
const DBLCLICK_MS   = 350;

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
            if (!node || node.isMain) { if (node?.isMain) alert('중심 노드는 삭제할 수 없습니다.'); return; }
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
    if (ed) {
        ed.classList.add('hidden');
        ed.style.display = '';
    }
}

function openEditor(nodeId) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    window._editNodeId = nodeId;
    const editor = document.getElementById('nodeEditor');
    const input  = document.getElementById('nodeTextInput');
    if (!editor || !input) return;

    // SVG 좌표 → 화면(fixed) 좌표 변환
    const svg     = document.getElementById('mindmapSVG');
    const svgRect = svg.getBoundingClientRect();
    const sx = svgRect.left + node.x;  // 화면 X (node.x는 SVG 내부 좌표)
    const sy = svgRect.top  + node.y;  // 화면 Y

    // 노드 크기 계산
    const nW = node.type === 'rect' || node.type === 'triangle' ? (node.width  || 120) : (node.radius || 50) * 2;
    const nH = node.type === 'rect' || node.type === 'triangle' ? (node.height || 60)  : (node.radius || 50) * 2;

    // 편집 input을 노드 도형에 정확히 오버레이
    const edW = Math.max(nW + 24, 160);
    const edH = Math.max(nH, 40);

    editor.classList.remove('hidden');
    editor.style.position  = 'fixed';
    editor.style.left      = `${sx - edW / 2}px`;
    editor.style.top       = `${sy - edH / 2}px`;
    editor.style.width     = `${edW}px`;
    editor.style.height    = `${edH}px`;
    editor.style.transform = 'none';

    // input 크기도 노드에 맞게
    input.style.width  = '100%';
    input.style.height = '100%';
    input.style.textAlign = 'center';
    input.style.fontSize  = node.isMain ? '18px' : '14px';

    input.value = node.text || '';
    requestAnimationFrame(() => { input.focus(); input.select(); });
    console.log('[Mindmap] 편집창 열림 - ID:', nodeId, '위치:', sx, sy);
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
        return `<path d="M ${sp.x} ${sp.y} Q ${cx} ${cy}, ${tp.x} ${tp.y}"
                      class="mindmap-link" marker-end="url(#arrowhead)"/>`;
    }).join('');

    ng.innerHTML = nodes.map(node => {
        const isSelected = selectedNodeId === node.id;
        const nW = node.type === 'rect' || node.type === 'triangle' ? (node.width || 120) : (node.radius || 50) * 2;
        const nH = node.type === 'rect' || node.type === 'triangle' ? (node.height || 60) : (node.radius || 50) * 2;

        const selectionOverlay = isSelected 
            ? (node.type === 'rect' 
                ? `<rect x="${-(node.width||120)/2 - 4}" y="${-(node.height||60)/2 - 4}" width="${(node.width||120)+8}" height="${(node.height||60)+8}" rx="12" fill="none" stroke="#8B5CF6" stroke-width="2" stroke-dasharray="4 2"/>`
                : (node.type === 'triangle'
                    ? `<polygon points="0,${-(node.height||100)/2 - 8} ${-(node.width||120)/2 - 8},${(node.height||100)/2 + 4} ${(node.width||120)/2 + 8},${(node.height||100)/2 + 4}" fill="none" stroke="#8B5CF6" stroke-width="2" stroke-dasharray="4 2"/>`
                    : `<circle r="${(node.radius||50) + 4}" fill="none" stroke="#8B5CF6" stroke-width="2" stroke-dasharray="4 2"/>`))
            : '';

        const shape = node.type === 'rect'
            ? `<rect x="${-(node.width||120)/2}" y="${-(node.height||60)/2}"
                     width="${node.width||120}" height="${node.height||60}"
                     rx="10" class="node-shape" filter="url(#glass-shadow)"/>`
            : (node.type === 'triangle' 
                ? `<polygon points="0,${-(node.height||100)/2} ${-(node.width||120)/2},${(node.height||100)/2} ${(node.width||120)/2},${(node.height||100)/2}" 
                            class="node-shape" filter="url(#glass-shadow)"/>`
                : `<circle r="${node.radius||50}" class="node-shape" filter="url(#glass-shadow)"/>`);

        const isConnSrc = connectSourceId === node.id;
        return `
            <g class="node-group${node.isMain ? ' main' : ''}${isConnSrc ? ' connecting-source' : ''}${isSelected ? ' selected' : ''}"
               transform="translate(${node.x},${node.y})"
               onmousedown="window._nodeMouseDown(event,${node.id})"
               oncontextmenu="window._nodeContextMenu(event,${node.id})">
                ${selectionOverlay}
                ${shape}
                <text text-anchor="middle" dy="5" class="node-text">${node.text||''}</text>
            </g>`;
    }).join('');
}

// ── 이벤트 설정 ──────────────────────────────────────────────────
function setupEvents() {
    const svg = document.getElementById('mindmapSVG');
    // canvas는 pointer-events:none 유지 → SVG가 항상 이벤트 수신

    // ─ 빈 곳 mousedown → 그리기 시작 ─
    svg.addEventListener('mousedown', e => {
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
        if (draggingNodeId) {
            draggingNodeId = null;
            saveMindmap();
        }

        if (isDrawing) {
            isDrawing = false;
            const shape = mindmapEngine.recognizeShape();
            if (shape) {
                const newNode = {
                    id: Date.now(), text: '',
                    x: shape.x, y: shape.y,
                    type: shape.type, radius: shape.radius,
                    width: shape.width, height: shape.height
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

        if (e.key === 'Delete' || e.key === 'Backspace') {
            // 텍스트 편집 중이면 처리 안 함 (기존 로직 유지)
            if (window._editNodeId != null) return;

            if (selectedNodeId != null) {
                const node = nodes.find(n => n.id === selectedNodeId);
                if (!node || node.isMain) {
                    if (node?.isMain) alert('중심 노드는 삭제할 수 없습니다.');
                    return;
                }
                deleteNode(selectedNodeId);
            }
        }
    });

    document.getElementById('saveMindmapBtn').onclick        = saveMindmap;
    document.getElementById('backToDashFromMindmap').onclick = () => location.reload();
}

async function saveMindmap() {
    try {
        await apiFetch('/api/mindmap', {
            method: 'POST',
            body: JSON.stringify({ data: { nodes, links } })
        });
    } catch (_) {}
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

// ── 노드 mousedown 전역 핸들러 ───────────────────────────────────
window._nodeMouseDown = (e, id) => {
    e.stopPropagation(); // 빈 곳 SVG 이벤트로 버블 방지

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
        { label: '✏️ 이름 변경', action: () => openEditor(id) }
    ];

    if (!node.isMain) {
        menuItems.push({ type: 'separator' });
        menuItems.push({ 
            label: '🗑️ 노드 삭제', 
            action: () => {
                if (confirm(`'${node.text || '이름 없음'}' 노드를 삭제하시겠습니까?`)) {
                    deleteNode(id);
                }
            } 
        });
    }

    contextMenu.show(e.clientX, e.clientY, menuItems);
};
