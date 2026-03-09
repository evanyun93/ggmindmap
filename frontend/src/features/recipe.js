/**
 * @file recipe.js
 * @description 레시피 위젯의 목록(Book 뷰), 단일 상세 보기, 작성/수정 기능을 관리합니다.
 */

import { apiFetch } from '../services/api.js';

export function initRecipe(el, data) {
    const container = el.querySelector('.recipe-view-container');
    const headerTitle = el.querySelector('.recipe-widget-title');
    const addBtn = el.querySelector('.btn-recipe-add');
    
    // 데이터 로드
    let settings = data.settings || {};
    let recipes = Array.isArray(settings.recipes) ? settings.recipes : [];
    const widgetId = data.id;

    // View 상태 관리 ('list', 'detail', 'edit')
    let currentView = 'list';
    let currentRecipeId = null;

    /**
     * 데이터를 서버에 동기화
     */
    const saveSettings = async () => {
        try {
            await apiFetch(`/api/widgets/${widgetId}`, {
                method: 'PATCH',
                body: JSON.stringify({ settings: { ...settings, recipes } })
            });
        } catch (e) {
            console.error('[Recipe] 위젯 설정 저장 실패', e);
        }
    };

    /**
     * 뷰 전환 유틸리티
     */
    const renderView = (view, payload = null) => {
        currentView = view;
        currentRecipeId = payload;
        
        // 버튼 및 제목 갱신
        if (view === 'list') {
            headerTitle.textContent = '나만의 레시피 북';
            addBtn.style.display = 'flex';
            addBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
            addBtn.title = "새 레시피 작성";
            addBtn.onclick = () => renderView('edit');
            
            renderListView();
        } else if (view === 'detail') {
            const r = recipes.find(x => x.id === currentRecipeId);
            headerTitle.textContent = r ? r.title : '레시피 상세';
            addBtn.style.display = 'flex';
            // 수정 모드 진입 아이콘
            addBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
            addBtn.title = "레시피 수정";
            addBtn.onclick = () => renderView('edit', currentRecipeId);
            
            renderDetailView(r);
        } else if (view === 'edit') {
            const isNew = !currentRecipeId;
            headerTitle.textContent = isNew ? '새 레시피 작성' : '레시피 수정';
            addBtn.style.display = 'none'; // 작성 중엔 상단 플러스 버튼 숨김
            
            renderEditView(isNew ? null : recipes.find(x => x.id === currentRecipeId));
        }
    };

    /**
     * 목록 뷰 브랜치 렌더링
     */
    const renderListView = () => {
        if (recipes.length === 0) {
            container.innerHTML = `
                <div class="recipe-empty-state fade-in">
                    <div class="empty-icon">🍽️</div>
                    <p>등록된 레시피가 없습니다.</p>
                    <span class="empty-sub">오른쪽 위 + 버튼을 눌러 나만의 레시피를 추가해보세요!</span>
                </div>
            `;
            return;
        }

        const listHTML = recipes.map(r => `
            <div class="recipe-card fade-in" data-id="${r.id}">
                <div class="recipe-card-emoji">${r.emoji || '🍳'}</div>
                <div class="recipe-card-info">
                    <h4 class="recipe-card-title">${r.title || '이름 없음'}</h4>
                    <span class="recipe-card-meta">재료 ${r.ingredients?.length || 0}개 · 순서 ${r.steps?.length || 0}단계</span>
                </div>
            </div>
        `).join('');

        container.innerHTML = `<div class="recipe-list-grid">${listHTML}</div>`;

        // 카드 클릭 시 상세로
        container.querySelectorAll('.recipe-card').forEach(card => {
            card.onclick = () => renderView('detail', card.dataset.id);
        });
    };

    /**
     * 상세 뷰 브랜치 렌더링
     */
    const renderDetailView = (recipe) => {
        if (!recipe) return renderView('list');

        const ingsHTML = (recipe.ingredients || []).map(i => `<li>${i}</li>`).join('');
        const stepsHTML = (recipe.steps || []).map((s, idx) => `
            <div class="recipe-step-item">
                <div class="step-num">${idx + 1}</div>
                <div class="step-text">${s}</div>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="recipe-detail-pane fade-in">
                <button class="btn-recipe-back">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg> 목록으로
                </button>
                <div class="recipe-detail-header">
                    <span class="recipe-detail-emoji">${recipe.emoji || '🍳'}</span>
                    <h3 class="recipe-detail-title">${recipe.title || '제목 없음'}</h3>
                </div>
                
                <div class="recipe-detail-section">
                    <h4 class="section-title">주요 재료</h4>
                    <ul class="recipe-ingredients-list">
                        ${ingsHTML || '<li class="text-muted">재료가 등록되지 않았습니다.</li>'}
                    </ul>
                </div>

                <div class="recipe-detail-section">
                    <h4 class="section-title">조리 순서</h4>
                    <div class="recipe-steps-list">
                        ${stepsHTML || '<div class="text-muted">조리 순서가 등록되지 않았습니다.</div>'}
                    </div>
                </div>
                
                <div class="recipe-detail-footer">
                     <button class="btn-recipe-danger delete-current-recipe">이 레시피 삭제</button>
                </div>
            </div>
        `;

        container.querySelector('.btn-recipe-back').onclick = () => renderView('list');
        container.querySelector('.delete-current-recipe').onclick = () => {
             if (confirm('이 레시피를 정말 삭제하시겠습니까?')) {
                 recipes = recipes.filter(x => x.id !== recipe.id);
                 saveSettings();
                 renderView('list');
             }
        };
    };

    /**
     * 수정/작성 뷰 브랜치 렌더링
     */
    const renderEditView = (recipe = null) => {
        const title = recipe ? recipe.title : '';
        const emoji = recipe ? recipe.emoji : '🍳';
        const ings = recipe ? (recipe.ingredients || []).join('\n') : '';
        const steps = recipe ? (recipe.steps || []).join('\n') : '';

        container.innerHTML = `
            <div class="recipe-edit-pane fade-in">
                <div class="recipe-edit-header">
                     <input type="text" id="recipeEmojiInput" class="recipe-emoji-input" value="${emoji}" maxlength="2" title="이모지를 입력하세요">
                     <input type="text" id="recipeTitleInput" class="recipe-title-input" placeholder="레시피 제목" value="${title}">
                </div>
                
                <div class="recipe-edit-section">
                     <label>✨ 필요한 재료 (줄바꿈으로 구분)</label>
                     <textarea id="recipeIngInput" class="recipe-textarea short" placeholder="예: 양파 1개\n간장 2스푼\n다진마늘 1스푼">${ings}</textarea>
                </div>

                <div class="recipe-edit-section">
                     <label>🔥 조리 순서 (줄바꿈으로 구분)</label>
                     <textarea id="recipeStepInput" class="recipe-textarea tall" placeholder="예: 1. 양파를 채썬다.\n2. 팬에 기름을 두르고 볶는다.">${steps}</textarea>
                </div>

                <div class="recipe-edit-actions">
                     <button class="btn-recipe-cancel">취소</button>
                     <button class="btn-recipe-save">저장하기</button>
                </div>
            </div>
        `;

        container.querySelector('.btn-recipe-cancel').onclick = () => {
            // 취소 시, 기존 레시피가 있었으면 상세 뷰로, 새 레시피면 목록으로 이동
            renderView(recipe ? 'detail' : 'list', recipe ? recipe.id : null);
        };

        container.querySelector('.btn-recipe-save').onclick = () => {
            const newTitle = container.querySelector('#recipeTitleInput').value.trim() || '이름 없음 레시피';
            const newEmoji = container.querySelector('#recipeEmojiInput').value.trim() || '🍳';
            const rawIngs = container.querySelector('#recipeIngInput').value;
            const rawSteps = container.querySelector('#recipeStepInput').value;

            const newIngs = rawIngs.split('\n').map(s => s.trim()).filter(s => s);
            const newSteps = rawSteps.split('\n').map(s => s.trim()).filter(s => s);

            if (recipe) {
                // 수정
                recipe.title = newTitle;
                recipe.emoji = newEmoji;
                recipe.ingredients = newIngs;
                recipe.steps = newSteps;
            } else {
                // 추가
                const newRecipe = {
                    id: 'rcp_' + Date.now(),
                    title: newTitle,
                    emoji: newEmoji,
                    ingredients: newIngs,
                    steps: newSteps
                };
                recipes.push(newRecipe);
                currentRecipeId = newRecipe.id;
            }

            saveSettings();
            renderView('detail', recipe ? recipe.id : currentRecipeId);
        };
    };

    // 초기 뷰 렌더링
    renderView('list');
}
