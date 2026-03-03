/**
 * @file dashboard-grid-mobile-scroll.js
 * @description 모바일 대시보드 스크롤 페이더 컨트롤러를 초기화합니다.
 */

export function initMobileScrollController(dashboardContent) {
    const controller = document.getElementById('mobileScrollController');
    const track = document.getElementById('mobileScrollTrack');
    const thumb = document.getElementById('mobileScrollThumb');
    const fill = document.getElementById('mobileScrollFill');
    const indicator = document.getElementById('mobileScrollIndicator');
    if (!controller || !track || !thumb || !fill || !indicator) return;
    if (controller.dataset.bound === 'true') return;
    controller.dataset.bound = 'true';

    const getScrollTarget = () => {
        if (dashboardContent && dashboardContent.scrollHeight > dashboardContent.clientHeight + 1) {
            return dashboardContent;
        }
        return document.scrollingElement || document.documentElement;
    };

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    let isDragging = false;

    const setControllerState = (enabled) => {
        controller.classList.toggle('is-hidden', !enabled);
        thumb.classList.toggle('disabled', !enabled);
        thumb.setAttribute('aria-disabled', enabled ? 'false' : 'true');
        thumb.tabIndex = enabled ? 0 : -1;
    };

    const applyVisualRatio = (ratio) => {
        const trackHeight = track.clientHeight;
        const thumbHeight = thumb.offsetHeight;
        const travel = Math.max(0, trackHeight - thumbHeight);
        const y = ratio * travel;
        const percent = Math.round(ratio * 100);

        thumb.style.transform = `translateY(${y}px)`;
        fill.style.height = `${Math.max(thumbHeight * 0.45, y + thumbHeight * 0.5)}px`;
        indicator.textContent = `${percent}%`;
        thumb.setAttribute('aria-valuenow', String(percent));
        thumb.setAttribute('aria-valuetext', `${percent}%`);
    };

    const syncFromScroll = () => {
        const target = getScrollTarget();
        const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
        if (maxScroll <= 1) {
            setControllerState(false);
            applyVisualRatio(0);
            return;
        }

        setControllerState(true);
        const ratio = clamp(target.scrollTop / maxScroll, 0, 1);
        applyVisualRatio(ratio);
    };

    const scrollToRatio = (ratio, behavior = 'auto') => {
        const target = getScrollTarget();
        const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
        if (maxScroll <= 1) return;
        target.scrollTo({ top: ratio * maxScroll, behavior });
    };

    const jumpToClientY = (clientY, behavior = 'auto') => {
        const rect = track.getBoundingClientRect();
        const thumbHeight = thumb.offsetHeight;
        const travel = Math.max(1, rect.height - thumbHeight);
        const relative = clamp(clientY - rect.top - thumbHeight / 2, 0, travel);
        const ratio = relative / travel;
        scrollToRatio(ratio, behavior);
        applyVisualRatio(ratio);
    };

    const onDragMove = (e) => {
        if (!isDragging) return;
        const touch = e.touches ? e.touches[0] : e;
        jumpToClientY(touch.clientY);
        if (e.cancelable) e.preventDefault();
    };

    const stopDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        controller.classList.remove('dragging');
        thumb.classList.remove('active');
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('touchmove', onDragMove);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('touchend', stopDrag);
        document.removeEventListener('touchcancel', stopDrag);
    };

    const startDrag = (e) => {
        if (thumb.classList.contains('disabled')) return;
        const touch = e.touches ? e.touches[0] : e;
        isDragging = true;
        controller.classList.add('dragging');
        thumb.classList.add('active');
        jumpToClientY(touch.clientY);

        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('touchend', stopDrag, { passive: true });
        document.addEventListener('touchcancel', stopDrag, { passive: true });

        if (e.cancelable) e.preventDefault();
    };

    thumb.addEventListener('mousedown', startDrag);
    thumb.addEventListener('touchstart', startDrag, { passive: false });

    track.addEventListener('click', (e) => {
        if (thumb.classList.contains('disabled')) return;
        if (e.target === thumb) return;
        jumpToClientY(e.clientY, 'smooth');
    });

    track.addEventListener('touchstart', (e) => {
        if (thumb.classList.contains('disabled')) return;
        if (e.target === thumb) return;
        jumpToClientY(e.touches[0].clientY, 'smooth');
        if (e.cancelable) e.preventDefault();
    }, { passive: false });

    thumb.addEventListener('keydown', (e) => {
        const target = getScrollTarget();
        const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
        if (maxScroll <= 1) return;

        const currentRatio = clamp(target.scrollTop / maxScroll, 0, 1);
        const stepRatio = 0.06;
        let nextRatio = currentRatio;

        if (e.key === 'ArrowDown' || e.key === 'PageDown') {
            nextRatio = clamp(currentRatio + stepRatio, 0, 1);
        } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
            nextRatio = clamp(currentRatio - stepRatio, 0, 1);
        } else if (e.key === 'Home') {
            nextRatio = 0;
        } else if (e.key === 'End') {
            nextRatio = 1;
        } else {
            return;
        }

        scrollToRatio(nextRatio, 'smooth');
        applyVisualRatio(nextRatio);
        e.preventDefault();
    });

    const requestSync = () => {
        requestAnimationFrame(syncFromScroll);
    };

    if (dashboardContent) {
        dashboardContent.addEventListener('scroll', requestSync, { passive: true });
    }
    window.addEventListener('scroll', requestSync, { passive: true });
    window.addEventListener('resize', requestSync, { passive: true });

    if (typeof ResizeObserver !== 'undefined' && dashboardContent) {
        const resizeObserver = new ResizeObserver(requestSync);
        resizeObserver.observe(dashboardContent);
    }

    requestSync();
    setTimeout(requestSync, 120);
    setTimeout(requestSync, 420);
}

