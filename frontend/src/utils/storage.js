/**
 * @file storage.js
 * @description localStorage 및 sessionStorage 접근 시 발생할 수 있는 예외(WebView 보완 등)를 처리합니다.
 */

export const safeLocalStorage = {
    getItem(key) {
        try { return localStorage.getItem(key); }
        catch (e) { console.error('[Storage] localStorage.getItem 실패:', e); return null; }
    },
    setItem(key, value) {
        try { localStorage.setItem(key, value); return true; }
        catch (e) { console.error('[Storage] localStorage.setItem 실패:', e); return false; }
    },
    removeItem(key) {
        try { localStorage.removeItem(key); return true; }
        catch (e) { console.error('[Storage] localStorage.removeItem 실패:', e); return false; }
    },
    clear() {
        try { localStorage.clear(); return true; }
        catch (e) { console.error('[Storage] localStorage.clear 실패:', e); return false; }
    },
    key(index) {
        try { return localStorage.key(index); }
        catch (e) { console.error('[Storage] localStorage.key 실패:', e); return null; }
    },
    get length() {
        try { return localStorage.length; }
        catch (e) { console.error('[Storage] localStorage.length 실패:', e); return 0; }
    }
};

export const safeSessionStorage = {
    getItem(key) {
        try { return sessionStorage.getItem(key); }
        catch (e) { console.error('[Storage] sessionStorage.getItem 실패:', e); return null; }
    },
    setItem(key, value) {
        try { sessionStorage.setItem(key, value); return true; }
        catch (e) { console.error('[Storage] sessionStorage.setItem 실패:', e); return false; }
    },
    removeItem(key) {
        try { sessionStorage.removeItem(key); return true; }
        catch (e) { console.error('[Storage] sessionStorage.removeItem 실패:', e); return false; }
    },
    clear() {
        try { sessionStorage.clear(); return true; }
        catch (e) { console.error('[Storage] sessionStorage.clear 실패:', e); return false; }
    },
    key(index) {
        try { return sessionStorage.key(index); }
        catch (e) { console.error('[Storage] sessionStorage.key 실패:', e); return null; }
    },
    get length() {
        try { return sessionStorage.length; }
        catch (e) { console.error('[Storage] sessionStorage.length 실패:', e); return 0; }
    }
};
