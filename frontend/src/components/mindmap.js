/**
 * @file mindmap.js
 * @description 마인드맵 캔버스 화면의 HTML 구조를 생성합니다.
 */

export function getMindmapHTML() {
    return `
        <div class="mindmap-fullscreen-overlay fade-in">
            <header class="mindmap-toolbar premium-glass">
                <div class="tool-left">
                    <button class="btn-icon" id="backToDashFromMindmap" title="돌아가기">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    </button>
                    <h2 class="mindmap-title">Mind Canvas</h2>
                </div>
                <div class="tool-center">
                    <button class="btn-tool" id="addNodeBtn">노드 추가 (+)</button>
                    <button class="btn-tool" id="saveMindmapBtn">저장하기</button>
                    <span class="save-status" id="saveStatus"></span>
                </div>
                <div class="tool-right">
                    <div class="zoom-controls">
                        <button id="zoomOut">-</button>
                        <span id="zoomLevel">100%</span>
                        <button id="zoomIn">+</button>
                    </div>
                </div>
            </header>
            
            <div class="mindmap-canvas-container" id="mindmapCanvasContainer">
                <svg id="mindmapSVG" width="100%" height="100%">
                    <g id="linksGroup"></g>
                    <g id="nodesGroup"></g>
                </svg>
            </div>

            <!-- 노드 편집 팝오버 -->
            <div id="nodeEditor" class="node-editor hidden premium-glass">
                <input type="text" id="nodeTextInput" placeholder="생각 입력...">
                <div class="editor-btns">
                    <button id="deleteNodeBtn" class="btn-danger-mini">삭제</button>
                    <button id="closeEditorBtn">닫기</button>
                </div>
            </div>

            <div class="mindmap-guide">기본 노드를 더블클릭해서 시작하세요! (드래그로 이동 가능)</div>
        </div>
    `;
}
