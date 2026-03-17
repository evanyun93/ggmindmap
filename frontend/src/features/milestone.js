/**
 * @file milestone.js
 * @description 마일스톤 위젯의 데이터 연동 및 접기 기능을 담당합니다.
 */

import { apiFetch } from '../services/api.js';

/**
 * 마일스톤 위젯 초기화
 * @param {HTMLElement} el 위젯 루트 엘리먼트
 * @param {Object} widgetData 위젯 데이터 (최신 settings 포함)
 */
export function initMilestone(el, widgetData) {
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

    // 1. 초기 UI 상태 설정
    const isCollapsed = localStorage.getItem(`milestone_collapsed_${widgetId}`) === 'true';
    if (isCollapsed) el.classList.add('collapsed');

    // 2. 이벤트 바인딩

    // 접기/펼치기
    header.addEventListener('mousedown', (e) => {
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
    setInterval(() => renderMilestoneData(el, settings), 5000);
}

/**
 * 제목 수정 설정
 */
function setupTitleEdit(el, titleEl, editBtn, settings) {
    const widgetId = el.dataset.id;
    editBtn.onclick = (e) => {
        e.stopPropagation();
        const current = titleEl.textContent;
        const input = document.createElement('input');
        input.value = current;
        input.className = 'milestone-title-edit-input';

        titleEl.replaceWith(input);
        input.focus();

        const finish = async () => {
            const newTitle = input.value.trim() || '나의 마일스톤';
            settings.title = newTitle;
            titleEl.textContent = newTitle;
            input.replaceWith(titleEl);
            await saveSettings(widgetId, settings);
        };

        input.onblur = finish;
        input.onkeydown = (e) => {
            if (e.key === 'Enter') finish();
            if (e.key === 'Escape') { input.value = current; input.replaceWith(titleEl); }
        };
    };
}

/**
 * 설정 저장 API 호출
 */
async function saveSettings(id, settings) {
    try {
        await apiFetch(`/api/widgets/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ settings })
        });
    } catch (err) {
        console.error('[Milestone] 설정 저장 실패:', err);
    }
}

function renderMilestoneData(el, settings) {
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
        const sheetDataRaw = localStorage.getItem('mindmap_spreadsheet_data');
        const headerDataRaw = localStorage.getItem('mindmap_spreadsheet_headers');

        if (sheetDataRaw) {
            try {
                const data = JSON.parse(sheetDataRaw);
                const headers = headerDataRaw ? JSON.parse(headerDataRaw) : {};

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
