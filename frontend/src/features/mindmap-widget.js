/**
 * @file mindmap-widget.js
 * @description 대시보드 위젯으로 임베딩된 마인드맵 기능을 관리합니다.
 * 노드 추가/편집/삭제/연결, 팬/줌, 자동 저장을 지원합니다.
 */

import { apiFetch } from '../services/api.js';
import { safeLocalStorage } from '../utils/storage.js';

const SAVE_DEBOUNCE_MS = 1200;
const DBLCLICK_MS = 350;

// 전체화면과 동일한 색상 팔레트
const NODE_COLORS = [
    { fill: 'rgba(139,92,246,0.18)',  stroke: '#a78bfa' }, // purple
    { fill: 'rgba(6,182,212,0.18)',   stroke: '#22d3ee' }, // cyan
    { fill: 'rgba(244,63,94,0.18)',   stroke: '#fb7185' }, // rose
    { fill: 'rgba(16,185,129,0.18)',  stroke: '#34d399' }, // emerald
    { fill: 'rgba(245,158,11,0.18)',  stroke: '#fbbf24' }, // amber
    { fill: 'rgba(99,102,241,0.18)',  stroke: '#818cf8' }, // indigo
    { fill: 'rgba(236,72,153,0.18)',  stroke: '#f472b6' }, // pink
];
const MAIN_COLOR = { fill: 'rgba(139,92,246,0.22)', stroke: '#8B5CF6' };

