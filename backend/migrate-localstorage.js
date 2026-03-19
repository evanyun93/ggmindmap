/**
 * @file backend/migrate-localstorage.js
 * @description 로컬 스토리지 데이터를 데이터베이스로 마이그레이션하는 스크립트입니다.
 * 
 * 마이그레이션 항목:
 * - todo_collapsed_{id} → tba_user_widgets.settings.collapsed
 * - todo_checkbox_color → tba_user_widgets.settings.checkboxColor
 * - todo_widget_title_{id} → tba_user_widgets.settings.title
 * - mindmap_dday_target → tba_user_widgets.settings.ddayTarget (또는独立的表)
 * - mindmap_fab_pos → tba_user_widgets.settings.fabPos
 * - mindmap_spreadsheet_data → tba_spreadsheets (신규 테이블)
 * - mindmap_spreadsheet_headers → tba_spreadsheets (신규 테이블)
 */

const { pool } = require('./config/database');

/**
 * 마이그레이션 실행
 */
async function migrateLocalStorageData() {
    const client = await pool.connect();
    
    try {
        console.log('=== LocalStorage → Database 마이그레이션 시작 ===\n');
        
        // 1. 마일스톤 테이블 생성 (독립 데이터 저장용)
        await client.query(`
            CREATE TABLE IF NOT EXISTS tba_milestones (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES tba_users(id) NOT NULL,
                widget_id INTEGER REFERENCES tba_user_widgets(id),
                title VARCHAR(100) DEFAULT '나의 마일스톤',
                collapsed BOOLEAN DEFAULT FALSE,
                settings JSONB DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ tba_milestones 테이블 확인/생성 완료');
        
        // 2. 스프레드시트 테이블 생성
        await client.query(`
            CREATE TABLE IF NOT EXISTS tba_spreadsheets (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES tba_users(id) NOT NULL,
                widget_id INTEGER REFERENCES tba_user_widgets(id),
                data JSONB DEFAULT '{}',
                headers JSONB DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ tba_spreadsheets 테이블 확인/생성 완료');
        
        // 3. 위젯 설정 마이그레이션 (tba_user_widgets에 settings JSONB로 통합)
        // todo_collapsed_*, todo_widget_title_* → settings에 추가
        // mindmap_fab_pos → settings에 추가
        
        console.log('\n📋 로컬 스토리지에서 데이터 읽기 (프론트엔드에서 실행 예정)');
        console.log('   - 이 스크립트는 백엔드 테이블 생성만 담당합니다.');
        console.log('   - 실제 데이터 마이그레이션은 프론트엔드 sync.js의 마이그레이션 함수에서 수행됩니다.');
        
        // 4. 마이그레이션용 API 엔드포인트 생성 안내
        console.log('\n📝 백엔드 API 엔드포인트 생성 필요:');
        console.log('   - POST /api/sync/migrate - 마이그레이션 데이터 제출');
        console.log('   - GET /api/sync/check - 마이그레이션 상태 확인');
        
        console.log('\n=== 마이그레이션 테이블 준비 완료 ===');
        
    } catch (error) {
        console.error('❌ 마이그레이션 실패:', error);
    } finally {
        client.release();
    }
}

// 스크립트 직접 실행 시
if (require.main === module) {
    migrateLocalStorageData()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = { migrateLocalStorageData };
