/**
 * @file milestone.js
 * @description 마일스톤 위젯의 데이터 연동 및 접기 기능을 담당합니다.
 */

import { apiFetch } from '../services/api.js';
import { syncService, SYNC_DATA_TYPES } from '../services/sync.js';

/**
 * 마일스톤 위젯 초기화
 * @param {HTMLElement} el 위젯 루트 엘리먼트
 * @param {Object} widgetData 위젯 데이터 (최신 settings 포함)
 */
export async function initMilestone(el, widgetData) {
    if (!el) return;

    const header = el.querySelector('.milestone-header');
    const collapsible = el.querySelector('.milestone-collapsible-wrapper');

    if (!header || !collapsible) {
        console.warn('[Milestone] 필수 요소를 찾을 수 없습니다.');
        return;
    }

    if (el._isInitialized) return;
    el._isInitialized = true;

    const widgetId = el.dataset.id;
    let settings = widgetData.settings || {};

    // 1. 초기 UI 상태 설정 - SyncService에서 로컬 캐시 먼저 확인
    const collapsedValue = await syncService.getData(SYNC_DATA_TYPES.MILESTONE_COLLAPSED, widgetId);
    const isCollapsed = collapsedValue === 'true';
    if (isCollapsed) el.classList.add('collapsed');

    // 2. 이벤트 바인딩

    // 접기/펼치기
    header.addEventListener('mousedown', (e) => {
        // 타이틀 수정 모드 중에는 모든 카드 상호작용(접기, 접기 등)을 차단
        if (el.classList.contains('is-editing')) return;
        if (e.target.closest('button, input, textarea, .milestone-widget-title')) return;

        let isDragging = false;
        const startY = e.clientY;
        const onMove = (m) => { if (Math.abs(m.clientY - startY) > 5) isDragging = true; };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (!isDragging) {
                const collapsed = el.classList.toggle('collapsed');
                localStorage.setItem(`milestone_collapsed_${widgetId}`, collapsed);

                // 접기/펴기 상태에 따른 레이아웃 독립 저장 트리거
                import('./dashboard-grid.js').then(m => m.saveLayout());
            }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    // 제목 수정
    const titleEl = el.querySelector('.milestone-widget-title');
    const editBtn = el.querySelector('.edit-milestone-title-btn');
    if (titleEl && editBtn) {
        setupTitleEdit(el, titleEl, editBtn, settings);
    }

    // 연동 토글
    const syncToggle = el.querySelector('.milestone-memo-sync');
    const dateControls = el.querySelector('.milestone-date-controls');
    const syncSummary = el.querySelector('.milestone-sync-summary');
    const indieSummary = el.querySelector('.milestone-independent-summary');

    if (syncToggle && dateControls) {
        syncToggle.onchange = async () => {
            const isSync = syncToggle.checked;
            dateControls.classList.toggle('hidden', isSync);
            if (syncSummary) syncSummary.classList.toggle('hidden', !isSync);
            if (indieSummary) indieSummary.classList.toggle('hidden', isSync);

            settings.syncWithMemo = isSync;
            await saveSettings(widgetId, settings);
            renderMilestoneData(el, settings);
        };
    }

    // 날짜 변경
    const baseInput = el.querySelector('.milestone-base-date');
    const targetInput = el.querySelector('.milestone-target-date');
    if (baseInput && targetInput) {
        const handleDateChange = async () => {
            settings.baseDate = baseInput.value;
            settings.targetDate = targetInput.value;
            await saveSettings(widgetId, settings);
            renderMilestoneData(el, settings);
        };
        baseInput.onchange = handleDateChange;
        targetInput.onchange = handleDateChange;
    }

    // 독립 데이터 편집 (Debounced)
    let indieSaveTimer;
    el.querySelectorAll('.indie-label, .indie-value').forEach(input => {
        input.oninput = () => {
            clearTimeout(indieSaveTimer);
            indieSaveTimer = setTimeout(async () => {
                const newData = [];
                el.querySelectorAll('.independent-item').forEach(item => {
                    newData.push({
                        label: item.querySelector('.indie-label').value,
                        value: item.querySelector('.indie-value').value
                    });
                });
                settings.summaryData = newData;
                await saveSettings(widgetId, settings);
            }, 1000);
        };
    });

    // 메모장 자동 저장 (Debounced)
    const memoArea = el.querySelector('.milestone-premium-memo');
    let memoSaveTimer;
    if (memoArea) {
        memoArea.oninput = () => {
            clearTimeout(memoSaveTimer);
            memoSaveTimer = setTimeout(async () => {
                settings.memoContent = memoArea.value;
                await saveSettings(widgetId, settings);
            }, 1000);
        };
    }

    // 3. 데이터 로딩 및 주기적 갱신
    renderMilestoneData(el, settings);
    setInterval(async () => await renderMilestoneData(el, settings), 5000);
}

/**
 * 제목 수정 설정
 */
async function setupTitleEdit(el, titleEl, editBtn, settings) {
    const widgetId = el.dataset.id;
    const savedTitle = await syncService.getData(SYNC_DATA_TYPES.MILESTONE_TITLE, widgetId);
    if (savedTitle) titleEl.textContent = savedTitle;

    const pencilIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" style="pointer-events: none;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
    const checkIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" style="pointer-events: none;"><path d="M20 6L9 17L4 12"/></svg>`;

    editBtn.innerHTML = pencilIcon;
    editBtn.title = "제목 수정";

    editBtn.onclick = async (e) => {
        e.stopPropagation();
        const isEditing = el.classList.contains('is-editing');

        if (!isEditing) {
            // 편집 모드 진입
            el.classList.add('is-editing');
            editBtn.innerHTML = checkIcon;
            editBtn.title = "저장";

            const current = titleEl.textContent;
            const input = document.createElement('input');
            input.value = current;
            input.className = 'milestone-title-edit-input';

            Object.assign(input.style, {
                background: '#1e293b', border: '1px solid #8B5CF6', color: 'white',
                borderRadius: '4px', padding: '2px 8px', width: '150px'
            });

            // 취소 버튼 추가
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'cancel-title-edit-btn';
            cancelBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" style="pointer-events:none;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            cancelBtn.title = "취소";
            cancelBtn.style.cssText = "background:none; border:none; padding:4px; cursor:pointer; color:#ef4444; margin-left:4px; position:relative; z-index:9999; pointer-events:auto;";
            
            // 모바일 터치 및 블러 충돌 방지
            cancelBtn.onmousedown = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                input.value = current;
                exitEditMode(current);
            };
            cancelBtn.ontouchstart = cancelBtn.onmousedown;
            
            editBtn.parentNode.insertBefore(cancelBtn, editBtn.nextSibling);

            titleEl.replaceWith(input);
            input.focus();
            input.select();

            input.onmousedown = (e) => e.stopPropagation();

            input.onkeydown = (e) => {
                e.stopPropagation(); // 브라우저 뒤로가기 방지용 전파 차단은 유지
                if (e.key === 'Enter') editBtn.click();
                if (e.key === 'Escape') cancelBtn.click();
            };
        } else {
            // 저장 실행
            const input = el.querySelector('.milestone-title-edit-input');
            if (input) {
                const newTitle = input.value.trim() || '나의 마일스톤';
                await syncService.setData(SYNC_DATA_TYPES.MILESTONE_TITLE, widgetId, newTitle);
                exitEditMode(newTitle);
            }
        }
    };

    const exitEditMode = (title) => {
        const input = el.querySelector('.milestone-title-edit-input');
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

    // 실시간 동기화 리스너 추가
    syncService.addListener(SYNC_DATA_TYPES.MILESTONE_TITLE, (updatedWidgetId, newTitle) => {
        if (updatedWidgetId == widgetId && !el.classList.contains('is-editing')) {
            titleEl.textContent = newTitle;
            if (settings) settings.title = newTitle;
        }
    });
}

/**
 * 설정 저장 API 호출
 */
async function saveSettings(id, settings) {
    try {
        // 개별 설정을 SyncService를 통해 저장
        for (const [key, value] of Object.entries(settings)) {
            await syncService.setData(key, id, value);
        }
    } catch (err) {
        console.error('[Milestone] 설정 저장 실패:', err);
    }
}

async function renderMilestoneData(el, settings) {
    const ddayBadge = el.querySelector('.milestone-dday-badge');
    const targetDateText = el.querySelector('.target-date');
    const subInfoText = el.querySelector('.sub-info');
    const summaryContainer = el.querySelector('.milestone-sync-summary .milestone-sheet-summary');

    // A. D-Day 정보 결정
    let baseDate, targetDate;
    const isSync = settings.syncWithMemo !== false;

    if (isSync) {
        // 연동 모드일 때는 전역 빠른 메모 날짜 사용
        const targetStr = localStorage.getItem('mindmap_dday_target');
        if (targetStr) {
            targetDate = new Date(targetStr);
            baseDate = new Date(); // 연동 시 기준일은 오늘
        }
    } else {
        // 독립 모드일 때는 해당 카드의 설정을 사용
        if (settings.targetDate) {
            targetDate = new Date(settings.targetDate);
            baseDate = settings.baseDate ? new Date(settings.baseDate) : new Date();
        }
    }

    if (targetDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        targetDate.setHours(0, 0, 0, 0);
        baseDate.setHours(0, 0, 0, 0);

        // 정확한 일수 계산 (오늘~목표일 남은 기간)
        const diffMs = targetDate.getTime() - today.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

        // 전체 프로젝트 기간 대비 진행률 계산
        const totalMs = targetDate.getTime() - baseDate.getTime();
        const totalDays = Math.max(1, Math.round(totalMs / (1000 * 60 * 60 * 24)));
        const elapsedMs = today.getTime() - baseDate.getTime();
        const elapsedDays = Math.round(elapsedMs / (1000 * 60 * 60 * 24));
        const progressPercent = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)));

        const badgeText = diffDays > 0 ? `D-${diffDays}` : (diffDays === 0 ? 'D-Day' : `D+${Math.abs(diffDays)}`);

        if (ddayBadge) ddayBadge.textContent = badgeText;
        if (targetDateText) {
            const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
            const dateStr = `${targetDate.getFullYear()}. ${targetDate.getMonth() + 1}. ${targetDate.getDate()}. (${dayNames[targetDate.getDay()]})`;
            const rangeStr = !isSync && settings.baseDate ? `<br><small style="opacity:0.6; font-size:0.75rem;">기간: ${settings.baseDate} ~ ${settings.targetDate} (${totalDays}일 간, ${progressPercent}% 진행)</small>` : '';
            targetDateText.innerHTML = dateStr + rangeStr;
        }

        if (subInfoText) {
            let sats = 0;
            if (diffDays >= 0) {
                const temp = new Date(today);
                while (temp <= targetDate) {
                    if (temp.getDay() === 6) sats++;
                    temp.setDate(temp.getDate() + 1);
                }
                subInfoText.textContent = `남은 토요일: ${sats}회 (진행률: ${progressPercent}%)`;
            } else {
                subInfoText.textContent = `목표일이 지났습니다. (진행 완료)`;
            }
        }
    } else {
        if (targetDateText) targetDateText.textContent = isSync ? '빠른 메모에서 날짜를 설정하세요' : '기준일과 목표일을 설정하세요';
        if (ddayBadge) ddayBadge.textContent = '-';
    }

    // B. 스프레드시트 요약 (연동 모드일 때만 갱신)
    if (isSync && summaryContainer) {
        // SyncService에서 스프레드시트 데이터 가져오기
        const sheetDataRaw = await syncService.getData(SYNC_DATA_TYPES.SPREADSHEET_DATA, widgetId);
        const headerDataRaw = await syncService.getData(SYNC_DATA_TYPES.SPREADSHEET_HEADERS, widgetId);

        if (sheetDataRaw) {
            try {
                const data = typeof sheetDataRaw === 'string' ? JSON.parse(sheetDataRaw) : sheetDataRaw;
                const headers = typeof headerDataRaw === 'string' ? JSON.parse(headerDataRaw) : headerDataRaw || {};

                const items = Object.entries(data)
                    .filter(([_, cell]) => cell.value !== '' && cell.value !== undefined)
                    .sort(([idA], [idB]) => idA.localeCompare(idB))
                    .slice(0, 4);

                if (items.length > 0) {
                    summaryContainer.innerHTML = items.map(([id, cell]) => {
                        const colChar = id.match(/[A-Z]+/)[0];
                        const rowNum = id.match(/[0-9]+/)[0];
                        const colIndex = colChar.charCodeAt(0) - 65;
                        const colName = headers[`col-${colIndex}`] || colChar;
                        const rowName = headers[`row-${rowNum}`] || rowNum;
                        return `
                            <div class="summary-item">
                                <span class="cell-id">${colName} ${rowName}</span>
                                <span class="cell-value">${cell.value}</span>
                            </div>
                        `;
                    }).join('');
                } else {
                    summaryContainer.innerHTML = '<div class="no-data">입력된 데이터가 없습니다.</div>';
                }
            } catch (e) {
                summaryContainer.innerHTML = '<div class="no-data">데이터 오류</div>';
            }
        } else {
            summaryContainer.innerHTML = '<div class="no-data">사용 중인 메모가 없습니다.</div>';
        }
    }
}
