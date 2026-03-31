/**
 * @file mindmap-cta.js
 * @description 대시보드의 마인드맵 시작 카드(CTA)의 접기 기능을 관리합니다.
 */

import { safeLocalStorage } from '../utils/storage.js';

/**
 * 마인드맵 CTA 기능 초기화
 * @param {HTMLElement} el 위젯 루트 엘리먼트
 */
export function initMindmapCTA(el) {
    if (!el) return;

    const header = el.querySelector('.mindmap-cta-header');
    if (!header) {
        console.warn('[MindmapCTA] 헤더를 찾을 수 없습니다.');
        return;
    }

    if (el._isInitialized) return;
    el._isInitialized = true;

    const widgetId = el.dataset.id;

    // 1. 초기 UI 상태 설정
    const platform = window.innerWidth <= 768 ? 'mobile' : 'pc';
    const isCollapsed = safeLocalStorage.getItem(`mindmap_collapsed_${platform}_${widgetId}`) === 'true';
    if (isCollapsed) el.classList.add('collapsed');

    // 2. 이벤트 바인딩
    header.addEventListener('mousedown', (e) => {
        // 버튼이나 다른 인터랙티브 요소 클릭 시는 제외
        if (e.target.closest('button, input')) return;

        let isDragging = false;
        const startY = e.clientY;
        
        const onMove = (m) => {
            if (Math.abs(m.clientY - startY) > 5) isDragging = true;
        };
        
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            
            if (!isDragging) {
                const collapsed = el.classList.toggle('collapsed');
                const platform = window.innerWidth <= 768 ? 'mobile' : 'pc';
                safeLocalStorage.setItem(`mindmap_collapsed_${platform}_${widgetId}`, collapsed);
                
                // 접기/펴기 상태에 따른 레이아웃 독립 저장 트리거
                import('./dashboard-grid.js').then(m => m.saveLayout());
            }
        };
        
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}
