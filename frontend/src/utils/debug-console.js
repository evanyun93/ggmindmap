/**
 * @file debug-console.js
 * @description 개발자 도구가 없는 환경(인앱 브라우저 등)을 위해 브라우저 로그를 화면에 표시하고 치명적 오류를 감지합니다.
 */

const MAX_LOGS = 50;
const logs = [];
let isInitialized = false;

/**
 * 디버그 콘솔 및 글로벌 에러 감시 초기화
 */
export function initDebugConsole() {
    if (isInitialized) return;
    isInitialized = true;

    // 1. UI 요소 생성
    createDebugUI();

    // 2. 원래의 콘솔 메서드 백업 및 래핑
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => {
        originalLog.apply(console, args);
        addLog('log', args);
    };
    console.warn = (...args) => {
        originalWarn.apply(console, args);
        addLog('warn', args);
    };
    console.error = (...args) => {
        originalError.apply(console, args);
        addLog('error', args);
    };

    // 3. 글로벌 런타임 에러 감시
    window.addEventListener('error', (event) => {
        showFatalError(`Runtime Error: ${event.message}\nAt: ${event.filename}:${event.lineno}`);
    });

    // 4. Promise 거부 에러 감시
    window.addEventListener('unhandledrejection', (event) => {
        showFatalError(`Promise Error: ${event.reason}`);
    });

    console.log('[Debug] 디버그 콘솔 시스템이 활성화되었습니다.');
}

/**
 * 로그 데이터 저장 및 UI 갱신
 */
function addLog(type, args) {
    const message = args.map(arg => {
        try {
            return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg);
        } catch (e) {
            return String(arg);
        }
    }).join(' ');

    logs.push({ type, message, time: new Date().toLocaleTimeString() });
    if (logs.length > MAX_LOGS) logs.shift();

    updateDebugUI();
}

/**
 * 디버그 UI 생성 (인라인 스타일 사용으로 외부 CSS 의존성 제거)
 */
function createDebugUI() {
    if (document.getElementById('app-debug-root')) return;

    const root = document.createElement('div');
    root.id = 'app-debug-root';
    root.style.cssText = `
        position: fixed; bottom: 10px; right: 10px; z-index: 9999999;
        pointer-events: none; font-family: monospace; font-size: 11px;
    `;

    // 1. 토글 버튼 (매우 작고 투명하게)
    const btn = document.createElement('button');
    btn.id = 'app-debug-toggle';
    btn.textContent = 'D';
    btn.style.cssText = `
        pointer-events: auto; width: 24px; height: 24px; border-radius: 50%;
        background: rgba(139, 92, 246, 0.4); color: white; border: none;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer; opacity: 0.5;
        display: flex; align-items: center; justify-content: center;
    `;
    btn.onclick = () => {
        const pan = document.getElementById('app-debug-panel');
        pan.style.display = pan.style.display === 'none' ? 'flex' : 'none';
        btn.style.opacity = pan.style.display === 'none' ? '0.5' : '1';
    };

    // 2. 로그 패널
    const panel = document.createElement('div');
    panel.id = 'app-debug-panel';
    panel.style.cssText = `
        position: fixed; bottom: 40px; right: 10px; width: 300px; max-height: 200px;
        background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(139, 92, 246, 0.5);
        border-radius: 12px; display: none; flex-direction: column; overflow: hidden;
        box-shadow: 0 10px 25px rgba(0,0,0,0.5); pointer-events: auto; color: #f1f5f9;
        backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    `;
    panel.innerHTML = `
        <div style="padding: 8px 12px; background: rgba(139,92,246,0.2); border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between;">
            <b style="color: #a78bfa;">Debug Logs</b>
            <span onclick="window.clearDebugLogs && window.clearDebugLogs()" style="cursor:pointer; opacity: 0.8; font-weight: bold; color: #f87171; background: rgba(239, 68, 68, 0.15); padding: 2px 8px; border-radius: 4px; transition: all 0.2s;">Clear</span>
        </div>
        <div id="app-debug-logs" style="overflow-y: scroll; flex: 1; padding: 4px;"></div>
    `;

    root.appendChild(panel);
    root.appendChild(btn);
    document.body.appendChild(root);
}

/**
 * 로그 패널 갱신
 */
function updateDebugUI() {
    const list = document.getElementById('app-debug-logs');
    if (!list) return;

    list.innerHTML = logs.map(log => {
        let color = '#cbd5e1';
        if (log.type === 'warn') color = '#fbbf24';
        if (log.type === 'error') color = '#f87171';
        return `<div style="padding: 2px 4px; border-bottom: 1px solid rgba(255,255,255,0.05); color: ${color}; word-break: break-all;">
            <span style="opacity: 0.4;">[${log.time}]</span> ${log.message}
        </div>`;
    }).join('');
    list.scrollTop = list.scrollHeight;
}

/**
 * 치명적인 오류 발생 시 오버레이로 알림
 */
