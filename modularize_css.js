const fs = require('fs');
const path = require('path');

const cssDir = path.resolve('frontend/assets/css');
if (!fs.existsSync(cssDir)) {
    fs.mkdirSync(cssDir, { recursive: true });
}

const sourceCss = path.resolve('frontend/style.css');
let content = fs.readFileSync(sourceCss, 'utf8');

// 정규식을 이용해 섹션별로 내용을 추출하는 것은 위험하므로, 
// 이전에 삽입한 '───' 주석들을 기준으로 자르거나 
// 주요 키워드 기반으로 분류합니다.

const files = {
    'variables.css': '/* 전역 변수 및 테마 */\\n',
    'base.css': '/* 기초 리셋 및 공통 애니메이션 */\\n',
    'auth.css': '/* 인증 및 로그인 */\\n',
    'layout.css': '/* 대시보드 레이아웃 */\\n',
    'components.css': '/* 공통 컴포넌트 */\\n',
    'widgets.css': '/* 위젯 스타일 */\\n',
    'responsive.css': '/* 모바일 반응형 */\\n'
};

// 여기서는 안전하게 수동 파싱 로직을 시뮬레이션하거나 
// 주요 트리거를 기준으로 자릅니다.

let lines = content.split('\\n');
let currentFile = 'base.css';
let collections = {
    'variables.css': [],
    'base.css': [],
    'auth.css': [],
    'layout.css': [],
    'components.css': [],
    'widgets.css': [],
    'responsive.css': []
};

lines.forEach(line => {
    if (line.includes(':root')) currentFile = 'variables.css';
    else if (line.includes('.auth-container') || line.includes('.auth-card')) currentFile = 'auth.css';
    else if (line.includes('.dashboard-container') || line.includes('.dashboard-header')) currentFile = 'layout.css';
    else if (line.includes('.theme-picker') || line.includes('.btn-primary') || line.includes('.manual-popup')) currentFile = 'components.css';
    else if (line.includes('.widget-') || line.includes('.milestone-') || line.includes('.todo-')) currentFile = 'widgets.css';
    else if (line.includes('@media (max-width: 768px)')) currentFile = 'responsive.css';

    collections[currentFile].push(line);
});

// 파일 저장 및 메인 style.css 업데이트
let importHeader = '';
for (const [fileName, fileLines] of Object.entries(collections)) {
    if (fileLines.length > 0) {
        fs.writeFileSync(path.join(cssDir, fileName), fileLines.join('\\n'), 'utf8');
        importHeader += `@import './assets/css/${fileName}';\\n`;
    }
}

fs.writeFileSync(sourceCss, importHeader, 'utf8');
console.log('style.css 모듈 분리 완료 (frontend/assets/css)');