function getNodeColor(node) {
    if (node.isMain) return MAIN_COLOR;
    const idx = node.colorIdx ?? (node.id % NODE_COLORS.length);
    return NODE_COLORS[idx % NODE_COLORS.length];
}

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

    // ── 제목 편집 ────────────────────────────────────────────────
    const titleEl = el.querySelector('.mindmap-widget-title');
    const editTitleBtn = el.querySelector('.edit-mindmap-title-btn');
    const pencilIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" style="pointer-events: none;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
    const checkIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" style="pointer-events: none;"><path d="M20 6L9 17L4 12"/></svg>`;

    const exitTitleEditMode = (newTitle) => {
        const input = el.querySelector('.edit-title-input');
        if (input) {
            titleEl.textContent = newTitle;
            input.replaceWith(titleEl);
        }
        const cancelBtn = el.querySelector('.cancel-title-edit-btn');
        if (cancelBtn) cancelBtn.remove();
        el.classList.remove('is-editing');
        if (editTitleBtn) { editTitleBtn.innerHTML = pencilIcon; editTitleBtn.title = '제목 수정'; }
    };

    if (editTitleBtn && titleEl) {
        editTitleBtn.onclick = async (e) => {
            e.stopPropagation();
            const isEditing = el.classList.contains('is-editing');
            if (!isEditing) {
                el.classList.add('is-editing');
                editTitleBtn.innerHTML = checkIcon;
                editTitleBtn.title = '저장';
                const current = titleEl.textContent;
                const input = document.createElement('input');
                input.value = current;
                input.className = 'edit-title-input';
                Object.assign(input.style, {
                    background: '#1e293b', border: '1px solid #8B5CF6', color: 'white',
                    borderRadius: '4px', padding: '2px 8px', width: '150px'
                });
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'cancel-title-edit-btn';
                cancelBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" style="pointer-events:none;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
                cancelBtn.title = '취소';
                cancelBtn.style.cssText = 'background:none; border:none; padding:4px; cursor:pointer; color:#ef4444; margin-left:4px; position:relative; z-index:9999; pointer-events:auto;';
                cancelBtn.onmousedown = (ev) => { ev.preventDefault(); ev.stopPropagation(); exitTitleEditMode(current); };
                cancelBtn.ontouchstart = cancelBtn.onmousedown;
                editTitleBtn.parentNode.insertBefore(cancelBtn, editTitleBtn.nextSibling);
                titleEl.replaceWith(input);
                input.focus();
                input.select();
                input.onmousedown = (ev) => ev.stopPropagation();
                input.onkeydown = (ev) => {
                    ev.stopPropagation();
                    if (ev.key === 'Enter') editTitleBtn.click();
                    if (ev.key === 'Escape') cancelBtn.dispatchEvent(new MouseEvent('mousedown'));
                };
            } else {
                const input = el.querySelector('.edit-title-input');
                if (input) {
                    const newTitle = input.value.trim() || '마인드맵';
                    exitTitleEditMode(newTitle);
                    try {
                        await apiFetch(`/api/widgets/${widgetId}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ title: newTitle })
                        });
                    } catch (err) {
                        console.error('마인드맵 제목 업데이트 에러:', err);
                    }
                }
            }
        };
    }

    // ── 상태 (읽기 전용: 팬/줌만 허용) ─────────────────────────
    let nodes = [];
    let links = [];
    let isPanning = false;
    let panStartX = 0, panStartY = 0;
    let panX = 0, panY = 0;
    let zoom = 1;

    // ── 데이터 로드 (/api/mindmap 공유 저장소 사용) ──────────────
    // 초기 중심 노드 (데이터 없을 때 기본값)
    const defaultNode = () => ({
        id: Date.now(),
        text: '중심',
        x: 200, y: 130,
        type: 'circle', radius: 42, isMain: true
    });

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

    // ── 편집 모드 버튼 ──────────────────────────────────────────
    const editBtn = el.querySelector('.btn-mindmap-fullscreen');
    if (editBtn) {
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            import('./mindmap.js').then(m => m.initMindmap(Number(widgetId), widgetData?.settings ?? null));
        });
    }

    // ── 헬퍼 ────────────────────────────────────────────────────
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
            const color = getNodeColor(node);
            const sw = node.isMain ? 3 : 2;

            const shape = node.type === 'rect'
                ? `<rect x="${-(node.width || 110) / 2}" y="${-(node.height || 55) / 2}" width="${node.width || 110}" height="${node.height || 55}" rx="8" class="mw-node-shape" fill="${color.fill}" stroke="${color.stroke}" stroke-width="${sw}"/>`
                : (node.type === 'triangle'
                    ? `<polygon points="0,${-(node.height||100)/2} ${-(node.width||120)/2},${(node.height||100)/2} ${(node.width||120)/2},${(node.height||100)/2}" class="mw-node-shape" fill="${color.fill}" stroke="${color.stroke}" stroke-width="${sw}"/>`
                    : `<circle r="${node.radius || 40}" class="mw-node-shape" fill="${color.fill}" stroke="${color.stroke}" stroke-width="${sw}"/>`);

            const cls = `mw-node-group${node.isMain ? ' main' : ''}`;

            const maxChars = 8;
            const text = node.text || '';
            const textEl = text.length > maxChars
                ? `<text text-anchor="middle" class="mw-node-text"><tspan x="0" dy="-7">${escapeXml(text.slice(0, maxChars))}</tspan><tspan x="0" dy="16">${escapeXml(text.slice(maxChars, maxChars * 2))}${text.length > maxChars * 2 ? '…' : ''}</tspan></text>`
                : `<text text-anchor="middle" dy="5" class="mw-node-text">${escapeXml(text)}</text>`;

            return `<g class="${cls}" transform="translate(${node.x},${node.y})" style="cursor:default;pointer-events:none">${shape}${textEl}</g>`;
        }).join('');

        updateTransform();
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

    // ── SVG 이벤트 (팬/줌 전용) ─────────────────────────────────
    svg.style.cursor = 'grab';

    svg.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        isPanning = true;
        panStartX = e.clientX - panX;
        panStartY = e.clientY - panY;
        svg.style.cursor = 'grabbing';
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

    // 터치 팬/핀치줌
    let isTouchPanning = false;
    let touchPanStart = { x: 0, y: 0, panX: 0, panY: 0 };
    let lastTouchDist = 0;

    svg.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
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
        if (isTouchPanning && e.touches.length === 1) {
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
        isTouchPanning = false;
        lastTouchDist = 0;
    });

    // ── document 이벤트 (팬 종료) ───────────────────────────────
    document.addEventListener('mousemove', (e) => {
        if (!document.contains(el) || !isPanning) return;
        panX = e.clientX - panStartX;
        panY = e.clientY - panStartY;
        updateTransform();
    });

    document.addEventListener('mouseup', () => {
        if (!document.contains(el)) return;
        if (isPanning) {
            isPanning = false;
            svg.style.cursor = 'grab';
        }
    });

    // ── 초기 데이터 로드 및 렌더링 ──────────────────────────────
    (async () => {
        const settings = widgetData?.settings;
        // settings.mindmapData 키가 존재하면 위젯 자체 데이터 사용 (신규 위젯 포함)
        // 키가 없으면 전역 /api/mindmap 폴백 (기존 위젯 하위 호환)
        if (settings && 'mindmapData' in settings) {
            const saved = settings.mindmapData;
            if (saved && Array.isArray(saved.nodes) && saved.nodes.length > 0) {
                nodes = saved.nodes;
                links = saved.links || [];
            } else {
                nodes = [defaultNode()];
            }
        } else {
            try {
                const res = await apiFetch('/api/mindmap');
                const data = await res.json();
                if (data.success && data.data && Array.isArray(data.data.nodes) && data.data.nodes.length > 0) {
                    nodes = data.data.nodes;
                    links = data.data.links || [];
                } else {
                    nodes = [defaultNode()];
                }
            } catch (_) {
                nodes = [defaultNode()];
            }
        }

        render();

        // SVG 크기가 확정된 후 맞춤 보기 적용
        requestAnimationFrame(() => {
            const rect = svg.getBoundingClientRect();
            if (nodes.length <= 1 && rect.width > 0 && nodes[0]) {
                nodes[0].x = rect.width / 2;
                nodes[0].y = rect.height / 2;
                render();
            } else if (nodes.length > 1) {
                fitView();
            }
        });
    })();
}
