/**
 * @file mindmap.js
 * @description 마인드맵 인터랙티브 캔버스 로직을 담당합니다.
 */

import { apiFetch } from '../services/api.js';
import { getMindmapHTML } from '../components/mindmap.js';

let nodes = [];
let links = [];
let selectedNode = null;
let zoom = 1;
let isPanning = false;
let startPan = { x: 0, y: 0 };
let offset = { x: 0, y: 0 };

/**
 * 마인드맵 초기화 및 화면 전환
 */
export async function initMindmap() {
    const appRoot = document.getElementById('app-root');
    const originalContent = appRoot.innerHTML;

    // 화면 전환
    appRoot.innerHTML = getMindmapHTML();

    // 이벤트 바인딩
    document.getElementById('backToDashFromMindmap').addEventListener('click', () => {
        location.reload(); // 간단하게 리로드로 대시보드 복구
    });

    // 데이터 로드
    await loadMindmapData();

    // 초기 노드가 없으면 생성
    if (nodes.length === 0) {
        nodes.push({ id: Date.now(), text: '중심 생각', x: window.innerWidth / 2, y: window.innerHeight / 2, isMain: true });
    }

    renderMindmap();
    setupCanvasEvents();
    setupToolbarEvents();
}

async function loadMindmapData() {
    try {
        const res = await apiFetch('/api/mindmap');
        const result = await res.json();
        if (result.success && result.data) {
            nodes = result.data.nodes || [];
            links = result.data.links || [];
        }
    } catch (err) {
        console.error('마인드맵 로드 에러:', err);
    }
}

function renderMindmap() {
    const nodesGroup = document.getElementById('nodesGroup');
    const linksGroup = document.getElementById('linksGroup');
    if (!nodesGroup || !linksGroup) return;

    // 링크(선) 렌더링
    linksGroup.innerHTML = links.map(link => {
        const source = nodes.find(n => n.id === link.source);
        const target = nodes.find(n => n.id === link.target);
        if (!source || !target) return '';
        return `<path d="M ${source.x} ${source.y} Q ${(source.x + target.x) / 2} ${source.y}, ${target.x} ${target.y}" 
                      class="mindmap-link" />`;
    }).join('');

    // 노드 렌더링
    nodesGroup.innerHTML = nodes.map(node => {
        // collapsed 상태면 타이틀만 보이기
        if (node.collapsed) {
            return `
            <g class="node-group collapsed" transform="translate(${node.x}, ${node.y})"
               onmousedown="window.startNodeDrag(event, ${node.id})"
               ondblclick="window.toggleNodeCollapse(${node.id})">
                <rect x="-60" y="-20" width="120" height="40" rx="10" class="node-rect${node.isMain ? ' main' : ''}" />
                <text text-anchor="middle" dy="5" class="node-text">${node.text}</text>
            </g>
            `;
        } else {
            return `
            <g class="node-group" transform="translate(${node.x}, ${node.y})"
               onmousedown="window.startNodeDrag(event, ${node.id})"
               ondblclick="window.toggleNodeCollapse(${node.id})">
                <rect x="-60" y="-20" width="120" height="40" rx="10" class="node-rect${node.isMain ? ' main' : ''}" />
                <text text-anchor="middle" dy="5" class="node-text">${node.text}</text>
                <!-- 펼쳐진 상태에서만 상세 내용/버튼 등 추가 가능 -->
            </g>
            `;
        }
    }).join('');
}

function setupCanvasEvents() {
    const svg = document.getElementById('mindmapSVG');

    svg.onmousemove = (e) => {
        if (window.draggingNodeId) {
            const node = nodes.find(n => n.id === window.draggingNodeId);
            if (node) {
                node.x = e.clientX;
                node.y = e.clientY;
                renderMindmap();
            }
        }
    };

    svg.onmouseup = () => {
        window.draggingNodeId = null;
    };
}

function setupToolbarEvents() {
    document.getElementById('addNodeBtn').addEventListener('click', () => {
        const newNode = {
            id: Date.now(),
            text: '새로운 생각',
            x: window.innerWidth / 2 + (Math.random() * 100 - 50),
            y: window.innerHeight / 2 + (Math.random() * 100 - 50)
        };
        nodes.push(newNode);

        // 메인 노드가 있다면 연결
        const main = nodes.find(n => n.isMain);
        if (main) {
            links.push({ source: main.id, target: newNode.id });
        }
        renderMindmap();
    });

    document.getElementById('saveMindmapBtn').addEventListener('click', async () => {
        const status = document.getElementById('saveStatus');
        status.textContent = '저장 중...';
        try {
            await apiFetch('/api/mindmap', {
                method: 'POST',
                body: JSON.stringify({ data: { nodes, links } })
            });
            status.textContent = '저장 완료!';
            setTimeout(() => status.textContent = '', 2000);
        } catch (err) {
            status.textContent = '저장 실패';
        }
    });
}

// 전역 공개 함수 (SVG 이벤트용)
window.startNodeDrag = (e, id) => {
    e.stopPropagation();
    window.draggingNodeId = id;
};

// 노드 더블클릭 시 접기/펼치기 토글
window.toggleNodeCollapse = (id) => {
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    node.collapsed = !node.collapsed;
    renderMindmap();
};

// 기존 편집 팝업은 우클릭 등으로 분리하거나, 필요시 유지
window.openNodeEditor = (id) => {
    const node = nodes.find(n => n.id === id);
    if (!node) return;

    selectedNode = node;
    const editor = document.getElementById('nodeEditor');
    const input = document.getElementById('nodeTextInput');

    input.value = node.text;
    editor.classList.remove('hidden');

    // 버튼 이벤트들
    document.getElementById('closeEditorBtn').onclick = () => {
        node.text = input.value;
        editor.classList.add('hidden');
        renderMindmap();
    };

    document.getElementById('deleteNodeBtn').onclick = () => {
        if (node.isMain) return alert('중심 노드는 삭제할 수 없습니다.');
        nodes = nodes.filter(n => n.id !== id);
        links = links.filter(l => l.source !== id && l.target !== id);
        editor.classList.add('hidden');
        renderMindmap();
    };
};
