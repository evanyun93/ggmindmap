/**
 * @file dashboard-bootstrap.js
 * @description 대시보드 부트스트랩(시각 효과/위젯/유틸리티 초기화)을 담당합니다.
 */

import { createParticles } from '../utils/effects.js';
import { logout, verifyAndUpdateEmail } from '../services/auth.js';
import { apiFetch } from '../services/api.js';
import { setupManualPopup } from './manual-popup.js';
import { initMemo } from './memo.js';
import { initFeedback } from './feedback.js';
import { initMilestone } from './milestone.js';
import { initAdmin } from '../admin.js';
import { syncService } from '../services/sync.js';
import { initDashboardLayouts } from './dashboard-layout-manager.js';

/**
 * 대시보드의 모든 동적 기능(메모, 피드백, 그리드 등)을 초기화합니다.
 * @param {object} user
 */
export async function initDashboardFeatures(user) {
    console.log('[Init] 대시보드 피처 초기화 시작...');

    // 알림 권한 차단 여부 체크 및 경고 (비차단)
    if (window.checkNotificationPermissionAndWarn) {
        window.checkNotificationPermissionAndWarn();
    }

    // 0. 동기화 서비스 초기화 (네트워크 지연 시 최대 4초 대기 후 강제 진행)
    await Promise.race([
        syncService.init(),
        new Promise(resolve => setTimeout(() => {
            console.warn('[Dashboard] 동기화 서비스 초기화 타임아웃(4s). 오프라인 모드로 전환합니다.');
            resolve(null);
        }, 4000))
    ]);

    // 1. UI 및 시각 효과 레이어 초기화
    initVisualEffects();

    // 2. 개별 위젯 독립적 초기화
    initWidgets();

    // 3. 도구 및 메뉴 초기화
    initUtilities(user);
    initCollapseAll();
    initZoomControl();

    // 4. 할 일 알람 시스템 시작
    import('./todo-alarm.js').then(m => m.todoAlarmSystem.start());

    // 5. 레이아웃 관리 초기화
    let layouts = await syncService.getData('dashboard_layouts');

    // null이거나 잘못된 구조면 기본값으로 초기화
    if (!layouts || typeof layouts !== 'object' || (!Array.isArray(layouts.pc) && !Array.isArray(layouts.mobile))) {
        layouts = { pc: [], mobile: [] };
    }

    initDashboardLayouts({ dashboard_layouts: layouts });

    console.log('[Init] 모든 피처 초기화 완료.');
}

/**
 * 시각 효과 및 배경 애니메이션 초기화
 */
function initVisualEffects() {
    createParticles('particles2', 20, ['#8B5CF6', '#06B6D4', '#A78BFA', '#22D3EE']);

    // D-Day 데이터 동기화 (레이아웃 안정화 후 실행)
    setTimeout(() => {
        const ddayCount = document.getElementById('ddayCount');
        const mainDday = document.getElementById('mainDdayCount');
        if (ddayCount && mainDday) mainDday.textContent = ddayCount.textContent;
    }, 500);
}

/**
 * 개별 비즈니스 위젯 로직 초기화
 */
function initWidgets() {
    initMemo();
    initFeedback();
    initMilestone();

    // dashboard-grid가 위젯을 로드하면, 각 위젯에서 widget-manager.js → initWidgetLogic → initTodo(el) 을 올바르게 호출합니다.
    // 이 곳에서 initTodo()를 별도로 호출하면 인자 없이 실행되어 모든 위젯에 동일 초기화가 적용되는 버그가 발생합니다.
    import('./dashboard-grid.js').then(module => module.initDashboardGrid());
}

/**
 * 네비게이션, 로그아웃, 관리 시스템 등 유틸리티 초기화
 */
