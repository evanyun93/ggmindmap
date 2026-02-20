/**
 * @file api.js
 * @description 백엔드 API와의 통신을 위한 기본 설정을 관리합니다.
 */

export const API_BASE = window.location.origin;

/**
 * 전역 인증 헤더를 포함한 fetch 헬퍼 (필요시 확장 가능)
 * @param {string} endpoint - API 엔드포인트
 * @param {object} options - fatch 옵션
 */
export async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('mindmap_token') || sessionStorage.getItem('mindmap_token');

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
    });

    return response;
}
