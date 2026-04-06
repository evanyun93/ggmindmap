/**
 * @file config.js
 * @description 애플리케이션 전역 설정 및 환경 변수를 관리합니다.
 * 이 파일은 Service Worker에서도 안전하게 임포트할 수 있도록 작성되었습니다.
 */

// self는 브라우저 메인 스레드(window)와 Service Worker 환경 모두에서 전역 객체를 가리킵니다.
// [배포/로컬/IP 환경 자동 감지]
const hostname = self.location.hostname;
const isLocal = hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.');
const isDuckdnsDomain = hostname.includes('duckdns.org');

// 로컬 망이거나 백엔드(duckdns) 도메인으로 직접 접속했다면 현재 오리진을 쓰고, 
// 그 외의 프론트엔드 전용 호스팅(Vercel 등)이면 하드코딩된 백엔드 주소를 사용합니다.
export const API_BASE = (isLocal || isDuckdnsDomain)
    ? 'http://localhost:3000'
    : 'https://ggmindmap.duckdns.org';
