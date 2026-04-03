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

            <!-- ── 색상 선택기 ───────────────────────────────── -->
            <div id="mmColorPicker" class="mm-color-picker hidden">
                <div class="mm-color-picker-label">색상 선택</div>
                <div class="mm-color-swatches" id="mmColorSwatches"></div>
            </div>

            <!-- ── 노드 인라인 편집기 ────────────────────────── -->
            <div id="nodeEditor" class="mm-node-editor hidden">
                <textarea id="nodeTextInput" placeholder="이름 입력…"
                    autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" rows="1"></textarea>
                <div class="mm-editor-hint">⌨ <kbd>Shift+Enter</kbd> 편집 완료</div>
            </div>

            <!-- ── 도움말 모달 (모달리스 · 드래그 가능) ──────── -->
            <div id="mmHelpModal" class="mm-help-modal hidden">
                <div class="mm-help-card">
                    <div class="mm-help-header" id="mmHelpDragHandle">
                        <h3 class="mm-help-title">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
                                <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                            Mind Canvas 사용법
                        </h3>
                        <button class="mm-help-close" id="mmHelpClose">✕</button>
                    </div>
                    <div class="mm-help-sections">
                        <!-- 모바일 전용 조작법 -->
                        <div class="mm-help-section mm-mobile-only">
                            <div class="mm-help-section-title">📱 터치 조작</div>
                            <div class="mm-help-rows">
                                <div class="mm-help-row"><kbd>하단 ⭕▭△ 버튼</kbd><span>도형 추가</span></div>
                                <div class="mm-help-row"><kbd>꾹 누르기 (캔버스)</kbd><span>도형 추가 메뉴</span></div>
                                <div class="mm-help-row"><kbd>한 손가락 드래그</kbd><span>화면 이동</span></div>
                                <div class="mm-help-row"><kbd>두 손가락 핀치</kbd><span>줌인 / 줌아웃</span></div>
                                <div class="mm-help-row"><kbd>노드 드래그</kbd><span>노드 이동</span></div>
                                <div class="mm-help-row"><kbd>노드 두 번 탭</kbd><span>이름 편집</span></div>
                                <div class="mm-help-row"><kbd>노드 꾹 누르기</kbd><span>편집 / 삭제 메뉴</span></div>
                                <div class="mm-help-row"><kbd>🔗 연결 버튼</kbd><span>첫 번째 노드 탭 → 두 번째 노드 탭으로 연결</span></div>
                            </div>
                        </div>
                        <!-- PC 전용 조작법 -->
                        <div class="mm-help-section mm-desktop-only">
                            <div class="mm-help-section-title">➕ 도형 추가</div>
                            <div class="mm-help-rows">
                                <div class="mm-help-row"><kbd>우클릭</kbd><span>빈 캔버스에서 우클릭 → 원·사각형·삼각형 선택</span></div>
                            </div>
                        </div>
                        <div class="mm-help-section mm-desktop-only">
                            <div class="mm-help-section-title">🖱️ 화면 이동 / 줌</div>
                            <div class="mm-help-rows">
                                <div class="mm-help-row"><kbd>드래그</kbd><span>빈 캔버스에서 좌클릭 드래그하면 화면 이동</span></div>
                                <div class="mm-help-row"><kbd>마우스 휠</kbd><span>줌인 / 줌아웃</span></div>
                            </div>
                        </div>
                        <div class="mm-help-section">
                            <div class="mm-help-section-title">🖱️ 노드 조작</div>
                            <div class="mm-help-rows">
                                <div class="mm-help-row"><kbd>드래그</kbd><span>노드를 원하는 위치로 이동</span></div>
                                <div class="mm-help-row"><kbd>더블클릭</kbd><span>이름 편집 모드 진입</span></div>
                                <div class="mm-help-row"><kbd>우클릭</kbd><span>이름 변경 · 크기 조정 · 삭제 메뉴</span></div>
                            </div>
                        </div>
                        <div class="mm-help-section mm-desktop-only">
                            <div class="mm-help-section-title">🔗 노드 연결</div>
                            <div class="mm-help-rows">
                                <div class="mm-help-row"><kbd>Shift + 클릭</kbd><span>첫 번째 노드 → 두 번째 노드 클릭으로 연결</span></div>
                            </div>
                        </div>
                        <div class="mm-help-section mm-desktop-only">
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

            <!-- ── 하단 힌트 바 (PC 전용) ─────────────────────── -->
            <div class="mm-hint-bar" id="mindmapGuide">
                <span class="mm-hint-item"><kbd>우클릭</kbd> 도형 추가</span>
                <span class="mm-hint-sep">·</span>
                <span class="mm-hint-item"><kbd>드래그</kbd> 화면 이동</span>
                <span class="mm-hint-sep">·</span>
                <span class="mm-hint-item"><kbd>더블클릭</kbd> 편집</span>
                <span class="mm-hint-sep">·</span>
                <span class="mm-hint-item"><kbd>Shift+클릭</kbd> 연결</span>
                <span class="mm-hint-sep">·</span>
                <span class="mm-hint-item"><kbd>휠</kbd> 줌</span>
            </div>

            <!-- ── 모바일 하단 액션 바 ────────────────────────── -->
            <div class="mm-mobile-bar" id="mmMobileBar">
                <!-- 도형 추가 버튼 -->
                <div class="mm-mob-shapes">
                    <button class="mm-mob-shape-btn" id="mmMobCircle">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/></svg>
                        원
                    </button>
                    <button class="mm-mob-shape-btn" id="mmMobRect">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="6" width="18" height="12" rx="3"/></svg>
                        사각형
                    </button>
                    <button class="mm-mob-shape-btn" id="mmMobTriangle">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="12,4 21,20 3,20"/></svg>
                        삼각형
                    </button>
                </div>

                <!-- 컨트롤 버튼 -->
                <div class="mm-mob-controls">
                    <button class="mm-mob-ctrl-btn" id="mmMobConnect">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="5" cy="12" r="3"/><circle cx="19" cy="6" r="3"/><circle cx="19" cy="18" r="3"/><line x1="8" y1="10.5" x2="16" y2="7.5"/><line x1="8" y1="13.5" x2="16" y2="16.5"/></svg>
                        <span>연결</span>
                    </button>
                    <button class="mm-mob-ctrl-btn" id="mmMobDelete">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        <span>삭제</span>
                    </button>
                    <button class="mm-mob-ctrl-btn" id="mmMobFit">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
                        <span>맞추기</span>
                    </button>
                    <div class="mm-mob-zoom">
                        <button class="mm-mob-zoom-btn" id="mmZoomOut">−</button>
                        <span class="mm-zoom-level" id="mmZoomLevel">100%</span>
                        <button class="mm-mob-zoom-btn" id="mmZoomIn">+</button>
                    </div>
                </div>
            </div>

        </div>
    `;
}
