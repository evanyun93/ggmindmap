/**
 * @file dialog.js
 * @description 브라우저 기본 alert/confirm 및 Web Notification을 대체하는 전역 커스텀 UI 유틸리티
 */

function injectDialogStyles() {
    if (document.getElementById('app-dialog-styles')) return;
    const style = document.createElement('style');
    style.id = 'app-dialog-styles';
    style.textContent = `
        .app-dialog-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(15, 23, 42, 0.7);
            backdrop-filter: blur(4px);
            z-index: 9999999; /* 모든 것 위에 표시 */
            display: flex; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.2s ease;
        }
        .app-dialog-overlay.show { opacity: 1; }
        
        .app-dialog-box {
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 12px;
            box-shadow: 0 15px 35px rgba(0,0,0,0.5);
            padding: 24px;
            width: 90%; max-width: 360px;
            text-align: center;
            transform: translateY(20px) scale(0.95);
            transition: all 0.2s ease;
        }
        .app-dialog-overlay.show .app-dialog-box {
            transform: translateY(0) scale(1);
        }
        
        .app-dialog-msg {
            color: #f8fafc; font-size: 1.05rem; line-height: 1.5; margin-bottom: 24px; white-space: pre-wrap; word-break: keep-all;
        }
        
        .app-dialog-btns {
            display: flex; gap: 12px; justify-content: center;
        }
        
        .app-dialog-btn {
            background: #3b82f6; color: white; padding: 12px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; border: none; flex: 1; font-size: 1rem; transition: background 0.2s, transform 0.1s;
        }
        .app-dialog-btn:hover { background: #2563eb; }
        .app-dialog-btn:active { transform: scale(0.96); }
        
        .app-dialog-btn.cancel { background: #475569; }
        .app-dialog-btn.cancel:hover { background: #334155; }

        .app-toast-container {
            position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%);
            z-index: 9999999; display: flex; flex-direction: column; gap: 12px; pointer-events: none;
        }
        .app-toast-msg {
            background: rgba(139, 92, 246, 0.95);
            color: white; padding: 14px 28px; border-radius: 30px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.4);
            font-weight: 500; font-size: 0.95rem; text-align: center;
            animation: toastIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards, toastOut 0.4s 2s forwards;
        }
        @keyframes toastIn { from { opacity: 0; transform: translateY(20px) scale(0.9); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes toastOut { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(20px) scale(0.9); } }
    `;
    document.head.appendChild(style);
}

/**
 * 기본 alert()를 대체하는 커스텀 비동기 Alert
 */
export function appAlert(msg) {
    return new Promise(resolve => {
        injectDialogStyles();
        const overlay = document.createElement('div');
        overlay.className = 'app-dialog-overlay';
        overlay.innerHTML = `
            <div class="app-dialog-box">
                <div class="app-dialog-msg">${msg}</div>
                <div class="app-dialog-btns">
                    <button class="app-dialog-btn ok">확인</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        // 애니메이션 트랜지션을 위한 다음 프레임 지연
        requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('show')));

        const close = () => {
            overlay.classList.remove('show');
            setTimeout(() => { overlay.remove(); resolve(); }, 200);
        };
        
        const okBtn = overlay.querySelector('.ok');
        okBtn.onclick = close;
        okBtn.focus();
    });
}

/**
 * 기본 confirm()을 대체하는 커스텀 비동기 Confirm (true/false 반환)
 */
export function appConfirm(msg) {
    return new Promise(resolve => {
        injectDialogStyles();
        const overlay = document.createElement('div');
        overlay.className = 'app-dialog-overlay';
        overlay.innerHTML = `
            <div class="app-dialog-box">
                <div class="app-dialog-msg">${msg}</div>
                <div class="app-dialog-btns">
                    <button class="app-dialog-btn cancel">취소</button>
                    <button class="app-dialog-btn ok">확인</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('show')));

        const close = (res) => {
            overlay.classList.remove('show');
            setTimeout(() => { overlay.remove(); resolve(res); }, 200);
        };
        
        overlay.querySelector('.ok').onclick = () => close(true);
        overlay.querySelector('.cancel').onclick = () => close(false);
    });
}

/**
 * 짧은 알림용 Toast (비동기로 사라짐)
 */
export function appToast(msg) {
    injectDialogStyles();
    
    let container = document.querySelector('.app-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'app-toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = 'app-toast-msg';
    toast.textContent = msg;
    container.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
        if (container.childElementCount === 0 && container.parentNode) container.remove();
    }, 2500);
}

// 전역 객체에 속성 부여 (모듈 시스템 외부 파일에서도 접근 가능하도록 설정)
window.appAlert = appAlert;
window.appConfirm = appConfirm;
window.appToast = appToast;
