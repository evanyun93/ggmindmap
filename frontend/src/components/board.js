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
            <div class="board-header" style="display: flex; justify-content: space-between; align-items: center;">
                <h2>고객의 소리함 (Q&A)</h2>
                <button id="returnToDashboardBtnTop" class="btn-secondary" style="padding: 8px 16px; font-size: 14px; display: flex; align-items: center; gap: 6px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                    대시보드로 돌아가기
                </button>
            </div>

            <div class="board-main-layout">
                <!-- 좌측: 작성 폼 (Sticky) -->
                <div class="board-left-panel">
                    <div class="board-write-section" id="boardWriteSection">
                        <div class="write-card premium-glass">
                            <h3>의견 남기기</h3>
                            <textarea id="feedbackBoardContent" placeholder="마인드맵에 바라는 점을 5자 이상 입력해 주세요...\n\n여기 적은 내용들은 모두에게 공유됩니다.
- from. 성연 " rows="10"></textarea>
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
    const isAdmin = window.currentUser && window.currentUser.login_id === 'admin';
    const deleteBtn = isAdmin ? `
        <button class="btn-delete-feedback" onclick="window.deleteFeedback(${item.id})" title="삭제">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>
    ` : '';
    const replyBtn = isAdmin ? `
        <button class="btn-reply-feedback" onclick="window.replyFeedback(${item.id})" title="답변 달기">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </button>
    ` : '';

    const date = new Date(item.created_at).toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    const hasReply = !!item.admin_reply;
    const badgeHTML = hasReply ? `<span class="reply-badge">답변 완료</span>` : '';

    let replyHTML = '';
    if (hasReply) {
        const replyDate = item.admin_replied_at ? new Date(item.admin_replied_at).toLocaleString('ko-KR', {
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        }) : '';
        replyHTML = `
            <div class="feedback-reply premium-glass-card">
                <div class="reply-header">
                    <div class="admin-avatar">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                    </div>
                    <span class="reply-author">운영자 답변</span>
                    <span class="reply-date">${replyDate}</span>
                </div>
                <div class="reply-content">${item.admin_reply.replace(/\n/g, '<br>')}</div>
            </div>
        `;
    }

    return `
        <div class="feedback-item premium-glass-card">
            <div class="item-header">
                <div class="author-info">
                    <div class="author-avatar">${(item.display_name || item.login_id || '익')[0]}</div>
                    <span class="item-author">${item.display_name || item.login_id || '익명 사용자'}</span>
                    ${badgeHTML}
                </div>
                <div class="item-actions">
                    <span class="item-date">${date}</span>
                    ${replyBtn}
                    ${deleteBtn}
                </div>
            </div>
            <div class="item-content">${item.content.replace(/\n/g, '<br>')}</div>
            ${replyHTML}
        </div>
    `;
}
