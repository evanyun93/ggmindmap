/**
 * @file milestone.js
 * @description 마일스톤 위젯의 데이터 연동 및 접기 기능을 담당합니다.
 */

export function initMilestone() {
    const header = document.getElementById('milestoneHeader');
    const widget = document.querySelector('.widget-milestone');
    const collapsible = document.getElementById('milestoneCollapsible');

    if (!header || !widget || !collapsible) return;

    // 1. 접힘 상태 복구
    const isCollapsed = localStorage.getItem('milestone_collapsed') === 'true';
    if (isCollapsed) {
        widget.classList.add('collapsed');
    }

    // 2. 초기 데이터 렌더링
    renderMilestoneData();

    // 3. 접기/펼치기 이벤트
    let isDragging = false;
    let dragStartY = 0;
    header.addEventListener('mousedown', (e) => {
        isDragging = false;
        dragStartY = e.clientY;
        const onMove = (moveEvent) => {
            if (Math.abs(moveEvent.clientY - dragStartY) > 5) {
                isDragging = true;
            }
        };
        const onUp = (upEvent) => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (!isDragging && !upEvent.target.closest('button, input, a')) {
                const collapsed = widget.classList.toggle('collapsed');
                localStorage.setItem('milestone_collapsed', collapsed);
            }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    // 4. 데이터 변경 감지 (간단히 5초마다 갱신 또는 필요 시 호출)
    setInterval(renderMilestoneData, 5000);
}

/**
 * 로컬 스토리지의 데이터를 읽어와 마일스톤 위젯을 업데이트합니다.
 */
function renderMilestoneData() {
    // A. D-Day 정보 로드
    const targetDateStr = localStorage.getItem('mindmap_dday_target');
    const ddayBadge = document.getElementById('milestoneDdayBadge');
    const targetDateText = document.getElementById('milestoneTargetDate');
    const subInfoText = document.getElementById('milestoneSubInfo');

    if (targetDateStr) {
        const targetDate = new Date(targetDateStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        targetDate.setHours(0, 0, 0, 0);

        const diffDays = Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24));
        const badgeText = diffDays > 0 ? `D-${diffDays}` : (diffDays === 0 ? 'D-Day' : `D+${Math.abs(diffDays)}`);

        if (ddayBadge) ddayBadge.textContent = badgeText;
        if (targetDateText) {
            const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
            targetDateText.textContent = `${targetDate.getFullYear()}. ${targetDate.getMonth() + 1}. ${targetDate.getDate()}. (${dayNames[targetDate.getDay()]})`;
        }

        // 토요일 개수 계산
        if (subInfoText) {
            let sats = 0;
            if (diffDays >= 0) {
                const temp = new Date(today);
                while (temp <= targetDate) {
                    if (temp.getDay() === 6) sats++;
                    temp.setDate(temp.getDate() + 1);
                }
                subInfoText.textContent = `남은 토요일: ${sats}회`;
            } else {
                subInfoText.textContent = `목표일이 지났습니다.`;
            }
        }
    }

    // B. 스프레드시트 요약 로드
    const sheetDataRaw = localStorage.getItem('mindmap_spreadsheet_data');
    const headerDataRaw = localStorage.getItem('mindmap_spreadsheet_headers');
    const summaryContainer = document.getElementById('milestoneSheetSummary');

    if (summaryContainer) {
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
                        // ID(예: A1)를 커스텀 이름으로 변환
                        const colChar = id.match(/[A-Z]+/)[0];
                        const rowNum = id.match(/[0-9]+/)[0];
                        const colIndex = colChar.charCodeAt(0) - 65;

                        const colName = headers[`col-${colIndex}`] || colChar;
                        const rowName = headers[`row-${rowNum}`] || rowNum;
                        const displayName = `${colName} ${rowName}`;

                        return `
                            <div class="summary-item">
                                <span class="cell-id">${displayName}</span>
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
