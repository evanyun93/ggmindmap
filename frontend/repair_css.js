const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'style.css');
let content = fs.readFileSync(cssPath, 'utf8');

// 파손된 부분 찾기 (예상되는 마지막 정상 부분: .user-section)
const lastNormalBlock = '.user-section {';
const index = content.lastIndexOf(lastNormalBlock);

if (index !== -1) {
    // .user-section 블록까지만 남기고 이하 절단
    // 닫는 괄호 } 까지 포함하도록 정밀 절단
    const nextCloseBrace = content.indexOf('}', index);
    if (nextCloseBrace !== -1) {
        content = content.substring(0, nextCloseBrace + 1);
    }
}

// 깨끗해진 파일 끝에 스타일 추가
const extraStyles = `

/* ═══ 커스텀 컨텍스트 메뉴 (Node.js 복구본) ═══ */
.custom-context-menu {
  position: fixed !important;
  display: none;
  border-radius: 12px !important;
  background: rgba(15, 23, 42, 0.95) !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
  box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.7) !important;
  padding: 8px !important;
  min-width: 200px !important;
  z-index: 100000 !important;
  animation: menuFadeIn 0.2s ease-out !important;
}

@keyframes menuFadeIn {
  from { opacity: 0; transform: translateY(-10px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.menu-item {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  padding: 12px 16px !important;
  cursor: pointer !important;
  border-radius: 8px !important;
  transition: all 0.2s ease !important;
  color: #ffffff !important;
  font-size: 14.5px !important;
  font-weight: 500 !important;
}

.menu-item:hover {
  background: rgba(139, 92, 246, 0.5) !important;
  color: #fff !important;
  transform: translateX(5px) !important;
}

.menu-icon {
  font-size: 18px !important;
  width: 24px !important;
  display: flex !important;
  justify-content: center !important;
}

.menu-separator {
  height: 1px !important;
  background: rgba(255, 255, 255, 0.15) !important;
  margin: 8px 4px !important;
}
`;

fs.writeFileSync(cssPath, content + extraStyles, 'utf8');
console.log('style.css 복구 완료!');
