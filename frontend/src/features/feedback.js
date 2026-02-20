/**
 * @file feedback.js
 * @description 고객의 소리함(피드백) 기능을 담당하는 모듈입니다.
 */

import { apiFetch } from '../services/api.js';
import { showMessage, hideMessage, setLoading } from '../utils/dom.js';

/**
 * 피드백 기능 초기화
 */
export function initFeedback() {
    const feedbackBtn = document.getElementById('feedbackBtn');
    const modal = document.getElementById('feedbackModal');
    const closeBtn = document.getElementById('closeFeedback');
    const submitBtn = document.getElementById('submitFeedback');
    const contentArea = document.getElementById('feedbackContent');
    const msgEl = document.getElementById('feedbackMsg');

    if (!feedbackBtn || !modal) return;

    // 모달 열기
    feedbackBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
        modal.classList.add('fade-in');
        contentArea.focus();
    });

    // 모달 닫기
    const closeModalFunc = () => {
        modal.classList.add('hidden');
        modal.classList.remove('fade-in');
        contentArea.value = '';
        hideMessage(msgEl);
    };

    closeBtn.addEventListener('click', closeModalFunc);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModalFunc();
    });

    // 피드백 제출
    submitBtn.addEventListener('click', async () => {
        const content = contentArea.value.trim();
        if (content.length < 5) {
            showMessage(msgEl, '내용을 5자 이상 입력해 주세요.');
            return;
        }

        setLoading(submitBtn, true);
        try {
            const res = await apiFetch('/api/feedback', {
                method: 'POST',
                body: JSON.stringify({ content })
            });
            const result = await res.json();

            if (result.success) {
                alert(result.message);
                closeModalFunc();
            } else {
                showMessage(msgEl, result.message);
            }
        } catch (err) {
            showMessage(msgEl, '서버 통신 중 오류가 발생했습니다.');
        } finally {
            setLoading(submitBtn, false);
        }
    });
}
