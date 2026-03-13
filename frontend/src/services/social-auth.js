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
    // 1. 버튼 이벤트 연결 (로그인 화면용)
    const kakaoBtn = document.getElementById('kakaoLoginBtn');
    const naverBtn = document.getElementById('naverLoginBtn');

    if (kakaoBtn) kakaoBtn.addEventListener('click', () => { currentMode = 'login'; loginWithKakao(); });
    if (naverBtn) naverBtn.addEventListener('click', () => { currentMode = 'login'; loginWithNaver(); });

    // 2. 대시보드 내 연동 버튼 연결
    const linkKakaoBtn = document.getElementById('linkKakaoBtn');
    const linkNaverBtn = document.getElementById('linkNaverBtn');

    if (linkKakaoBtn) linkKakaoBtn.addEventListener('click', () => { currentMode = 'link'; loginWithKakao(); });
    if (linkNaverBtn) linkNaverBtn.addEventListener('click', () => { currentMode = 'link'; loginWithNaver(); });

    // 3. 대시보드에서 연동 버튼 처리 (이미 로그인된 상태에서 다른 소셜 연동)
    // 이 부분은 이제 사용 안 함 - 대신 직접 연동 API 호출
    const handleSocialLink = async (socialData) => {
        try {
            const token = localStorage.getItem('mindmap_token') || sessionStorage.getItem('mindmap_token');
            if (!token) {
                alert('로그인이 필요합니다.');
                return;
            }

            const response = await apiFetch('/api/auth/link-social', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(socialData)
            });
            const result = await response.json();

            if (result.success) {
                alert(result.message);
                window.location.reload();
            } else {
                alert(result.message || '연동 중 오류가 발생했습니다.');
            }
        } catch (error) {
            console.error('소셜 연동 에러:', error);
            alert('서버와 통신할 수 없습니다.');
        }
    };

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
                    let nickname = null;
                    if (res.kakao_account?.profile?.nickname) nickname = res.kakao_account.profile.nickname;
                    else if (res.properties?.nickname) nickname = res.properties.nickname;

                    // 이메일 가져오기 (있는 경우)
                    let email = null;
                    if (res.kakao_account?.email) email = res.kakao_account.email;

                    await processSocialLogin({
                        socialId: res.id.toString(),
                        provider: 'kakao',
                        displayName: nickname,
                        login_id: null,
                        email: email
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
        // 네이버 액세스 토큰을 백엔드 프록시를 통해 사용자 정보 가져오기
        try {
            // 백엔드 엔드포인트를 통해 Naver API 호출 (CORS 우회)
            const response = await apiFetch('/api/auth/naver-user-info', {
                method: 'POST',
                body: JSON.stringify({ accessToken: e.data.token })
            });
            const result = await response.json();
            
            if (result.success && result.data) {
                const naverUser = result.data;
                console.log('[Naver Login] Raw Naver API response:', naverUser);
                console.log('[Naver Login] Name:', naverUser.name);
                console.log('[Naver Login] Email:', naverUser.email);
                console.log('[Naver Login] Using socialId:', naverUser.id);
                
                // 이메일이 있어도 우선 로그인 시도 (백엔드에서 기존 계정 확인)
                // 백엔드가 자동으로 기존 계정 여부를 확인하고 처리
                await processSocialLogin({
                    socialId: naverUser.id,
                    provider: 'naver',
                    displayName: naverUser.name,
                    login_id: null,
                    email: naverUser.email || null
                });
            } else {
                alert(result.message || '네이버 로그인 정보를 가져올 수 없습니다.');
            }
        } catch (error) {
            console.error('네이버 사용자 정보 가져오기 실패:', error);
            alert('네이버 로그인 중 오류가 발생했습니다.\n\n잠시 후 다시 시도해 주세요.');
            return;
        }
    }
});

/**
 * 이메일 입력 모달 (네이버 이메일 권한이 없을 때)
 */
