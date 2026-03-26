const db = require('../config/database');

/**
 * 동기화 데이터 타입 상수 (중앙 관리)
 */
const SYNC_TYPES = {
    // 위젯 설정 및 데이터 상태
    TODO_AUTO_DELETE: 'todo_auto_delete',
    TODO_DATA_UPDATE: 'todo_data_update',
    MILESTONE_DATA_UPDATE: 'milestone_data_update',
    MINDMAP_UPDATE: 'mindmap_update',
    DASHBOARD_UPDATE: 'dashboard_update', // 위젯 추가/삭제 등

    // 개별 데이터 필드 (레거시 및 호환용)
    TODO_COLLAPSED: 'todo_collapsed',
    TODO_COLOR: 'todo_color',
    TODO_TITLE: 'todo_title',
    MILESTONE_COLLAPSED: 'milestone_collapsed',
    MILESTONE_TITLE: 'milestone_title',
    MILESTONE_SETTINGS: 'milestone_settings',
    DDAY_TARGET: 'dday_target',
    FAB_POS: 'fab_pos',
    SPREADSHEET_DATA: 'spreadsheet_data',
    SPREADSHEET_HEADERS: 'spreadsheet_headers',
    DATA_UPDATE: 'data_update'
};

/**
 * 데이터 변경 시 다른 클라이언트에 알림을 보내는 공통 서비스
 */
const syncService = {
    SYNC_TYPES,

    /**
     * @param {number} userId 사용자 ID
     * @param {number|string} widgetId 위젯 ID (0은 전역/대시보드)
     * @param {string} type 동기화 데이터 타입 (SYNC_TYPES 참조)
     * @param {any} payload 추가 데이터 (기본값은 현재 시간 타임스탬프)
     */
    async notifyChange(userId, widgetId, type, payload = Date.now()) {
        if (!userId || widgetId === undefined || !type) {
            console.error('[SyncService] 필수 인자 누락:', { userId, widgetId, type });
            return;
        }

        try {
            await db.pool.query(
                `INSERT INTO tba_widget_settings (user_id, widget_id, setting_key, setting_value, updated_at)
                VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, widget_id, setting_key) 
                DO UPDATE SET setting_value = $4, updated_at = CURRENT_TIMESTAMP`,
                [userId, widgetId, type, String(payload)]
            );
            // console.log(`[SyncService] 전파 성공: ${type} (Widget: ${widgetId})`);
        } catch (err) {
            // console.error('[SyncService] 전파 실패:', err.message);
        }
    }
};

module.exports = syncService;
