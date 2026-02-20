/**
 * @file board.js
 * @description Q&A 게시판의 HTML 구조를 생성합니다.
 */

/**
 * 게시판 기본 아키텍처 (목록 + 작성 폼)
 * @returns {string} HTML string
 */
export function getBoardHTML() {
    return `
        <div class="board-container">
            <div class="board-header">
                <h2>고객의 소리함 (Q&A)</h2>
                <button class="btn-toggle-write" id="toggleWriteBtn">의견 남기기</button>
            </div>

            <!-- 작성 폼 섹션 (기본 숨김) -->
            <div class="board-write-section hidden" id="boardWriteSection">
                <div class="write-card">
                    <textarea id="feedbackBoardContent" placeholder="마인드맵에 바라는 점을 5자 이상 입력해 주세요..." rows="4"></textarea>
                    <div class="write-actions">
                        <div class="feedback-msg" id="boardFeedbackMsg"></div>
                        <button class="btn-submit-board" id="submitBoardFeedback">제출하기</button>
                    </div>
                </div>
            </div>

            <!-- 목록 섹션 -->
            <div class="board-list-section" id="boardListSection">
                <div class="board-loader">목록을 불러오는 중...</div>
            </div>
        </div>
    `;
}

/**
 * 피드백 아이템 하나에 대한 HTML을 생성합니다.
 * @param {object} item - 피드백 데이터
 * @returns {string} HTML string
 */
export function getFeedbackItemHTML(item) {
    const date = new Date(item.created_at).toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    return `
        <div class="feedback-item">
            <div class="item-header">
                <span class="item-author">${item.display_name || item.username || '익명 사용자'}</span>
                <span class="item-date">${date}</span>
            </div>
            <div class="item-content">${item.content.replace(/\n/g, '<br>')}</div>
        </div>
    `;
}
