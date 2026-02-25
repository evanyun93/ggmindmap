const fs = require('fs');
const path = require('path');

// .env 로드 (현재 폴더에 있음)
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { pool } = require('./config/database');

// style.css 경로는 상위-상위-frontend 폴더에 있음
const cssPath = path.join(__dirname, '..', 'frontend', 'style.css');

async function repair() {
    try {
        console.log('--- Starting System Repair (from backend) ---');

        // 1. CSS 복구
        console.log('Reading CSS at:', cssPath);
        let cssContent = fs.readFileSync(cssPath, 'utf8');
        const cutPoint = '.user-section {';
        const index = cssContent.lastIndexOf(cutPoint);

        if (index !== -1) {
            console.log('Found .user-section, cleaning up tail...');
            const nextBrace = cssContent.indexOf('}', index);
            if (nextBrace !== -1) {
                cssContent = cssContent.substring(0, nextBrace + 1);
            }
        }

        const cssAppends = `

/* ═══ 대시보드 그리드 및 위젯 기본 스타일 (안전 복구본) ═══ */
.dashboard-grid-v2 {
  position: relative !important;
  width: 100% !important;
  min-height: calc(100vh - 120px) !important;
  background-image: radial-gradient(rgba(139, 92, 246, 0.15) 1.5px, transparent 1.5px) !important;
  background-size: 30px 30px !important;
  background-position: -15px -15px !important;
  padding: 30px !important;
  box-sizing: border-box !important;
  overflow: visible !important;
  display: block !important;
}

.draggable-widget {
  position: absolute !important;
  z-index: 100 !important;
  border-radius: 16px !important;
  overflow: hidden !important;
  transition: transform 0.2s ease, box-shadow 0.3s ease !important;
}

.premium-glass-card {
  background: rgba(30, 41, 59, 0.85) !important;
  backdrop-filter: blur(20px) !important;
  -webkit-backdrop-filter: blur(20px) !important;
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6) !important;
  display: flex !important;
  flex-direction: column !important;
}

.custom-context-menu {
  position: fixed !important;
  display: none;
  border-radius: 14px !important;
  background: rgba(15, 23, 42, 0.98) !important;
  backdrop-filter: blur(24px) !important;
  border: 1px solid rgba(255, 255, 255, 0.25) !important;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7) !important;
  padding: 8px !important;
  min-width: 220px !important;
  z-index: 100000 !important;
}

.menu-item {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  padding: 12px 16px !important;
  cursor: pointer !important;
  border-radius: 10px !important;
  transition: all 0.2s ease !important;
  color: #ffffff !important;
  font-size: 14.5px !important;
}

.menu-item:hover {
  background: rgba(139, 92, 246, 0.5) !important;
  transform: translateX(5px) !important;
}
`;
        fs.writeFileSync(cssPath, cssContent + cssAppends, 'utf8');
        console.log('CSS Repaired!');

        // 2. DB 위젯 주입
        console.log('Checking users in DB...');
        const usersRes = await pool.query('SELECT id, username FROM tba_users');
        console.log(`Found ${usersRes.rowCount} users.`);

        for (const user of usersRes.rows) {
            const widgetCheck = await pool.query('SELECT id FROM tba_user_widgets WHERE user_id = $1', [user.id]);
            if (widgetCheck.rowCount === 0) {
                console.log(`Initalizing widgets for ${user.username}...`);
                await pool.query(`
                    INSERT INTO tba_user_widgets (user_id, widget_type, x, y, width, height, settings) 
                    VALUES 
                    ($1, 'milestone', 20, 20, 700, 340, '{}'), 
                    ($1, 'todo', 740, 20, 400, 540, '{}'), 
                    ($1, 'mindmap', 20, 380, 700, 180, '{}')`,
                    [user.id]
                );
            }
        }

        console.log('--- Repair Finished Successfully ---');
        process.exit(0);
    } catch (err) {
        console.error('ERROR:', err);
        process.exit(1);
    }
}

repair();
