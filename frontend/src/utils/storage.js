/**
 * @file storage.js
 * @description localStorage 및 sessionStorage 접근 시 발생할 수 있는 예외(WebView 보완 등)를 처리합니다.
 */

export const safeLocalStorage = {
    getItem(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            console.error('[Storage] localStorage.getItem 실패:', e);
            return null;
        }
    },
    setItem(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (e) {
            console.error('[Storage] localStorage.setItem 실패:', e);
            return false;
        }
    },
    removeItem(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            console.error('[Storage] localStorage.removeItem 실패:', e);
            return false;
        }
    }
};

export const safeSessionStorage = {
    getItem(key) {
        try {
            return sessionStorage.getItem(key);
        } catch (e) {
            console.error('[Storage] sessionStorage.getItem 실패:', e);
            return null;
        }
    },
    setItem(key, value) {
        try {
            sessionStorage.setItem(key, value);
            return true;
        } catch (e) {
            console.error('[Storage] sessionStorage.setItem 실패:', e);
            return false;
        }
    },
    removeItem(key) {
        try {
            sessionStorage.removeItem(key);
            return true;
        } catch (e) {
            console.error('[Storage] sessionStorage.removeItem 실패:', e);
            return false;
        }
    }
};
