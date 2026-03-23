const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/authHandler');

/**
 * 데이터 타입 상수
 */
const DATA_TYPES = {
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
    TODO_AUTO_DELETE: 'todo_auto_delete'
};

/**
 * GET /api/sync/data - 모든 동기화 데이터 조회 (폴링용)
 * 클라이언트가 마지막 업데이트 시간 이후의 변경 사항을 가져옴
 */
router.get('/data', authenticateToken, async (req, res) => {
    try {
        const client = await pool.connect();
        
        try {
            const userId = req.user.id;
            const lastUpdate = req.query.lastUpdate || '1970-01-01';
            
            // 1. 위젯 설정 조회
            const widgetSettings = await client.query(
                `SELECT widget_id, setting_key, setting_value, updated_at 
                FROM tba_widget_settings 
                WHERE user_id = $1 AND updated_at > $2`,
                [userId, lastUpdate]
            );
            
            // 2. 사용자 전역 설정 조회
            const userSettings = await client.query(
                `SELECT settings FROM tba_user_settings WHERE user_id = $1`,
                [userId]
            );
            
            // 3. 스프레드시트 데이터 조회
            const spreadsheets = await client.query(
                `SELECT widget_id, data, headers, updated_at 
                FROM tba_spreadsheets 
                WHERE user_id = $1 AND updated_at > $2`,
                [userId, lastUpdate]
            );

            const finalUserSettings = userSettings.rows[0]?.settings || {};
            
            res.json({
                success: true,
                data: {
                    widgetSettings: widgetSettings.rows,
                    userSettings: finalUserSettings,
                    spreadsheets: spreadsheets.rows
                },
                serverTime: new Date().toISOString()
            });
            
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('sync/data 조회 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/**
 * POST /api/sync/data - 데이터 저장 (로컬 + 서버 동기화)
 */
router.post('/data', authenticateToken, async (req, res) => {
    try {
        const client = await pool.connect();
        
        try {
            const userId = req.user.id;
            const { type, widgetId, data, timestamp } = req.body;
            
            if (!type) {
                return res.status(400).json({ success: false, message: 'type이 필요합니다.' });
            }
            
            // 타입별 처리
            switch (type) {
                case DATA_TYPES.DDAY_TARGET:
                case DATA_TYPES.FAB_POS:
                case DATA_TYPES.TODO_COLOR:
                    // 사용자 전역 설정으로 저장
                    const settingKey = type;
                    await client.query(
                        `INSERT INTO tba_user_settings (user_id, settings, updated_at)
                        VALUES ($1, $2, CURRENT_TIMESTAMP)
                        ON CONFLICT (user_id) DO UPDATE 
                        SET settings = tba_user_settings.settings || $2,
                            updated_at = CURRENT_TIMESTAMP`,
                        [userId, JSON.stringify({ [settingKey]: data })]
                    );
                    break;
                
                case DATA_TYPES.TODO_COLLAPSED:
                case DATA_TYPES.MILESTONE_COLLAPSED:
                case DATA_TYPES.MILESTONE_SETTINGS:
                case DATA_TYPES.TODO_DATA_UPDATE:
                case DATA_TYPES.MILESTONE_DATA_UPDATE:
                    // 위젯별 설정으로 저장 (마지막 업데이트 시각 등)
                    if (!widgetId) {
                        return res.status(400).json({ success: false, message: 'widgetId가 필요합니다.' });
                    }
                    await client.query(
                        `INSERT INTO tba_widget_settings (user_id, widget_id, setting_key, setting_value, updated_at)
                        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                        ON CONFLICT (user_id, widget_id, setting_key) 
                        DO UPDATE SET setting_value = $4, updated_at = CURRENT_TIMESTAMP`,
                        [userId, widgetId, type, String(data)]
                    );
                    break;

                case DATA_TYPES.TODO_TITLE:
                case DATA_TYPES.MILESTONE_TITLE:
                case DATA_TYPES.RECIPE_TITLE:
                case 'data_update': // 범용 데이터 업데이트 신호
                    // 위젯 전용 title 컬럼 또는 범용 업데이트 신호 처리
                    if (!widgetId) {
                        return res.status(400).json({ success: false, message: 'widgetId가 필요합니다.' });
                    }
                    if (type !== 'data_update') {
                        await client.query(
                            `UPDATE tba_user_widgets 
                             SET title = $1 
                             WHERE id = $2 AND user_id = $3`,
                            [String(data), widgetId, userId]
                        );
                    }
                    // 'data_update'는 tba_widget_settings에 저장되어 브로드캐스트됨 (기존 로직 활용)
                    break;

                case DATA_TYPES.TODO_AUTO_DELETE:
                    // 위젯별 설정으로 저장
                    if (!widgetId) {
                        return res.status(400).json({ success: false, message: 'widgetId가 필요합니다.' });
                    }
                    await client.query(
                        `INSERT INTO tba_widget_settings (user_id, widget_id, setting_key, setting_value, updated_at)
                        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                        ON CONFLICT (user_id, widget_id, setting_key) 
                        DO UPDATE SET setting_value = $4, updated_at = CURRENT_TIMESTAMP`,
                        [userId, widgetId, type, String(data)]
                    );
                    // todoApi.js의 삭제 로직이 사용하는 tba_users 테이블도 함께 업데이트
                    await client.query(
                        `UPDATE tba_users SET todo_auto_delete = $1 WHERE id = $2`,
                        [data === true || data === 'true', userId]
                    );
                    break;
                    
                case DATA_TYPES.SPREADSHEET_DATA:
                case DATA_TYPES.SPREADSHEET_HEADERS:
                    // 스프레드시트 데이터 저장
                    if (!widgetId) {
                        return res.status(400).json({ success: false, message: 'widgetId가 필요합니다.' });
                    }
                    
                    const spreadsheetKey = type === DATA_TYPES.SPREADSHEET_DATA ? 'data' : 'headers';
                    await client.query(
                        `INSERT INTO tba_spreadsheets (user_id, widget_id, ${spreadsheetKey}, updated_at)
                        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                        ON CONFLICT (user_id, widget_id) 
                        DO UPDATE SET ${spreadsheetKey} = $3, updated_at = CURRENT_TIMESTAMP`,
                        [userId, widgetId, JSON.stringify(data)]
                    );
                    break;
                    
                default:
                    return res.status(400).json({ success: false, message: '알 수 없는 타입입니다.' });
            }
            
            res.json({
                success: true,
                timestamp: new Date().toISOString()
            });
            
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('sync/data 저장 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/**
 * POST /api/sync/migrate - 로컬 스토리지 마이그레이션
 * 앱 최초 실행 시 로컬 스토리지의 데이터를 서버로 이전
 */
router.post('/migrate', authenticateToken, async (req, res) => {
    try {
        const client = await pool.connect();
        
        try {
            const userId = req.user.id;
            const { localStorageData } = req.body;
            
            if (!localStorageData) {
                return res.status(400).json({ success: false, message: 'localStorageData가 필요합니다.' });
            }
            
            let migratedCount = 0;
            
            // 1. To-Do 체크박스 색상 마이그레이션
            if (localStorageData.todo_checkbox_color) {
                await client.query(
                    `INSERT INTO tba_user_settings (user_id, settings, updated_at)
                    VALUES ($1, $2, CURRENT_TIMESTAMP)
                    ON CONFLICT (user_id) DO UPDATE 
                    SET settings = tba_user_settings.settings || $2`,
                    [userId, JSON.stringify({ [DATA_TYPES.TODO_COLOR]: localStorageData.todo_checkbox_color })]
                );
                migratedCount++;
            }
            
            // 2. D-Day 타겟 마이그레이션
            if (localStorageData.mindmap_dday_target) {
                await client.query(
                    `INSERT INTO tba_user_settings (user_id, settings, updated_at)
                    VALUES ($1, $2, CURRENT_TIMESTAMP)
                    ON CONFLICT (user_id) DO UPDATE 
                    SET settings = tba_user_settings.settings || $2`,
                    [userId, JSON.stringify({ [DATA_TYPES.DDAY_TARGET]: localStorageData.mindmap_dday_target })]
                );
                migratedCount++;
            }
            
            // 3. FAB 위치 마이그레이션
            if (localStorageData.mindmap_fab_pos) {
                await client.query(
                    `INSERT INTO tba_user_settings (user_id, settings, updated_at)
                    VALUES ($1, $2, CURRENT_TIMESTAMP)
                    ON CONFLICT (user_id) DO UPDATE 
                    SET settings = tba_user_settings.settings || $2`,
                    [userId, JSON.stringify({ [DATA_TYPES.FAB_POS]: localStorageData.mindmap_fab_pos })]
                );
                migratedCount++;
            }
            
            // 4. 위젯별 설정 마이그레이션 (todo_collapsed_*, todo_widget_title_*, milestone_*)
            const widgetSettings = localStorageData.widgetSettings || {};
            for (const [key, value] of Object.entries(widgetSettings)) {
                const widgetIdMatch = key.match(/_(\d+)$/);
                if (widgetIdMatch) {
                    const widgetId = widgetIdMatch[1];
                    let settingType = null;
                    
                    if (key.startsWith('todo_collapsed_')) settingType = DATA_TYPES.TODO_COLLAPSED;
                    else if (key.startsWith('todo_widget_title_')) settingType = DATA_TYPES.TODO_TITLE;
                    else if (key.startsWith('milestone_collapsed_')) settingType = DATA_TYPES.MILESTONE_COLLAPSED;
                    else if (key.startsWith('milestone_widget_title_')) settingType = DATA_TYPES.MILESTONE_TITLE;
                    
                    if (settingType) {
                        await client.query(
                            `INSERT INTO tba_widget_settings (user_id, widget_id, setting_key, setting_value, updated_at)
                            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                            ON CONFLICT (user_id, widget_id, setting_key) 
                            DO UPDATE SET setting_value = $4, updated_at = CURRENT_TIMESTAMP`,
                            [userId, widgetId, settingType, String(value)]
                        );
                        migratedCount++;
                    }
                }
            }
            
            // 5. 스프레드시트 데이터 마이그레이션
            if (localStorageData.mindmap_spreadsheet_data) {
                // 기본 스프레드시트 widget_id를 0으로 설정 (메모 팝업용)
                await client.query(
                    `INSERT INTO tba_spreadsheets (user_id, widget_id, data, updated_at)
                    VALUES ($1, 0, $2, CURRENT_TIMESTAMP)
                    ON CONFLICT (user_id, widget_id) 
                    DO UPDATE SET data = $2, updated_at = CURRENT_TIMESTAMP`,
                    [userId, JSON.stringify(localStorageData.mindmap_spreadsheet_data)]
                );
                migratedCount++;
            }
            
            if (localStorageData.mindmap_spreadsheet_headers) {
                await client.query(
                    `INSERT INTO tba_spreadsheets (user_id, widget_id, headers, updated_at)
                    VALUES ($1, 0, $2, CURRENT_TIMESTAMP)
                    ON CONFLICT (user_id, widget_id) 
                    DO UPDATE SET headers = $2, updated_at = CURRENT_TIMESTAMP`,
                    [userId, JSON.stringify(localStorageData.mindmap_spreadsheet_headers)]
                );
                migratedCount++;
            }
            
            // 마이그레이션 완료 플래그 저장
            await client.query(
                `INSERT INTO tba_user_settings (user_id, settings, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id) DO UPDATE 
                SET settings = tba_user_settings.settings || $2`,
                [userId, JSON.stringify({ _migrated: true, _migratedAt: new Date().toISOString() })]
            );
            
            res.json({
                success: true,
                message: `${migratedCount}개 항목 마이그레이션 완료`,
                migratedCount
            });
            
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('sync/migrate 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/**
 * GET /api/sync/migrate/status - 마이그레이션 상태 확인
 */
router.get('/migrate/status', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const result = await pool.query(
            'SELECT settings FROM tba_user_settings WHERE user_id = $1',
            [userId]
        );
        
        const settings = result.rows[0]?.settings || {};
        const isMigrated = settings._migrated === true;
        
        res.json({
            success: true,
            isMigrated,
            migratedAt: settings._migratedAt
        });
    } catch (error) {
        console.error('sync/migrate/status 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

module.exports = router;