export function showFatalError(msg) {
    // 이미 노출된 에러창이 있다면 추가하지 않음
    if (document.getElementById('fatal-error-overlay')) {
        const logArea = document.getElementById('fatal-error-msg');
        if (logArea) logArea.textContent += `\n\n--- Next Error ---\n${msg}`;
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'fatal-error-overlay';
    overlay.id = 'fatal-error-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: radial-gradient(circle at center, #1e1b4b 0%, #0f172a 100%);
        color: white; z-index: 99999999; display: flex; flex-direction: column;
        align-items: center; justify-content: center; padding: 20px;
        font-family: 'Inter', sans-serif; text-align: center;
        animation: fadeInError 0.5s ease-out;
    `;

    const ua = navigator.userAgent || "";
    const isWebView = /KAKAOTALK|FB_IAB|FBAN|FBAV|Instagram|Line|NAVER|Daum/i.test(ua) || (/(iPhone|iPad|iPod)/i.test(ua) && !/Safari/i.test(ua));

    overlay.innerHTML = `
        <div style="background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 32px; padding: 40px; max-width: 450px; width: 100%; box-shadow: 0 25px 50px rgba(0,0,0,0.5);">
            <div style="font-size: 64px; margin-bottom: 20px;">🚀</div>
            <h2 style="font-size: 26px; margin-bottom: 12px; font-weight: 700; color: #f8fafc; letter-spacing: -0.5px;">더 쾌적한 환경으로 안내합니다</h2>
            <p style="margin-bottom: 30px; color: #94a3b8; line-height: 1.6; font-size: 15px;">
                ${isWebView 
                    ? '현재 인앱 브라우저는 최신 기능 사용이 제한될 수 있습니다.<br>더 강력한 성능의 외부 브라우저를 열어드릴까요?' 
                    : '어플리케이션 최적화 중 환경 설정이 필요합니다.<br>더 나은 경험을 위해 잠시만 기다려 주세요.'}
            </p>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                ${isWebView ? `
                    <button id="btn-escape-error" style="padding: 16px 24px; background: #8b5cf6; color: white; border: none; border-radius: 16px; font-weight: 700; font-size: 16px; cursor: pointer; box-shadow: 0 10px 20px rgba(139,92,246,0.3); transition: all 0.3s;">
                        외부 브라우저로 열기 (추천)
                    </button>
                ` : ''}
                <button onclick="window.location.reload()" style="padding: 14px 24px; background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; font-weight: 600; font-size: 14px; cursor: pointer;">
                    현재 페이지 새로고침
                </button>
            </div>
            
            <div id="toggle-error-logs" style="margin-top: 40px; color: rgba(255, 255, 255, 0.3); font-size: 12px; cursor: pointer; text-decoration: underline;">
                기술적 상세 내용 보기 ▼
            </div>
            <div id="fatal-error-msg" style="display: none; margin-top: 20px; width: 100%; max-height: 200px; overflow-y: auto; background: rgba(0,0,0,0.3); padding: 15px; border-radius: 12px; font-family: monospace; font-size: 11px; color: #94a3b8; white-space: pre-wrap; word-break: break-all; text-align: left; border: 1px solid rgba(255,255,255,0.05);">
                ${msg}
            </div>
        </div>
        <style>
            @keyframes fadeInError { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
            @keyframes errorBounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-15px); } }
        </style>
    `;

    document.body.appendChild(overlay);

    // 로그 토글 이벤트 바인딩
    const toggleBtn = overlay.querySelector('#toggle-error-logs');
    const msgDiv = overlay.querySelector('#fatal-error-msg');
    toggleBtn.onclick = () => {
        const isHidden = msgDiv.style.display === 'none';
        msgDiv.style.display = isHidden ? 'block' : 'none';
        toggleBtn.textContent = isHidden ? '상세 내용 접기 ▲' : '기술적 상세 내용 보기 ▼';
    };

    // 탈출 버튼 이벤트 바인딩
    if (isWebView) {
        const escapeBtn = overlay.querySelector('#btn-escape-error');
        escapeBtn.onclick = () => {
            const url = "https://ggmindmap.vercel.app";
            if (document.getElementById('manual-guide-overlay')) return;
            
            const guideOverlay = document.createElement('div');
            guideOverlay.id = 'manual-guide-overlay';
            guideOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.9);z-index:100000000;display:flex;flex-direction:column;align-items:flex-end;padding:20px;color:white;font-weight:bold;text-align:right;backdrop-filter:blur(10px);';
            guideOverlay.innerHTML = `
                <div style="font-size:40px;margin-bottom:10px;animation:errorBounce 1.5s infinite;">↗️</div>
                <div style="font-size:20px;line-height:1.4;">여기 메뉴 버튼을 눌러<br><span style="color:#a78bfa;">[다른 브라우저로 열기]</span>를<br>선택해 주세요!</div>
                <button onclick="this.parentElement.remove()" style="margin-top:40px;background:white;color:black;border:none;padding:12px 24px;border-radius:12px;font-weight:bold;cursor:pointer;">안내 닫기</button>
            `;
            document.body.appendChild(guideOverlay);

            const isIOS = /iPhone|iPad|iPod/i.test(ua);
            const isAndroid = /Android/i.test(ua);
            if (/KAKAOTALK/i.test(ua)) {
                setTimeout(() => { window.location.href = 'kakaotalk://web/openExternalApp?url=' + encodeURIComponent(url); }, 100);
                if (isIOS) setTimeout(() => { window.location.href = 'kakaoweb://openExternalApp?url=' + encodeURIComponent(url); }, 500);
            }
            if (isAndroid) {
                const intentUrl = 'intent://' + url.replace(/https?:\/\//i, '') + '#Intent;scheme=https;package=com.android.chrome;end';
                setTimeout(() => { window.location.href = intentUrl; }, 300);
            }
            setTimeout(() => { window.location.href = url; }, 1000);
        };
    }

    document.body.appendChild(overlay);
    if (window.navigator?.vibrate) window.navigator.vibrate([100, 50, 100]);
}

// 디버그 로그 초기화 전역 노출
window.clearDebugLogs = () => {
    logs.length = 0;
    const list = document.getElementById('app-debug-logs');
    if (list) list.innerHTML = '';
    console.log('[Debug] 콘솔 로그가 초기화되었습니다.');
};

// 초기 로딩 에러를 가로채기 위해 전역 노출
window.showFatalError = showFatalError;
