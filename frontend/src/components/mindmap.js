/**
 * @file mindmap.js (components)
 * @description 마인드맵 캔버스 화면의 HTML 구조 – 모드 버튼 제거, 단순화
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
                    <div class="mindmap-hints">
                        <span class="hint-badge"><kbd>드래그</kbd> 노드 이동</span>
                        <span class="hint-badge"><kbd>빈 곳 드래그</kbd> 도형 추가</span>
                        <span class="hint-badge"><kbd>Shift+클릭</kbd> 연결</span>
                        <span class="hint-badge"><kbd>더블클릭</kbd> 편집</span>
                        <span class="hint-badge"><kbd>Delete</kbd> 노드 삭제</span>
                    </div>
                </div>
                <div class="tool-right">
                    <button class="btn-tool" id="saveMindmapBtn">저장하기</button>
                    <span class="save-status" id="saveStatus"></span>
                </div>
            </header>

            <div class="mindmap-canvas-container" id="mindmapCanvasContainer">
                <svg id="mindmapSVG" width="100%" height="100%">
                    <defs>
                        <filter id="glass-shadow" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur in="SourceAlpha" stdDeviation="5" />
                            <feOffset dx="2" dy="2" result="offsetblur" />
                            <feComponentTransfer>
                                <feFuncA type="linear" slope="0.3" />
                            </feComponentTransfer>
                            <feMerge>
                                <feMergeNode />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orientation="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="rgba(139,92,246,0.6)" />
                        </marker>
                    </defs>
                    <g id="linksGroup"></g>
                    <g id="nodesGroup"></g>
                </svg>
                <!-- 자유 드로잉을 위한 오버레이 캔버스 -->
                <canvas id="drawingCanvas" class="drawing-canvas"></canvas>
            </div>

            <!-- 인라인 노드 편집 오버레이 -->
            <div id="nodeEditor" class="node-editor-inline hidden">
                <input type="text" id="nodeTextInput" placeholder="입력 후 Enter...">
            </div>

            <div class="mindmap-guide" id="mindmapGuide">빈 곳을 드래그하면 도형을 추가할 수 있습니다.</div>
        </div>
    `;
}
