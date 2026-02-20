/**
 * @file changelog.js
 * @description 업데이트 내역 모달의 표시 및 닫기 기능을 제어합니다.
 */

import { getChangelogHTML } from '../components/changelog.js';

/**
 * 업데이트 내역 기능을 초기화합니다.
 */
export function initChangelog() {
    const versionBtn = document.getElementById('footerVersion');
    if (!versionBtn) return;

    versionBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showChangelog();
    });
}

/**
 * 업데이트 내역 모달을 표시합니다.
 */
function showChangelog() {
    // 이미 열려있는지 확인
    if (document.getElementById('changelogOverlay')) return;

    // 모달 삽입
    const modalHTML = getChangelogHTML();
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const overlay = document.getElementById('changelogOverlay');
    const closeBtn = document.getElementById('closeChangelog');

    // 애니메이션을 위한 지연 실행
    setTimeout(() => overlay.classList.add('visible'), 10);

    // 닫기 이벤트들
    const close = () => {
        overlay.classList.remove('visible');
        setTimeout(() => overlay.remove(), 400);
    };

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    // ESC 키로 닫기
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            close();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}
