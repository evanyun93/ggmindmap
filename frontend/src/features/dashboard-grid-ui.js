/**
 * @file dashboard-grid-ui.js
 * @description 대시보드 그리드의 UI 상태(환영 섹션, 테마)를 관리합니다.
 */

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
    const isHiddenForever = localStorage.getItem('hide_welcome_forever') === 'true';
    if (isHiddenForever) {
        welcomeSection.style.display = 'none';
        showLogo();
        return;
    }

    const closeBtn = document.getElementById('closeWelcomeBtn');
    const dontShowCheckbox = document.getElementById('dontShowAgainCheckbox');

    if (closeBtn) {
        closeBtn.onclick = () => {
            // 체크박스 상태 확인
            if (dontShowCheckbox && dontShowCheckbox.checked) {
                localStorage.setItem('hide_welcome_forever', 'true');
            }
            welcomeSection.style.display = 'none';
            showLogo();
        };
    }
}

/**
 * 테마 초기화 및 연동
 */
export function initTheme() {
    const savedTheme = localStorage.getItem('dashboard_theme') || 'midnight';
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
    localStorage.setItem('dashboard_theme', theme);
}

