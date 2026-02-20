/**
 * @file feedback.js
 * @description Q&A 게시판 기능을 담당하며, 대시보드 메인과 게시판 간의 화면 전환을 관리합니다.
 */

import { apiFetch } from '../services/api.js';
import { showMessage, hideMessage, setLoading } from '../utils/dom.js';
import { getBoardHTML, getFeedbackItemHTML } from '../components/board.js';

let isBoardView = false;
let originalDashboardHTML = '';

/**
 * 피드백 기능 초기화
 */
export function initFeedback() {
    const feedbackBtn = document.getElementById('feedbackBtn');
    const contentArea = document.getElementById('dashboardContent');

    if (!feedbackBtn || !contentArea) return;

    // 원래 대시보드 내용 저장
    originalDashboardHTML = contentArea.innerHTML;

    // 버튼 클릭 이벤트: 게시판 <-> 대시보드 전환
    feedbackBtn.addEventListener('click', () => {
        if (!isBoardView) {
            // 대시보드 -> 게시판 진입: 기존 내용을 완전히 비우고 게시판 렌더링
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
            // 게시판 -> 대시보드 복구
            contentArea.innerHTML = originalDashboardHTML;
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

    const toggleBtn = document.getElementById('toggleWriteBtn');
    const writeSection = document.getElementById('boardWriteSection');
    const submitBtn = document.getElementById('submitBoardFeedback');
    const listSection = document.getElementById('boardListSection');

    // 작성 폼 토글
    toggleBtn.addEventListener('click', () => {
        const isHidden = writeSection.classList.toggle('hidden');
        toggleBtn.textContent = isHidden ? '의견 남기기' : '작성 취소';
    });

    // 제출 로직
    submitBtn.addEventListener('click', async () => {
        const contentArea = document.getElementById('feedbackBoardContent');
        const msgEl = document.getElementById('boardFeedbackMsg');
        const content = contentArea.value.trim();

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
                contentArea.value = '';
                writeSection.classList.add('hidden');
                toggleBtn.textContent = '의견 남기기';
                // 목록 갱신
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
 * 대시보드 원본 화면으로 전환
 */
function switchToDashboard(container) {
    container.innerHTML = originalDashboardHTML;
}

/**
 * 피드백 목록을 백엔드에서 가져와 렌더링합니다.
 */
async function loadFeedbackList(container) {
    try {
        const res = await apiFetch('/api/feedback');
        const result = await res.json();

        if (result.success && result.feedback.length > 0) {
            container.innerHTML = result.feedback
                .map(item => getFeedbackItemHTML(item))
                .join('');
        } else if (result.feedback.length === 0) {
            container.innerHTML = '<div class="no-data">등록된 업데이트 제안이 없습니다. 첫 번째 의견을 남겨보세요!</div>';
        } else {
            container.innerHTML = '<div class="error">목록을 불러오지 못했습니다.</div>';
        }
    } catch (err) {
        container.innerHTML = '<div class="error">서버와 통신할 수 없습니다.</div>';
    }
}
