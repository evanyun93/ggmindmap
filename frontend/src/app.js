/**
 * @file app.js
 * @description 애플리케이션의 엔트리 포인트입니다. 각 모듈을 로드하고 초기 상태를 설정합니다.
 */

import { createParticles } from './utils/effects.js';
import { checkAutoLogin, login, register, logout } from './services/auth.js';
import { showMessage, hideMessage, setLoading, switchCard } from './utils/dom.js';
import { initSocialAuth } from './services/social-auth.js'; // social-auth 임포트
import { getDashboardHTML } from './components/dashboard.js';
import { initChangelog } from './features/changelog.js';
import { initDashboardFeatures } from './features/dashboard-bootstrap.js';
import './utils/dialog.js'; // 전역 커스텀 Alert/Confirm/Toast 등록

// 피드백 모듈 등에서 initDashboardFeatures를 사용할 수 있도록 re-export
export { initDashboardFeatures };

// DOM 요소 캐시 (로그인 페이지용)
let loginCard, registerCard, loginForm, registerForm, loginError, registerError, registerSuccess;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. 배경 파티클 생성
    createParticles('particles');

    // 2. 자동 로그인 확인
    const user = await checkAutoLogin();
    if (user) {
        showDashboardView(user);
    } else {
        // 인증되지 않은 사용자일 경우에만 로그인 화면(.auth-container)을 표시
        const authContainer = document.getElementById('authContainer');
        if (authContainer) authContainer.style.display = '';
        initAuthView();
    }

    // 3. 전역 기능 초기화 (푸터 등)
    initChangelog();

    // 4. 네이버 콜백 처리 (팝업 등에서 돌아왔을 때)
    const { checkNaverCallback } = await import('./services/social-auth.js');
    checkNaverCallback();

    // 5. 모바일 제스처 이탈 방지 (뒤로 가기 차단)
    if (window.innerWidth <= 768) {
        history.pushState(null, null, location.href);
        window.onpopstate = function() {
            history.pushState(null, null, location.href);
            // 필요 시 사용자에게 알림을 줄 수 있음
            console.log('[App] 제스처에 의한 뒤로 가기가 차단되었습니다.');
        };
    }
});

/**
 * 로그인/회원가입 화면 초기화
 */
function initAuthView() {
    loginCard = document.getElementById('loginCard');
    registerCard = document.getElementById('registerCard');
    loginForm = document.getElementById('loginForm');
    registerForm = document.getElementById('registerForm');
    loginError = document.getElementById('loginError');
    registerError = document.getElementById('registerError');
    registerSuccess = document.getElementById('registerSuccess');

    const showRegisterBtn = document.getElementById('showRegister');
    const showLoginBtn = document.getElementById('showLogin');

    // 이벤트 리스너 등록
    loginForm.addEventListener('submit', handleLoginSubmit);
    registerForm.addEventListener('submit', handleRegisterSubmit);
    showRegisterBtn.addEventListener('click', () => switchCard('register', loginCard, registerCard, clearAuthMessages));
    showLoginBtn.addEventListener('click', () => switchCard('login', loginCard, registerCard, clearAuthMessages));

    // 소셜 로그인 초기화
    initSocialAuth();
}

/**
 * 대시보드 화면으로 전환 및 초기화
 * @param {object} user 
 */
async function showDashboardView(user) {
    console.log('[Dashboard] 로그인 유저 정보:', user);
    window.currentUser = user; // 전역 유저 정보 저장 (삭제 버튼 노출용)
    const appRoot = document.getElementById('app-root');
    if (appRoot) {
        appRoot.classList.add('dashboard-active');
        appRoot.innerHTML = getDashboardHTML(user);
    } else {
        document.body.innerHTML = getDashboardHTML(user); // 폴백
    }

    // 대시보드 기능 초기화 실행
    await initDashboardFeatures(user);

    // 대시보드 내 소셜 연동 버튼을 위해 다시 초기화 (이미 이벤트 리스너가 중복 등록되지 않도록 social-auth.js에서 처리됨)
    initSocialAuth();
}

/**
 * 로그인 처리
 */
async function handleLoginSubmit(e) {
    e.preventDefault();
    hideMessage(loginError);

    const login_id = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    const btn = document.getElementById('loginBtn');

    setLoading(btn, true);
    const result = await login(login_id, password, rememberMe);
    setLoading(btn, false);

    if (result.success) {
        showDashboardView(result.user);
    } else {
        showMessage(loginError, result.message);
    }
}

/**
 * 회원가입 처리
 */
async function handleRegisterSubmit(e) {
    e.preventDefault();
    hideMessage(registerError);
    hideMessage(registerSuccess);

    const login_id = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const displayName = document.getElementById('regDisplayName').value.trim();
    const email = document.getElementById('regEmail')?.value.trim();
    const btn = document.getElementById('registerBtn');

    setLoading(btn, true);
    const result = await register({ login_id, password, displayName, email });
    setLoading(btn, false);

    if (result.success) {
        showMessage(registerSuccess, '회원가입 성공! 로그인 해주세요.');
        registerForm.reset();
        setTimeout(() => {
            switchCard('login', loginCard, registerCard, clearAuthMessages);
            document.getElementById('loginUsername').value = login_id;
        }, 1500);
    } else {
        showMessage(registerError, result.message);
    }
}

