/**
 * @file app.js
 * @description 애플리케이션의 엔트리 포인트입니다. 각 모듈을 로드하고 초기 상태를 설정합니다.
 */

import { createParticles } from './utils/effects.js';
import { checkAutoLogin, login, register, logout } from './services/auth.js';
import { showMessage, hideMessage, setLoading, switchCard } from './utils/dom.js';
import { initSocialAuth } from './services/social-auth.js'; // social-auth 임포트
import { getDashboardHTML } from './components/dashboard.js';
import { initMemo } from './features/memo.js';
import { initFeedback } from './features/feedback.js';
import { initChangelog } from './features/changelog.js';
import { initMilestone } from './features/milestone.js';

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
        initAuthView();
    }

    // 3. 전역 기능 초기화 (푸터 등)
    initChangelog();

    // 4. 네이버 콜백 처리 (팝업 등에서 돌아왔을 때)
    const { checkNaverCallback } = await import('./services/social-auth.js');
    checkNaverCallback();
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
function showDashboardView(user) {
    window.currentUser = user; // 전역 유저 정보 저장 (삭제 버튼 노출용)
    const appRoot = document.getElementById('app-root');
    if (appRoot) {
        appRoot.innerHTML = getDashboardHTML(user);
    } else {
        document.body.innerHTML = getDashboardHTML(user); // 폴백
    }

    // 대시보드 기능 초기화 실행
    initDashboardFeatures(user);

    // 대시보드 내 소셜 연동 버튼을 위해 다시 초기화 (이미 이벤트 리스너가 중복 등록되지 않도록 social-auth.js에서 처리됨)
    initSocialAuth();
}

/**
 * 대시보드의 모든 동적 기능(메모, 피드백, 그리드 등)을 초기화합니다.
 * @param {object} user 
 */
export function initDashboardFeatures(user) {
    // 대시보드 전용 파티클 생성
    createParticles('particles2', 20, ['#8B5CF6', '#06B6D4', '#A78BFA', '#22D3EE']);

    // 메모 기능 초기화 (D-Day, Spreadsheet, Drag 등)
    initMemo();

    // 고객의 소리함 초기화
    initFeedback();

    // 마일스톤 위젯 초기화 (D-Day 등)
    initMilestone();

    // D-Day 데이터 동기화
    const updateMainDday = () => {
        const ddayCount = document.getElementById('ddayCount');
        const mainDday = document.getElementById('mainDdayCount');
        if (ddayCount && mainDday) mainDday.textContent = ddayCount.textContent;
    };
    setTimeout(updateMainDday, 500);
    // 중복 방지를 위한 타이머 관리 로직이 추후 필요할 수 있음

    // To-Do 및 그리드 커스터마이징 초기화
    import('./features/todo.js').then(module => module.initTodo());
    import('./features/dashboard-grid.js').then(module => {
        module.initDashboardGrid();
        module.restoreLayout();
    });

    // 마인드맵 버튼 연동
    const startBtn = document.getElementById('realStartMindmapBtn');
    if (startBtn) {
        startBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            import('./features/mindmap.js').then(module => module.initMindmap());
        });
    }

    // 로그아웃 버튼 설정
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
}

/**
 * 로그인 처리
 */
async function handleLoginSubmit(e) {
    e.preventDefault();
    hideMessage(loginError);

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    const btn = document.getElementById('loginBtn');

    setLoading(btn, true);
    const result = await login(username, password, rememberMe);
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

    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const displayName = document.getElementById('regDisplayName').value.trim();
    const btn = document.getElementById('registerBtn');

    setLoading(btn, true);
    const result = await register({ username, password, displayName });
    setLoading(btn, false);

    if (result.success) {
        showMessage(registerSuccess, '회원가입 성공! 로그인 해주세요.');
        registerForm.reset();
        setTimeout(() => {
            switchCard('login', loginCard, registerCard, clearAuthMessages);
            document.getElementById('loginUsername').value = username;
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
