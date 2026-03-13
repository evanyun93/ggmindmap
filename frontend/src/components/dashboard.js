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
  // 디버깅
  console.log('[Dashboard] user info:', user);

  // social_ids 배열에서 연결된 provider 목록 추출 (하위 호환성: socialProvider도 확인)
  const socialIds = user.socialIds || [];
  const connectedProviders = socialIds.map(s => s.provider).filter(Boolean);

  // 단일 provider 필드도 하위 호환성을 위해 확인
  if (user.socialProvider && !connectedProviders.includes(user.socialProvider)) {
    connectedProviders.push(user.socialProvider);
  }

  // 프로바이더 배지 생성 함수
  const getProviderBadge = (provider, isLinked = true) => {
    const label = provider === 'kakao' ? 'K' : (provider === 'naver' ? 'N' : (provider === 'github' ? 'G' : (provider === 'google' ? 'G' : provider.charAt(0).toUpperCase())));
    const title = isLinked ? `${provider} 계정으로 연동되었습니다.` : `${provider} 계정 연동`;
    const className = isLinked ? 'badge-social linked' : `btn-link-mini ${provider}`;
    const content = isLinked ? label : `Link ${label}`;
    const id = isLinked ? '' : `id="link${provider.charAt(0).toUpperCase() + provider.slice(1)}Btn"`;
    return `<span class="${className} ${provider}" title="${title}" ${id}>${content}</span>`;
  };

  // 연결된 모든 프로바이더에 대한 배지 HTML 생성
  const connectedBadgesHtml = connectedProviders
    .map(provider => getProviderBadge(provider, true))
    .join(' ');

  // 연결되지 않은 프로바이ader에 대한 링크 버튼 생성
  const allProviders = ['kakao', 'naver', 'github', 'google'];
  const unconnectedProviders = allProviders.filter(p => !connectedProviders.includes(p));
  const linkButtonsHtml = unconnectedProviders
    .map(provider => `<button class="btn-link-mini ${provider}" id="link${provider.charAt(0).toUpperCase() + provider.slice(1)}Btn" title="${provider} 계정 연동">${provider === 'kakao' ? 'K' : (provider === 'naver' ? 'N' : (provider === 'github' ? 'G' : 'G'))}</button>`)
    .join(' ');

  // 이메일 미등록 알림 (이메일이 없는 모든 사용자)
  const emailWarning = !user.email ? `
    <div class="email-warning" style="
      background: #fff3cd; color: #856404; padding: 12px 16px; 
      border-radius: 8px; margin-bottom: 16px; display: flex; 
      align-items: center; justify-content: space-between; gap: 12px;
      border: 1px solid #ffeeba;
    ">
      <span>📧 이메일을 등록하면 카카오/네이버 계정과 연동할 수 있습니다.</span>
      <button id="addEmailBtn" style="
        background: #ffc107; border: none; padding: 6px 12px; 
        border-radius: 4px; cursor: pointer; font-weight: 600;
      ">이메일 추가</button>
    </div>
  ` : '';

  // 비밀번호 미설정 알림 (tba_users 테이블의 password 필드가 비어있을 때만 표시)
  console.log('[Dashboard] user.hasPassword:', user.hasPassword, 'user.socialIds:', user.socialIds);
  const noPasswordWarning = !user.hasPassword ? `
    <div class="password-warning" style="
      background: #cce5ff; color: #004085; padding: 12px 16px; 
      border-radius: 8px; margin-bottom: 16px; display: flex; 
      align-items: center; justify-content: space-between; gap: 12px;
      border: 1px solid #b8daff;
    ">
      <span>🔐 일반 로그인을 위해 아이디와 비밀번호를 설정 해보세요.</span>
      <button id="setPasswordBtn" style="
        background: #007bff; color: white; border: none; padding: 6px 12px; 
        border-radius: 4px; cursor: pointer; font-weight: 600;
      ">비밀번호 설정</button>
    </div>
  ` : '';

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
            ${connectedProviders.length > 0 ?
      `${connectedBadgesHtml} ${linkButtonsHtml}` :
      `<button class="btn-link-mini kakao" id="linkKakaoBtn" title="카카오 계정 연동">K</button>
               <button class="btn-link-mini naver" id="linkNaverBtn" title="네이버 계정 연동">N</button>`
    }
          </div>
          <div class="nav-actions">
            <button class="btn-manual" id="manualBtn">매뉴얼</button>
            <button class="btn-feedback" id="feedbackBtn">소리함</button>
            ${(user && user.login_id && user.login_id.toLowerCase() === 'admin') ? '<button class="btn-admin" id="adminBtn">관리자</button>' : ''}
            <button class="btn-logout" id="logoutBtn">로그아웃</button>
          </div>
          <span class="user-name mobile-hide" data-user-debug="${user.login_id}">안녕하세요, <strong>${user.displayName || user.login_id}</strong>님 ${connectedBadgesHtml}</span>
        </div>
      </header>
      <div class="dashboard-content" id="dashboardContent">
        ${emailWarning}
        ${noPasswordWarning}
        ${getMainDashboardContentHTML(user)}
      </div>

      <!-- 매뉴얼 팝업 -->
      <div class="manual-popup hidden" id="manualPopup">
        <div class="manual-header">
          <span style="flex:1;">📝 MindMap 사용 매뉴얼</span>
          <button class="close-popup" id="closeManual">×</button>
        </div>
        <div class="manual-content" id="manualContent" style="overflow-y:auto; max-height:60vh; padding:18px 8px 8px 8px; background:rgba(255,255,255,0.03); border-radius:12px;">
          로딩 중...
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
              <h1>${user.displayName || user.login_id}'s MindMap</h1>
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
              <!-- 동적 위젯이 여기에 렌더링됩니다 -->
            </div>
          </div>

          <div class="mobile-scroll-controller" id="mobileScrollController" aria-label="대시보드 스크롤 컨트롤러">
            <div class="mobile-scroll-fader" id="mobileScrollFader">
              <div class="mobile-scroll-fader-track" id="mobileScrollTrack" aria-hidden="true">
                <div class="mobile-scroll-fader-fill" id="mobileScrollFill"></div>
                <button
                  type="button"
                  class="mobile-scroll-fader-thumb"
                  id="mobileScrollThumb"
                  role="slider"
                  tabindex="0"
                  aria-label="대시보드 세로 스크롤 페이더"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow="0"
                  aria-valuetext="0%"
                  title="스크롤 페이더"
                ></button>
              </div>
              <div class="mobile-scroll-fader-indicator" id="mobileScrollIndicator" aria-hidden="true">0%</div>
            </div>
          </div>
        </div>
  `;
}
