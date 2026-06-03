---
name: data-analysis
description: "데이터 분석, CSV/Excel 분석, 통계, 차트 생성, 인사이트 추출에 사용합니다. '데이터 분석', '통계', '차트', '트렌드', '인사이트', '분석해줘' 요청 시 적용."
---

# 데이터 분석

## 분석 워크플로우

```
1. 데이터 이해 → 2. 정제 → 3. 탐색 → 4. 분석 → 5. 시각화 → 6. 인사이트 → 7. 보고
```

## Python 분석 패턴

### 데이터 로드 + 기초 통계
```python
import pandas as pd

df = pd.read_excel("data.xlsx")  # 또는 pd.read_csv("data.csv")
print(df.shape)        # 행, 열 수
print(df.describe())   # 기초 통계
print(df.info())       # 데이터 타입
print(df.isnull().sum()) # 결측치
```

### 그룹별 분석
```python
# 그룹별 합계/평균
summary = df.groupby("카테고리")["매출"].agg(["sum", "mean", "count"])

# 피벗 테이블
pivot = pd.pivot_table(df, values="매출", index="월", columns="제품", aggfunc="sum")
```

### 차트 생성
```python
import matplotlib.pyplot as plt
import matplotlib
matplotlib.rcParams['font.family'] = 'Malgun Gothic'  # 한국어 폰트

# 막대 차트
fig, ax = plt.subplots(figsize=(10, 6))
summary["sum"].plot(kind="barh", ax=ax, color="#2F5496")
ax.set_title("카테고리별 매출", fontsize=16, fontweight="bold")
plt.tight_layout()
plt.savefig("data/output/chart.png", dpi=150)
```

## 분석 보고서 구조

```
## 데이터 분석 보고서: [주제]

### 1. 핵심 발견 (BLUF)
- [가장 중요한 인사이트 1문장]

### 2. 데이터 개요
- 데이터 출처: [파일명]
- 기간: [시작~끝]
- 레코드 수: [N건]

### 3. 주요 발견
#### 발견 1: [제목]
- [수치 + 해석]
- [차트/표 참조]

#### 발견 2: [제목]
- [수치 + 해석]

### 4. 시사점 및 권고
- [발견에서 도출된 행동 제안]

### 5. 한계 및 추가 분석 필요 사항
```

## 차트 선택 가이드

| 보여주려는 것 | 차트 유형 | 피하기 |
|-------------|----------|--------|
| 비교 | 가로 막대 | 파이 차트 |
| 추이 (시간) | 선 그래프 | 3D 차트 |
| 구성 | 누적 막대, 워터폴 | 파이 (5개 초과 시) |
| 분포 | 히스토그램, 박스플롯 | 평균만 보여주기 |
| 상관관계 | 산점도 | 이중 축 선 차트 |
| KPI | 큰 숫자 + 변동 | 게이지/스피드미터 |

## 체크리스트
- [ ] 분석 전에 "누가, 무엇을 알고 싶은가?" 정의했는가?
- [ ] 결측치/이상치를 처리했는가?
- [ ] 차트 제목이 인사이트를 담고 있는가? ("매출 데이터" X → "Q3 매출 12% 감소" O)
- [ ] 비교 맥락이 있는가? (전기 대비, 목표 대비)
- [ ] 인사이트에서 행동 권고가 도출되는가?

## 프로액티브 트리거
- 분석 목적이 불명확함
- 데이터 전처리 없이 분석을 시작하고 있음
- 시각화 없이 수치만 나열하고 있음
- 통계만 있고 인사이트가 없음
- 표본 크기나 편향을 고려하지 않음

## 산출물
- 분석 보고서
- 차트/시각화
- 인사이트 요약
