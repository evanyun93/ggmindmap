/**
 * @file auth.js
 * @description 유저 인증(로그인, 회원가입, 토큰 확인 등) 프로세스를 담당합니다.
 */

import { apiFetch } from './api.js';
import { safeLocalStorage, safeSessionStorage } from '../utils/storage.js';

/**
 * 저장된 토큰을 확인하여 자동 로그인을 시도합니다.
 * @returns {Promise<object|null>} 유저 정보 또는 null
 */
export async function checkAutoLogin() {
    const token = safeLocalStorage.getItem('token') || safeLocalStorage.getItem('mindmap_token') ||
        safeSessionStorage.getItem('token') || safeSessionStorage.getItem('mindmap_token');
    if (!token) return null;

    try {
        const res = await apiFetch('/api/auth/verify');
        if (res.ok) {
            const data = await res.json();
            return data.user;
        } else {
            clearTokens();
        }
    } catch (err) {
        console.error('자동 로그인 확인 중 오류:', err);
    }
    return null;
}

/**
 * 로그인을 요청합니다.
 * @param {string} username 
 * @param {string} password 
 * @param {boolean} rememberMe 
 */
export async function login(login_id, password, rememberMe) {
    try {
        const res = await apiFetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ login_id, password })
        });

        const data = await res.json();
        if (data.success) {
            if (rememberMe) {
                safeLocalStorage.setItem('token', data.token);
                safeLocalStorage.setItem('mindmap_token', data.token);
            } else {
                safeSessionStorage.setItem('token', data.token);
                safeSessionStorage.setItem('mindmap_token', data.token);
            }
        }
        return data;
    } catch (err) {
        return { success: false, message: '서버에 연결할 수 없습니다.' };
    }
}

/**
 * 회원가입을 요청합니다.
 * @param {object} userData 
 */
export async function register(userData) {
    try {
        const res = await apiFetch('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
        return await res.json();
    } catch (err) {
        return { success: false, message: '서버에 연결할 수 없습니다.' };
    }
}

/**
 * 로그아웃 처리를 합니다.
 */
export async function logout() {
    try {
        await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
        console.warn('[Auth] 서버 로그아웃 요청 실패 (무시하고 로컬 정리 진행):', err);
    }
    clearTokens();
    location.reload();
}

/**
 * 저장된 인증 토큰을 삭제합니다.
 */
export function clearTokens() {
    safeLocalStorage.removeItem('token');
    safeLocalStorage.removeItem('mindmap_token');
    safeSessionStorage.removeItem('token');
    safeSessionStorage.removeItem('mindmap_token');
}

/**
 * 이메일 인증 및 업데이트 프로세스를 진행합니다 (Prompt 기반)
 * @returns {Promise<boolean>} 성공 여부
 */
export async function verifyAndUpdateEmail() {
    // 1. 이메일 형식 검사 정규식
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    const email = window.prompt("이메일이 설정되어 있지 않습니다.\n답변을 받으시려면 메일주소를 입력해주세요:");
    if (!email) return false;

    if (!emailRegex.test(email)) {
        window.appAlert('올바른 이메일 형식이 아닙니다. (예: example@mail.com)');
        return false;
    }

    try {
        // 1. 인증번호 발송 요청
        const reqRes = await apiFetch('/api/auth/request-email-verify', {
            method: 'POST',
            body: JSON.stringify({ email })
        });

        // JSON 응답인지 확인
        const contentType = reqRes.headers.get("content-type");
        if (!reqRes.ok || !contentType || !contentType.includes("application/json")) {
            const errorText = await reqRes.text();
            console.error('인증번호 발송 실패 응답:', errorText);
            window.appAlert(`인증번호 발송 중 오류가 발생했습니다. (상태 코드: ${reqRes.status})\n서버 설정을 확인해주세요.`);
            return false;
        }

        const reqData = await reqRes.json();

        if (!reqData.success) {
            window.appAlert(reqData.message || '인증번호 발송에 실패했습니다.');
            return false;
        }

        // 2. 인증번호 입력 받기
        const code = window.prompt(`${email}로 인증번호가 발송되었습니다.\n전송된 6자리 번호를 입력해주세요:`);
        if (!code) return false;

        // 3. 인증번호 검증 및 업데이트
        const verRes = await apiFetch('/api/auth/verify-email-update', {
            method: 'POST',
            body: JSON.stringify({ email, code })
        });

        const verContentType = verRes.headers.get("content-type");
        if (!verRes.ok || !verContentType || !verContentType.includes("application/json")) {
            const errorText = await verRes.text();
            console.error('인증 검증 실패 응답:', errorText);
            window.appAlert(`인증 처리 중 오류가 발생했습니다. (상태 코드: ${verRes.status})`);
            return false;
        }

        const verData = await verRes.json();

        if (verData.success) {
            window.appAlert('이메일이 성공적으로 등록되었습니다!');
            // 전역 사용자 정보 업데이트 (필요 시)
            if (window.currentUser) {
                window.currentUser.email = email;
            }
            return true;
        } else {
            window.appAlert(verData.message || '인증에 실패했습니다.');
            return false;
        }
    } catch (err) {
        console.error('이메일 인증 프로세스 에러:', err);
        window.appAlert(`서버와의 통신 중 오류가 발생했습니다: ${err.message}`);
        return false;
    }
}
