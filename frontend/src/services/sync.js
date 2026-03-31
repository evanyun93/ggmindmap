/**
 * @file sync.js
 * @description 데이터 동기화 서비스를 관리합니다.
 * 
 * 기능:
 * - 로컬 캐시(localStorage)와 서버 간 데이터 동기화
 * - 폴링 기반 자동 동기화 (5초 간격)
 * - 타임스탬프 기반 변경 감지
 * - 마이그레이션 지원
 */

import { apiFetch } from './api.js';

/**
 * 데이터 타입 상수
 */
export const SYNC_DATA_TYPES = {
    TODO_COLLAPSED: 'todo_collapsed',
    TODO_COLOR: 'todo_color',
    TODO_TITLE: 'todo_title',
    TODO_AUTO_DELETE: 'todo_auto_delete',
    TODO_DATA_UPDATE: 'todo_data_update',
    MILESTONE_COLLAPSED: 'milestone_collapsed',
    MILESTONE_TITLE: 'milestone_title',
    MILESTONE_SETTINGS: 'milestone_settings',
    MILESTONE_DATA_UPDATE: 'milestone_data_update',
    DDAY_TARGET: 'dday_target',
    FAB_POS: 'fab_pos',
    SPREADSHEET_DATA: 'spreadsheet_data',
    SPREADSHEET_HEADERS: 'spreadsheet_headers',
    RECIPE_TITLE: 'recipe_title',
    MINDMAP_UPDATE: 'mindmap_update',
    DASHBOARD_LAYOUTS: 'dashboard_layouts'
};

/**
 * 폴링 간격 (밀리초)
 */
const POLL_INTERVAL = 5000;

/**
 * 로컬 스토리지 캐시 접두사
 */
const CACHE_PREFIX = 'sync_cache_';

/**
 * 마지막 동기화 시간 저장 키
 */
const LAST_SYNC_KEY = 'sync_last_timestamp';

/**
 * 마이그레이션 완료 플래그 키
 */
const MIGRATED_KEY = 'sync_migrated';

/**
 * SyncService 클래스
 * 데이터 동기화 로직을 담당합니다.
 */
class SyncService {
    constructor() {
        this.syncInterval = null;
        this.lastSyncTime = localStorage.getItem(LAST_SYNC_KEY) || '1970-01-01T00:00:00.000Z';
        this.isSyncing = false;
        this.listeners = new Map();
        this.isInitialized = false;
        this.initPromise = null;
    }

