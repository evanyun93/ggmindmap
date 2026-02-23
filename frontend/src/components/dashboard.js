/**
 * @file dashboard.js
 * @description 대시보드의 HTML 구조를 생성하고 UI 레이아웃을 관리합니다.
 */

/**
 * 대시보드 기본 레이아웃 HTML을 반환합니다.
 * @param {object} user - 유저 정보
 * @returns {string} 대시보드 HTML 문자열
 */
export function getDashboardHTML(user) {
  return `
    <div class="bg-particles" id="particles2"></div>
    <div class="dashboard-container">
      <header class="dashboard-header">
        <div class="logo-section">
          ${getLogoSVG()}
          <h2>MindMap</h2>
        </div>
        <div class="user-section">
          <div class="account-link-zone">
            ${user.socialProvider ?
      `<span class="badge-social linked ${user.socialProvider}" title="${user.socialProvider} 계정으로 연동되었습니다.">
                ${user.socialProvider === 'kakao' ? 'K' : 'N'} 연동됨
               </span>` :
      `<button class="btn-link-mini kakao" id="linkKakaoBtn" title="카카오 계정 연동">K</button>
               <button class="btn-link-mini naver" id="linkNaverBtn" title="네이버 계정 연동">N</button>`
    }
          </div>
          <button class="btn-feedback" id="feedbackBtn">고객의 소리함</button>
          <span class="user-name">안녕하세요, <strong>${user.displayName || user.username}</strong>님</span>
          <button class="btn-logout" id="logoutBtn">로그아웃</button>
        </div>
      </header>
      <div class="dashboard-content" id="dashboardContent">
        ${getMainDashboardContentHTML(user)}
      </div>

      <!-- 플로팅 메모 버튼 (FAB) -->
      <button class="memo-fab" id="memoFab" title="메모장 열기">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
      </button>

      <!-- 메모 팝업 -->
      <div class="memo-popup hidden" id="memoPopup">
        <div class="memo-header">
          <span style="flex:1;">빠른 메모 (수식 지원)</span>
          <button class="close-popup" id="closeMemo">×</button>
        </div>

        <!-- D-Day 위젯 -->
        <div class="dday-widget">
            <div class="dday-header-row">
                <span class="dday-title">오늘 날짜</span>
                <span class="dday-today" id="todayDate">-</span>
            </div>
            <div class="dday-header-row" style="cursor:pointer;" id="targetDateRow">
                <span class="dday-title">목표 날짜</span>
                <span class="dday-today" id="targetDateDisplay" style="color:var(--text-primary);">-</span>
                <input type="date" id="ddayInput" class="dday-input" style="position:absolute; opacity:0; pointer-events:none;">
            </div>
            <div class="dday-content">
                <div class="dday-item">
                    <span class="dday-label">D-Day</span>
                    <span class="dday-value" id="ddayCount">-</span>
                </div>
                <div class="dday-item">
                    <span class="dday-label">남은 토요일</span>
                    <span class="dday-value" id="saturdayCount">-</span>
                </div>
            </div>
        </div>

      <div id="spreadsheet-widget"></div>
      </div>
    </div>
  `;
}

/**
 * 로고 SVG 문자열을 반환합니다.
 */
function getLogoSVG() {
  return `
    <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="8" fill="url(#grad1)" />
        <circle cx="24" cy="8" r="4" fill="url(#grad2)" />
        <circle cx="38" cy="16" r="4" fill="url(#grad2)" />
        <circle cx="38" cy="32" r="4" fill="url(#grad2)" />
        <circle cx="24" cy="40" r="4" fill="url(#grad2)" />
        <circle cx="10" cy="32" r="4" fill="url(#grad2)" />
        <circle cx="10" cy="16" r="4" fill="url(#grad2)" />
        <defs>
          <linearGradient id="grad1" x1="16" y1="16" x2="32" y2="32">
            <stop stop-color="#8B5CF6"/>
            <stop offset="1" stop-color="#06B6D4"/>
          </linearGradient>
          <linearGradient id="grad2" x1="0" y1="0" x2="48" y2="48">
            <stop stop-color="#A78BFA"/>
            <stop offset="1" stop-color="#22D3EE"/>
          </linearGradient>
        </defs>
    </svg>`;
}

/**
 * 대시보드 메인 콘텐츠 영역(#dashboardContent)의 HTML만 반환합니다.
 */
