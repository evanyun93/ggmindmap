/**
 * @file effects.js
 * @description 배경 파티클 애니메이션 등의 시각적 효과를 담당합니다.
 */

/**
 * 지정된 컨테이너에 파티클 효과를 생성합니다.
 * @param {string} containerId - 파티클이 담길 요소의 ID
 * @param {number} count - 생성할 파티클 개수
 * @param {string[]} colors - 사용할 색상 배열
 */
export function createParticles(containerId, count = 30, colors = ['#8B5CF6', '#06B6D4', '#A78BFA', '#22D3EE', '#7C3AED']) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // 기존 파티클 제거 (재호출 시 대비)
    container.innerHTML = '';

    for (let i = 0; i < count; i++) {
        const particle = document.createElement('div');
        particle.classList.add('particle');

        const size = Math.random() * 4 + 2;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        particle.style.animationDuration = `${Math.random() * 15 + 10}s`;
        particle.style.animationDelay = `${Math.random() * 10}s`;

        container.appendChild(particle);
    }
}