function initUtilities() {
    setupManualPopup();

    // 고객의 소리 (헤더 및 모달 버튼 통합)
    const feedbackBtns = [
        document.getElementById('feedbackBtn'),
        document.getElementById('modalFeedbackBtn')
    ].filter(Boolean);

    feedbackBtns.forEach(btn => {
        btn.onclick = () => {
            // 모달 내 버튼일 경우 모달을 먼저 닫음
            if (btn.id === 'modalFeedbackBtn') {
                const modal = document.getElementById('setupWarningModal');
                if (modal) modal.style.display = 'none';
            }
            // 기존 feedbackBtn의 클릭 시뮬레이션 또는 직접 호출
            const originalFeedbackBtn = document.getElementById('feedbackBtn');
            if (originalFeedbackBtn) {
                // feedbackBtn이 initFeedback에서 이벤트를 가져가므로 직접 클릭 트리거
                if (btn !== originalFeedbackBtn) {
                    originalFeedbackBtn.click();
                }
            }
        };
    });

    // 마인드맵 진입 버튼
    const startBtn = document.getElementById('realStartMindmapBtn');
    if (startBtn) {
        startBtn.onclick = (e) => {
            e.stopPropagation();
            import('./mindmap.js').then(module => module.initMindmap());
        };
    }

    // 로그아웃 시스템
    const logoutBtn = document.getElementById('logoutBtn');
    const modalLogoutBtn = document.getElementById('modalLogoutBtn');
    if (logoutBtn) logoutBtn.onclick = logout;
    if (modalLogoutBtn) modalLogoutBtn.onclick = logout;

    // 관리자 전용 기능 (Admin 계정 체크는 상위에서 수행)
    const adminBtn = document.getElementById('adminBtn');
    if (adminBtn) adminBtn.onclick = initAdmin;

    // 새로고침 버튼 연동
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.onclick = () => {
            if (refreshBtn.classList.contains('spinning')) return;
            
            console.log('[Dashboard] 수동 새로고침 시작 (F5와 완벽히 동일한 동작)');
            refreshBtn.classList.add('spinning');
            
            // 애니메이션 피드백을 0.5초 보여준 뒤 페이지 전체(F5) 새로고침
            setTimeout(() => {
                window.location.reload();
            }, 500);
        };
    }

    // 설정 모달 관련 추가 로직 (알림 권한 등)
    const setupBtn = document.getElementById('setupBtn');
    if (setupBtn) {
        const originalOnClick = setupBtn.onclick;
        setupBtn.onclick = (e) => {
            if (originalOnClick) originalOnClick(e);
            // 모달 열릴 때 알림 상태 업데이트
            if (window.updateNotifStatusUI) window.updateNotifStatusUI();
        };
    }

    const modalRequestNotif = document.getElementById('modalRequestNotif');
    if (modalRequestNotif) {
        modalRequestNotif.onclick = async () => {
            if (!('Notification' in window)) {
                window.appAlert('이 브라우저는 알림 기능을 지원하지 않습니다.');
                return;
            }
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                window.appAlert('알림 권한이 허용되었습니다! 이제 실시간 알람을 받으실 수 있습니다.');
                // 서비스 워커에 구독 갱신 요청 (import 동적으로 수행)
                import('./features/todo-alarm.js').then(m => m.todoAlarmSystem.start());
            }
            if (window.updateNotifStatusUI) window.updateNotifStatusUI();
        };
    }

    // 이메일 추가 버튼 (인증 프로세스 포함)
    const addEmailBtn = document.getElementById('addEmailBtn');
    if (addEmailBtn) {
        addEmailBtn.onclick = async () => {
            const verified = await verifyAndUpdateEmail();
            if (verified) {
                window.location.reload(); // 성공 시 UI 갱신을 위해 새로고침
            }
        };
    }

    // 사용자 프로필 버튼 클릭 시 설정 모달 띄우기
    const userProfileBtn = document.getElementById('userProfileBtn');
    if (userProfileBtn) {
        userProfileBtn.addEventListener('click', () => {
            const modal = document.getElementById('setupWarningModal');
            if (modal) {
                modal.style.display = 'flex';
            }
        });
        
        // 닫기 버튼 효과 (선택적)
        userProfileBtn.addEventListener('mouseenter', () => {
            userProfileBtn.style.background = 'rgba(255,255,255,0.15)';
        });
        userProfileBtn.addEventListener('mouseleave', () => {
            userProfileBtn.style.background = 'rgba(255,255,255,0.08)';
        });
    }

    // 닉네임 변경 버튼
    const submitNicknameBtn = document.getElementById('submitNicknameBtn');
    const changeDisplayNameInput = document.getElementById('changeDisplayNameInput');
    if (submitNicknameBtn && changeDisplayNameInput) {
        submitNicknameBtn.onclick = async () => {
            const newNickname = changeDisplayNameInput.value.trim();
            if (!newNickname) {
                window.appAlert('변경할 닉네임을 입력해 주세요.');
                return;
            }

            try {
                const token = localStorage.getItem('mindmap_token') || sessionStorage.getItem('mindmap_token');
                if (!token) {
                    window.appAlert('로그인이 필요합니다.');
                    return;
                }

                submitNicknameBtn.disabled = true;
                submitNicknameBtn.textContent = '변경 중...';

                const response = await apiFetch('/api/auth/settings', {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ displayName: newNickname })
                });

                const result = await response.json();
                if (result.success) {
                    window.appAlert('닉네임이 성공적으로 변경되었습니다!');
                    window.location.reload();
                } else {
                    window.appAlert(result.message || '닉네임 변경에 실패했습니다.');
                }
            } catch (error) {
                console.error('닉네임 변경 에러:', error);
                window.appAlert('서버와 통신할 수 없습니다.');
            } finally {
                submitNicknameBtn.disabled = false;
                submitNicknameBtn.textContent = '변경';
            }
        };
    }

    // 모달 닫기 버튼들 (기존 하단 버튼 + 신규 상단 X 버튼)
    const closeSetupWarningBtn = document.getElementById('closeSetupWarningBtn');
    const closeSetupWarningHeaderBtn = document.getElementById('closeSetupWarningHeaderBtn');
    
    const closeSettingsModal = () => {
        const modal = document.getElementById('setupWarningModal');
        if (modal) {
            modal.style.display = 'none';
            
            // 모달 닫힐 때 메인 뷰로 초기화 (다시 열 때를 대비)
            const mainView = document.getElementById('mainSettingsView');
            const pResetView = document.getElementById('passwordResetSubView');
            const nChangeView = document.getElementById('nicknameChangeSubView');
            const tChangeView = document.getElementById('themeChangeSubView');
            const hInfoView = document.getElementById('healthInfoSubView');
            if (mainView) mainView.style.display = 'block';
            if (pResetView) pResetView.style.display = 'none';
            if (nChangeView) nChangeView.style.display = 'none';
            if (tChangeView) tChangeView.style.display = 'none';
            if (hInfoView) hInfoView.style.display = 'none';
        }
    };

    if (closeSetupWarningBtn) {
        closeSetupWarningBtn.addEventListener('click', closeSettingsModal);
    }
    if (closeSetupWarningHeaderBtn) {
        closeSetupWarningHeaderBtn.addEventListener('click', closeSettingsModal);
    }

    // --- 설정 서브 뷰 관련 로직 ---
    const mainSettingsView = document.getElementById('mainSettingsView');
    
    // 1. 닉네임 변경 서브 뷰
    const openNicknameChangeSubBtn = document.getElementById('openNicknameChangeSubBtn');
    const closeNicknameChangeSubBtn = document.getElementById('closeNicknameChangeSubBtn');
    const nicknameChangeSubView = document.getElementById('nicknameChangeSubView');

    if (openNicknameChangeSubBtn && mainSettingsView && nicknameChangeSubView) {
        openNicknameChangeSubBtn.addEventListener('click', () => {
            mainSettingsView.style.display = 'none';
            nicknameChangeSubView.style.display = 'block';
        });
    }

    if (closeNicknameChangeSubBtn && mainSettingsView && nicknameChangeSubView) {
        closeNicknameChangeSubBtn.addEventListener('click', () => {
            nicknameChangeSubView.style.display = 'none';
            mainSettingsView.style.display = 'block';
        });
    }

    // 2. 테마 변경 서브 뷰
    const openThemeChangeSubBtn = document.getElementById('openThemeChangeSubBtn');
    const closeThemeChangeSubBtn = document.getElementById('closeThemeChangeSubBtn');
    const themeChangeSubView = document.getElementById('themeChangeSubView');

    if (openThemeChangeSubBtn && mainSettingsView && themeChangeSubView) {
        openThemeChangeSubBtn.addEventListener('click', () => {
            mainSettingsView.style.display = 'none';
            themeChangeSubView.style.display = 'block';
        });
    }

    if (closeThemeChangeSubBtn && mainSettingsView && themeChangeSubView) {
        closeThemeChangeSubBtn.addEventListener('click', () => {
            themeChangeSubView.style.display = 'none';
            mainSettingsView.style.display = 'block';
        });
    }

    // 3. 비밀번호 재설정 관련 로직
    const openPasswordResetSubBtn = document.getElementById('openPasswordResetSubBtn');
    const closePasswordResetSubBtn = document.getElementById('closePasswordResetSubBtn');
    const passwordResetSubView = document.getElementById('passwordResetSubView');

    if (openPasswordResetSubBtn && mainSettingsView && passwordResetSubView) {
        openPasswordResetSubBtn.addEventListener('click', () => {
            mainSettingsView.style.display = 'none';
            passwordResetSubView.style.display = 'block';
        });
    }

    if (closePasswordResetSubBtn && mainSettingsView && passwordResetSubView) {
        closePasswordResetSubBtn.addEventListener('click', () => {
            passwordResetSubView.style.display = 'none';
            mainSettingsView.style.display = 'block';
        });
    }

    const sendResetCodeBtn = document.getElementById('sendResetCodeBtn');
    if (sendResetCodeBtn) {
        sendResetCodeBtn.addEventListener('click', async () => {
            const emailInput = document.getElementById('resetEmail');
            const email = emailInput ? emailInput.value.trim() : '';

            if (!email || !email.includes('@')) {
                window.appAlert('유효한 이메일을 입력해 주세요.');
                return;
            }

            const originalText = sendResetCodeBtn.textContent;
            sendResetCodeBtn.textContent = '전송 중...';
            sendResetCodeBtn.disabled = true;

            try {
                const response = await apiFetch('/api/auth/request-password-reset', {
                    method: 'POST',
                    body: JSON.stringify({ email })
                });
                const result = await response.json();

                if (result.success) {
                    window.appAlert(result.message || '인증번호가 발송되었습니다.');
                    // UI 변경: 인증번호 입력 단계 노출, 이메일 변경 불가
                    document.getElementById('pwdResetStep1').style.display = 'none';
                    document.getElementById('pwdResetStep2').style.display = 'block';
                    if (emailInput) {
                        emailInput.readOnly = true;
                        emailInput.style.background = '#f8f9fa';
                    }
                } else {
                    window.appAlert(result.message || '인증번호 전송에 실패했습니다.');
                }
            } catch (error) {
                console.error('인증번호 요청 에러:', error);
                window.appAlert('서버 오류가 발생했습니다.');
            } finally {
                sendResetCodeBtn.textContent = originalText;
                sendResetCodeBtn.disabled = false;
            }
        });
    }

    const verifyAndResetPwdBtn = document.getElementById('verifyAndResetPwdBtn');
    if (verifyAndResetPwdBtn) {
        verifyAndResetPwdBtn.addEventListener('click', async () => {
            const email = document.getElementById('resetEmail').value.trim();
            const code = document.getElementById('resetCode').value.trim();
            const newPassword = document.getElementById('resetNewPassword').value;

            if (!code) {
                window.appAlert('인증번호를 입력해 주세요.');
                return;
            }
            if (!newPassword || newPassword.length < 4) {
                window.appAlert('새 비밀번호는 4자 이상이어야 합니다.');
                return;
            }

            const originalText = verifyAndResetPwdBtn.textContent;
            verifyAndResetPwdBtn.textContent = '처리 중...';
            verifyAndResetPwdBtn.disabled = true;

            try {
                const response = await apiFetch('/api/auth/verify-password-reset', {
                    method: 'POST',
                    body: JSON.stringify({ email, code, newPassword })
                });
                const result = await response.json();

                if (result.success) {
                    window.appAlert('비밀번호가 성공적으로 변경되었습니다!');
                    window.location.reload();
                } else {
                    window.appAlert(result.message || '비밀번호 변경에 실패했습니다.');
                }
            } catch (error) {
                console.error('비밀번호 변경 에러:', error);
                window.appAlert('서버 통신 중 오류가 발생했습니다.');
            } finally {
                verifyAndResetPwdBtn.textContent = originalText;
                verifyAndResetPwdBtn.disabled = false;
            }
        });
    }

    // 비밀번호 설정 버튼 (모달이 아닌 별도 비밀번호 설정 플로우 유지 - 필요시 유지)
    const setPasswordBtn = document.getElementById('setPasswordBtn');
    if (setPasswordBtn) {
        setPasswordBtn.onclick = async () => {
            // 비밀번호 설정 모달 표시
            const modalHtml = `
                <div id="setPasswordModal" style="
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.7); z-index: 10000;
                    display: flex; justify-content: center; align-items: center;
                ">
                    <div style="
                        background: #fff; border-radius: 12px; padding: 24px;
                        width: 90%; max-width: 400px; text-align: center;
                    ">
                        <h3 style="margin: 0 0 16px; color: #333;">비밀번호 설정</h4>
                        <p style="color: #666; margin-bottom: 20px;">
                            일반 로그인을 위해 아이디와 비밀번호를 설정하세요.<br>
                            설정 후에도 소셜 로그인은 계속 사용 가능합니다.
                        </p>
                        <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                            <input type="text" id="newLoginId" placeholder="로그인 ID (4자 이상)" style="
                                flex: 1; padding: 12px;
                                border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box;
                            ">
                            <button id="checkLoginIdBtn" style="
                                padding: 12px 16px; background: #6c757d;
                                color: white; border: none; border-radius: 8px;
                                cursor: pointer; white-space: nowrap;
                            ">중복확인</button>
                        </div>
                        <div id="loginIdCheckResult" style="
                            margin-bottom: 12px; font-size: 14px;
                            display: none; min-height: 20px;
                        "></div>
                        <input type="password" id="newPassword" placeholder="새 비밀번호 (4자 이상)" style="
                            width: 100%; padding: 12px; margin-bottom: 12px;
                            border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box;
                        ">
                        <input type="password" id="confirmPassword" placeholder="비밀번호 확인" style="
                            width: 100%; padding: 12px; margin-bottom: 20px;
                            border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box;
                        ">
                        <button id="doSetPasswordBtn" style="
                            width: 100%; padding: 14px; background: #28a745;
                            color: white; border: none; border-radius: 8px;
                            font-size: 16px; cursor: pointer;
                        ">설정하기</button>
                        <button id="cancelSetPasswordBtn" style="
                            width: 100%; padding: 10px; margin-top: 10px;
                            background: #f5f5f5; color: #666; border: none;
                            border-radius: 8px; cursor: pointer;
                        ">취소</button>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            let isLoginIdChecked = false;

            // setTimeout을 사용하여 DOM이 완전히 준비된 후 이벤트 리스너 연결
            setTimeout(() => {
                const checkBtn = document.getElementById('checkLoginIdBtn');
                const resultDiv = document.getElementById('loginIdCheckResult');
                const loginIdInput = document.getElementById('newLoginId');

                if (!checkBtn || !resultDiv || !loginIdInput) {
                    console.error('모달 요소를 찾을 수 없습니다.');
                    return;
                }

                console.log('[DEBUG] 중복 확인 버튼 이벤트 연결됨');

                // 중복 확인 버튼 이벤트
                checkBtn.addEventListener('click', async () => {
                    console.log('[DEBUG] 중복 확인 버튼 클릭됨');
                    const newLoginId = loginIdInput.value.trim();

                    // 방어 코드: resultDiv 요소 확인
                    const resultDiv = document.getElementById('loginIdCheckResult');
                    console.log('[DEBUG] resultDiv 요소 확인:', resultDiv);
                    if (!resultDiv) {
                        console.error('[DEBUG] loginIdCheckResult 요소를 찾을 수 없습니다!');
                        return;
                    }

                    // 요소 확인을 위한 상세 디버그 로그
                    console.log('[DEBUG] resultDiv.style.display (초기):', resultDiv.style.display);
                    console.log('[DEBUG] resultDiv.parentElement:', resultDiv.parentElement);

                    if (!newLoginId || newLoginId.length < 4) {
                        resultDiv.textContent = '✗ 아이디는 4자 이상이어야 합니다.';
                        resultDiv.style.color = '#dc3545';
                        resultDiv.style.display = 'block';
                        isLoginIdChecked = false;
                        console.log('[DEBUG] 4자 미만 입력 처리 완료');
                        return;
                    }

                     try {
                         const token = localStorage.getItem('mindmap_token') || sessionStorage.getItem('mindmap_token');
                         console.log('[DEBUG] 토큰 확인 시도: localStorage/sessionStorage에서 토큰 읽기');
                         if (token) {
                             console.log('[DEBUG] 토큰 값:', token.substring(0, 20) + '...');
                         } else {
                             console.log('[DEBUG] 토큰이 없습니다. 로그인이 필요합니다.');
                             window.appAlert('로그인이 필요합니다');
                             return;
                         }
                         console.log('[DEBUG] API 호출 시작: /api/auth/check-login-id?login_id=', newLoginId);
                         const response = await apiFetch(`/api/auth/check-login-id?login_id=${encodeURIComponent(newLoginId)}`, {
                             method: 'GET',
                             headers: { 'Authorization': `Bearer ${token}` }
                         });
                         console.log('[DEBUG] API 호출 완료 - 상태 코드:', response.status);
                         const result = await response.json();
                         console.log('[DEBUG] 응답 데이터 전체:', result);
                         console.log('[DEBUG] 중복 확인 결과 - available:', result.available);

                         if (result.available) {
                             resultDiv.textContent = '✓ 사용 가능한 ID입니다';
                             resultDiv.style.color = '#28a745';
                             resultDiv.style.fontWeight = 'bold';
                             resultDiv.style.display = 'block';
                             isLoginIdChecked = true;
                             console.log('[DEBUG] 사용 가능한 ID - UI 업데이트 완료');
                         } else {
                             resultDiv.textContent = '✗ 이미 사용 중인 ID입니다';
                             resultDiv.style.color = '#dc3545';
                             resultDiv.style.fontWeight = 'bold';
                             resultDiv.style.display = 'block';
                             isLoginIdChecked = false;
                             console.log('[DEBUG] 중복된 ID - UI 업데이트 완료');
                         }

                         // 최종 상태 확인
                         console.log('[DEBUG] resultDiv.textContent (최종):', resultDiv.textContent);
                         console.log('[DEBUG] resultDiv.style.display (최종):', resultDiv.style.display);
                         console.log('[DEBUG] resultDiv.style.color (최종):', resultDiv.style.color);
                     } catch (error) {
                         console.error('[DEBUG] API 호출 중 오류 발생:', error);
                         console.error('[DEBUG] 오류 상세 정보:', error.message, error.stack);
                         resultDiv.textContent = '중복 확인 중 오류가 발생했습니다.';
                         resultDiv.style.color = '#dc3545';
                         resultDiv.style.display = 'block';
                         isLoginIdChecked = false;
                     }
                });

                // login_id 입력 시 중복 확인 상태 초기화
                loginIdInput.addEventListener('input', () => {
                    isLoginIdChecked = false;
                    const resultDiv = document.getElementById('loginIdCheckResult');
                    if (resultDiv) {
                        resultDiv.textContent = '';
                        resultDiv.style.display = 'none';
                    }
                });
            }, 100);

            document.getElementById('doSetPasswordBtn').addEventListener('click', async () => {
                const newLoginId = document.getElementById('newLoginId').value.trim();
                const newPassword = document.getElementById('newPassword').value;
                const confirmPassword = document.getElementById('confirmPassword').value;

                if (!newLoginId || newLoginId.length < 4) {
                    window.appAlert('아이디는 4자 이상이어야 합니다.');
                    return;
                }

                if (!isLoginIdChecked) {
                    window.appAlert('아이디 중복 확인을 해주세요.');
                    return;
                }

                if (!newPassword || newPassword.length < 4) {
                    window.appAlert('비밀번호는 4자 이상이어야 합니다.');
                    return;
                }

                if (newPassword !== confirmPassword) {
                    window.appAlert('비밀번호가 일치하지 않습니다.');
                    return;
                }

                try {
                    const token = localStorage.getItem('mindmap_token') || sessionStorage.getItem('mindmap_token');
                    const response = await apiFetch('/api/auth/settings', {
                        method: 'PATCH',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ newLoginId, newPassword })
                    });
                    const result = await response.json();

                    document.getElementById('setPasswordModal').remove();

                    if (result.success) {
                        window.appAlert(result.message);
                        window.location.reload();
                    } else {
                        window.appAlert(result.message || '설정에 실패했습니다.');
                    }
                } catch (error) {
                    window.appAlert('서버와 통신할 수 없습니다.');
                }
            });

            document.getElementById('cancelSetPasswordBtn').addEventListener('click', () => {
                document.getElementById('setPasswordModal').remove();
            });
        };
    }

    // ── 건강 정보 서브 뷰 ──────────────────────────────────────────
    const openHealthInfoSubBtn = document.getElementById('openHealthInfoSubBtn');
    const closeHealthInfoSubBtn = document.getElementById('closeHealthInfoSubBtn');
    const healthInfoSubView = document.getElementById('healthInfoSubView');

    /**
     * 서버에서 건강 정보를 불러와 뱃지를 갱신하고 데이터를 반환합니다.
     * 영양제 위젯 등 다른 위젯에서도 window.loadUserHealthInfo() 로 호출 가능합니다.
     */
    const loadHealthInfo = async () => {
        const badge = document.getElementById('healthInfoBadge');
        try {
            const token = localStorage.getItem('mindmap_token') || sessionStorage.getItem('mindmap_token');
            if (!token) {
                if (badge) { badge.textContent = '미입력'; badge.style.background = '#fff3cd'; badge.style.color = '#856404'; }
                return null;
            }
            const res = await apiFetch('/api/auth/health-info', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success && data.healthInfo && Object.keys(data.healthInfo).some(k => data.healthInfo[k])) {
                if (badge) { badge.textContent = '입력됨 ✓'; badge.style.background = '#d4edda'; badge.style.color = '#155724'; }
                return data.healthInfo;
            } else {
                if (badge) { badge.textContent = '미입력'; badge.style.background = '#fff3cd'; badge.style.color = '#856404'; }
                return null;
            }
        } catch (e) {
            if (badge) { badge.textContent = '오류'; badge.style.background = '#f8d7da'; badge.style.color = '#721c24'; }
            return null;
        }
    };

    // 전역으로 노출하여 다른 위젯에서도 사용 가능
    window.loadUserHealthInfo = loadHealthInfo;

    // 모달 열릴 때 건강 정보 상태 로딩 (userProfileBtn 클릭 시)
    const userProfileBtnForHealth = document.getElementById('userProfileBtn');
    if (userProfileBtnForHealth) {
        userProfileBtnForHealth.addEventListener('click', () => loadHealthInfo());
    }
    // 페이지 로드 시 한 번 로딩
    loadHealthInfo();

    // 성별 선택에 따라 임신 여부 행 표시/숨김
    const setupGenderToggle = () => {
        const maleRadio = document.getElementById('healthGenderMale');
        const femaleRadio = document.getElementById('healthGenderFemale');
        const pregnancyRow = document.getElementById('healthPregnancyRow');
        [maleRadio, femaleRadio].forEach(r => {
            if (!r) return;
            r.addEventListener('change', () => {
                const isFemale = femaleRadio && femaleRadio.checked;
                if (pregnancyRow) pregnancyRow.style.display = isFemale ? 'block' : 'none';
                if (!isFemale) {
                    const pregnantNo = document.getElementById('healthPregnantNo');
                    if (pregnantNo) pregnantNo.checked = true;
                }
            });
        });
    };

    // 서브 뷰 열기 + 기존 데이터 불러와 폼 채우기
    if (openHealthInfoSubBtn && mainSettingsView && healthInfoSubView) {
        openHealthInfoSubBtn.addEventListener('click', async () => {
            mainSettingsView.style.display = 'none';
            healthInfoSubView.style.display = 'block';
            setupGenderToggle();

            const healthInfo = await loadHealthInfo();
            if (healthInfo) {
                const maleRadio = document.getElementById('healthGenderMale');
                const femaleRadio = document.getElementById('healthGenderFemale');
                const pregnancyRow = document.getElementById('healthPregnancyRow');

                if (healthInfo.gender === 'male' && maleRadio) maleRadio.checked = true;
                if (healthInfo.gender === 'female' && femaleRadio) {
                    femaleRadio.checked = true;
                    if (pregnancyRow) pregnancyRow.style.display = 'block';
                }

                const birthYear = document.getElementById('healthBirthYear');
                const birthMonth = document.getElementById('healthBirthMonth');
                const birthDay = document.getElementById('healthBirthDay');
                if (birthYear && healthInfo.birthYear) birthYear.value = healthInfo.birthYear;
                if (birthMonth && healthInfo.birthMonth) birthMonth.value = healthInfo.birthMonth;
                if (birthDay && healthInfo.birthDay) birthDay.value = healthInfo.birthDay;

                if (healthInfo.gender === 'female') {
                    const pregnantYes = document.getElementById('healthPregnantYes');
                    const pregnantNo = document.getElementById('healthPregnantNo');
                    if (healthInfo.isPregnant === 'yes' && pregnantYes) pregnantYes.checked = true;
                    else if (pregnantNo) pregnantNo.checked = true;
                }

                const weightInput = document.getElementById('healthWeight');
                const heightInput = document.getElementById('healthHeight');
                if (weightInput && healthInfo.weight) weightInput.value = healthInfo.weight;
                if (heightInput && healthInfo.height) heightInput.value = healthInfo.height;
            }
        });
    }

    // 서브 뷰 닫기
    if (closeHealthInfoSubBtn && mainSettingsView && healthInfoSubView) {
        closeHealthInfoSubBtn.addEventListener('click', () => {
            healthInfoSubView.style.display = 'none';
            mainSettingsView.style.display = 'block';
        });
    }

    // 건강 정보 저장
    const submitHealthInfoBtn = document.getElementById('submitHealthInfoBtn');
    if (submitHealthInfoBtn) {
        submitHealthInfoBtn.addEventListener('click', async () => {
            const token = localStorage.getItem('mindmap_token') || sessionStorage.getItem('mindmap_token');
            if (!token) { window.appAlert('로그인이 필요합니다.'); return; }

            const maleRadio = document.getElementById('healthGenderMale');
            const femaleRadio = document.getElementById('healthGenderFemale');
            const gender = femaleRadio && femaleRadio.checked ? 'female' : (maleRadio && maleRadio.checked ? 'male' : '');

            const birthYear = document.getElementById('healthBirthYear')?.value || '';
            const birthMonth = document.getElementById('healthBirthMonth')?.value || '';
            const birthDay = document.getElementById('healthBirthDay')?.value || '';

            const pregnantYes = document.getElementById('healthPregnantYes');
            const isPregnant = (gender === 'female' && pregnantYes && pregnantYes.checked) ? 'yes' : 'no';

            const weight = document.getElementById('healthWeight')?.value || '';
            const height = document.getElementById('healthHeight')?.value || '';

            const msgEl = document.getElementById('healthInfoMsg');
            submitHealthInfoBtn.disabled = true;
            submitHealthInfoBtn.textContent = '저장 중...';

            try {
                const res = await apiFetch('/api/auth/health-info', {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ gender, birthYear, birthMonth, birthDay, isPregnant: gender === 'female' ? isPregnant : 'no', weight, height })
                });
                const result = await res.json();
                if (result.success) {
                    if (msgEl) { msgEl.textContent = '✓ 저장되었습니다!'; msgEl.style.color = '#155724'; }
                    await loadHealthInfo();
                    setTimeout(() => {
                        if (healthInfoSubView) healthInfoSubView.style.display = 'none';
                        if (mainSettingsView) mainSettingsView.style.display = 'block';
                        if (msgEl) msgEl.textContent = '';
                    }, 1000);
                } else {
                    if (msgEl) { msgEl.textContent = result.message || '저장에 실패했습니다.'; msgEl.style.color = '#721c24'; }
                }
            } catch (e) {
                if (msgEl) { msgEl.textContent = '서버 통신 오류가 발생했습니다.'; msgEl.style.color = '#721c24'; }
            } finally {
                submitHealthInfoBtn.disabled = false;
                submitHealthInfoBtn.textContent = '저장하기';
            }
        });
    }

    // 모달 닫힐 때 건강 정보 서브뷰도 초기화
    const origCloseSettings = closeSettingsModal;
    const closeSettingsWithHealth = () => {
        origCloseSettings();
        if (healthInfoSubView) healthInfoSubView.style.display = 'none';
    };
    // 기존 닫기 버튼들에 재등록 (위에서 이미 등록했으나 health 초기화 추가)
    // closeSettingsModal 내부에서 healthInfoSubView 처리되도록 closeSettingsModal 재정의
}

/**
 * 모든 위젯을 한 번에 접거나 펴는 기능을 초기화합니다.
 */
function initCollapseAll() {
    const collapseAllBtn = document.getElementById('collapseAllBtn');
    if (!collapseAllBtn) return;

    collapseAllBtn.onclick = () => {
        const widgets = document.querySelectorAll('.draggable-widget');
        if (widgets.length === 0) return;

        // 하나라도 펼쳐진 위젯이 있는지 확인
        const anyExpanded = Array.from(widgets).some(w => !w.classList.contains('collapsed'));
        const plat = window.innerWidth <= 768 ? 'mobile' : 'pc';

        widgets.forEach(w => {
            const widgetId = w.dataset.id;
            if (anyExpanded) {
                // 모두 접기
                w.classList.add('collapsed');
                if (widgetId) {
                    localStorage.setItem(`todo_collapsed_${plat}_${widgetId}`, 'true');
                    localStorage.setItem(`milestone_collapsed_${plat}_${widgetId}`, 'true');
                    localStorage.setItem(`recipe_collapsed_${plat}_${widgetId}`, 'true');
                }
            } else {
                // 모두 펴기
                w.classList.remove('collapsed');
                if (widgetId) {
                    localStorage.setItem(`todo_collapsed_${plat}_${widgetId}`, 'false');
                    localStorage.setItem(`milestone_collapsed_${plat}_${widgetId}`, 'false');
                    localStorage.setItem(`recipe_collapsed_${plat}_${widgetId}`, 'false');
                }
            }
        });

        // 버튼 텍스트 변경
        collapseAllBtn.textContent = anyExpanded ? '모두 펴기' : '모두 접기';
        
        // 변경된 접기 상태를 현재 활성 커스텀 레이아웃 데이터에 동기화
        import('./dashboard-grid.js').then(m => {
            if (m.saveLayout) m.saveLayout();
        });
        
        // 햅틱 피드백
        if (window.navigator.vibrate) window.navigator.vibrate(5);
    };
}

/**
 * 대시보드 배율(Zoom) 모듈 초기화
 */
async function initZoomControl() {
    const desktopControl = document.getElementById('desktopZoomControl');
    const mobileBtn = document.getElementById('mobileZoomBtn');
    const mobilePopup = document.getElementById('mobileZoomPopup');
    if (!desktopControl && !mobileBtn) return;

    let zoomLevel = 1.0;
    const ZOOM_STEP = 0.1;
    const MIN_ZOOM = 0.5;
    const MAX_ZOOM = 2.0;

    const contentArea = document.getElementById('dashboardContent') || document.querySelector('.dashboard-content');
    if (!contentArea) return;

    // UI 요소 캐싱
    const dZoomIn = document.getElementById('zoomInBtn');
    const dZoomOut = document.getElementById('zoomOutBtn');
    const dZoomText = document.getElementById('zoomLevelText');
    
    const mZoomIn = document.getElementById('mZoomInBtn');
    const mZoomOut = document.getElementById('mZoomOutBtn');
    const mZoomText = document.getElementById('mZoomLevelText');
    const mZoomBtnText = document.getElementById('mobileZoomText');
    const mZoomReset = document.getElementById('mZoomResetBtn');

    // 서버에 배율 상태 저장 (디바운스 적용)
    let saveTimeout;
    const saveZoomLevel = (zoom) => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            const token = localStorage.getItem('mindmap_token') || sessionStorage.getItem('mindmap_token');
            if (token) {
                try {
                    await apiFetch('/api/auth/zoom-info', {
                        method: 'PATCH',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ dashboardZoom: zoom })
                    });
                } catch (e) {
                    console.error('줌 레벨 저장 실패:', e);
                }
            }
        }, 1000);
    };

    // 실제 화면에 줌 적용하고 UI 텍스트 갱신하는 함수
    const applyZoom = (zoom, doSave = true) => {
        // 소수점 1자리로 클리핑 및 범위 제한
        zoom = Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
        zoom = Math.round(zoom * 10) / 10;
        zoomLevel = zoom;

        // 적용
        contentArea.style.zoom = zoomLevel.toString();
        window.dashboardZoom = zoomLevel; // 전역 스코프에 노출하여 드래그/마우스 이벤트에서 참조하게 함

        // 텍스트 업데이트
        const textValue = Math.round(zoomLevel * 100) + '%';
        if (dZoomText) dZoomText.textContent = textValue;
        if (mZoomText) mZoomText.textContent = textValue;
        if (mZoomBtnText) mZoomBtnText.textContent = textValue;

        if (doSave) saveZoomLevel(zoomLevel);
    };

    // 서버(또는 임시 저장)에서 초기 배율 가져오기
    const loadInitialZoom = async () => {
        const token = localStorage.getItem('mindmap_token') || sessionStorage.getItem('mindmap_token');
        if (token) {
            try {
                const res = await apiFetch('/api/auth/zoom-info', { headers: { 'Authorization': `Bearer ${token}` } });
                const data = await res.json();
                if (data.success && data.dashboardZoom) {
                    applyZoom(parseFloat(data.dashboardZoom), false);
                }
            } catch (e) {
                console.error('초기 줌 레벨 로드 실패:', e);
            }
        }
    };

    await loadInitialZoom();

    // === 이벤트 핸들러 등록 ===

    const zoomIn = () => applyZoom(zoomLevel + ZOOM_STEP);
    const zoomOut = () => applyZoom(zoomLevel - ZOOM_STEP);
    const resetZoom = () => applyZoom(1.0);

    if (dZoomIn) dZoomIn.onclick = zoomIn;
    if (dZoomOut) dZoomOut.onclick = zoomOut;
    if (dZoomText) dZoomText.onclick = resetZoom;

    if (mZoomIn) mZoomIn.onclick = zoomIn;
    if (mZoomOut) mZoomOut.onclick = zoomOut;
    if (mZoomReset) mZoomReset.onclick = resetZoom;

    // 모바일 팝업 토글 로직
    if (mobileBtn && mobilePopup) {
        mobileBtn.onclick = (e) => {
            e.stopPropagation();
            if (mobilePopup.style.display === 'none') {
                mobilePopup.style.display = 'flex';
                // 팝업이 열릴 때 버튼 위치에 맞추기 위해 약간의 트윅
                const rect = mobileBtn.getBoundingClientRect();
                mobilePopup.style.top = (rect.bottom + 10) + 'px';
            } else {
                mobilePopup.style.display = 'none';
            }
        };

        // 바깥 클릭 시 닫기
        document.addEventListener('click', (e) => {
            if (mobilePopup.style.display === 'flex' && !mobilePopup.contains(e.target) && !mobileBtn.contains(e.target)) {
                mobilePopup.style.display = 'none';
            }
        });
    }
}
