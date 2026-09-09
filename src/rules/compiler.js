export const defaultBlueRule = {
    id: 0,
    name: 'Blue',
    color: '#64d8ff',
    speed: 1.4,
    visionRadius: 80,
    fearDistance: 30,
    reproductionRate: 0.08,
    size: 1,
    lifespan: 95,
    aggression: 0.12,
    lightAffinity: 0.9,
    avoidCrowds: true,
    diet: 'plants',
};
export const defaultRedRule = {
    id: 1,
    name: 'Red',
    color: '#ff6d7a',
    speed: 1.18,
    visionRadius: 105,
    fearDistance: 10,
    reproductionRate: 0.035,
    size: 1.35,
    lifespan: 120,
    aggression: 0.88,
    lightAffinity: 0.05,
    avoidCrowds: false,
    diet: 'prey',
};
export const defaultWorldRules = {
    temperature: 0.68,
    foodRegen: 1,
    movementCost: 1,
    waterDependency: false,
    nightRedOnly: false,
    mutationRate: 0.035,
    lightX: 0.72,
    lightY: 0.3,
};
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export function compileCreaturePrompt(prompt, base = defaultBlueRule) {
    const text = prompt.replace(/\s+/g, ' ').trim().toLowerCase();
    const next = { ...base };
    if (/빛|광원|태양/.test(text))
        next.lightAffinity = /싫|피하/.test(text) ? 0.05 : 0.95;
    if (/빠르|민첩/.test(text))
        next.speed = 1.75;
    if (/느리/.test(text))
        next.speed = 0.85;
    if (/멀리|시야|눈이 좋/.test(text))
        next.visionRadius = 125;
    if (/겁|도망|피하|군집|너무 많/.test(text)) {
        next.avoidCrowds = true;
        next.fearDistance = 38;
    }
    if (/공격|사냥|잡아먹|포식|육식/.test(text)) {
        next.aggression = 0.68;
        next.diet = /식물|풀도|잡식/.test(text) ? 'omnivore' : 'prey';
    }
    if (/식물|풀|초식/.test(text) && !/잡아먹|포식/.test(text))
        next.diet = 'plants';
    if (/번식.*빠|새끼.*많|번식률.*높/.test(text))
        next.reproductionRate = 0.13;
    if (/번식.*느|새끼.*적|번식률.*낮/.test(text))
        next.reproductionRate = 0.035;
    if (/크다|큰 생물|덩치/.test(text))
        next.size = 1.5;
    if (/몸집이?\s*작|작은\s*몸|작게\s*(?:만들|태어)/.test(text))
        next.size = 0.82;
    if (/오래 살|장수/.test(text))
        next.lifespan = 150;
    if (/수명.*짧|빨리 죽/.test(text))
        next.lifespan = 65;
    const number = (pattern) => text.match(pattern)?.[1];
    const speed = number(/속도\s*(?:는|를|:|=)?\s*([0-9.]+)/);
    const vision = number(/시야\s*(?:는|를|:|=)?\s*([0-9.]+)/);
    const reproduction = number(/번식률\s*(?:은|을|:|=)?\s*([0-9.]+)/);
    if (speed)
        next.speed = clamp(Number(speed), 0.2, 3);
    if (vision)
        next.visionRadius = clamp(Number(vision), 10, 220);
    if (reproduction)
        next.reproductionRate = clamp(Number(reproduction), 0.005, 0.4);
    return next;
}
export function compileGodCommand(command, current) {
    const text = command.replace(/\s+/g, ' ').trim().toLowerCase();
    const world = { ...current };
    let addPredators = 0;
    const notes = [];
    if (/빙하기|얼어|혹한|추워/.test(text)) {
        world.temperature = 0.16;
        world.foodRegen = 0.46;
        world.movementCost = 1.65;
        notes.push('빙하기: 온도↓ · 먹이 재생↓ · 이동 비용↑');
    }
    if (/폭염|더워|열파/.test(text)) {
        world.temperature = 0.94;
        world.foodRegen = 0.72;
        world.movementCost = 1.22;
        notes.push('폭염: 온도↑ · 먹이 재생↓');
    }
    if (/풍년|먹이.*늘|식물.*늘/.test(text)) {
        world.foodRegen = Math.min(2.4, world.foodRegen * 1.55);
        notes.push('먹이 재생률 증가');
    }
    if (/물이 없는|물 없|수분/.test(text)) {
        world.waterDependency = true;
        notes.push('물 의존성 활성화');
    }
    if (/물 의존.*해제|물 없이.*살/.test(text)) {
        world.waterDependency = false;
        notes.push('물 의존성 해제');
    }
    if (/밤|야간/.test(text) && /빨간|red|육식/.test(text)) {
        world.nightRedOnly = true;
        notes.push('야간 모드: Red만 이동');
    }
    if (/낮|주간|모두.*움직/.test(text)) {
        world.nightRedOnly = false;
        notes.push('주간 모드: 모든 종 이동');
    }
    const predatorMatch = text.match(/(?:육식동물|포식자|빨간\s*생물|red)[^0-9]{0,10}([0-9]{1,5})\s*마리/);
    if (predatorMatch) {
        addPredators = clamp(Number(predatorMatch[1]), 1, 5000);
        notes.push(`포식자 ${addPredators.toLocaleString()}마리 투입`);
    }
    return { world, addPredators, note: notes.join(' · ') || '환경 변화 규칙을 찾지 못해 기존 세계를 유지했습니다.' };
}