function showEmailInputModal(naverUser) {
    const modalHtml = `
        <div id="emailInputModal" style="
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.7); z-index: 10000;
            display: flex; justify-content: center; align-items: center;
        ">
            <div style="
                background: #fff; border-radius: 12px; padding: 24px;
                width: 90%; max-width: 400px; text-align: center;
            ">
                <h3 style="margin: 0 0 16px; color: #333;">이메일 입력</h3>
                <p style="color: #666; margin-bottom: 20px;">
                    네이버 이메일 권한이 필요합니다.<br>
                    사용하실 이메일을 입력해 주세요.
                </p>
                <input type="email" id="userEmail" placeholder="이메일 (예: user@naver.com)" style="
                    width: 100%; padding: 12px; margin-bottom: 20px;
                    border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box;
                ">
                <button id="submitEmailBtn" style="
                    width: 100%; padding: 14px; background: #03C75A;
                    color: white; border: none; border-radius: 8px;
                    font-size: 16px; cursor: pointer;
                ">확인</button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('submitEmailBtn').addEventListener('click', async () => {
        const email = document.getElementById('userEmail').value.trim();
        
        console.log('[Naver Login] Email submitted:', email, 'naverUser:', naverUser);
        
        if (!email || !email.includes('@')) {
            alert('올바른 이메일을 입력해 주세요.');
            return;
        }

        document.getElementById('emailInputModal').remove();

        // Naver ID는 고유하므로 이를 사용 (형식: naver_user_xxx)
        const naverId = 'naver_user_' + naverUser.id;
        console.log('[Naver Login] Using socialId from email modal:', naverId);

        await processSocialLogin({
            socialId: naverId,
            provider: 'naver',
            displayName: naverUser.nickname || displayName,
            login_id: null,
            email: email
        });
    });
}

/**
 * 백엔드 서버에 소셜 로그인 정보 전송
 * - 자동 회원가입/로그인 (중복 가입 방지)
 * - 다른 소셜에 연동된 계정이 있으면 경고
 * - 로그인 상태에서 연동 시도 시 link-social API 호출
 */
async function processSocialLogin(socialData) {
    try {
        // 연동 모드인 경우 (로그인 상태에서 다른 소셜 추가)
        if (currentMode === 'link') {
            const token = localStorage.getItem('mindmap_token') || sessionStorage.getItem('mindmap_token');
            if (!token) {
                alert('로그인이 필요합니다.');
                return;
            }

            const response = await apiFetch('/api/auth/link-social', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(socialData)
            });
            const result = await response.json();

            if (result.success) {
                alert(result.message);
                window.location.reload();
            } else {
                alert(result.message || '연동 중 오류가 발생했습니다.');
            }
            return;
        }

        // 로그인 모드 (자동 회원가입/로그인)
        const response = await apiFetch('/api/auth/social-login', {
            method: 'POST',
            body: JSON.stringify(socialData)
        });
        const result = await response.json();

        if (result.success) {
            localStorage.setItem('mindmap_token', result.token);
            window.location.reload();
        } else if (result.linked && result.type === 'already_linked') {
            // 다른 소셜에 연동된 계정이 있음
            alert(result.message);
            // 사용자에게 기존 계정으로 로그인하도록 유도
            const loginCard = document.getElementById('loginCard');
            const registerCard = document.getElementById('registerCard');
            if (loginCard && registerCard) {
                registerCard.classList.add('hidden');
                loginCard.classList.remove('hidden');
            }
        } else {
            alert(result.message || '로그인 처리 중 오류가 발생했습니다.');
        }
    } catch (error) {
        console.error('소셜 로그인 에러:', error);
        alert('서버와 통신할 수 없습니다.');
    }
}

/**
 * 실제 소셜 로그인/연동 API 호출
 */
async function doSocialLogin(socialData, mode) {
    try {
        const endpoint = mode === 'link' ? '/api/auth/link-social' : '/api/auth/social-login';
        
        // 연동 모드인 경우 현재 로그인한 사용자 정보 포함
        if (mode === 'link') {
            const token = localStorage.getItem('mindmap_token') || sessionStorage.getItem('mindmap_token');
            if (token) {
                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    socialData.currentLoginId = payload.login_id;
                } catch (e) {
                    console.error('JWT 디코드 실패:', e);
                }
            }
        }
        
        const response = await apiFetch(endpoint, {
            method: 'POST',
            body: JSON.stringify(socialData)
        });
        const result = await response.json();

        if (result.success) {
            if (mode === 'login' || mode === 'link') {
                localStorage.setItem('mindmap_token', result.token);
            }
            window.location.reload();
        } else {
            alert(result.message || '처리 중 오류가 발생했습니다.');
        }
    } catch (error) {
        console.error('인증 에러:', error);
        alert('서버와 통신할 수 없습니다.');
    }
}

/**
 * 소셜 연동 모달 표시
 */
function showSocialLinkModal(socialData, email) {
    const modalHtml = `
        <div id="socialLinkModal" style="
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.7); z-index: 10000;
            display: flex; justify-content: center; align-items: center;
        ">
            <div style="
                background: #fff; border-radius: 12px; padding: 24px;
                width: 90%; max-width: 400px; text-align: center;
            ">
                <h3 style="margin: 0 0 16px; color: #333;">소셜 계정 연동</h3>
                <p style="color: #666; margin-bottom: 20px;">
                    이메일 <strong>${email}</strong>로 등록된 일반 계정이 있습니다.<br>
                    해당 계정과 연동하시겠습니까?
                </p>
                <input type="text" id="linkUsername" placeholder="아이디" value="${email}" style="
                    width: 100%; padding: 12px; margin-bottom: 12px;
                    border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box;
                ">
                <input type="password" id="linkPassword" placeholder="비밀번호" style="
                    width: 100%; padding: 12px; margin-bottom: 20px;
                    border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box;
                ">
                <button id="doLinkBtn" style="
                    width: 100%; padding: 14px; background: #4CAF50;
                    color: white; border: none; border-radius: 8px;
                    font-size: 16px; cursor: pointer;
                ">연동하기</button>
                <button id="cancelLinkBtn" style="
                    width: 100%; padding: 10px; margin-top: 10px;
                    background: #f5f5f5; color: #666; border: none;
                    border-radius: 8px; cursor: pointer;
                ">취소</button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('doLinkBtn').addEventListener('click', async () => {
        const login_id = document.getElementById('linkUsername').value;
        const password = document.getElementById('linkPassword').value;

        if (!login_id || !password) {
            alert('아이디와 비밀번호를 모두 입력해 주세요.');
            return;
        }

        // /social-register API 호출 (mode: link)
        try {
            const response = await apiFetch('/api/auth/social-register', {
                method: 'POST',
                body: JSON.stringify({
                    ...socialData,
                    login_id,
                    password,
                    mode: 'link'
                })
            });
            const result = await response.json();

            document.getElementById('socialLinkModal').remove();

            if (result.success) {
                localStorage.setItem('mindmap_token', result.token);
                window.location.reload();
            } else {
                alert(result.message || '연동 중 오류가 발생했습니다.');
            }
        } catch (error) {
            alert('서버와 통신할 수 없습니다.');
        }
    });

    document.getElementById('cancelLinkBtn').addEventListener('click', () => {
        document.getElementById('socialLinkModal').remove();
    });
}

