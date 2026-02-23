/**
 * @file social-auth.js
 * @description 카카오 및 네이버 소셜 로그인 SDK 연동 및 인증 처리를 담당합니다.
 */

import { apiFetch } from './api.js';

// ⚠️ 보안을 위해 키 값은 백엔드 .env 및 API를 통해 동적으로 로드합니다.
let KAKAO_JS_KEY = null;
let NAVER_CLIENT_ID = null;
let currentMode = 'login'; // 'login' 또는 'link'

/**
 * 소셜 로그인 초기화
 */
export async function initSocialAuth() {
    // 1. 버튼 이벤트 먼저 연결 (로그인 화면용)
    const kakaoBtn = document.getElementById('kakaoLoginBtn');
    const naverBtn = document.getElementById('naverLoginBtn');

    if (kakaoBtn) kakaoBtn.addEventListener('click', () => { currentMode = 'login'; loginWithKakao(); });
    if (naverBtn) naverBtn.addEventListener('click', () => { currentMode = 'login'; loginWithNaver(); });

    // 2. 대시보드 내 연동 버튼 연결
    const linkKakaoBtn = document.getElementById('linkKakaoBtn');
    const linkNaverBtn = document.getElementById('linkNaverBtn');

    if (linkKakaoBtn) linkKakaoBtn.addEventListener('click', () => { currentMode = 'link'; loginWithKakao(); });
    if (linkNaverBtn) linkNaverBtn.addEventListener('click', () => { currentMode = 'link'; loginWithNaver(); });

    try {
        // 3. 백엔드에서 공개 키 정보 가져오기
        const configRes = await apiFetch('/api/config/social');
        if (!configRes.ok) throw new Error('Config API failed');

        const config = await configRes.json();
        if (!config.success) return;

        KAKAO_JS_KEY = config.kakaoJsKey;
        NAVER_CLIENT_ID = config.naverClientId;

        // 4. SDK 로드 (키가 있을 때만)
        if (KAKAO_JS_KEY) {
            const script = document.createElement('script');
            script.src = 'https://developers.kakao.com/sdk/js/kakao.min.js';
            script.onload = () => {
                if (window.Kakao && !window.Kakao.isInitialized()) {
                    window.Kakao.init(KAKAO_JS_KEY);
                }
            };
            document.head.appendChild(script);
        }

        if (NAVER_CLIENT_ID) {
            const script = document.createElement('script');
            script.src = 'https://static.nid.naver.com/js/naveridlogin_js_sdk_2.0.2.js';
            document.head.appendChild(script);
        }
    } catch (err) {
        console.error('소셜 초기화 실패:', err);
    }
}

/**
 * 카카오 로그인 실행
 */
function loginWithKakao() {
    if (!KAKAO_JS_KEY) { alert('💡 설정을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.'); return; }
    if (typeof Kakao === 'undefined') { alert('💡 SDK가 로드되지 않았습니다.'); return; }

    if (!Kakao.isInitialized()) Kakao.init(KAKAO_JS_KEY);

    Kakao.Auth.login({
        success: function (authObj) {
            Kakao.API.request({
                url: '/v2/user/me',
                success: async function (res) {
                    let nickname = '카카오 사용자';
                    if (res.kakao_account?.profile?.nickname) nickname = res.kakao_account.profile.nickname;
                    else if (res.properties?.nickname) nickname = res.properties.nickname;

                    await processSocialLogin({
                        socialId: res.id.toString(),
                        provider: 'kakao',
                        displayName: nickname,
                        username: `kakao_${res.id}`
                    });
                }
            });
        },
        fail: (err) => { console.error(err); alert('로그인 실패'); }
    });
}

/**
 * 네이버 로그인 실행
 */
function loginWithNaver() {
    if (!NAVER_CLIENT_ID) { alert('💡 설정을 확인해 주세요.'); return; }
    const url = `https://nid.naver.com/oauth2.0/authorize?response_type=token&client_id=${NAVER_CLIENT_ID}&redirect_uri=${encodeURIComponent(window.location.origin)}&state=STATE_STRING`;
    window.open(url, 'naverLoginPopup', 'width=500,height=600');
}

/**
 * 네이버 콜백 처리
 */
export async function checkNaverCallback() {
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get('access_token');
        if (accessToken && window.opener) {
            window.opener.postMessage({ type: 'NAVER_LOGIN', token: accessToken }, window.location.origin);
            window.close();
        }
    }
}

// 팝업 메시지 리스너
window.addEventListener('message', async (e) => {
    if (e.origin !== window.location.origin) return;
    if (e.data && e.data.type === 'NAVER_LOGIN') {
        await processSocialLogin({
            socialId: 'naver_user_' + Math.random().toString(36).substring(7),
            provider: 'naver',
            displayName: '네이버 사용자',
            username: 'naver_' + Date.now()
        });
    }
});

/**
 * 백엔드 서버에 소셜 로그인 또는 연동 정보 전송
 */
async function processSocialLogin(socialData) {
    try {
        const endpoint = currentMode === 'link' ? '/api/auth/link-social' : '/api/auth/social-login';
        const response = await apiFetch(endpoint, {
            method: 'POST',
            body: JSON.stringify(socialData)
        });
        const result = await response.json();

        if (result.success) {
            if (currentMode === 'login') {
                localStorage.setItem('mindmap_token', result.token);
            }
            alert(result.message);
            window.location.reload();
        } else {
            alert(result.message || '처리 중 오류가 발생했습니다.');
        }
    } catch (error) {
        console.error('인증 에러:', error);
        alert('서버와 통신할 수 없습니다.');
    }
}
