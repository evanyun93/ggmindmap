/**
 * @file api.js
 * @description 백엔드 API와의 통신을 위한 기본 설정을 관리합니다.
 */

// 로컬 환경(localhost)에서는 로컬 백엔드, 그 외( Vercel 등 배포 환경)에서는 오라클 서버 백엔드 사용
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
export const API_BASE = isLocal ? window.location.origin : 'http://146.56.111.45:3001';

/**
 * 전역 인증 헤더를 포함한 fetch 헬퍼 (필요시 확장 가능)
 * @param {string} endpoint - API 엔드포인트
 * @param {object} options - fatch 옵션
 */
export async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('token') || localStorage.getItem('mindmap_token') ||
        sessionStorage.getItem('token') || sessionStorage.getItem('mindmap_token');

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

/**
 * 관리자용 사용자 목록을 가져옵니다.
 * @param {string} token - 관리자 인증 토큰
 * @returns {Promise<object>}
 */
export async function fetchAdminUsers(token) {
    try {
        const res = await fetch(`${API_BASE}/api/auth/admin/users`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return await res.json();
    } catch (err) {
        console.error('관리자 데이터 호출 에러:', err);
        return { success: false, message: '서버 통신 실패' };
    }
}
