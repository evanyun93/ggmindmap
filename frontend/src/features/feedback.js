/**
 * @file feedback.js
 * @description Q&A 게시판 기능을 담당하며, 대시보드 메인과 게시판 간의 화면 전환을 관리합니다.
 */

import { apiFetch } from '../services/api.js';
import { showMessage, hideMessage, setLoading } from '../utils/dom.js';
import { getMainDashboardContentHTML } from '../components/dashboard.js';
import { getBoardHTML, getFeedbackItemHTML } from '../components/board.js';
import { initDashboardFeatures } from '../app.js';

let currentPage = 1;
const ITEMS_PER_PAGE = 5;
let allFeedback = [];

let isBoardView = false;

/**
 * 피드백 기능 초기화
 */
export function initFeedback() {
    const feedbackBtn = document.getElementById('feedbackBtn');
    const contentArea = document.getElementById('dashboardContent');

    if (!feedbackBtn || !contentArea) return;

    // 버튼 클릭 이벤트: 게시판 <-> 대시보드 전환
    feedbackBtn.addEventListener('click', () => {
        if (!isBoardView) {
            // 대시보드 -> 게시판 진입
            contentArea.classList.add('fade-out'); // 기존 내용 페이드 아웃 효과
            setTimeout(() => {
                contentArea.innerHTML = '';
                switchToBoard(contentArea);
                contentArea.classList.remove('fade-out');
                contentArea.classList.add('fade-in');
            }, 300);

            feedbackBtn.textContent = '대시보드로 돌아가기';
            isBoardView = true;
        } else {
            // 게시판 -> 대시보드 복구 (정적 HTML이 아닌 동적 재렌더링 및 초기화)
            contentArea.classList.add('fade-out');
            setTimeout(() => {
                const user = window.currentUser;
                contentArea.innerHTML = getMainDashboardContentHTML(user);
                initDashboardFeatures(user); // 모든 기능 재초기화 (그리드 위치 복구 포함)

                contentArea.classList.remove('fade-out');
                contentArea.classList.add('fade-in');
            }, 300);

            feedbackBtn.textContent = '고객의 소리함';
            isBoardView = false;
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

/**
 * 게시판 화면으로 전환
 */
async function switchToBoard(container) {
    container.innerHTML = getBoardHTML();

    const returnBtn = document.getElementById('returnToDashboardBtnTop');
    if (returnBtn) {
        returnBtn.addEventListener('click', () => {
            const feedbackBtn = document.getElementById('feedbackBtn');
            if (feedbackBtn) feedbackBtn.click();
        });
    }

    const toggleBtn = document.getElementById('toggleWriteBtn');
    const writeSection = document.getElementById('boardWriteSection');
    const submitBtn = document.getElementById('submitBoardFeedback');
    const listSection = document.getElementById('boardListSection');

    // 제출 로직
    submitBtn.addEventListener('click', async () => {
        const contentInput = document.getElementById('feedbackBoardContent');
        const msgEl = document.getElementById('boardFeedbackMsg');
        const content = contentInput.value.trim();

        if (content.length < 5) {
            showMessage(msgEl, '내용을 5자 이상 입력해 주세요.');
            return;
        }

        submitBtn.disabled = true;
        try {
            const res = await apiFetch('/api/feedback', {
                method: 'POST',
                body: JSON.stringify({ content })
            });
            const result = await res.json();

            if (result.success) {
                contentInput.value = '';
                showMessage(msgEl, '의견이 소중하게 전달되었습니다!', true);
                // 목록 갱신 (첫 페이지로)
                currentPage = 1;
                loadFeedbackList(listSection);
            } else {
                showMessage(msgEl, result.message);
            }
        } catch (err) {
            showMessage(msgEl, '제출 중 오류가 발생했습니다.');
        } finally {
            submitBtn.disabled = false;
        }
    });

    // 목록 불러오기
    loadFeedbackList(listSection);
}


/**
 * 피드백 목록을 가져와 페이지네이션 처리합니다.
 */
async function loadFeedbackList(listSection) {
    try {
        const res = await apiFetch('/api/feedback');
        const result = await res.json();

        if (result.success) {
            allFeedback = result.feedback;
            renderCurrentPage();
        } else {
            listSection.innerHTML = '<div class="error">목록을 불러오지 못했습니다.</div>';
        }
    } catch (err) {
        listSection.innerHTML = '<div class="error">서버와 통신할 수 없습니다.</div>';
    }
}

/**
 * 현재 페이지의 피드백 목록과 페이지네이션 UI를 렌더링합니다.
 */
function renderCurrentPage() {
    const listSection = document.getElementById('boardListSection');
    const paginationSection = document.getElementById('boardPagination');

    if (!listSection || !paginationSection) return;

    if (allFeedback.length === 0) {
        listSection.innerHTML = '<div class="no-data">등록된 업데이트 제안이 없습니다. 첫 번째 의견을 남겨보세요!</div>';
        paginationSection.innerHTML = '';
        return;
    }

    // 데이터 쪼개기
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pagedItems = allFeedback.slice(startIndex, endIndex);

    // 목록 렌더링
    listSection.innerHTML = pagedItems
        .map(item => getFeedbackItemHTML(item))
        .join('');

    // 페이지네이션 버튼 렌더링
    const totalPages = Math.ceil(allFeedback.length / ITEMS_PER_PAGE);
    let paginationHTML = '';

    for (let i = 1; i <= totalPages; i++) {
        paginationHTML += `
            <button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="window.changeFeedbackPage(${i})">
                ${i}
            </button>
        `;
    }

    paginationSection.innerHTML = paginationHTML;
}

// 전역 윈도우 객체에 페이지 변경 함수 등록
window.changeFeedbackPage = (page) => {
    currentPage = page;
    renderCurrentPage();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// 피드백 삭제 요청 (관리자 전용)
window.deleteFeedback = async (id) => {
    if (!confirm('이 의견을 삭제하시겠습니까?')) return;

    try {
        const res = await apiFetch(`/api/feedback/${id}`, {
            method: 'DELETE'
        });
        const result = await res.json();

        if (result.success) {
            // 삭제 성공 후 현재 페이지 데이터 다시 불러오기
            const listSection = document.getElementById('boardListSection');
            loadFeedbackList(listSection);
        } else {
            alert(result.message || '삭제에 실패했습니다.');
        }
    } catch (err) {
        alert('서버와 통신할 수 없습니다.');
    }
};