    /**
     * 사용자 로그인 시 초기화
     * 마이그레이션이 필요한지 확인하고 수행
     */
    async init() {
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            console.log('[Sync] 초기화 시작');
            
            // 마이그레이션 상태 확인
            const needsMigration = await this.checkMigrationNeeded();
            
            if (needsMigration) {
                console.log('[Sync] 마이그레이션 필요 - 실행 중...');
                await this.migrateLocalStorage();
            }
            
            // 캐시 로드
            this.loadCache();
            
            // 폴링 시작 및 첫 번째 동기화 완료 대기 (중요: 초기 데이터 확보)
            await this.startSync();
            
            this.isInitialized = true;
            console.log('[Sync] 초기화 완료');
            return true;
        })();

        return this.initPromise;
    }

    /**
     * 마이그레이션 필요 여부 확인
     */
    async checkMigrationNeeded() {
        // 이미 마이그레이션 완료되었으면 패스
        const alreadyMigrated = localStorage.getItem(MIGRATED_KEY);
        if (alreadyMigrated === 'true') {
            return false;
        }
        
        // 서버에서 마이그레이션 상태 확인
        try {
            const res = await apiFetch('/api/sync/migrate/status');
            const data = await res.json();
            
            if (data.success && data.isMigrated) {
                localStorage.setItem(MIGRATED_KEY, 'true');
                return false;
            }
            
            return true;
        } catch (err) {
            console.error('[Sync] 마이그레이션 상태 확인 실패:', err);
            // 네트워크 오류 시 로컬 스토리지 데이터가 있으면 마이그레이션 필요로 간주
            return this.hasLocalStorageData();
        }
    }

    /**
     * 로컬 스토지에 마이그레이션할 데이터가 있는지 확인
     */
    hasLocalStorageData() {
        const keys = [
            'todo_checkbox_color',
            'mindmap_dday_target',
            'mindmap_fab_pos',
            'mindmap_spreadsheet_data',
            'mindmap_spreadsheet_headers'
        ];
        
        for (const key of keys) {
            if (localStorage.getItem(key)) {
                return true;
            }
        }
        
        // 위젯별 설정 확인
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('todo_collapsed_') || 
                        key.startsWith('todo_widget_title_') ||
                        key.startsWith('milestone_collapsed_') ||
                        key.startsWith('milestone_widget_title_'))) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * 로컬 스토리지 데이터를 서버로 마이그레이션
     */
    async migrateLocalStorage() {
        try {
            // 마이그레이션할 데이터 수집
            const localStorageData = {
                todo_checkbox_color: localStorage.getItem('todo_checkbox_color'),
                mindmap_dday_target: localStorage.getItem('mindmap_dday_target'),
                mindmap_fab_pos: localStorage.getItem('mindmap_fab_pos'),
                mindmap_spreadsheet_data: localStorage.getItem('mindmap_spreadsheet_data'),
                mindmap_spreadsheet_headers: localStorage.getItem('mindmap_spreadsheet_headers'),
                widgetSettings: {}
            };
            
            // 위젯별 설정 수집
            const widgetKeys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.startsWith('todo_collapsed_') || 
                            key.startsWith('todo_widget_title_') ||
                            key.startsWith('milestone_collapsed_') ||
                            key.startsWith('milestone_widget_title_'))) {
                    widgetKeys.push(key);
                }
            }
            
            for (const key of widgetKeys) {
                localStorageData.widgetSettings[key] = localStorage.getItem(key);
            }
            
            // 서버로 마이그레이션 요청
            const res = await apiFetch('/api/sync/migrate', {
                method: 'POST',
                body: JSON.stringify({ localStorageData })
            });
            
            const result = await res.json();
            
            if (result.success) {
                console.log(`[Sync] 마이그레이션 완료: ${result.migratedCount}개 항목`);
                localStorage.setItem(MIGRATED_KEY, 'true');
            } else {
                console.error('[Sync] 마이그레이션 실패:', result.message);
            }
            
            return result.success;
        } catch (err) {
            console.error('[Sync] 마이그레이션 오류:', err);
            return false;
        }
    }

    /**
     * 로컬 캐시 로드
     */
    loadCache() {
        // 서버에서 캐시된 데이터 로드
        try {
            const cacheData = localStorage.getItem(CACHE_PREFIX + 'data');
            if (cacheData) {
                const parsed = JSON.parse(cacheData);
                console.log('[Sync] 캐시 데이터 로드 완료');
            }
        } catch (err) {
            console.error('[Sync] 캐시 로드 오류:', err);
        }
    }

    /**
     * 로컬 캐시 저장
     */
    saveCache(key, data) {
        try {
            const cacheKey = CACHE_PREFIX + key;
            const cacheData = {
                value: data,
                timestamp: new Date().toISOString()
            };
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } catch (err) {
            console.error('[Sync] 캐시 저장 오류:', err);
        }
    }

    /**
     * 로컬 캐시 읽기
     */
    getCache(key) {
        try {
            const cacheKey = CACHE_PREFIX + key;
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (err) {
            console.error('[Sync] 캐시 읽기 오류:', err);
        }
        return null;
    }

    /**
     * 특정 플랫폼별로 캐시 키와 서버 동기화 Type을 분리하기 위한 도우미 메서드
     */
    resolveType(type) {
        if (type === SYNC_DATA_TYPES.TODO_COLLAPSED ||
            type === SYNC_DATA_TYPES.MILESTONE_COLLAPSED) {
            const platform = window.innerWidth <= 768 ? 'mobile' : 'pc';
            return `${type}_${platform}`;
        }
        return type;
    }

    /**
     * 데이터 조회 (로컬 캐시 우선, 서버에서 업데이트 있으면 가져오기)
     * @param {string} rawType - 데이터 타입
     * @param {string|number} widgetId - 위젯 ID (optional)
     * @returns {Promise<any>}
     */
    async getData(rawType, widgetId = null) {
        const type = this.resolveType(rawType);
        // 초기화가 진행 중이면 잠시 대기하지만, 로컬 데이터를 우선시하도록 타임아웃 적용 (최대 1초)
        if (!this.isInitialized && this.initPromise) {
            await Promise.race([
                this.initPromise,
                new Promise(resolve => setTimeout(resolve, 1000))
            ]);
        }

        const cacheKey = widgetId ? `${type}_${widgetId}` : type;
        
        // 1. 로컬 캐시에서 먼저 확인
        const cached = this.getCache(cacheKey);
        if (cached) {
            // 약간의 딜레이 후 서버에서 업데이트 확인 (비동기)
            this.checkForUpdates(type, widgetId);
            return cached.value;
        }
        
        // 2. 로컬 스토리지에서 확인 (레거시 호환)
        const legacyValue = this.getFromLocalStorage(rawType, widgetId); // 레거시는 rawType 그대로 처리
        if (legacyValue !== null) {
            // 캐시에 저장
            this.saveCache(cacheKey, legacyValue);
            return legacyValue;
        }
        
        // 3. 서버에서 가져오기
        try {
            const res = await apiFetch(`/api/sync/data?lastUpdate=${this.lastSyncTime}`);
            const result = await res.json();
            
            if (result.success) {
                const serverData = this.extractServerData(result.data, type, widgetId);
                if (serverData !== null) {
                    this.saveCache(cacheKey, serverData);
                    return serverData;
                }
            }
        } catch (err) {
            console.error('[Sync] 서버 데이터 가져오기 실패:', err);
        }
        
        return null;
    }

    /**
     * 서버 응답에서 특정 데이터 추출
     */
    extractServerData(serverData, type, widgetId) {
        // 위젯 설정에서 찾기
        if (widgetId) {
            const widgetSetting = serverData.widgetSettings?.find(
                s => s.widget_id == widgetId && s.setting_key === type
            );
            if (widgetSetting) {
                return widgetSetting.setting_value;
            }
        }
        
        // 사용자 설정에서 찾기
        if (serverData.userSettings) {
            if (serverData.userSettings[type] !== undefined) {
                return serverData.userSettings[type];
            }
        }
        
        // 스프레드시트 데이터
        if (type === SYNC_DATA_TYPES.SPREADSHEET_DATA || 
            type === SYNC_DATA_TYPES.SPREADSHEET_HEADERS) {
            const spreadsheet = serverData.spreadsheets?.find(s => s.widget_id == widgetId);
            if (spreadsheet) {
                return type === SYNC_DATA_TYPES.SPREADSHEET_DATA ? 
                    spreadsheet.data : spreadsheet.headers;
            }
        }
        
        return null;
    }

    /**
     * 레거시 로컬 스토리지에서 데이터 읽기
     */
    getFromLocalStorage(type, widgetId) {
        switch (type) {
            case SYNC_DATA_TYPES.TODO_COLOR:
                return localStorage.getItem('todo_checkbox_color');
                
            case SYNC_DATA_TYPES.TODO_COLLAPSED:
                if (widgetId) {
                    const objPlatform = window.innerWidth <= 768 ? 'mobile' : 'pc';
                    return localStorage.getItem(`todo_collapsed_${objPlatform}_${widgetId}`);
                }
                break;
                
            case SYNC_DATA_TYPES.TODO_TITLE:
                if (widgetId) {
                    return localStorage.getItem(`todo_widget_title_${widgetId}`);
                }
                break;
                
            case SYNC_DATA_TYPES.TODO_AUTO_DELETE:
                if (widgetId) {
                    return localStorage.getItem(`todo_auto_delete_${widgetId}`);
                }
                return localStorage.getItem('todo_auto_delete');
                
            case SYNC_DATA_TYPES.DDAY_TARGET:
                return localStorage.getItem('mindmap_dday_target');
                
            case SYNC_DATA_TYPES.FAB_POS:
                return localStorage.getItem('mindmap_fab_pos');
                
            case SYNC_DATA_TYPES.SPREADSHEET_DATA:
                return localStorage.getItem('mindmap_spreadsheet_data');
                
            case SYNC_DATA_TYPES.SPREADSHEET_HEADERS:
                return localStorage.getItem('mindmap_spreadsheet_headers');
                
            case SYNC_DATA_TYPES.MILESTONE_COLLAPSED:
                if (widgetId) {
                    const objPlatform = window.innerWidth <= 768 ? 'mobile' : 'pc';
                    return localStorage.getItem(`milestone_collapsed_${objPlatform}_${widgetId}`);
                }
                break;
                
            case SYNC_DATA_TYPES.MILESTONE_TITLE:
                if (widgetId) {
                    return localStorage.getItem(`milestone_widget_title_${widgetId}`);
                }
                break;

            case SYNC_DATA_TYPES.DASHBOARD_LAYOUTS:
                // 로컬 캐시 없음 - 항상 서버(userSettings)에서 로드
                return null;
        }
        
        return null;
    }

    /**
     * 데이터 설정 (로컬 + 서버)
     * @param {string} type - 데이터 타입
     * @param {string|number} widgetId - 위젯 ID (optional)
     * @param {any} data - 저장할 데이터
     */
    async setData(rawType, widgetId = null, data) {
        const type = this.resolveType(rawType);
        const cacheKey = widgetId ? `${type}_${widgetId}` : type;
        
        // 1. 로컬 캐시 업데이트
        this.saveCache(cacheKey, data);
        
        // 2. 레거시 로컬 스토리지 업데이트 (호환성 유지)
        this.saveToLocalStorage(rawType, widgetId, data);
        
        // 3. 서버에 동기화 (비동기)
        try {
            await apiFetch('/api/sync/data', {
                method: 'POST',
                body: JSON.stringify({
                    type,
                    widgetId,
                    data,
                    timestamp: new Date().toISOString()
                })
            });
            
            // 마지막 동기화 시간 업데이트
            this.lastSyncTime = new Date().toISOString();
            localStorage.setItem(LAST_SYNC_KEY, this.lastSyncTime);
            
            // 변경 이벤트 발생
            this.emit(type, widgetId, data);
            
        } catch (err) {
            console.error('[Sync] 서버 동기화 실패:', err);
            // 로컬에만 저장하고 재시도 큐에 추가
            this.queueForRetry(type, widgetId, data);
        }
    }

    /**
     * 레거시 로컬 스토리지에 저장
     */
    saveToLocalStorage(type, widgetId, data) {
        const value = typeof data === 'string' ? data : JSON.stringify(data);
        
        switch (type) {
            case SYNC_DATA_TYPES.TODO_AUTO_DELETE:
                if (widgetId) {
                    localStorage.setItem(`todo_auto_delete_${widgetId}`, value);
                } else {
                    localStorage.setItem('todo_auto_delete', value);
                }
                break;

            case SYNC_DATA_TYPES.TODO_COLOR:
                localStorage.setItem('todo_checkbox_color', value);
                break;
                
            case SYNC_DATA_TYPES.TODO_COLLAPSED:
                if (widgetId) {
                    const objPlatform = window.innerWidth <= 768 ? 'mobile' : 'pc';
                    localStorage.setItem(`todo_collapsed_${objPlatform}_${widgetId}`, value);
                }
                break;
                
            case SYNC_DATA_TYPES.TODO_TITLE:
                if (widgetId) {
                    localStorage.setItem(`todo_widget_title_${widgetId}`, value);
                }
                break;
                
            case SYNC_DATA_TYPES.DDAY_TARGET:
                localStorage.setItem('mindmap_dday_target', value);
                break;
                
            case SYNC_DATA_TYPES.FAB_POS:
                localStorage.setItem('mindmap_fab_pos', value);
                break;
                
            case SYNC_DATA_TYPES.SPREADSHEET_DATA:
                localStorage.setItem('mindmap_spreadsheet_data', value);
                break;
                
            case SYNC_DATA_TYPES.SPREADSHEET_HEADERS:
                localStorage.setItem('mindmap_spreadsheet_headers', value);
                break;
                
            case SYNC_DATA_TYPES.MILESTONE_COLLAPSED:
                if (widgetId) {
                    const objPlatform = window.innerWidth <= 768 ? 'mobile' : 'pc';
                    localStorage.setItem(`milestone_collapsed_${objPlatform}_${widgetId}`, value);
                }
                break;
                
            case SYNC_DATA_TYPES.MILESTONE_TITLE:
                if (widgetId) {
                    localStorage.setItem(`milestone_widget_title_${widgetId}`, value);
                }
                break;

            case SYNC_DATA_TYPES.DASHBOARD_LAYOUTS:
                // dashboard_layouts는 userSettings에 저장 - 로컬 스토리지는 캐시만 사용
                break;
        }
    }

    /**
     * 변경 사항 확인 (비동기)
     */
    async checkForUpdates(type, widgetId) {
        if (this.isSyncing) return;
        
        try {
            const res = await apiFetch(`/api/sync/data?lastUpdate=${this.lastSyncTime}`);
            const result = await res.json();
            
            if (result.success && result.data) {
                const serverData = this.extractServerData(result.data, type, widgetId);
                
                if (serverData !== null) {
                    const cacheKey = widgetId ? `${type}_${widgetId}` : type;
                    const cached = this.getCache(cacheKey);
                    
                    // 서버数据和本地缓存不同，则更新本地
                    if (cached && cached.value !== serverData) {
                        this.saveCache(cacheKey, serverData);
                        this.saveToLocalStorage(type, widgetId, serverData);
                        this.emit(type, widgetId, serverData);
                    }
                }
                
                // 마지막 동기화 시간 업데이트
                if (result.serverTime) {
                    this.lastSyncTime = result.serverTime;
                    localStorage.setItem(LAST_SYNC_KEY, this.lastSyncTime);
                }
            }
        } catch (err) {
            console.error('[Sync] 업데이트 확인 실패:', err);
        }
    }

    /**
     * 폴링 시작
     */
    async startSync() {
        if (this.syncInterval) {
            console.log('[Sync] 폴링이 이미 실행 중입니다.');
            return;
        }
        
        console.log('[Sync] 폴링 시작 (즉시 실행 후 5초 간격)');
        
        // 첫 번째 동기화 즉시 실행 (await 하여 초기 로딩 시 데이터 보장)
        await this.pollForUpdates();
        
        this.syncInterval = setInterval(async () => {
            await this.pollForUpdates();
        }, POLL_INTERVAL);
    }

    /**
     * 폴링 중지
     */
    stopSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('[Sync] 폴링 중지');
        }
    }

    /**
     * 서버 폴링 (전체 업데이트 확인)
     */
    async pollForUpdates() {
        if (this.isSyncing) return;
        
        this.isSyncing = true;
        
        try {
            const res = await apiFetch(`/api/sync/data?lastUpdate=${this.lastSyncTime}`);
            const result = await res.json();
            
            if (result.success && result.data) {
                // 전체 데이터 업데이트 (로컬 스토리지에 병합)
                this.mergeServerData(result.data);
                
                // 마지막 동기화 시간 업데이트
                if (result.serverTime) {
                    this.lastSyncTime = result.serverTime;
                    localStorage.setItem(LAST_SYNC_KEY, this.lastSyncTime);
                }
                
                // 변경 이벤트 발생
                this.emit('sync', null, result.data);
            }
        } catch (err) {
            console.error('[Sync] 폴링 실패:', err);
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * 서버 데이터를 로컬에 병합
     */
    mergeServerData(serverData) {
        // 사용자 설정 병합
        if (serverData.userSettings) {
            for (const [key, value] of Object.entries(serverData.userSettings)) {
                if (key.startsWith('_')) continue; // 시스템 키 건너뛰기
                this.saveToLocalStorage(key, null, value);
                // userSettings의 모든 항목을 캐시에도 저장 (dashboard_layouts 등 JSON 오브젝트도 캐시로 관리)
                const oldCache = this.getCache(key);
                this.saveCache(key, value);
                
                // 값이 변경된 경우에만 이벤트 발생 (대시보드 레이아웃 실시간 반영 등)
                const oldValue = oldCache ? JSON.stringify(oldCache.value) : null;
                const newValue = JSON.stringify(value);
                if (oldValue !== newValue) {
                    this.emit(key, null, value);
                }
            }
        }
        
        // 위젯 설정 병합
        if (serverData.widgetSettings) {
            for (const setting of serverData.widgetSettings) {
                const type = setting.setting_key;
                const widgetId = setting.widget_id;
                const value = setting.setting_value;
                const cacheKey = widgetId ? `${type}_${widgetId}` : type;

                // 레거시 로컬 스토리지 업데이트
                this.saveToLocalStorage(type, widgetId, value);
                // 현재 캐시 업데이트 (매우 중요: getData가 최신 데이터를 보려면 필요)
                this.saveCache(cacheKey, value);
                
                // 개별 변경 이벤트 발생
                this.emit(type, widgetId, value);
            }
        }
        
        // 스프레드시트 데이터 병합
        if (serverData.spreadsheets) {
            for (const sheet of serverData.spreadsheets) {
                if (sheet.data) {
                    this.saveToLocalStorage(SYNC_DATA_TYPES.SPREADSHEET_DATA, sheet.widget_id, sheet.data);
                }
                if (sheet.headers) {
                    this.saveToLocalStorage(SYNC_DATA_TYPES.SPREADSHEET_HEADERS, sheet.widget_id, sheet.headers);
                }
            }
        }
    }

    /**
     * 재시도 큐에 추가
     */
    queueForRetry(type, widgetId, data) {
        const retryQueue = JSON.parse(localStorage.getItem(CACHE_PREFIX + 'retry') || '[]');
        retryQueue.push({ type, widgetId, data, timestamp: Date.now() });
        localStorage.setItem(CACHE_PREFIX + 'retry', JSON.stringify(retryQueue));
    }

    /**
     * 재시도 큐 처리
     */
    async processRetryQueue() {
        const retryQueue = JSON.parse(localStorage.getItem(CACHE_PREFIX + 'retry') || '[]');
        
        if (retryQueue.length === 0) return;
        
        const failedItems = [];
        
        for (const item of retryQueue) {
            try {
                await apiFetch('/api/sync/data', {
                    method: 'POST',
                    body: JSON.stringify({
                        type: item.type,
                        widgetId: item.widgetId,
                        data: item.data,
                        timestamp: new Date().toISOString()
                    })
                });
            } catch (err) {
                failedItems.push(item);
            }
        }
        
        localStorage.setItem(CACHE_PREFIX + 'retry', JSON.stringify(failedItems));
    }

    /**
     * 이벤트 리스너 등록
     */
    on(rawEvent, callback) {
        const event = this.resolveType(rawEvent);
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    /**
     * addListener 에일리어스 (on과 동일)
     */
    addListener(event, callback) {
        this.on(event, callback);
    }

    /**
     * removeListener 에일리어스 (off와 동일)
     */
    removeListener(event, callback) {
        this.off(event, callback);
    }

    /**
     * 특정 위젯의 모든 데이터 변경 신호를 감지하여 콜백 실행 (범용 아키텍처)
     * @param {string|number} widgetId 위젯 ID
     * @param {function} callback 변경 시 실행할 함수
     * @returns {function} 리스너 제거용 함수
     */
    watchWidget(widgetId, callback) {
        if (!widgetId) return () => {};
        
        const types = [
            SYNC_DATA_TYPES.TODO_DATA_UPDATE,
            SYNC_DATA_TYPES.MILESTONE_DATA_UPDATE,
            'data_update'
        ];

        const listener = (updatedWidgetId, newValue) => {
            if (String(updatedWidgetId) === String(widgetId)) {
                callback(newValue);
            }
        };

        types.forEach(type => this.addListener(type, listener));
        
        // 구독 해제용 함수 반환
        return () => {
            types.forEach(type => this.removeListener(type, listener));
        };
    }

    /**
     * 이벤트 리스너 제거
     */
    off(rawEvent, callback) {
        const event = this.resolveType(rawEvent);
        if (!this.listeners.has(event)) return;
        
        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    }

    /**
     * 이벤트 발생
     */
    emit(rawEvent, widgetId, data) {
        const event = this.resolveType(rawEvent);
        if (!this.listeners.has(event)) return;
        
        for (const callback of this.listeners.get(event)) {
            try {
                // 인자 순서 표준화: (widgetId, data)
                callback(widgetId, data);
            } catch (err) {
                console.error('[Sync] 이벤트 콜백 오류:', err);
            }
        }
    }

    /**
     * 서비스 정리 (로그아웃 시 호출)
     */
    destroy() {
        this.stopSync();
        this.listeners.clear();
        console.log('[Sync] 서비스 종료');
    }
}

// Singleton 인스턴스 생성 및 내보내기
export const syncService = new SyncService();

// 기본 내보내기 (기본 인스턴스)
export default syncService;
