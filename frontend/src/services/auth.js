/**
 * @file auth.js
 * @description 유저 인증(로그인, 회원가입, 토큰 확인 등) 프로세스를 담당합니다.
 */

import { apiFetch } from './api.js';

/**
 * 저장된 토큰을 확인하여 자동 로그인을 시도합니다.
 * @returns {Promise<object|null>} 유저 정보 또는 null
 */
export async function checkAutoLogin() {
    const token = localStorage.getItem('token') || localStorage.getItem('mindmap_token') ||
        sessionStorage.getItem('token') || sessionStorage.getItem('mindmap_token');
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
export async function login(username, password, rememberMe) {
    try {
        const res = await apiFetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        if (data.success) {
            if (rememberMe) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('mindmap_token', data.token);
            } else {
                sessionStorage.setItem('token', data.token);
                sessionStorage.setItem('mindmap_token', data.token);
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
export function logout() {
    clearTokens();
    location.reload();
}

/**
 * 저장된 인증 토큰을 삭제합니다.
 */
export function clearTokens() {
    localStorage.removeItem('token');
    localStorage.removeItem('mindmap_token');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('mindmap_token');
}
