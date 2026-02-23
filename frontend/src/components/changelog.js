/**
 * @file changelog.js
 * @description 업데이트 내역(Changelog) 모달의 HTML 구조를 정의합니다.
 */

/**
 * 업데이트 내역 데이터를 반환합니다.
 */
export const changelogData = [
  {
    version: '1.4.3',
    date: '2026-02-23',
    title: '할 일 리스트 UI 개선',
    items: [
      '할 일 리스트 UI 개선',
      '제목 수정 기능 추가',
      '체크박스 색상 지정 팔레트 추가'
    ]
  },
  {
    version: '1.4.2',
    date: '2026-02-23',
    title: '매뉴얼 팝업 및 사용성 개선',
    items: [
      '매뉴얼(도움말) 팝업 UI 추가',
      '카드 접기 버튼 클릭 시, 해당 카드 크기도 접히도록 개선',
      '모바일 버전 UI개선'
    ]
  },
  {
    version: '1.4.1',
    date: '2026-02-23',
    title: '버그 수정 및 카카오 연동 추가',
    items: [
      '고객의 소리함 이동 후, 대시보드 복귀 시, 화이트보드 컨텐츠정보 UI 위치 오류 수정',
      '로그인 화면에서 카카오, 네이버 로그인 UI 추가',
      '카카오 로그인 실제 추가'
    ]
  },
  {
    version: '1.4.0',
    date: '2026-02-23',
    title: '로고 애니메이션 리뉴얼 및 가독성 개선',
    items: [
      '로고 내부 원들에 뽀글뽀글 살아있는 듯한 맥동 애니메이션(Bubbly Pulse) 적용',
      '로고 주변에 몽환적인 무지갯빛 광채(Dreamy Aura) 효과 추가',
      '화이트보드 배경의 시각적 깊이감 및 흐르는 그리드 애니메이션 최적화',
      '빠른 메모(스프레드시트)의 행/열 머리말 사용자 정의 기능 추가',
      '마일스톤 위젯 진입 시 요약 데이터가 즉시 로딩되도록 동기화 로직 보완'
    ]
  },
  {
    version: '1.3.0',
    date: '2026-02-23',
    title: '대시보드 위젯 커스터마이징 및 프라이빗 서비스',
    items: [
      '대시보드 위젯 자유 드래그 및 리사이즈(6열 그리드) 기능 구현',
      '플레이스홀더 시스템 도입으로 드래그 안정성 및 시각적 피드백 강화',
      '사용자별 프라이빗 To-Do 리스트 및 마인드맵 저장 시스템 연동',
      '대시보드 2열 레이아웃(환영 메시지 / 위젯 섹션) 리뉴얼',
      '위젯 레이아웃 로컬 저장 및 복구 기능 고도화'
    ]
  },
  {
    version: '1.2.0',
    date: '2026-02-20',
    title: '게시판 고도화 및 푸터 추가',
    items: [
      '게시판 2단 레이아웃(작성/목록 분리) 적용',
      '클라이언트 사이드 페이지네이션(5개씩 보기) 도입',
      '전역 고정 푸터 및 인스타그램 오리지널 로고 적용',
      '화면 렌더링 버그 수정 및 레이아웃 안정화'
    ]
  },
  {
    version: '1.1.0',
    date: '2026-02-19',
    title: '메모 기능 및 D-Day 위젯',
    items: [
      '드래그 가능한 플로팅 메모장(FAB) 추가',
      '엑셀 수식 지원 스프레드시트 엔진 통합',
      '목표 날짜 관리용 D-Day 카운터 위젯 구현',
      '사용자별 메모 데이터 로컬 저장 기능'
    ]
  },
  {
    version: '1.0.0',
    date: '2026-02-18',
    title: '마인드맵 서비스 런치',
    items: [
      '글래스모피즘 기반 프리미엄 로그인/회원가입 UI',
      'JWT 기반 보안 인증 시스템 구축',
      '실시간 배경 파티클 애니메이션 적용',
      '대시보드 기본 레이아웃 완성'
    ]
  }
];

/**
 * 업데이트 내역 모달 HTML을 생성합니다.
 */
export function getChangelogHTML() {
  return `
    <div class="changelog-overlay" id="changelogOverlay">
      <div class="changelog-modal premium-glass">
        <div class="changelog-header">
          <h2><span class="icon">🚀</span> 업데이트 진척사항</h2>
          <button class="close-changelog" id="closeChangelog">×</button>
        </div>
        <div class="changelog-body">
          <div class="timeline">
            ${changelogData.map(release => `
              <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                  <div class="release-header">
                    <span class="version-tag">v${release.version}</span>
                    <span class="release-date">${release.date}</span>
                  </div>
                  <h3>${release.title}</h3>
                  <ul class="update-list">
                    ${release.items.map(item => `<li>${item}</li>`).join('')}
                  </ul>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="changelog-footer">
          <p>앞으로도 더 좋은 기능을 계속 추가할 예정입니다. 감사합니다!</p>
        </div>
      </div>
    </div>
  `;
}
