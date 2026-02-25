const fs = require('fs');
const cssAppends = `
/* ═══ 대시보드 그리드 및 위젯 기본 스타일 (복구본) ═══ */
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
  z-index: 100;
  border-radius: 16px;
  overflow: hidden;
}
.premium-glass-card {
  background: rgba(30, 41, 59, 0.75) !important;
  backdrop-filter: blur(16px) !important;
  -webkit-backdrop-filter: blur(16px) !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.5) !important;
}
.custom-context-menu {
  position: fixed !important;
  display: none;
  border-radius: 14px !important;
  background: rgba(15, 23, 42, 0.98) !important;
  backdrop-filter: blur(20px) !important;
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
  z-index: 100000 !important;
}
`;
fs.appendFileSync('style.css', cssAppends);
console.log('Styles injected!');

.dashboard - grid - v2 {
    position: relative!important;
    width: 100 % !important;
    min - height: calc(100vh - 120px)!important;
    background - image: radial - gradient(rgba(139, 92, 246, 0.15) 1.5px, transparent 1.5px)!important;
    background - size: 30px 30px!important;
    background - position: -15px - 15px!important;
    padding: 30px!important;
    box - sizing: border - box!important;
    overflow: visible!important;
    display: block!important;
}

.draggable - widget {
    position: absolute!important;
    z - index: 100;
    transition: transform 0.2s cubic - bezier(0.175, 0.885, 0.32, 1.275), box - shadow 0.3s ease;
}

.draggable - widget.dragging {
    cursor: grabbing!important;
    z - index: 9999!important;
    transition: none!important;
    opacity: 0.9;
}

.premium - glass - card {
    background: rgba(30, 41, 59, 0.7)!important;
    backdrop - filter: blur(12px)!important;
    -webkit - backdrop - filter: blur(12px)!important;
    border: 1px solid rgba(255, 255, 255, 0.12)!important;
    box - shadow: 0 10px 30px - 5px rgba(0, 0, 0, 0.5)!important;
    border - radius: 16px!important;
    overflow: hidden;
    display: flex;
    flex - direction: column;
}

/* ═══ 컨텍스트 메뉴 스타일 ═══ */
.custom - context - menu {
    position: fixed!important;
    display: none;
    border - radius: 12px!important;
    background: rgba(15, 23, 42, 0.95)!important;
    backdrop - filter: blur(12px)!important;
    border: 1px solid rgba(255, 255, 255, 0.2)!important;
    box - shadow: 0 10px 30px - 5px rgba(0, 0, 0, 0.7)!important;
    padding: 8px!important;
    min - width: 200px!important;
    z - index: 100000!important;
}

.menu - item {
    display: flex!important;
    align - items: center!important;
    gap: 12px!important;
    padding: 10px 14px!important;
    cursor: pointer!important;
    border - radius: 8px!important;
    transition: all 0.2s ease!important;
    color: #fff!important;
    font - size: 14px!important;
}

.menu - item:hover {
    background: rgba(139, 92, 246, 0.4)!important;
}
