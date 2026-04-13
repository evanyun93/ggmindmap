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
    if (!welcomeSection) return;

    // '다시는 보지 않기' 설정 확인
    const isHiddenForever = safeLocalStorage.getItem('hide_welcome_forever') === 'true';
    if (isHiddenForever) {
        welcomeSection.style.display = 'none';
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
            setTimeout(() => {
                welcomeSection.style.display = 'none';
            }, 500);
            if (window.navigator.vibrate) window.navigator.vibrate(10);
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

/**
 * 네이버 웨일 브라우저 강제 다크모드 차단
 * Whale은 CSS color-scheme을 무시하고 렌더링 레벨에서 색상을 변환하므로
 * html 인라인 스타일(가장 높은 우선순위)로 직접 차단합니다.
 */
function blockWhaleDarkMode(theme) {
    if (!/Whale/i.test(navigator.userAgent)) return;

    const html = document.documentElement;
    const isClassic = theme === 'classic';

    // html 인라인 color-scheme 강제 지정
    html.style.setProperty('color-scheme', isClassic ? 'only light' : 'only dark', 'important');
    html.style.setProperty('forced-color-adjust', 'none', 'important');

    // 차단 시트 주입 (한 번만 생성, 이후 내용만 교체)
    let shield = document.getElementById('whale-dark-shield');
    if (!shield) {
        shield = document.createElement('style');
        shield.id = 'whale-dark-shield';
        document.head.appendChild(shield);
    }

    if (isClassic) {
        shield.textContent = `
            html, body.theme-classic {
                background-color: #f5f6fa !important;
                color: #1e293b !important;
                filter: none !important;
            }
        `;
    } else {
        shield.textContent = `
            html {
                color-scheme: only dark !important;
                filter: none !important;
            }
        `;
    }
}

function applyTheme(theme) {
    // 기존 테마 클래스 제거
    document.body.classList.remove('theme-midnight', 'theme-blueprint', 'theme-classic', 'theme-dark');
    // 신규 테마 클래스 추가
    document.body.classList.add(`theme-${theme}`);

    // 웨일 다크모드 차단
    blockWhaleDarkMode(theme);

    // UI 상태 업데이트
    const chips = document.querySelectorAll('.theme-chip');
    chips.forEach(c => {
        c.classList.toggle('active', c.dataset.theme === theme);
    });

    // 저장
    safeLocalStorage.setItem('dashboard_theme', theme);
}

