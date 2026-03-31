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
            <span onclick="document.getElementById('app-debug-panel').innerHTML=''; logs.length=0;" style="cursor:pointer; opacity: 0.6;">Clear</span>
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
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(127, 29, 29, 0.98); color: white; z-index: 10000000;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 20px; font-family: sans-serif;
    `;

    overlay.innerHTML = `
        <h2 style="font-size: 24px; margin-bottom: 10px;">⚠️ 치명적 오류 발생</h2>
        <p style="margin-bottom: 20px; opacity: 0.8; text-align: center;">어플리케이션이 예기치 않게 중단되었습니다.<br>아래 내용을 캡쳐하여 문의해주세요.</p>
        <div id="fatal-error-msg" style="width: 100%; max-width: 500px; max-height: 300px; overflow-y: auto; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all;">${msg}</div>
        <button onclick="window.location.reload()" style="margin-top: 30px; padding: 12px 24px; background: white; color: #7f1d1d; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">페이지 새로고침</button>
    `;

    document.body.appendChild(overlay);
    if (window.navigator?.vibrate) window.navigator.vibrate([100, 50, 100]);
}

// 초기 로딩 에러를 가로채기 위해 전역 노출
window.showFatalError = showFatalError;
