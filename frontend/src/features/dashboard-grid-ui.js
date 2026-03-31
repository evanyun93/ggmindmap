/**
 * @file dashboard-grid-ui.js
 * @description 대시보드 그리드의 UI 상태(환영 섹션, 테마)를 관리합니다.
 */

import { safeLocalStorage } from '../utils/storage.js';

/**
 * 환영 세션 제어 로직
 */
export function initWelcomeSection() {
    const welcomeSection = document.getElementById('welcomeSection');
    const centralLogoSection = document.getElementById('centralLogoSection');
    if (!welcomeSection) return;

    const showLogo = () => {
        if (centralLogoSection) centralLogoSection.classList.remove('hidden');
    };

    // '다시는 보지 않기' 설정 확인
    const isHiddenForever = safeLocalStorage.getItem('hide_welcome_forever') === 'true';
    if (isHiddenForever) {
        welcomeSection.style.display = 'none';
        showLogo();
        return;
    }

    const closeBtn = document.getElementById('closeWelcomeBtn');
    const dontShowCheckbox = document.getElementById('dontShowAgainCheckbox');

    if (closeBtn) {
        const closeAction = () => {
            // 체크박스 상태 확인
            if (dontShowCheckbox && dontShowCheckbox.checked) {
                safeLocalStorage.setItem('hide_welcome_forever', 'true');
            }
            welcomeSection.style.display = 'none';
            if (window.navigator.vibrate) window.navigator.vibrate(10);
            showLogo();
        };

        closeBtn.onclick = closeAction;
        // [WebView 대응] 클릭이 지연되거나 무시되는 환경을 위해 터치 시작 시 즉시 반응
        closeBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            closeAction();
        }, { passive: false });
    }
}

/**
 * 테마 초기화 및 연동
 */
export function initTheme() {
    const savedTheme = safeLocalStorage.getItem('dashboard_theme') || 'midnight';
    applyTheme(savedTheme);

    const themePickers = document.querySelectorAll('.theme-picker-premium');
    themePickers.forEach(picker => {
        picker.addEventListener('click', (e) => {
            const chip = e.target.closest('.theme-chip');
            if (!chip) return;

            const theme = chip.dataset.theme;
            applyTheme(theme);
        });
    });
}

function applyTheme(theme) {
    // 기존 테마 클래스 제거
    document.body.classList.remove('theme-midnight', 'theme-blueprint', 'theme-classic', 'theme-dark');
    // 신규 테마 클래스 추가
    document.body.classList.add(`theme-${theme}`);

    // UI 상태 업데이트
    const chips = document.querySelectorAll('.theme-chip');
    chips.forEach(c => {
        c.classList.toggle('active', c.dataset.theme === theme);
    });

    // 저장
    safeLocalStorage.setItem('dashboard_theme', theme);
}

