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

    // 비밀번호 설정 버튼
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
                            일반 로그인을 위해 비밀번호를 설정하세요.<br>
                            설정 후에도 소셜 로그인은 계속 사용 가능합니다.
                        </p>
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
                        ">비밀번호 설정</button>
                        <button id="cancelSetPasswordBtn" style="
                            width: 100%; padding: 10px; margin-top: 10px;
                            background: #f5f5f5; color: #666; border: none;
                            border-radius: 8px; cursor: pointer;
                        ">취소</button>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            document.getElementById('doSetPasswordBtn').addEventListener('click', async () => {
                const newPassword = document.getElementById('newPassword').value;
                const confirmPassword = document.getElementById('confirmPassword').value;

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
                        body: JSON.stringify({ newPassword })
                    });
                    const result = await response.json();

                    document.getElementById('setPasswordModal').remove();

                    if (result.success) {
                        alert(result.message);
                        window.location.reload();
                    } else {
                        alert(result.message || '비밀번호 설정에 실패했습니다.');
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

