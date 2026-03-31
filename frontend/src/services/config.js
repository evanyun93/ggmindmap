/**
 * @file config.js
 * @description 애플리케이션 전역 설정 및 환경 변수를 관리합니다.
 * 이 파일은 Service Worker에서도 안전하게 임포트할 수 있도록 작성되었습니다.
 */

// self는 브라우저 메인 스레드(window)와 Service Worker 환경 모두에서 전역 객체를 가리킵니다.
// [Vercel 배포 환경 체크] 브라우저 호스팅이 Vercel일 때만 하드코딩된 ngrok 주소를 사용합니다.
const isVercel = self.location.hostname === 'ggmindmap.vercel.app';

export const API_BASE = isVercel
    ? 'https://unperturbable-fatherless-annamae.ngrok-free.dev'
    : self.location.origin;
