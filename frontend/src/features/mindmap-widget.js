/**
 * @file mindmap-widget.js
 * @description 대시보드 위젯으로 임베딩된 마인드맵 기능을 관리합니다.
 * 노드 추가/편집/삭제/연결, 팬/줌, 자동 저장을 지원합니다.
 */

import { apiFetch } from '../services/api.js';
import { safeLocalStorage } from '../utils/storage.js';
import { contextMenu } from '../utils/context-menu.js';

const SAVE_DEBOUNCE_MS = 1200;
const DBLCLICK_MS = 350;

/**
 * 마인드맵 위젯 초기화
 * @param {HTMLElement} el - 위젯 루트 엘리먼트
 * @param {Object} widgetData - 위젯 데이터 (settings.mindmapData 포함 가능)
 */
export function initMindmapWidget(el, widgetData) {
    if (el._isInitialized) return;
    el._isInitialized = true;

    const widgetId = el.dataset.id;
    const svg = el.querySelector('.mindmap-widget-svg');
    if (!svg) return;

    // ── 상태 ────────────────────────────────────────────────────
    let nodes = [];
    let links = [];
    let selectedNodeId = null;
    let connectSourceId = null;
    let draggingNodeId = null;
    let dragOffsetX = 0, dragOffsetY = 0;
    let isPanning = false;
    let panStartX = 0, panStartY = 0;
    let panX = 0, panY = 0;
    let zoom = 1;
    let lastClickNodeId = null;
    let lastClickTime = 0;
    let saveTimer = null;
    let hasMoved = false;

    // ── 데이터 로드 ──────────────────────────────────────────────
    const savedData = widgetData.settings?.mindmapData;
    if (savedData && Array.isArray(savedData.nodes) && savedData.nodes.length > 0) {
        nodes = savedData.nodes;
        links = savedData.links || [];
    } else {
        // 초기 중심 노드
        nodes.push({
            id: Date.now(),
            text: '중심',
            x: 200, y: 130,
            type: 'circle', radius: 42, isMain: true
        });
    }

    // ── 접힘 상태 ────────────────────────────────────────────────
    const header = el.querySelector('.mindmap-widget-header');
    if (header) {
        const platform = window.innerWidth <= 768 ? 'mobile' : 'pc';
        const isCollapsed = safeLocalStorage.getItem(`mindmap_collapsed_${platform}_${widgetId}`) === 'true';
        if (isCollapsed) el.classList.add('collapsed');

        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('button, input')) return;
            let isDragging = false;
            const startY = e.clientY;
            const onMove = (m) => { if (Math.abs(m.clientY - startY) > 5) isDragging = true; };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                if (!isDragging) {
                    const collapsed = el.classList.toggle('collapsed');
                    const p = window.innerWidth <= 768 ? 'mobile' : 'pc';
                    safeLocalStorage.setItem(`mindmap_collapsed_${p}_${widgetId}`, collapsed);
                    import('./dashboard-grid.js').then(m => m.saveLayout?.());
                }
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    // ── 전체화면 버튼 ────────────────────────────────────────────
    const fullscreenBtn = el.querySelector('.btn-mindmap-fullscreen');
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            import('./mindmap.js').then(m => m.initMindmap());
        });
    }

    // ── 노드 추가 버튼 ───────────────────────────────────────────
    const addNodeBtn = el.querySelector('.mw-btn-add-node');
    if (addNodeBtn) {
        addNodeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const rect = svg.getBoundingClientRect();
            // 현재 보이는 캔버스 중앙에 추가
            const cx = (rect.width / 2 - panX) / zoom;
            const cy = (rect.height / 2 - panY) / zoom;
            addNodeAt(cx + (Math.random() - 0.5) * 60, cy + (Math.random() - 0.5) * 60);
        });
    }

    // ── 화면 맞추기 버튼 ────────────────────────────────────────
    const fitBtn = el.querySelector('.mw-btn-fit');
    if (fitBtn) {
        fitBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fitView();
        });
    }

    // ── 헬퍼 ────────────────────────────────────────────────────
    function getSVGPoint(clientX, clientY) {
        const rect = svg.getBoundingClientRect();
        return {
            x: (clientX - rect.left - panX) / zoom,
            y: (clientY - rect.top - panY) / zoom
        };
    }

    function getNodeAt(clientX, clientY) {
        const pt = getSVGPoint(clientX, clientY);
        for (let i = nodes.length - 1; i >= 0; i--) {
            const n = nodes[i];
            if (n.type === 'rect') {
                const hw = (n.width || 110) / 2, hh = (n.height || 55) / 2;
                if (Math.abs(pt.x - n.x) <= hw && Math.abs(pt.y - n.y) <= hh) return n;
            } else {
                if (Math.hypot(pt.x - n.x, pt.y - n.y) <= (n.radius || 40)) return n;
            }
        }
        return null;
    }

    function edgePoint(from, to) {
        const dx = to.x - from.x, dy = to.y - from.y;
        const d = Math.hypot(dx, dy);
        if (d === 0) return { x: from.x, y: from.y };
        const nx = dx / d, ny = dy / d;
        if (from.type === 'rect') {
            const hw = (from.width || 110) / 2, hh = (from.height || 55) / 2;
            const t = Math.min(nx ? hw / Math.abs(nx) : Infinity, ny ? hh / Math.abs(ny) : Infinity);
            return { x: from.x + nx * t, y: from.y + ny * t };
        }
        const r = from.radius || 40;
        return { x: from.x + nx * r, y: from.y + ny * r };
    }

    function escapeXml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function updateTransform() {
        const panGroup = svg.querySelector('.mw-pan-group');
        if (panGroup) {
            panGroup.setAttribute('transform', `translate(${panX},${panY}) scale(${zoom})`);
        }
    }

    // ── 렌더링 ──────────────────────────────────────────────────
    function render() {
        const linksGroup = svg.querySelector('.mw-links-group');
        const nodesGroup = svg.querySelector('.mw-nodes-group');
        if (!linksGroup || !nodesGroup) return;

        linksGroup.innerHTML = links.map(link => {
            const s = nodes.find(n => n.id === link.source);
            const t = nodes.find(n => n.id === link.target);
            if (!s || !t) return '';
            const sp = edgePoint(s, t), tp = edgePoint(t, s);
            const cx = (sp.x + tp.x) / 2, cy = (sp.y + tp.y) / 2 - 18;
            return `<path d="M${sp.x},${sp.y} Q${cx},${cy} ${tp.x},${tp.y}" class="mw-link" marker-end="url(#mw-arrow-${widgetId})"/>`;
        }).join('');

        nodesGroup.innerHTML = nodes.map(node => {
            const isSelected = selectedNodeId === node.id;
            const isConnSrc = connectSourceId === node.id;

            const selOverlay = isSelected
                ? (node.type === 'rect'
                    ? `<rect x="${-(node.width || 110) / 2 - 4}" y="${-(node.height || 55) / 2 - 4}" width="${(node.width || 110) + 8}" height="${(node.height || 55) + 8}" rx="11" fill="none" stroke="#8B5CF6" stroke-width="1.5" stroke-dasharray="4 2"/>`
                    : `<circle r="${(node.radius || 40) + 4}" fill="none" stroke="#8B5CF6" stroke-width="1.5" stroke-dasharray="4 2"/>`)
                : '';

            const shape = node.type === 'rect'
                ? `<rect x="${-(node.width || 110) / 2}" y="${-(node.height || 55) / 2}" width="${node.width || 110}" height="${node.height || 55}" rx="8" class="mw-node-shape"/>`
                : `<circle r="${node.radius || 40}" class="mw-node-shape"/>`;

            const cls = ['mw-node-group'];
            if (node.isMain) cls.push('main');
            if (isConnSrc) cls.push('connecting-source');
            if (isSelected) cls.push('selected');

            // 텍스트가 길면 두 줄로 표시
            const maxChars = 8;
            const text = node.text || '';
            const textEl = text.length > maxChars
                ? `<text text-anchor="middle" class="mw-node-text">
                     <tspan x="0" dy="-7">${escapeXml(text.slice(0, maxChars))}</tspan>
                     <tspan x="0" dy="16">${escapeXml(text.slice(maxChars, maxChars * 2))}${text.length > maxChars * 2 ? '…' : ''}</tspan>
                   </text>`
                : `<text text-anchor="middle" dy="5" class="mw-node-text">${escapeXml(text)}</text>`;

            return `<g class="${cls.join(' ')}" transform="translate(${node.x},${node.y})" data-node-id="${node.id}">
                ${selOverlay}
                ${shape}
                ${textEl}
            </g>`;
        }).join('');

        updateTransform();

        // 노드 이벤트 바인딩
        nodesGroup.querySelectorAll('.mw-node-group').forEach(g => {
            const nid = parseInt(g.dataset.nodeId);
            g.addEventListener('mousedown', (e) => onNodeMouseDown(e, nid));
            g.addEventListener('contextmenu', (e) => onNodeContextMenu(e, nid));
            g.addEventListener('touchstart', (e) => onNodeTouchStart(e, nid), { passive: false });
        });
    }

    // ── 저장 ────────────────────────────────────────────────────
    function scheduleSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(doSave, SAVE_DEBOUNCE_MS);
    }

    async function doSave() {
        try {
            const settings = { ...(widgetData.settings || {}), mindmapData: { nodes, links } };
            widgetData.settings = settings;
            await apiFetch(`/api/widgets/${widgetId}`, {
                method: 'PATCH',
                body: JSON.stringify({ settings })
            });
        } catch (e) {
            console.error('[MindmapWidget] 저장 실패:', e);
        }
    }

    // ── 노드 추가 ────────────────────────────────────────────────
    function addNodeAt(x, y, shape = 'circle') {
        const newNode = {
            id: Date.now(),
            text: '',
            x, y,
            type: shape,
            ...(shape === 'circle' ? { radius: 35 } : { width: 110, height: 50 })
        };
        nodes.push(newNode);
        render();
        openInlineEditor(newNode.id);
    }

    // ── 화면 맞추기 ──────────────────────────────────────────────
    function fitView() {
        if (nodes.length === 0) return;
        const rect = svg.getBoundingClientRect();
        const pad = 40;

        const xs = nodes.map(n => n.x);
        const ys = nodes.map(n => n.y);
        const minX = Math.min(...xs) - 60, maxX = Math.max(...xs) + 60;
        const minY = Math.min(...ys) - 60, maxY = Math.max(...ys) + 60;

        const scaleX = (rect.width - pad * 2) / (maxX - minX);
        const scaleY = (rect.height - pad * 2) / (maxY - minY);
        zoom = Math.min(scaleX, scaleY, 1.5);

        panX = (rect.width - (maxX + minX) * zoom) / 2;
        panY = (rect.height - (maxY + minY) * zoom) / 2;

        updateTransform();
    }

    // ── 인라인 편집기 ────────────────────────────────────────────
    function openInlineEditor(nodeId) {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;
        closeInlineEditor();

        const editor = document.createElement('div');
        editor.className = 'mw-inline-editor';
        editor.id = `mw-editor-${widgetId}`;
        editor._nodeId = nodeId;
        editor._widgetId = widgetId;

        const rect = svg.getBoundingClientRect();
        const screenX = rect.left + panX + node.x * zoom;
        const screenY = rect.top + panY + node.y * zoom;
        const nW = (node.type === 'rect' ? (node.width || 110) : (node.radius || 35) * 2) * zoom;
        const nH = Math.max((node.type === 'rect' ? (node.height || 50) : (node.radius || 35) * 2) * zoom, 34);
        const w = Math.max(nW + 20, 120);

        Object.assign(editor.style, {
            position: 'fixed',
            left: `${screenX - w / 2}px`,
            top: `${screenY - nH / 2}px`,
            width: `${w}px`,
            height: `${nH}px`,
            zIndex: '9999'
        });

        const input = document.createElement('input');
        input.type = 'text';
        input.value = node.text || '';
        input.placeholder = '이름 입력 후 Enter';
        input.className = 'mw-inline-input';

        let applied = false;
        const apply = () => {
            if (applied) return;
            applied = true;
            node.text = input.value;
            render();
            scheduleSave();
            closeInlineEditor();
        };

        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); apply(); }
            if (e.key === 'Escape') { e.preventDefault(); closeInlineEditor(); }
        });
        input.addEventListener('blur', () => setTimeout(apply, 120));

        editor.appendChild(input);
        document.body.appendChild(editor);
        requestAnimationFrame(() => { input.focus(); input.select(); });
    }

    function closeInlineEditor() {
        const ex = document.getElementById(`mw-editor-${widgetId}`);
        if (ex) ex.remove();
    }

    // ── 노드 마우스 이벤트 ───────────────────────────────────────
    function onNodeMouseDown(e, nodeId) {
        e.stopPropagation();

        const editor = document.getElementById(`mw-editor-${widgetId}`);
        if (editor) {
            if (editor._nodeId !== nodeId) closeInlineEditor();
            return;
        }

        if (e.shiftKey) {
            handleConnect(nodeId);
            return;
        }

        const now = Date.now();
        if (nodeId === lastClickNodeId && now - lastClickTime < DBLCLICK_MS) {
            lastClickNodeId = null; lastClickTime = 0;
            draggingNodeId = null;
            openInlineEditor(nodeId);
            return;
        }
        lastClickNodeId = nodeId;
        lastClickTime = now;

        selectedNodeId = nodeId;
        draggingNodeId = nodeId;
        hasMoved = false;

        const node = nodes.find(n => n.id === nodeId);
        if (node) {
            const pt = getSVGPoint(e.clientX, e.clientY);
            dragOffsetX = pt.x - node.x;
            dragOffsetY = pt.y - node.y;
        }
        render();
    }

    function onNodeContextMenu(e, nodeId) {
        e.preventDefault();
        e.stopPropagation();
        selectedNodeId = nodeId;
        render();

        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        const items = [
            { label: '✏️ 이름 변경', action: () => openInlineEditor(nodeId) },
            { type: 'separator' },
            { label: '🔗 연결 시작 (Shift+클릭)', action: () => { connectSourceId = nodeId; render(); } }
        ];

        if (!node.isMain) {
            items.push({ type: 'separator' });
            items.push({
                label: '🗑️ 노드 삭제',
                action: async () => {
                    if (await window.appConfirm(`'${node.text || '노드'}' 를 삭제하시겠습니까?`)) {
                        deleteNode(nodeId);
                    }
                }
            });
        }
        contextMenu.show(e.clientX, e.clientY, items);
    }

    // ── 터치 이벤트 (모바일) ─────────────────────────────────────
    let touchDraggingNodeId = null;
    let touchLastTap = { id: null, time: 0 };
    let touchDragOffset = { x: 0, y: 0 };
    let touchPanStart = { x: 0, y: 0, panX: 0, panY: 0 };
    let isTouchPanning = false;

    function onNodeTouchStart(e, nodeId) {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        e.stopPropagation();

        const touch = e.touches[0];
        const now = Date.now();

        // 더블탭 감지
        if (nodeId === touchLastTap.id && now - touchLastTap.time < 400) {
            touchLastTap = { id: null, time: 0 };
            openInlineEditor(nodeId);
            return;
        }
        touchLastTap = { id: nodeId, time: now };

        selectedNodeId = nodeId;
        touchDraggingNodeId = nodeId;
        hasMoved = false;

        const node = nodes.find(n => n.id === nodeId);
        if (node) {
            const pt = getSVGPoint(touch.clientX, touch.clientY);
            touchDragOffset.x = pt.x - node.x;
            touchDragOffset.y = pt.y - node.y;
        }
        render();
    }

    // ── 연결 처리 ────────────────────────────────────────────────
    function handleConnect(nodeId) {
        if (connectSourceId !== null && connectSourceId !== nodeId) {
            const exists = links.some(l =>
                (l.source === connectSourceId && l.target === nodeId) ||
                (l.target === connectSourceId && l.source === nodeId));
            if (!exists) links.push({ source: connectSourceId, target: nodeId });
            connectSourceId = null;
            render();
            scheduleSave();
        } else {
            connectSourceId = (connectSourceId === nodeId) ? null : nodeId;
            render();
        }
    }

    // ── 노드 삭제 ────────────────────────────────────────────────
    function deleteNode(nodeId) {
        const node = nodes.find(n => n.id === nodeId);
        if (!node || node.isMain) return;
        nodes = nodes.filter(n => n.id !== nodeId);
        links = links.filter(l => l.source !== nodeId && l.target !== nodeId);
        if (selectedNodeId === nodeId) selectedNodeId = null;
        if (connectSourceId === nodeId) connectSourceId = null;
        render();
        scheduleSave();
    }

    // ── SVG 이벤트 ──────────────────────────────────────────────
    svg.addEventListener('mousedown', (e) => {
        if (e.target.closest('.mw-node-group')) return;
        closeInlineEditor();

        if (connectSourceId !== null) {
            connectSourceId = null;
            render();
            return;
        }

        selectedNodeId = null;
        isPanning = true;
        hasMoved = false;
        panStartX = e.clientX - panX;
        panStartY = e.clientY - panY;
        svg.style.cursor = 'grabbing';
        render();
    });

    svg.addEventListener('dblclick', (e) => {
        if (e.target.closest('.mw-node-group')) return;
        e.preventDefault();
        const pt = getSVGPoint(e.clientX, e.clientY);
        addNodeAt(pt.x, pt.y);
    });

    svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = svg.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const delta = e.deltaY > 0 ? 0.88 : 1.12;
        const newZoom = Math.min(Math.max(zoom * delta, 0.2), 4);
        panX = mx - (mx - panX) * (newZoom / zoom);
        panY = my - (my - panY) * (newZoom / zoom);
        zoom = newZoom;
        updateTransform();
    }, { passive: false });

    // 터치 팬/줌
    let lastTouchDist = 0;
    svg.addEventListener('touchstart', (e) => {
        if (e.target.closest('.mw-node-group')) return;
        e.preventDefault();
        if (e.touches.length === 1) {
            isTouchPanning = true;
            const t = e.touches[0];
            touchPanStart = { x: t.clientX, y: t.clientY, panX, panY };
        } else if (e.touches.length === 2) {
            isTouchPanning = false;
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastTouchDist = Math.hypot(dx, dy);
        }
    }, { passive: false });

    svg.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (touchDraggingNodeId !== null) {
            const t = e.touches[0];
            const node = nodes.find(n => n.id === touchDraggingNodeId);
            if (node) {
                const pt = getSVGPoint(t.clientX, t.clientY);
                node.x = pt.x - touchDragOffset.x;
                node.y = pt.y - touchDragOffset.y;
                hasMoved = true;
                render();
            }
        } else if (isTouchPanning && e.touches.length === 1) {
            const t = e.touches[0];
            panX = touchPanStart.panX + (t.clientX - touchPanStart.x);
            panY = touchPanStart.panY + (t.clientY - touchPanStart.y);
            updateTransform();
        } else if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            if (lastTouchDist > 0) {
                const delta = dist / lastTouchDist;
                const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                const rect = svg.getBoundingClientRect();
                const mx = midX - rect.left, my = midY - rect.top;
                const newZoom = Math.min(Math.max(zoom * delta, 0.2), 4);
                panX = mx - (mx - panX) * (newZoom / zoom);
                panY = my - (my - panY) * (newZoom / zoom);
                zoom = newZoom;
                updateTransform();
            }
            lastTouchDist = dist;
        }
    }, { passive: false });

    svg.addEventListener('touchend', () => {
        if (touchDraggingNodeId !== null && hasMoved) scheduleSave();
        touchDraggingNodeId = null;
        isTouchPanning = false;
        lastTouchDist = 0;
    });

    // ── document 이벤트 ─────────────────────────────────────────
    document.addEventListener('mousemove', (e) => {
        if (!document.contains(el)) return;
        if (draggingNodeId !== null) {
            const node = nodes.find(n => n.id === draggingNodeId);
            if (node) {
                const pt = getSVGPoint(e.clientX, e.clientY);
                node.x = pt.x - dragOffsetX;
                node.y = pt.y - dragOffsetY;
                hasMoved = true;
                render();
            }
        } else if (isPanning) {
            panX = e.clientX - panStartX;
            panY = e.clientY - panStartY;
            updateTransform();
        }
    });

    document.addEventListener('mouseup', () => {
        if (!document.contains(el)) return;
        if (draggingNodeId !== null) {
            if (hasMoved) scheduleSave();
            draggingNodeId = null;
        }
        if (isPanning) {
            isPanning = false;
            svg.style.cursor = '';
        }
    });

    // ── 키보드 ──────────────────────────────────────────────────
    svg.setAttribute('tabindex', '0');
    svg.addEventListener('keydown', (e) => {
        if (document.getElementById(`mw-editor-${widgetId}`)) return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (selectedNodeId !== null) {
                const node = nodes.find(n => n.id === selectedNodeId);
                if (node && !node.isMain) deleteNode(selectedNodeId);
            }
        }
        if (e.key === 'Escape') {
            connectSourceId = null;
            selectedNodeId = null;
            render();
        }
    });

    // ── 초기 렌더링 ──────────────────────────────────────────────
    render();

    // 처음 로드 시 SVG 크기가 정해진 후 화면 맞추기
    requestAnimationFrame(() => {
        const rect = svg.getBoundingClientRect();
        if (rect.width > 0 && nodes.length <= 1) {
            // 초기 노드를 캔버스 중앙으로
            if (nodes[0]) {
                nodes[0].x = rect.width / 2;
                nodes[0].y = rect.height / 2;
                render();
            }
        } else if (nodes.length > 1) {
            fitView();
        }
    });
}
