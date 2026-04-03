/**
 * @file mindmap.js (components)
 * @description 전체화면 마인드맵 캔버스 HTML 구조
 */

export function getMindmapHTML() {
    return `
        <div class="mm-overlay fade-in">

            <!-- ── 상단 툴바 ─────────────────────────────────── -->
            <header class="mm-topbar">
                <div class="mm-topbar-left">
                    <button class="mm-back-btn" id="backToDashFromMindmap" title="대시보드로 돌아가기">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
                        </svg>
                    </button>
                    <div class="mm-brand">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" class="mm-brand-icon">
                            <circle cx="12" cy="12" r="3" fill="#8B5CF6"/>
                            <circle cx="4"  cy="6"  r="2" fill="#06B6D4"/>
                            <circle cx="20" cy="6"  r="2" fill="#F43F5E"/>
                            <circle cx="4"  cy="18" r="2" fill="#10B981"/>
                            <circle cx="20" cy="18" r="2" fill="#F59E0B"/>
                            <line x1="12" y1="12" x2="4"  y2="6"  stroke="#8B5CF6" stroke-width="1.2" opacity="0.6"/>
                            <line x1="12" y1="12" x2="20" y2="6"  stroke="#8B5CF6" stroke-width="1.2" opacity="0.6"/>
                            <line x1="12" y1="12" x2="4"  y2="18" stroke="#8B5CF6" stroke-width="1.2" opacity="0.6"/>
                            <line x1="12" y1="12" x2="20" y2="18" stroke="#8B5CF6" stroke-width="1.2" opacity="0.6"/>
                        </svg>
                        <h2 class="mm-title">Mind Canvas</h2>
                    </div>
                </div>

                <div class="mm-topbar-right">
                    <div class="mm-save-indicator" id="saveStatus"></div>
                    <button class="mm-help-btn" id="mmHelpBtn" title="사용 설명서">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                            <line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                    </button>
                    <button class="mm-save-btn" id="saveMindmapBtn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                            <polyline points="17 21 17 13 7 13 7 21"/>
                            <polyline points="7 3 7 8 15 8"/>
                        </svg>
                        저장
                    </button>
                </div>
            </header>

            <!-- ── 캔버스 영역 ────────────────────────────────── -->
            <div class="mm-canvas-wrap" id="mindmapCanvasContainer">
                <svg id="mindmapSVG" width="100%" height="100%">
                    <defs>
                        <filter id="glass-shadow" x="-30%" y="-30%" width="160%" height="160%">
                            <feGaussianBlur in="SourceAlpha" stdDeviation="6"/>
                            <feOffset dx="0" dy="3" result="blur"/>
                            <feComponentTransfer>
                                <feFuncA type="linear" slope="0.25"/>
                            </feComponentTransfer>
                            <feMerge>
                                <feMergeNode/>
                                <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                        </filter>
                        <filter id="node-glow" x="-40%" y="-40%" width="180%" height="180%">
                            <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur"/>
                            <feMerge>
                                <feMergeNode in="blur"/>
                                <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                        </filter>
                        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                            <polygon points="0 0, 8 3, 0 6" fill="rgba(139,92,246,0.55)"/>
                        </marker>
                    </defs>
                    <g id="mm-pan-group">
                        <g id="linksGroup"></g>
                        <g id="nodesGroup"></g>
                        <g id="resizeOverlay"></g>
                    </g>
                </svg>
            </div>

            <!-- ── 노드 인라인 편집기 ────────────────────────── -->
            <div id="nodeEditor" class="mm-node-editor hidden">
                <input type="text" id="nodeTextInput" placeholder="이름 입력 후 Enter…">
            </div>

            <!-- ── 도움말 모달 ────────────────────────────────── -->
            <div id="mmHelpModal" class="mm-help-modal hidden">
                <div class="mm-help-card">
                    <div class="mm-help-header">
                        <h3 class="mm-help-title">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
                                <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                            Mind Canvas 사용법
                        </h3>
                        <button class="mm-help-close" id="mmHelpClose">✕</button>
                    </div>
                    <div class="mm-help-sections">
                        <div class="mm-help-section">
                            <div class="mm-help-section-title">➕ 도형 추가</div>
                            <div class="mm-help-rows">
                                <div class="mm-help-row"><kbd>우클릭</kbd><span>빈 캔버스에서 우클릭 → 원·사각형·삼각형 메뉴에서 선택</span></div>
                            </div>
                        </div>
                        <div class="mm-help-section">
                            <div class="mm-help-section-title">🖱️ 캔버스 이동</div>
                            <div class="mm-help-rows">
                                <div class="mm-help-row"><kbd>드래그</kbd><span>빈 캔버스에서 좌클릭 드래그하면 화면이 이동됩니다</span></div>
                            </div>
                        </div>
                        <div class="mm-help-section">
                            <div class="mm-help-section-title">🖱️ 노드 조작</div>
                            <div class="mm-help-rows">
                                <div class="mm-help-row"><kbd>드래그</kbd><span>노드를 원하는 위치로 이동</span></div>
                                <div class="mm-help-row"><kbd>더블클릭</kbd><span>이름 편집 모드 진입</span></div>
                                <div class="mm-help-row"><kbd>우클릭</kbd><span>이름 변경 · 크기 조정 · 삭제 메뉴</span></div>
                                <div class="mm-help-row"><kbd>크기 조정</kbd><span>핸들 드래그 → 빈 곳 클릭 또는 Enter로 완료</span></div>
                            </div>
                        </div>
                        <div class="mm-help-section">
                            <div class="mm-help-section-title">🔗 노드 연결</div>
                            <div class="mm-help-rows">
                                <div class="mm-help-row"><kbd>Shift + 클릭</kbd><span>첫 번째 노드 선택 → 두 번째 노드 클릭으로 연결</span></div>
                                <div class="mm-help-row"><kbd>연결선 클릭</kbd><span>연결선을 클릭하면 강조 표시</span></div>
                            </div>
                        </div>
                        <div class="mm-help-section">
                            <div class="mm-help-section-title">⌨️ 단축키</div>
                            <div class="mm-help-rows">
                                <div class="mm-help-row"><kbd>Del / Backspace</kbd><span>선택된 노드 삭제</span></div>
                                <div class="mm-help-row"><kbd>ESC</kbd><span>연결 모드 취소 · 크기 조정 취소 · 선택 해제</span></div>
                                <div class="mm-help-row"><kbd>Enter</kbd><span>편집 완료 · 크기 조정 완료</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── 하단 힌트 바 ───────────────────────────────── -->
            <div class="mm-hint-bar" id="mindmapGuide">
                <span class="mm-hint-item"><kbd>우클릭</kbd> 도형 추가</span>
                <span class="mm-hint-sep">·</span>
                <span class="mm-hint-item"><kbd>드래그</kbd> 화면 이동</span>
                <span class="mm-hint-sep">·</span>
                <span class="mm-hint-item"><kbd>더블클릭</kbd> 편집</span>
                <span class="mm-hint-sep">·</span>
                <span class="mm-hint-item"><kbd>Shift+클릭</kbd> 연결</span>
                <span class="mm-hint-sep">·</span>
                <span class="mm-hint-item"><kbd>Del</kbd> 삭제</span>
            </div>

        </div>
    `;
}
