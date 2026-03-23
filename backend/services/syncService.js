const pool = require('../config/database');

/**
 * 데이터 변경 시 다른 클라이언트에 알림을 보내는 공통 서비스
 */
const syncService = {
    /**
     * @param {number} userId 사용자 ID
     * @param {number|string} widgetId 위젯 ID
     * @param {string} type 동기화 데이터 타입 (예: 'todo_data_update')
     * @param {any} payload 추가 데이터 (기본값은 현재 시간 타임스탬프)
     */
    async notifyChange(userId, widgetId, type, payload = Date.now()) {
        if (!userId || !widgetId || !type) {
            console.error('[SyncService] 필수 인자 누락:', { userId, widgetId, type });
            return;
        }

        try {
            await pool.query(
                `INSERT INTO tba_widget_settings (user_id, widget_id, setting_key, setting_value, updated_at)
                VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, widget_id, setting_key) 
                DO UPDATE SET setting_value = $4, updated_at = CURRENT_TIMESTAMP`,
                [userId, widgetId, type, String(payload)]
            );
            console.log(`[SyncService] 전파 성공: ${type} (Widget: ${widgetId})`);
        } catch (err) {
            console.error('[SyncService] 전파 실패:', err.message);
        }
    }
};

module.exports = syncService;