/**
 * 인증 관련 에러/성공 메시지 초기화
 */
function clearAuthMessages() {
    hideMessage(loginError);
    hideMessage(registerError);
    hideMessage(registerSuccess);
}

// ────────────────────────────────────────────────
// PWA 커스텀 설치 유도 로직
// ────────────────────────────────────────────────
window.deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    // 브라우저 기본 배너가 뜨지 않게 방지
    e.preventDefault();
    // 이벤트를 변수에 저장해두었다가 나중에 트리거
    window.deferredPrompt = e;
    
    // 설치 버튼 표시 (로그인 화면 & 대시보드 설정 메뉴)
    const installBtns = [
        document.getElementById('modalInstallApp'),
        document.getElementById('authInstallApp')
    ];

    installBtns.forEach(btn => {
        if (btn) {
            btn.style.display = 'flex';
            btn.onclick = async () => {
                const promptEvent = window.deferredPrompt;
                if (!promptEvent) return;
                promptEvent.prompt();
                const { outcome } = await promptEvent.userChoice;
                console.log(`[PWA] 사용자의 설치 응답: ${outcome}`);
                window.deferredPrompt = null;
                installBtns.forEach(b => { if (b) b.style.display = 'none'; });
            };
        }
    });
});

// 앱이 설치되었을 때의 처리
window.addEventListener('appinstalled', () => {
    console.log('[PWA] 앱이 성공적으로 설치되었습니다.');
    window.deferredPrompt = null;
    const installBtns = [
        document.getElementById('modalInstallApp'),
        document.getElementById('authInstallApp')
    ];
    installBtns.forEach(b => { if (b) b.style.display = 'none'; });
});

/**
 * 알림 권한 상태 UI 업데이트 (설정 모달용)
 */
window.updateNotifStatusUI = () => {
    const section = document.getElementById('notifStatusSection');
    const icon = document.getElementById('notifStatusIcon');
    const title = document.getElementById('notifStatusTitle');
    const desc = document.getElementById('notifStatusDesc');
    const btn = document.getElementById('modalRequestNotif');
    const installBtn = document.getElementById('modalInstallApp');

    if (!section) return;

    const permission = Notification.permission;
    // 앱으로 실행 중인지 확인 (Standalone 모드)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    // 1. 앱 설치 버튼을 '알림 설정 안내' 버튼으로 활용 (이미 설치된 경우)
    if (isStandalone && installBtn) {
        installBtn.style.display = 'flex';
        installBtn.innerHTML = '<span>🔔 알림 최적화 가이드</span>';
        installBtn.style.background = '#4B5563';
        installBtn.onclick = () => {
            window.appAlert('이미 앱이 설치되어 있습니다. 알람이 오지 않는다면 스마트폰 설정에서 "알림 허용"을 확인해 주세요.');
        };
    }

    // 2. 권한 상태별 UI 구성
    section.style.display = 'block';

    if (permission === 'granted') {
        section.style.background = '#f0fff4';
        section.style.borderColor = '#c6f6d5';
        if (icon) icon.textContent = '✅';
        if (title) {
            title.textContent = '알림 권한 허용됨';
            title.style.color = '#2f855a';
        }
        if (desc) {
            desc.textContent = '백그라운드에서 실시간 알람을 받을 수 있는 상태입니다.';
            desc.style.color = '#276749';
        }
        if (btn) btn.style.display = 'none';
    } else if (permission === 'denied') {
        section.style.background = '#fff5f5';
        section.style.borderColor = '#feb2b2';
        if (icon) icon.textContent = '❌';
        if (title) {
            title.textContent = '알림 권한 차단됨';
            title.style.color = '#c53030';
        }
        if (desc) {
            desc.textContent = '브라우저 주소창 왼쪽의 설정 아이콘을 눌러 알림 권한을 "허용"으로 바꿔주셔야 알람이 울립니다.';
            desc.style.color = '#742a2a';
        }
        if (btn) btn.style.display = 'none';
    } else {
        // default (대기)
        section.style.background = '#ebf8ff';
        section.style.borderColor = '#bee3f8';
        if (icon) icon.textContent = '🔔';
        if (title) {
            title.textContent = '알림 권한 대기 중';
            title.style.color = '#2b6cb0';
        }
        if (desc) {
            desc.textContent = '알람을 받으시려면 아래 버튼을 눌러 알림 권한을 허용해 주세요.';
            desc.style.color = '#2c5282';
        }
        if (btn) {
            btn.style.display = 'block';
            btn.textContent = '지금 알림 권한 허용하기';
            btn.style.background = '#3182ce';
        }
    }
};
