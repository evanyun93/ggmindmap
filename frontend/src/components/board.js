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
            </div>

            <div class="board-main-layout">
                <!-- 좌측: 작성 폼 (Sticky) -->
                <div class="board-left-panel">
                    <div class="board-write-section" id="boardWriteSection">
                        <div class="write-card premium-glass">
                            <h3>의견 남기기</h3>
                            <textarea id="feedbackBoardContent" placeholder="마인드맵에 바라는 점을 5자 이상 입력해 주세요..." rows="6"></textarea>
                            <div class="write-footer">
                                <div class="feedback-msg" id="boardFeedbackMsg"></div>
                                <button class="btn-submit-board-premium" id="submitBoardFeedback">
                                    <span>제출하기</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 우측: 목록 및 페이지네이션 -->
                <div class="board-right-panel">
                    <div class="board-list-section" id="boardListSection">
                        <div class="board-loader">목록을 불러오는 중...</div>
                    </div>
                    <div class="board-pagination" id="boardPagination">
                        <!-- 페이지 번호가 여기에 동적으로 생성됩니다 -->
                    </div>
                </div>
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
        <div class="feedback-item premium-glass-card">
            <div class="item-header">
                <div class="author-info">
                    <div class="author-avatar">${(item.display_name || item.username || '익')[0]}</div>
                    <span class="item-author">${item.display_name || item.username || '익명 사용자'}</span>
                </div>
                <span class="item-date">${date}</span>
            </div>
            <div class="item-content">${item.content.replace(/\n/g, '<br>')}</div>
        </div>
    `;
}
