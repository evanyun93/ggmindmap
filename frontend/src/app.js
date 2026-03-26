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
        window.onpopstate = function () {
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

    // 1. 앱 설치 버튼 처리 (브라우저 환경 vs 앱 환경)
    if (installBtn) {
        if (isStandalone) {
            // 이미 앱으로 실행 중인 경우: 알림 권한 가이드로 전환
            installBtn.style.display = 'flex';
            installBtn.innerHTML = '<span>🔔 알림 최적화 가이드</span>';
            installBtn.style.background = '#4B5563';
            installBtn.onclick = () => {
                window.appAlert('이미 앱이 설치되어 실행 중입니다. 알람이 오지 않는다면 스마트폰 "설정 > 알림 > MindMap"에서 알림 허용을 확인해 주세요.');
            };
        } else {
            // 브라우저에서 실행 중인 경우: 설치 유도
            installBtn.style.display = 'flex';
            if (window.deferredPrompt) {
                // 원클릭 설치 가능
                installBtn.innerHTML = '<span>📱 MindMap 앱 설치하기</span>';
                installBtn.style.background = '#8B5CF6';
                installBtn.onclick = async () => {
                    if (!window.deferredPrompt) return;
                    window.deferredPrompt.prompt();
                    const { outcome } = await window.deferredPrompt.userChoice;
                    if (outcome === 'accepted') window.deferredPrompt = null;
                    window.updateNotifStatusUI();
                };
            } else {
                // 수동 설치 안내 (Chrome: 홈 화면에 추가)
                installBtn.innerHTML = '<span>📱 앱 설치 방법 (안내)</span>';
                installBtn.style.background = '#6B7280';
                installBtn.onclick = () => {
                    window.appAlert('브라우저 메뉴(점 3개 또는 공유 버튼)를 누르고 "홈 화면에 추가" 또는 "앱 설치"를 클릭하시면 앱으로 사용하실 수 있습니다.');
                };
            }
        }
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

/**
 * 알림 권한이 미허용/차단된 경우 사용자에게 설정 변경을 유도하는 팝업 (세션당 1회)
 */
window.checkNotificationPermissionAndWarn = () => {
    // 이미 허용된 경우 종료
    if (Notification.permission === 'granted') return;

    // 세션당 1회 노출 제한 (새로고침 시 다시 안 뜸)
    if (sessionStorage.getItem('notif_prompt_shown') === 'true') return;
    sessionStorage.setItem('notif_prompt_shown', 'true');

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    const isDenied = Notification.permission === 'denied';

    // UI 분기: default(아직 안 물어봄) vs denied(거부됨)
    let guideHtml = '';
    let buttonsHtml = '';

    if (!isDenied) {
        // [Default] 상태이므로 권한 요청 버튼 표시
        guideHtml = `
            <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0; text-align: left;">
                <b>🔔 알림 활성화 필요</b><br>
                실시간 푸시 알람을 가장 확실하게 받아보시려면 알림 권한을 단 한 번 허용해 주세요. <br><br>
                <span style="color: #64748b;">(알림 권한을 허용하지 않으면 기본적으로 알람이 무음 처리되거나 보이지 않을 수 있습니다.)</span>
            </p>
        `;
        buttonsHtml = `
            <button id="requestNotifBtn" style="width: 100%; padding: 16px; background: #3b82f6; color: white; border: none; border-radius: 14px; font-weight: 700; cursor: pointer; font-size: 16px; margin-bottom: 8px;">
                지금 알림 권한 허용하기
            </button>
            <button id="closeNotifWarn" style="width: 100%; padding: 12px; background: transparent; color: #64748b; border: none; border-radius: 12px; font-weight: 600; cursor: pointer; font-size: 14px;">
                나중에 하기
            </button>
        `;
    } else {
        // [Denied] 기존 로직 (PWA 환경과 브라우저 환경 안내 분리)
        const ua = navigator.userAgent.toLowerCase();
        const isMobile = /android|iphone|ipad|ipod/.test(ua);

        if (isStandalone) {
            if (isMobile) {
                // 모바일 설치앱 (안드로이드 WebAPK / iOS PWA)
                guideHtml = `
                    <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0; text-align: left;">
                        <b style="color: #ef4444;">[앱 알림 차단 해제 방법]</b><br>
                        현재 기기에서 MindMap 앱의 알림이 완전히 차단되어 있습니다.<br><br>
                        아래 버튼을 눌러 기기 설정으로 이동한 뒤, <b>[알림]</b>을 '허용'으로 변경해 주세요.
                    </p>
                `;
                buttonsHtml = `
                    <button id="goToNotifSettings" style="width: 100%; padding: 16px; background: #8B5CF6; color: white; border: none; border-radius: 14px; font-weight: 700; cursor: pointer; font-size: 16px; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4); margin-bottom: 8px;">
                        설정 앱 열기 ➔ [알림] 켜기
                    </button>
                    <button id="closeNotifWarn" style="width: 100%; padding: 12px; background: transparent; color: #64748b; border: none; border-radius: 12px; font-weight: 600; cursor: pointer; font-size: 14px;">
                        나중에 직접 할게요
                    </button>
                `;
            } else {
                // PC 설치앱
                guideHtml = `
                    <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0; text-align: left;">
                        <b style="color: #ef4444;">[앱 알림 차단 해제 방법]</b><br>
                        현재 기기에서 MindMap 앱의 알림이 완전히 차단되어 있습니다.<br><br>
                        상단 타이틀 바의 <b>[ⓘ (앱 정보)] 또는 설정 메뉴</b>로 들어가 <b>[알림]</b>을 허용해 주세요.
                    </p>
                `;
                buttonsHtml = `
                    <button id="closeNotifWarn" style="width: 100%; padding: 16px; background: #8B5CF6; color: white; border: none; border-radius: 14px; font-weight: 700; cursor: pointer; font-size: 16px; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);">
                        알겠습니다 (직접 설정할게요)
                    </button>
                `;
            }
        } else {
            if (isMobile) {
                // 모바일 브라우저
                guideHtml = `
                    <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0; text-align: left;">
                        <b style="color: #ef4444;">[알림이 꺼져있습니다]</b><br>
                        <b>방법 1. (강력 추천)</b><br>
                        아래 버튼 클릭 시 나타나는 시스템 설정창에서 <b>[알림]</b>을 찾아 켜주세요.
                    </p>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 12px 0;">
                    <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0; text-align: left;">
                        <b>방법 2. 브라우저 직접 제어</b><br>
                        상단 주소창 왼쪽의 <b>[자물쇠 아이콘]</b>을 누르고 <b>[알림]</b> 설정을 '허용'으로 바꿔주세요.
                    </p>
                `;
                buttonsHtml = `
                    <button id="goToNotifSettings" style="width: 100%; padding: 16px; background: #8B5CF6; color: white; border: none; border-radius: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s; font-size: 16px; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4); margin-bottom: 8px;">
                        기기 설정 열기 ➔ [알림] 켜기
                    </button>
                    <button id="closeNotifWarn" style="width: 100%; padding: 12px; background: transparent; color: #64748b; border: none; border-radius: 12px; font-weight: 600; cursor: pointer; font-size: 14px;">
                        직접 자물쇠 아이콘 누를게요
                    </button>
                `;
            } else {
                // PC 브라우저
                guideHtml = `
                    <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0; text-align: left;">
                        <b style="color: #ef4444;">[알림이 꺼져있습니다]</b><br>
                        <b>방법 1. (강력 추천)</b><br>
                        상단 주소창 왼쪽의 <b>[자물쇠 아이콘]</b>을 누르고 <b>[알림]</b> 설정을 '허용'으로 바꿔주세요.
                    </p>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 12px 0;">
                    <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0; text-align: left;">
                        <b>방법 2. 브라우저 설정(앱) 메뉴 이용</b><br>
                        브라우저 우측 상단 옵션 메뉴를 통해 사이트 설정에서 <b>[알림]</b>을 찾아 허용해 주세요.
                    </p>
                `;
                buttonsHtml = `
                    <button id="closeNotifWarn" style="width: 100%; padding: 16px; background: #8B5CF6; color: white; border: none; border-radius: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s; font-size: 16px; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);">
                        직접 자물쇠 아이콘 누를게요
                    </button>
                `;
            }
        }
    }

    const modalHtml = `
        <div id="notifWarnModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(8px);">
            <div style="background: white; border-radius: 24px; width: 100%; max-width: 340px; padding: 28px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.2); max-height: 90vh; display: flex; flex-direction: column;">
                <div style="text-align: center; margin-bottom: 20px; flex-shrink: 0;">
                    <div style="width: 56px; height: 56px; background: ${isDenied ? '#fee2e2' : '#ebf8ff'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px;">
                        <span style="font-size: 28px;">${isDenied ? '🚫' : '🔔'}</span>
                    </div>
                    <h3 style="margin: 0; color: #0f172a; font-size: 20px; font-weight: 800;">${isDenied ? '알림 권한 차단됨' : '알림이 꺼져있습니다'}</h3>
                </div>
                
                <div style="background: #f8fafc; border-radius: 16px; padding: 16px; margin-bottom: 24px; flex-shrink: 0;">
                    ${guideHtml}
                </div>

                <div style="display: flex; flex-direction: column; gap: 0px; flex-shrink: 0;">
                    ${buttonsHtml}
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // 이벤트 리스너 바인딩
    const reqBtn = document.getElementById('requestNotifBtn');
    if (reqBtn) {
        reqBtn.onclick = async () => {
            reqBtn.textContent = '권한 요청 중...';
            const perm = await Notification.requestPermission();

            document.getElementById('notifWarnModal').remove();

            if (perm === 'granted') {
                if (window.appAlert) window.appAlert('✅ 알림이 성공적으로 허용되었습니다!');
                // 권한 허용 후 todo-alarm.js가 이를 인식해서 푸시 구독을 시도하도록 이벤트 발송
                document.dispatchEvent(new CustomEvent('notificationGranted'));
            } else {
                if (window.appAlert) window.appAlert('⚠️ 권한이 거부되었습니다. 주소창 좌측 자물쇠에서 직접 변경해주세요.');
            }
        };
    }

    const goBtn = document.getElementById('goToNotifSettings');
    if (goBtn) {
        goBtn.onclick = () => {
            const ua = navigator.userAgent.toLowerCase();
            const isAndroid = /android/.test(ua);
            const isIOS = /iphone|ipad|ipod/.test(ua);

            if (isAndroid) {
                // 범용 시스템 설정 앱 활성화 (패키지 종속성 제거)
                const intentUrl = 'intent:#Intent;action=android.settings.SETTINGS;end;';
                location.href = intentUrl;
                
                // 만약 Intent 호출이 무시될 경우를 대비
                setTimeout(() => {
                    if (window.appAlert) window.appAlert('자동 이동에 실패했습니다. 기기 "설정 > 애플리케이션" 메뉴에서 알림을 직접 켜주세요. ⚙️');
                }, 2000);
            } else if (isIOS) {
                location.href = 'app-settings:';
            } else {
                if (window.appAlert) window.appAlert('브라우저 주소창 자물쇠 모양 설정버튼에서 알림 권한을 직접 허용해 주세요.');
            }
        };
    }

    const closeBtn = document.getElementById('closeNotifWarn');
    if (closeBtn) {
        closeBtn.onclick = () => {
            document.getElementById('notifWarnModal').remove();
        };
    }
};
