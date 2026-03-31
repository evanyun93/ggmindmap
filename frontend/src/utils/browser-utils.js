/**
 * @file browser-utils.js
 * @description 인앱 브라우저 감지 및 외부 브라우저 호출 유틸리티
 */

/**
 * 현재 환경이 인앱 브라우저(웹뷰)인지 확인합니다.
 * @returns {boolean}
 */
export function isInAppBrowser() {
    const ua = navigator.userAgent.toLowerCase();
    return (
        ua.includes('kakaotalk') || 
        ua.includes('naver') || 
        ua.includes('line') || 
        ua.includes('fbav') || // Facebook
        ua.includes('instagram')
    );
}

/**
 * 현재 URL을 외부 기본 브라우저로 엽니다. (카카오톡 최적화)
 */
export function openInExternalBrowser() {
    const currentUrl = window.location.href;
    
    // 카카오톡 전용 외부 브라우저 열기 스킴
    if (navigator.userAgent.toLowerCase().includes('kakaotalk')) {
        window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(currentUrl)}`;
        return;
    }

    // 다른 웹뷰의 경우 클립보드 복사 안내 또는 일반적인 시도 (대부분 지원 안함)
    alert('우측 상단 메뉴(⋮)를 눌러 "다른 브라우저에서 열기"를 선택해주세요.');
}

/**
 * PWA 설치 가능 여부 확인 (기본 지원 브라우저 체크)
 */
export function isInstallableBrowser() {
    const ua = navigator.userAgent.toLowerCase();
    const isChrome = ua.includes('chrome') && !ua.includes('edge') && !ua.includes('opr');
    const isSafari = ua.includes('safari') && !ua.includes('chrome');
    const isEdge = ua.includes('edge') || ua.includes('edg');
    
    return (isChrome || isSafari || isEdge) && !isInAppBrowser();
}
