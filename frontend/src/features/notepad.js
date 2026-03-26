/**
 * @file notepad.js
 * @description 대시보드 그리드에 사용되는 메모장(Notepad) 위젯의 동작 로직을 담당합니다.
 */

import { apiFetch } from '../services/api.js';
import { syncService } from '../services/sync.js';

export async function initNotepad(el, widgetData) {
    if (!el) return;
    if (el._isInitialized) return;
    el._isInitialized = true;

    const widgetId = el.dataset.id;
    const titleEl = el.querySelector('.notepad-widget-title');
    const editBtn = el.querySelector('.edit-title-btn');
    const textarea = el.querySelector('.notepad-textarea');
    const statusText = el.querySelector('.notepad-save-status');
    const header = el.querySelector('.notepad-header');

    // 1. 접기/펼치기 기능
    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('button, input, textarea, .notepad-widget-title')) return;
        if (el.classList.contains('is-editing')) return;

        let isDragging = false;
        const startY = e.clientY;
        const onMove = (m) => { if (Math.abs(m.clientY - startY) > 5) isDragging = true; };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (!isDragging) {
                const collapsed = el.classList.toggle('collapsed');
                syncService.setData('NOTEPAD_COLLAPSED', widgetId, collapsed);
                import('./dashboard-grid.js').then(m => {
                    if (m.saveLayout) m.saveLayout();
                });
            }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    syncService.getData('NOTEPAD_COLLAPSED', widgetId).then(val => {
        if (val === 'true') el.classList.add('collapsed');
    });

    // 2. 제목 수정 기능
    const pencilIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" style="pointer-events: none;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
    const checkIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" style="pointer-events: none;"><path d="M20 6L9 17L4 12"/></svg>`;

    if (editBtn) {
        editBtn.onclick = async (e) => {
            e.stopPropagation();
            const isEditing = el.classList.contains('is-editing');

            if (!isEditing) {
                el.classList.add('is-editing');
                editBtn.innerHTML = checkIcon;
                editBtn.title = "저장";

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
                cancelBtn.title = "취소";
                cancelBtn.style.cssText = "background:none; border:none; padding:4px; cursor:pointer; color:#ef4444; margin-left:4px; position:relative; z-index:9999; pointer-events:auto;";
                
                cancelBtn.onmousedown = (ev) => {
                    ev.preventDefault(); ev.stopPropagation();
                    input.value = current;
                    exitEditMode(current);
                };
                cancelBtn.ontouchstart = cancelBtn.onmousedown;
                
                editBtn.parentNode.insertBefore(cancelBtn, editBtn.nextSibling);

                titleEl.replaceWith(input);
                input.focus();
                input.select();
                input.onmousedown = (ev) => ev.stopPropagation();
                input.onkeydown = (ev) => {
                    ev.stopPropagation();
                    if (ev.key === 'Enter') editBtn.click();
                    if (ev.key === 'Escape') cancelBtn.dispatchEvent(new MouseEvent('mousedown'));
                };
            } else {
                const input = el.querySelector('.edit-title-input');
                if (input) {
                    const newTitle = input.value.trim() || '나의 메모장';
                    exitEditMode(newTitle);
                    
                    try {
                        await apiFetch(`/api/widgets/${widgetId}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ title: newTitle })
                        });
                        syncService.setData('NOTEPAD_TITLE', widgetId, newTitle);
                    } catch (err) {
                        console.error('Notepad 제목 업데이트 에러:', err);
                    }
                }
            }
        };
    }

    const exitEditMode = (title) => {
        const input = el.querySelector('.edit-title-input');
        if (input) {
            titleEl.textContent = title;
            input.replaceWith(titleEl);
        }
        const cancelBtn = el.querySelector('.cancel-title-edit-btn');
        if (cancelBtn) cancelBtn.remove();
        el.classList.remove('is-editing');
        editBtn.innerHTML = pencilIcon;
        editBtn.title = "제목 수정";
    };

    syncService.addListener('NOTEPAD_TITLE', (id, val) => {
        if (id == widgetId && !el.classList.contains('is-editing')) {
            titleEl.textContent = val;
        }
    });

    // 3. 텍스트 자동 저장 (디바운스 기반 auto-save)
    let saveTimeout;
    textarea.addEventListener('input', () => {
        statusText.textContent = '저장 중...';
        statusText.style.opacity = '1';

        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            const content = textarea.value;
            try {
                // 기존 설정값 유지하고 content만 병합
                const currentSettings = widgetData.settings || {};
                const updatedSettings = { ...currentSettings, content };
                
                await apiFetch(`/api/widgets/${widgetId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ settings: updatedSettings })
                });
                
                widgetData.settings = updatedSettings;

                const now = new Date();
                const hh = String(now.getHours()).padStart(2, '0');
                const mm = String(now.getMinutes()).padStart(2, '0');
                statusText.innerHTML = `<span style="color: #10b981;">방금 저장됨</span> (${hh}:${mm})`;
                
                syncService.setData('NOTEPAD_CONTENT', widgetId, content);

                // 3초 뒤에 페이드 아웃
                setTimeout(() => {
                    statusText.style.opacity = '0';
                }, 3000);

            } catch (err) {
                statusText.innerHTML = '<span style="color: #ef4444;">저장 실패! 연결 상태를 확인하세요.</span>';
                console.error('Notepad 본문 저장 에러:', err);
            }
        }, 600); // 600ms 뒤에 저장
    });

    syncService.addListener('NOTEPAD_CONTENT', (id, val) => {
        if (id == widgetId && textarea.value !== val) {
            textarea.value = val;
        }
    });
}