/**
 * 소셜 회원가입 모달 표시
 */
function showSocialRegisterModal(socialData) {
    // 기본 이메일에서 login_id 제안
    const suggestedLoginId = socialData.email ? socialData.email.split('@')[0] : '';

    const modalHtml = `
        <div id="socialRegisterModal" style="
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.7); z-index: 10000;
            display: flex; justify-content: center; align-items: center;
        ">
            <div style="
                background: #fff; border-radius: 12px; padding: 24px;
                width: 90%; max-width: 400px; text-align: center;
            ">
                <h3 style="margin: 0 0 16px; color: #333;">${socialData.provider} 회원가입</h3>
                <p style="color: #666; margin-bottom: 20px;">
                    사용할 아이디와 비밀번호를 입력해 주세요.
                </p>
                <input type="text" id="socialRegLoginId" placeholder="아이디" value="${suggestedLoginId}" style="
                    width: 100%; padding: 12px; margin-bottom: 12px;
                    border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box;
                ">
                <input type="password" id="socialRegPassword" placeholder="비밀번호" style="
                    width: 100%; padding: 12px; margin-bottom: 20px;
                    border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box;
                ">
                <button id="socialDoRegisterBtn" style="
                    width: 100%; padding: 14px; background: #2196F3;
                    color: white; border: none; border-radius: 8px;
                    font-size: 16px; cursor: pointer;
                ">회원가입</button>
                <button id="socialCancelRegisterBtn" style="
                    width: 100%; padding: 10px; margin-top: 10px;
                    background: #f5f5f5; color: #666; border: none;
                    border-radius: 8px; cursor: pointer;
                ">취소</button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('socialDoRegisterBtn').addEventListener('click', async () => {
        const login_id = document.getElementById('socialRegLoginId').value;
        const password = document.getElementById('socialRegPassword').value;

        console.log('가입 시도 - login_id:', login_id, 'password:', password);

        if (!login_id || !password) {
            alert('아이디와 비밀번호를 모두 입력해 주세요.');
            return;
        }

        if (password.length < 4) {
            alert('비밀번호는 4자 이상이어야 합니다.');
            return;
        }

        // /social-register API 호출 (mode: register)
        try {
            const response = await apiFetch('/api/auth/social-register', {
                method: 'POST',
                body: JSON.stringify({
                    ...socialData,
                    username,
                    password,
                    mode: 'register'
                })
            });
            const result = await response.json();

            document.getElementById('socialRegisterModal').remove();

            if (result.success) {
                localStorage.setItem('mindmap_token', result.token);
                window.location.reload();
            } else {
                alert(result.message || '회원가입 중 오류가 발생했습니다.');
            }
        } catch (error) {
            alert('서버와 통신할 수 없습니다.');
        }
    });

    document.getElementById('socialCancelRegisterBtn').addEventListener('click', () => {
        document.getElementById('socialRegisterModal').remove();
    });
}
