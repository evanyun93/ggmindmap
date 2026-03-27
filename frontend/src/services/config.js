/**
 * @file config.js
 * @description 애플리케이션 전역 설정 및 환경 변수를 관리합니다.
 * 이 파일은 Service Worker에서도 안전하게 임포트할 수 있도록 작성되었습니다.
 */

// self는 브라우저 메인 스레드(window)와 Service Worker 환경 모두에서 전역 객체를 가리킵니다.
const isLocal = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

/**
 * 백엔드 API 베이스 주소
 * 로컬 환경이면 현재 오리진을, 배포 환경이면 ngrok 주소를 사용합니다.
 */
export const API_BASE = isLocal
    ? self.location.origin
    : 'https://unperturbable-fatherless-annamae.ngrok-free.dev';
