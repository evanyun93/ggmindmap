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
    const editor = el.querySelector('.notepad-editor');
    const toolbar = el.querySelector('.notepad-toolbar');
    const statusText = el.querySelector('.notepad-save-status');
    const header = el.querySelector('.notepad-header');

    // 1. 접기/펼치기 기능
    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('button, input, textarea, .notepad-editor, .notepad-widget-title')) return;
        if (el.classList.contains('is-editing')) return;

        let isDragging = false;
        const startY = e.clientY;
        const onMove = (m) => { if (Math.abs(m.clientY - startY) > 5) isDragging = true; };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (!isDragging) {
                const collapsed = el.classList.toggle('collapsed');
                const platform = window.innerWidth <= 768 ? 'mobile' : 'pc';
                localStorage.setItem(`notepad_collapsed_${platform}_${widgetId}`, collapsed);
                import('./dashboard-grid.js').then(m => {
                    if (m.saveLayout) m.saveLayout();
                });
            }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    const platform = window.innerWidth <= 768 ? 'mobile' : 'pc';
    if (localStorage.getItem(`notepad_collapsed_${platform}_${widgetId}`) === 'true') {
        el.classList.add('collapsed');
    }

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

    // 3. 모바일 환경용 높이 조절 기능 (Resize Handle)
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        // 기존에 설정된 모바일 높이가 있으면 적용
        if (widgetData.settings && widgetData.settings.mobileHeight) {
            editor.style.height = `${widgetData.settings.mobileHeight}px`;
        }

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'notepad-mobile-resize-handle';
        resizeHandle.innerHTML = '<div class="resize-line"></div><div class="resize-line"></div>';

        // 간단한 스타일링 (스타일 파일에 넣어도 됨)
        resizeHandle.style.cssText = `
            width: 100%;
            height: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 3px;
            cursor: row-resize;
            background: rgba(0, 0, 0, 0.05);
            border-bottom-left-radius: 8px;
            border-bottom-right-radius: 8px;
        `;
        resizeHandle.querySelectorAll('.resize-line').forEach(line => {
            line.style.cssText = 'width: 30px; height: 2px; background: rgba(0, 0, 0, 0.2); border-radius: 1px;';
        });

        el.querySelector('.notepad-content-wrapper').appendChild(resizeHandle);

        let startY = 0;
        let startHeight = 0;

        resizeHandle.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
            startHeight = editor.offsetHeight;
            e.preventDefault(); // 스크롤 방지
        }, { passive: false });

        resizeHandle.addEventListener('touchmove', (e) => {
            const currentY = e.touches[0].clientY;
            const diffY = currentY - startY;
            const newHeight = Math.max(100, startHeight + diffY); // 최소 100px
            editor.style.height = `${newHeight}px`;
            e.preventDefault();
        }, { passive: false });

        resizeHandle.addEventListener('touchend', () => {
            // 조절이 끝나면 높이 저장
            const finalHeight = editor.offsetHeight;
            const currentSettings = widgetData.settings || {};
            const updatedSettings = { ...currentSettings, mobileHeight: finalHeight };

            apiFetch(`/api/widgets/${widgetId}`, {
                method: 'PATCH',
                body: JSON.stringify({ settings: updatedSettings })
            }).then(() => {
                widgetData.settings = updatedSettings;
                syncService.setData('NOTEPAD_MOBILE_HEIGHT', widgetId, finalHeight);
            }).catch(err => {
                console.error('Notepad 모바일 높이 저장 에러:', err);
            });
        });
    }

    // 4. 툴바 기능 연동
    if (toolbar) {
        toolbar.addEventListener('mousedown', (e) => {
            e.preventDefault(); // 편집기 포커스 유지
        });

        toolbar.addEventListener('click', (e) => {
            const btn = e.target.closest('.toolbar-btn');
            if (!btn) return;

            const command = btn.dataset.command;

            if (command === 'insertCheckbox') {
                const checkboxHtml = '<input type="checkbox" class="notepad-checkbox"> ';
                document.execCommand('insertHTML', false, checkboxHtml);
            } else if (command === 'fontSize') {
                const size = btn.dataset.value;
                document.execCommand('fontSize', false, size);
            } else if (command) {
                document.execCommand(command, false, null);
            }

            editor.focus();
            triggerSave();
        });
    }

    // 간단한 HTML 필터링 함수 (XSS 방지용)
    const sanitizeHTML = (html) => {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const scripts = temp.querySelectorAll('script, iframe, object, embed, form');
        scripts.forEach(s => s.remove());

        // on* 속성 제거
        const allElements = temp.querySelectorAll('*');
        allElements.forEach(el => {
            Array.from(el.attributes).forEach(attr => {
                if (attr.name.startsWith('on')) {
                    el.removeAttribute(attr.name);
                }
                if (attr.name === 'href' || attr.name === 'src') {
                    if (attr.value.trim().toLowerCase().startsWith('javascript:')) {
                        el.removeAttribute(attr.name);
                    }
                }
            });
        });
        return temp.innerHTML;
    };

    // 5. 텍스트 자동 저장 및 체크박스/단축키 변환
    let saveTimeout;

    const triggerSave = () => {
        statusText.textContent = '저장 중...';
        statusText.style.opacity = '1';

        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            // 체크박스 상태를 HTML에 반영하기 위한 사전 작업
            const checkboxes = editor.querySelectorAll('.notepad-checkbox');
            checkboxes.forEach(cb => {
                if (cb.checked) {
                    cb.setAttribute('checked', 'checked');
                } else {
                    cb.removeAttribute('checked');
                }
            });

            const content = sanitizeHTML(editor.innerHTML);
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
        }, 600);
    };

    editor.addEventListener('input', () => {
        triggerSave();
    });

    // 체크박스 클릭 시 바로 저장 및 상태 토글
    editor.addEventListener('change', (e) => {
        if (e.target.classList.contains('notepad-checkbox')) {
            if (e.target.checked) {
                e.target.setAttribute('checked', 'checked');
            } else {
                e.target.removeAttribute('checked');
            }
            triggerSave();
        }
    });

    // '[ ]' 입력 시 체크박스로 자동 변환
    editor.addEventListener('keyup', (e) => {
        // [ ] 치환 (브라우저에 따라 텍스트 노드 처리가 필요하므로 execCommand 사용)
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const node = selection.focusNode;
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent;
            const match = text.match(/\[\s?\]\s?$/); // "[] " 또는 "[ ] "
            if (match) {
                const range = selection.getRangeAt(0);
                // 방금 입력한 '[ ] ' 만큼 지우고
                range.setStart(node, range.endOffset - match[0].length);
                range.deleteContents();

                // 체크박스 삽입
                const checkboxHtml = '<input type="checkbox" class="notepad-checkbox"> ';
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = checkboxHtml;
                const frag = document.createDocumentFragment();
                let lastNode;
                while (tempDiv.firstChild) {
                    lastNode = frag.appendChild(tempDiv.firstChild);
                }
                range.insertNode(frag);

                // 커서를 삽입된 요소 뒤로 이동
                if (lastNode) {
                    range.setStartAfter(lastNode);
                    range.setEndAfter(lastNode);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }

                triggerSave();
            }
        }
    });

    syncService.addListener('NOTEPAD_CONTENT', (id, val) => {
        if (id == widgetId && editor.innerHTML !== val) {
            editor.innerHTML = sanitizeHTML(val || '');
        }
    });

    // 초기 로딩 시에도 sanitize
    if (editor.innerHTML) {
        editor.innerHTML = sanitizeHTML(editor.innerHTML);
    }
}
