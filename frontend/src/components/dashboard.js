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
          <button class="btn-feedback" id="feedbackBtn">고객의 소리함</button>
          <span class="user-name">안녕하세요, <strong>${user.displayName || user.username}</strong>님</span>
          <button class="btn-logout" id="logoutBtn">로그아웃</button>
        </div>
      </header>
      <div class="dashboard-content" id="dashboardContent">
        <div class="dashboard-main-split">
          <!-- 좌측: 환영 메시지 섹션 -->
          <div class="welcome-section">
            <div class="welcome-card-premium premium-glass">
              <div class="welcome-icon">🧠</div>
              <h2>마인드맵에 오신 것을 환영합니다!</h2>
              <h3>현재 PC버전에서만 최적화 되어있으며<br>추후 모바일 버전도 추가될 예정입니다.<br>업데이트 진척사항은 하단의 Version을 눌러주세요!</h3>
              <div class="welcome-desc">
                <p>우측 상단의 메모 버튼을 클릭하여 엑셀 기능을 사용할 수 있습니다.</p>
                <p>현재 <strong>Private To-Do</strong> 및 <strong>Mind Canvas</strong> 기능이 추가되었습니다.<br>본인만의 생각을 정리하고 관리해보세요.</p>
              </div>
            </div>
          </div>

          <!-- 우측: 위젯 섹션 (2열 그리드) -->
          <div class="widgets-section">
            <div class="dashboard-grid-v2" id="widgetGrid">
              <!-- 1. D-Day 위젯 -->
              <div class="dashboard-card premium-glass-card widget-dday draggable-widget" data-id="dday">
                <div class="drag-handle">⋮⋮</div>
                <div class="card-icon">📅</div>
                <h3>나의 마일스톤</h3>
                <div class="dday-content-mini">
                  <div class="dday-info">
                    <span class="label">목표까지</span>
                    <span class="value" id="mainDdayCount">-</span>
                  </div>
                </div>
                <div class="resize-handle"></div>
              </div>

              <!-- 2. 프라이빗 To-Do 위젯 -->
              <div class="dashboard-card premium-glass-card widget-todo draggable-widget" data-id="todo">
                <div class="drag-handle">⋮⋮</div>
                <div class="card-icon">✅</div>
                <h3>오늘의 할 일</h3>
                <div class="todo-list-container" id="todoListContainer">
                  <div class="loader-mini">불러오는 중...</div>
                </div>
                <div class="todo-input-group">
                  <input type="text" id="todoInput" placeholder="할 일 추가...">
                  <button id="addTodoBtn">+</button>
                </div>
                <div class="resize-handle"></div>
              </div>

              <!-- 3. 마인드맵 바로가기 카드 -->
              <div class="dashboard-card premium-glass-card widget-mindmap-cta draggable-widget" id="startMindmapBtn" data-id="mindmap" style="grid-column: span 2;">
                <div class="drag-handle">⋮⋮</div>
                <div class="card-icon-mini">🧠</div>
                <div class="cta-text">
                  <h3>생각 그리기 (Mind Canvas)</h3>
                  <p>나만의 복잡한 생각을 시각화하고 정리해보세요.</p>
                </div>
                <button class="btn-primary-gradient">시작하기</button>
                <div class="resize-handle"></div>
              </div>
            </div>
          </div>
        </div>
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
