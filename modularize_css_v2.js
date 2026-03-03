const fs = require('fs');
const path = require('path');

const cssDir = path.resolve('frontend/assets/css');
if (!fs.existsSync(cssDir)) {
    fs.mkdirSync(cssDir, { recursive: true });
}

// 현재 모든 내용이 들어있는 variables.css를 소스로 사용
const sourceCss = path.join(cssDir, 'variables.css');
let content = fs.readFileSync(sourceCss, 'utf8');

// 섹션 정의 및 파일 매핑
const sections = [
    { header: '팝업 모달', file: 'components.css' },
    { header: '스크롤바 스타일', file: 'base.css' },
    { header: '위젯 공통 헤더', file: 'widgets.css' },
    { header: '마인드맵 노드 상태', file: 'widgets.css' },
    { header: '기초 리셋', file: 'base.css' },
    { header: '전역 디자인 시스템', file: 'variables.css' },
    { header: '배경 파티클', file: 'base.css' },
    { header: '인증 섹션', file: 'auth.css' },
    { header: '로그인 페이지 중앙 로고', file: 'auth.css' },
    { header: '입력 필드 및 아이콘', file: 'components.css' },
    { header: '체크박스 커스텀', file: 'components.css' },
    { header: '프리미엄 버튼', file: 'components.css' },
    { header: '피드백 게시판', file: 'widgets.css' },
    { header: '페이지네이션 버튼', file: 'components.css' },
    { header: '업데이트 기록', file: 'components.css' },
    { header: '타임라인 스타일', file: 'components.css' },
    { header: '글래스모피즘 입력 폼', file: 'components.css' },
    { header: '게시판 카드 아이템', file: 'widgets.css' },
    { header: '대시보드 전체 구조', file: 'layout.css' },
    { header: '상단 네비게이션 헤더', file: 'layout.css' },
    { header: '사용자 프로필', file: 'layout.css' },
    { header: '메인 대시보드 콘텐츠', file: 'layout.css' },
    { header: '테마 선택기 UI', file: 'components.css' },
    { header: '테마 선택 컬러 칩', file: 'components.css' },
    { header: '우클릭 컨텍스트 메뉴', file: 'components.css' },
    { header: '보더 디테일', file: 'components.css' },
    { header: '[PC 전용]', file: 'layout.css' },
    { header: '그리드 컨테이너', file: 'layout.css' },
    { header: '[모바일 전용]', file: 'responsive.css' }
];

let lines = content.split('\n');
let collections = {
    'variables.css': [],
    'base.css': [],
    'auth.css': [],
    'layout.css': [],
    'components.css': [],
    'widgets.css': [],
    'responsive.css': []
};

let currentFile = 'variables.css';

lines.forEach(line => {
    sections.forEach(s => {
        if (line.includes(s.header)) {
            currentFile = s.file;
        }
    });
    collections[currentFile].push(line);
});

// 파일 저장
let importHeader = '';
for (const [fileName, fileLines] of Object.entries(collections)) {
    const filePath = path.join(cssDir, fileName);
    fs.writeFileSync(filePath, fileLines.join('\n'), 'utf8');
    importHeader += `@import './assets/css/${fileName}';\n`;
}

// 메인 style.css 업데이트
const mainStyleCss = path.resolve('frontend/style.css');
fs.writeFileSync(mainStyleCss, importHeader, 'utf8');

console.log('style.css 정밀 모듈 분리 완료!');