export function getMainDashboardContentHTML(user) {
  return `
        <div class="dashboard-main-split">
          <!-- 상단: 환영 메시지 섹션 (Full Width) -->
          <div class="welcome-section wide-layout" id="welcomeSection">
            <div class="welcome-card-premium premium-glass">
              <button class="welcome-close-btn" id="closeWelcomeBtn" title="닫기">&times;</button>
              <div class="welcome-header-content">
                <div class="welcome-icon">🧠</div>
                <div class="welcome-text">
                  <h2>마인드맵에 오신 것을 환영합니다!</h2>
                  <p>나만의 복잡한 생각을 시각화하고 <strong>Private To-Do</strong>와 <strong>마일스톤</strong>으로 체계적으로 관리해보세요.</p>
                </div>
              </div>
              <div class="welcome-info-strip">
                <div class="info-links">
                  <span>현재 PC 버전에 최적화되어 있습니다.</span>
                  <span>업데이트 소식은 하단의 <strong>Version</strong>을 클릭해주세요.</span>
                </div>
                <!-- 다시 보지 않기 -->
                <label class="welcome-dont-show">
                  <input type="checkbox" id="dontShowAgainCheckbox"> 다시 보지 않기
                </label>
              </div>
            </div>
          </div>

          <!-- 상단: 중앙 로고 섹션 (환영 메시지 숨김 시 노출) -->
          <div class="central-logo-section hidden" id="centralLogoSection">
            <div class="central-logo-content">
              <div class="mega-logo">
                ${getLogoSVG()}
              </div>
              <h1>${user.displayName || user.username}'s MindMap</h1>
            </div>
          </div>

          <!-- 하단: 위젯 섹션 (Wide Whiteboard) -->
          <div class="widgets-section wide-layout">
            <div class="dashboard-grid-v2" id="widgetGrid">
              <!-- 테마 선택 UI: 화이트보드 우상단으로 이동 -->
              <div class="theme-picker-premium whiteboard-theme-picker">
                <button class="theme-chip midnight active" data-theme="midnight" title="Midnight"></button>
                <button class="theme-chip blueprint" data-theme="blueprint" title="Blueprint"></button>
                <button class="theme-chip classic" data-theme="classic" title="Classic"></button>
                <button class="theme-chip dark" data-theme="dark" title="Dark"></button>
              </div>

              <!-- 1. D-Day 위젯 -->
              <div class="dashboard-card premium-glass-card widget-milestone draggable-widget" data-id="milestone">
                <div class="drag-handle">⋮⋮</div>
                <div class="widget-header clickable-header" id="milestoneHeader" title="접기/펼치기">
                  <div class="header-main">
                    <div class="card-icon">📅</div>
                    <h3>나의 마일스톤</h3>
                  </div>
                  <div class="toggle-icon-wrapper" id="milestoneToggleBtn">
                    <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </div>
                </div>

                <div class="milestone-collapsible-wrapper" id="milestoneCollapsible">
                  <div class="milestone-content">
                    <div class="milestone-main-info">
                      <div class="milestone-dday-badge" id="milestoneDdayBadge">-</div>
                      <div class="milestone-text-info">
                        <p class="target-date" id="milestoneTargetDate">목표일을 설정해주세요</p>
                        <p class="sub-info" id="milestoneSubInfo">남은 토요일: -회</p>
                      </div>
                    </div>
                    <div class="milestone-separator"></div>
                    <div class="milestone-spreadsheet-summary">
                      <h4>📊 메모 요약</h4>
                      <div id="milestoneSheetSummary" class="summary-list">
                        <div class="loader-mini">불러오는 중...</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="resize-handle"></div>
              </div>

              <!-- 2. 프라이빗 To-Do 위젯 -->
              <div class="dashboard-card premium-glass-card widget-todo draggable-widget" data-id="todo">
                <div class="drag-handle">⋮⋮</div>
                <div class="widget-header clickable-header" id="todoHeader" title="접기/펼치기">
                  <div class="header-main">
                    <div class="card-icon">✅</div>
                    <h3>오늘의 할 일</h3>
                  </div>
                  <div class="toggle-icon-wrapper" id="todoToggleBtn">
                    <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </div>
                </div>
                
                <div class="todo-collapsible-wrapper" id="todoCollapsible">
                  <div class="todo-input-group-premium">
                    <div class="premium-input-wrapper">
                      <input type="text" id="todoInput" placeholder="할 일을 입력하세요...">
                      <button id="addTodoBtn" class="btn-add-todo">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                      </button>
                    </div>
                  </div>
                  <div class="todo-list-container" id="todoListContainer">
                    <div class="loader-mini">불러오는 중...</div>
                  </div>
                </div>
                <div class="resize-handle"></div>
              </div>

              <!-- 3. 마인드맵 바로가기 카드 -->
              <div class="dashboard-card premium-glass-card widget-mindmap-cta draggable-widget" data-id="mindmap">
                <div class="drag-handle">⋮⋮</div>
                <div class="card-icon-mini">🧠</div>
                <div class="cta-content-wrapper">
                  <div class="cta-text">
                    <h3>생각 그리기(추후 업데이트 예정)</h3>
                    <p>마인드맵으로 복잡한 아이디어를 시각화하세요.</p>
                  </div>
                  <button id="realStartMindmapBtn" class="cta-button-premium">
                    <span>시작하기</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
                  </button>
                </div>
                <div class="resize-handle"></div>
              </div>
            </div>
          </div>
        </div>
  `;
}
