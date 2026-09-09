function pct(a, b) {
    if (!b)
        return 0;
    return Math.round(((a - b) / b) * 100);
}
export function analyzeQuestion(question, snapshots, events) {
    if (snapshots.length < 2)
        return '아직 분석할 로그가 충분하지 않습니다. 시뮬레이션을 조금 더 진행해 주세요.';
    const first = snapshots[0];
    const last = snapshots.at(-1);
    const blueChange = pct(last.blue, first.blue);
    const redChange = pct(last.red, first.red);
    const blueMin = snapshots.reduce((a, b) => (b.blue < a.blue ? b : a), first);
    const redMin = snapshots.reduce((a, b) => (b.red < a.red ? b : a), first);
    const recentGod = [...events].reverse().find((e) => e.type === 'god');
    const asksBlue = /파란|blue/i.test(question);
    const asksRed = /빨간|red|포식/i.test(question);
    const target = asksRed ? 'Red' : 'Blue';
    const targetLast = asksRed ? last.red : last.blue;
    const targetFirst = asksRed ? first.red : first.blue;
    const change = asksRed ? redChange : blueChange;
    const minSnap = asksRed ? redMin : blueMin;
    const energy = asksRed ? last.avgEnergyRed : last.avgEnergyBlue;
    const reasons = [];
    if (last.food < first.food * 0.58 && !asksRed)
        reasons.push('먹이 재고가 크게 줄어 에너지 회복보다 소비가 커졌습니다');
    if (last.movementCost > first.movementCost * 1.25)
        reasons.push('환경 변화로 이동 비용이 상승했습니다');
    if (last.foodRegen < first.foodRegen * 0.72)
        reasons.push('먹이 재생 속도가 초기보다 낮아졌습니다');
    if (energy < 0.55)
        reasons.push(`현재 평균 에너지가 ${energy.toFixed(2)}로 낮습니다`);
    if (asksBlue && last.red > first.red * 1.25)
        reasons.push('포식자 개체수가 늘면서 Blue의 손실 압력이 커졌습니다');
    if (asksRed && last.blue < first.blue * 0.65)
        reasons.push('주요 먹잇감인 Blue가 감소해 포식자에게도 먹이 부족이 이어졌습니다');
    if (recentGod)
        reasons.push(`최근 God Mode 변화(${recentGod.message})도 같은 시기에 겹쳤습니다`);
    const outcome = targetLast === 0
        ? `${target} 종은 현재 멸종했습니다.`
        : `${target} 종은 초기 ${targetFirst.toLocaleString()}마리에서 현재 ${targetLast.toLocaleString()}마리로 ${Math.abs(change)}% ${change >= 0 ? '증가' : '감소'}했습니다.`;
    const turning = `가장 낮았던 구간은 약 ${Math.round(minSnap.t)}초 지점(${asksRed ? minSnap.red : minSnap.blue}마리)이었습니다.`;
    const why = reasons.length ? reasons.join('. 또한 ') + '.' : '현재 로그에서는 단일 원인보다 번식·에너지·환경 변수의 누적 효과가 더 크게 보입니다.';
    const compare = `같은 기간 Blue는 ${blueChange >= 0 ? '+' : ''}${blueChange}%, Red는 ${redChange >= 0 ? '+' : ''}${redChange}% 변했습니다.`;
    return `${outcome} ${turning} ${why} ${compare}`;
}
