/**
 * @file notepad.js
 * @description 대시보드 그리드에 사용되는 메모장(Notepad) 위젯의 동작 로직을 담당합니다.
 */

import { apiFetch } from '../services/api.js';
import { syncService } from '../services/sync.js';
import { safeLocalStorage } from '../utils/storage.js';

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

    // ─────────────────────────────────────────────────────────
    // 0. 더블클릭 편집 모드 관리
    //    기본: contenteditable=false (읽기 전용 → 커서 이동 문제 원천 차단)
    //    더블클릭 시: contenteditable=true + is-editing-notepad 클래스 추가
    //    편집 종료: Escape키 또는 위젯 외부 클릭
    // ─────────────────────────────────────────────────────────

    let _isEditingContent = false;

    const enterContentEditMode = () => {
        if (_isEditingContent) return;
        _isEditingContent = true;
        editor.contentEditable = 'true';
        el.classList.add('is-editing-notepad');
        editor.focus();
        // 커서를 맨 끝으로 이동
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(editor);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    };

    const exitContentEditMode = (doSave = true) => {
        if (!_isEditingContent) return;
        _isEditingContent = false;
        editor.contentEditable = 'false';
        el.classList.remove('is-editing-notepad');
        editor.blur();
        if (doSave) triggerSave(true); // 즉시 저장 (딜레이 없이)
    };

    // 기본은 읽기 전용
    editor.contentEditable = 'false';

    // 더블클릭으로 편집 모드 진입
    editor.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        enterContentEditMode();
    });

    // Escape키로 편집 모드 종료
    editor.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            exitContentEditMode(true);
        }
    });

    // 에디터·툴바 영역이 아닌 곳(헤더, 위젯 외부 등)을 클릭하면 편집 모드 종료
    const onOutsideClick = (e) => {
        if (!_isEditingContent) return;
        // 에디터 내부 클릭 → 편집 유지
        if (editor.contains(e.target)) return;
        // 툴바 내부 클릭 → 볼드/이탤릭 등 서식 적용을 위해 편집 유지
        if (toolbar && toolbar.contains(e.target)) return;
        // 그 외 (헤더, 상태바, 위젯 외부 등) → 편집 종료
        exitContentEditMode(true);
    };
    document.addEventListener('mousedown', onOutsideClick, { capture: true });
    document.addEventListener('touchstart', onOutsideClick, { capture: true, passive: true });

    // 편집 모드에서 에디터 내 mousedown이 드래그로 전파되지 않도록 차단
    editor.addEventListener('mousedown', (e) => {
        if (_isEditingContent) {
            e.stopPropagation();
        }
    });

    // ─────────────────────────────────────────────────────────
    // 1. 접기/펼치기 기능
    // ─────────────────────────────────────────────────────────
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
                // syncService를 사용하여 기기별 자동 분리 및 서버 동기화 처리 (V6)
                syncService.setData('NOTEPAD_COLLAPSED', widgetId, collapsed);
                
                import('./dashboard-grid.js').then(m => {
                    if (m.saveLayout) m.saveLayout();
                });
            }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    // 초기 로딩 시 기기에 맞는 접힘 상태 복원
    syncService.getData('NOTEPAD_COLLAPSED', widgetId).then(val => {
        if (val === true || val === 'true') {
            el.classList.add('collapsed');
        }
    });

    // ─────────────────────────────────────────────────────────
    // 2. 제목 수정 기능
    // ─────────────────────────────────────────────────────────
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
                    exitTitleEditMode(current);
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
                    exitTitleEditMode(newTitle);

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

    const exitTitleEditMode = (title) => {
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

    // ─────────────────────────────────────────────────────────
    // 3. 모바일 환경용 높이 조절 기능 (Resize Handle)
    // ─────────────────────────────────────────────────────────
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        // 기존에 설정된 모바일 높이가 있으면 적용
        if (widgetData.settings && widgetData.settings.mobileHeight) {
            editor.style.height = `${widgetData.settings.mobileHeight}px`;
        }

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'notepad-mobile-resize-handle';
        resizeHandle.innerHTML = '<div class="resize-line"></div><div class="resize-line"></div>';

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

    // ─────────────────────────────────────────────────────────
    // 4. 툴바 기능 연동
    // ─────────────────────────────────────────────────────────
    if (toolbar) {
        toolbar.addEventListener('mousedown', (e) => {
            e.preventDefault(); // 편집기 포커스 유지
        });

        toolbar.addEventListener('click', (e) => {
            const btn = e.target.closest('.toolbar-btn');
            if (!btn) return;

            // 편집 모드가 아니면 툴바 버튼도 무시
            if (!_isEditingContent) return;

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

            updateToolbarActiveState();
            editor.focus();
            triggerSave();
        });
    }

    // 툴바 버튼 활성화 상태 업데이트 로직
    const updateToolbarActiveState = () => {
        if (!toolbar) return;
        const btns = toolbar.querySelectorAll('.toolbar-btn');
        btns.forEach(btn => {
            const command = btn.dataset.command;
            const value = btn.dataset.value;
            let isActive = false;

            try {
                if (command === 'fontSize') {
                    isActive = document.queryCommandValue('fontSize') === value;
                } else if (command && !['insertCheckbox', 'insertUnorderedList'].includes(command)) {
                    isActive = document.queryCommandState(command);
                }
            } catch (e) {
                isActive = false;
            }

            if (isActive) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    };

    // 편집기 이동/입력 시 상태 업데이트
    editor.addEventListener('keyup', updateToolbarActiveState);
    editor.addEventListener('mouseup', updateToolbarActiveState);
    // 초기 로딩 시 한 번 호출
    setTimeout(updateToolbarActiveState, 500);

    // ─────────────────────────────────────────────────────────
    // 간단한 HTML 필터링 함수 (XSS 방지용)
    // ─────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────
    // 5. 텍스트 자동 저장 및 체크박스/단축키 변환
    //    immediateMode=true 이면 딜레이 없이 즉시 저장 (편집 종료 시)
    // ─────────────────────────────────────────────────────────
    let saveTimeout;

    const triggerSave = (immediateMode = false) => {
        statusText.textContent = '저장 중...';
        statusText.style.opacity = '1';

        clearTimeout(saveTimeout);

        const doSave = async () => {
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

                // 자신의 저장으로 인한 sync 이벤트가 innerHTML을 교체하지 않도록
                // NOTEPAD_CONTENT 리스너에서 편집 모드 여부로 판단하므로 별도 플래그 불필요
                syncService.setData('NOTEPAD_CONTENT', widgetId, content);

                // 3초 뒤에 페이드 아웃
                setTimeout(() => {
                    statusText.style.opacity = '0';
                }, 3000);

            } catch (err) {
                statusText.innerHTML = '<span style="color: #ef4444;">저장 실패! 연결 상태를 확인하세요.</span>';
                console.error('Notepad 본문 저장 에러:', err);
            }
        };

        if (immediateMode) {
            doSave();
        } else {
            saveTimeout = setTimeout(doSave, 600);
        }
    };

    // 편집 중에만 input 이벤트로 자동저장 트리거
    editor.addEventListener('input', () => {
        if (_isEditingContent) triggerSave();
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
        if (!_isEditingContent) return;

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const node = selection.focusNode;
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent;
            const match = text.match(/\[\s?\]\s?$/); // "[] " 또는 "[ ] "
            if (match) {
                const range = selection.getRangeAt(0);
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

    // 다른 기기/탭에서 sync된 내용만 반영 (편집 중에는 무시하여 커서 보호)
    syncService.addListener('NOTEPAD_CONTENT', (id, val) => {
        if (id == widgetId && editor.innerHTML !== val) {
            // 현재 편집 중이면 원격 변경 무시 (커서 초기화 방지)
            if (_isEditingContent) return;
            editor.innerHTML = sanitizeHTML(val || '');
        }
    });

    // 초기 로딩 시에도 sanitize
    if (editor.innerHTML) {
        editor.innerHTML = sanitizeHTML(editor.innerHTML);
    }
}
