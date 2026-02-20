/**
 * @file dom.js
 * @description UI 조작 및 DOM 관련 공통 유틸리티 함수들을 정의합니다.
 */

/**
 * 에러 또는 성공 메시지를 화면에 표시합니다.
 * @param {HTMLElement} el - 메시지를 표시할 요소
 * @param {string} text - 메시지 내용
 */
export function showMessage(el, text) {
    if (!el) return;
    el.textContent = text;
    el.classList.add('visible');
}

/**
 * 화면에 표시된 메시지를 숨깁니다.
 * @param {HTMLElement} el - 숨길 요소
 */
export function hideMessage(el) {
    if (!el) return;
    el.classList.remove('visible');
    el.textContent = '';
}

/**
 * 버튼의 로딩 상태를 전환합니다.
 * @param {HTMLButtonElement} btn - 대상 버튼
 * @param {boolean} loading - 로딩 여부
 */
export function setLoading(btn, loading) {
    if (!btn) return;
    const text = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.btn-loading');

    btn.disabled = loading;
    if (text) text.style.display = loading ? 'none' : 'inline';
    if (spinner) spinner.style.display = loading ? 'inline-flex' : 'none';
}

/**
 * 로그인 카드와 회원가입 카드 간의 전환 애니메이션을 처리합니다.
 * @param {string} target - 'login' 또는 'register'
 * @param {HTMLElement} loginCard 
 * @param {HTMLElement} registerCard 
 * @param {Function} onFinish - 전환 완료 후 콜백
 */
export function switchCard(target, loginCard, registerCard, onFinish) {
    const current = target === 'register' ? loginCard : registerCard;
    const next = target === 'register' ? registerCard : loginCard;

    if (!current || !next) return;

    current.classList.add('fade-out');

    setTimeout(() => {
        current.classList.add('hidden');
        current.classList.remove('fade-out');
        next.classList.remove('hidden');
        next.classList.add('fade-in');

        if (onFinish) onFinish();

        setTimeout(() => next.classList.remove('fade-in'), 500);
    }, 300);
}
