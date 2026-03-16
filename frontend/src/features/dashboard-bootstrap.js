/**
 * @file dashboard-bootstrap.js
 * @description 대시보드 부트스트랩(시각 효과/위젯/유틸리티 초기화)을 담당합니다.
 */

import { createParticles } from '../utils/effects.js';
import { logout } from '../services/auth.js';
import { apiFetch } from '../services/api.js';
import { setupManualPopup } from './manual-popup.js';
import { initMemo } from './memo.js';
import { initFeedback } from './feedback.js';
import { initMilestone } from './milestone.js';
import { initAdmin } from '../admin.js';

/**
 * 대시보드의 모든 동적 기능(메모, 피드백, 그리드 등)을 초기화합니다.
 * @param {object} user
 */
export function initDashboardFeatures(user) {
    console.log('[Init] 대시보드 피처 초기화 시작...');

    // 1. UI 및 시각 효과 레이어 초기화
    initVisualEffects();

    // 2. 개별 위젯 독립적 초기화
    initWidgets();

    // 3. 도구 및 메뉴 초기화
    initUtilities(user);

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

    // 지연 로딩 피처들
    import('./todo.js').then(module => module.initTodo());
    import('./dashboard-grid.js').then(module => module.initDashboardGrid());
}

/**
 * 네비게이션, 로그아웃, 관리 시스템 등 유틸리티 초기화
 */
function initUtilities() {
    setupManualPopup();

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
    if (logoutBtn) logoutBtn.onclick = logout;

    // 관리자 전용 기능 (Admin 계정 체크는 상위에서 수행)
    const adminBtn = document.getElementById('adminBtn');
    if (adminBtn) adminBtn.onclick = initAdmin;

    // 이메일 추가 버튼
    const addEmailBtn = document.getElementById('addEmailBtn');
    if (addEmailBtn) {
        addEmailBtn.onclick = async () => {
            const email = prompt('이메일을 입력해 주세요:');
            if (!email) return;
            if (!email.includes('@')) {
                alert('올바른 이메일을 입력해 주세요.');
                return;
            }
            try {
                const token = localStorage.getItem('mindmap_token') || sessionStorage.getItem('mindmap_token');
                console.log('[DEBUG] 토큰 확인 시도: localStorage/sessionStorage에서 토큰 읽기');
                if (token) {
                    console.log('[DEBUG] 토큰 값:', token.substring(0, 20) + '...');
                } else {
                    console.log('[DEBUG] 토큰이 없습니다. 로그인이 필요합니다.');
                    alert('로그인이 필요합니다');
                    return;
                }
                const response = await apiFetch('/api/auth/settings', {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ email })
                });
                const result = await response.json();
                if (result.success) {
                    alert('이메일이 저장되었습니다!');
                    window.location.reload();
                } else {
                    alert(result.message || '이메일 저장에 실패했습니다.');
                }
            } catch (error) {
                alert('서버와 통신할 수 없습니다.');
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
                alert('변경할 닉네임을 입력해 주세요.');
                return;
            }

            try {
                const token = localStorage.getItem('mindmap_token') || sessionStorage.getItem('mindmap_token');
                if (!token) {
                    alert('로그인이 필요합니다.');
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
                    alert('닉네임이 성공적으로 변경되었습니다!');
                    window.location.reload();
                } else {
                    alert(result.message || '닉네임 변경에 실패했습니다.');
                }
            } catch (error) {
                console.error('닉네임 변경 에러:', error);
                alert('서버와 통신할 수 없습니다.');
            } finally {
                submitNicknameBtn.disabled = false;
                submitNicknameBtn.textContent = '변경';
            }
        };
    }

    // 모달 닫기 버튼
    const closeSetupWarningBtn = document.getElementById('closeSetupWarningBtn');
    if (closeSetupWarningBtn) {
        closeSetupWarningBtn.addEventListener('click', () => {
            const modal = document.getElementById('setupWarningModal');
            if (modal) {
                modal.style.display = 'none';
                
                // 모달 닫힐 때 메인 뷰로 초기화 (다시 열 때를 대비)
                const mainView = document.getElementById('mainSettingsView');
                const pResetView = document.getElementById('passwordResetSubView');
                const nChangeView = document.getElementById('nicknameChangeSubView');
                const tChangeView = document.getElementById('themeChangeSubView');
                if (mainView) mainView.style.display = 'block';
                if (pResetView) pResetView.style.display = 'none';
                if (nChangeView) nChangeView.style.display = 'none';
                if (tChangeView) tChangeView.style.display = 'none';
            }
        });
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
                alert('유효한 이메일을 입력해 주세요.');
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
                    alert(result.message || '인증번호가 발송되었습니다.');
                    // UI 변경: 인증번호 입력 단계 노출, 이메일 변경 불가
                    document.getElementById('pwdResetStep1').style.display = 'none';
                    document.getElementById('pwdResetStep2').style.display = 'block';
                    if (emailInput) {
                        emailInput.readOnly = true;
                        emailInput.style.background = '#f8f9fa';
                    }
                } else {
                    alert(result.message || '인증번호 전송에 실패했습니다.');
                }
            } catch (error) {
                console.error('인증번호 요청 에러:', error);
                alert('서버 오류가 발생했습니다.');
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
                alert('인증번호를 입력해 주세요.');
                return;
            }
            if (!newPassword || newPassword.length < 4) {
                alert('새 비밀번호는 4자 이상이어야 합니다.');
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
                    alert('비밀번호가 성공적으로 변경되었습니다!');
                    window.location.reload();
                } else {
                    alert(result.message || '비밀번호 변경에 실패했습니다.');
                }
            } catch (error) {
                console.error('비밀번호 변경 에러:', error);
                alert('서버 통신 중 오류가 발생했습니다.');
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
                             alert('로그인이 필요합니다');
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
                    alert('아이디는 4자 이상이어야 합니다.');
                    return;
                }

                if (!isLoginIdChecked) {
                    alert('아이디 중복 확인을 해주세요.');
                    return;
                }

                if (!newPassword || newPassword.length < 4) {
                    alert('비밀번호는 4자 이상이어야 합니다.');
                    return;
                }

                if (newPassword !== confirmPassword) {
                    alert('비밀번호가 일치하지 않습니다.');
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
                        alert(result.message);
                        window.location.reload();
                    } else {
                        alert(result.message || '설정에 실패했습니다.');
                    }
                } catch (error) {
                    alert('서버와 통신할 수 없습니다.');
                }
            });

            document.getElementById('cancelSetPasswordBtn').addEventListener('click', () => {
                document.getElementById('setPasswordModal').remove();
            });
        };
    }
}

