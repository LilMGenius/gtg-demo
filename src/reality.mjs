// 세계의 사실은 여기 한 곳에만 살고 조문 인용을 같이 든다; 코드가 기억으로 적은 규칙을 코드 자신의 상수로 재면 틀려도 초록이다.
export const TEAM_RULE = {
  // IFAB 경기 규칙 3.1: 최대 열한 명 중 한 명은 골키퍼다.
  values: { maximum: 11, goalkeepers: 1 },
  source: {
    name: 'IFAB Laws of the Game 2026/27, Law 3.1',
    url: 'https://www.theifab.com/laws/latest/the-players/',
    clause: 'A match is played by two teams, each with a maximum of eleven players; one must be the goalkeeper.',
    checked: '2026-09-25'
  }
};

// IFAB 14.1의 접촉 시각과 골라인을 판정 좌표의 원점으로 둔다. 앞섬은 그 뒤에만 시작한다.
// Bar-Eli 외 표 1의 중앙 슛 비중이다. 오독 시 대기 비중으로 쓰는 것은 별도 제품 가설이다.
export const PENALTY_OBSERVATION = {
  // 논문이 보고한 백분율을 확률로 변환한 값이며 전 모집단의 중앙 슛 비중이다.
  values: { centerKickProbability: 0.287 },
  source: { name: 'Bar-Eli et al., Action Bias among Elite Soccer Goalkeepers, Table 1',
    url: 'https://mpra.ub.uni-muenchen.de/4477/1/MPRA_paper_4477.pdf',
    clause: 'Kick direction Center 14.3% 3.5% 10.8% 28.7%', checked: '2026-09-25' },
  derivation: '중앙 슛 비중의 백분율을 확률로 바꾼다. 키퍼의 중앙 대기 관측률이 아니다.'
};

export const PENALTY_RULE = {
  values: { contactMs: 0, lineDepth: 0, minimumFeet: 1 },
  source: {
    name: 'IFAB Laws of the Game 2026/27, Law 14.1',
    url: 'https://www.theifab.com/laws/latest/the-penalty-kick/',
    clause: 'until the ball is kicked. … at least part of one foot touching, in line with, or behind, the goal line.',
    checked: '2026-09-25'
  },
  derivation: '발 하나 이상이 선에 닿거나 같은 선상 또는 뒤에 있어야 한다. 골라인과 킥 접촉을 좌표 원점으로 정한다.'
};

// 폭과 높이는 IFAB 골문 안쪽 규격이다.
export const GOAL = {
  "units": "m",
  "values": {
    "width": 7.32,
    "height": 2.44
  },
  "source": {
    "name": "IFAB Law 1.10",
    "url": "https://www.theifab.com/laws/latest/the-field-of-play/",
    "clause": "The distance between the inside of the posts is 7.32 m (8 yds) and the distance from the lower edge of the crossbar to the ground is 2.44 m (8 ft).",
    "checked": "2026-09-25"
  }
};

// 깊이와 반지름은 IFAB 조문, 폭은 GOAL과 양쪽 깊이, 선은 최대 허용 폭이다.
export const PITCH_MARKS = {
  "units": "m",
  "values": {
    "boxD": 16.5,
    "boxW": 40.32,
    "areaD": 5.5,
    "areaW": 18.32,
    "spot": 11,
    "arcR": 9.15,
    "lineMax": 0.12
  },
  "source": {
    "name": "IFAB Law 1.2, 1.5, 1.6",
    "url": "https://www.theifab.com/laws/latest/the-field-of-play/",
    "clause": "Two lines are drawn at right angles to the goal line, 5.5 m (6 yds) from the inside of each goalpost. These lines extend into the field of play for 5.5 m (6 yds) and are joined by a line drawn parallel with the goal line. The area bounded by these lines and the goal line is the goal area.\nTwo lines are drawn at right angles to the goal line, 16.5 m (18 yds) from the inside of each goalpost. These lines extend into the field of play for 16.5 m (18 yds) and are joined by a line drawn parallel with the goal line. The area bounded by these lines and the goal line is the penalty area.\npenalty mark is made 11 m (12 yds) from the midpoint between the goalposts.\nAn arc of a circle with a radius of 9.15 m (10 yds) from the centre of each penalty mark is drawn outside the penalty area.\nAll lines must be of the same width, which must not be more than 12 cm (5 ins).",
    "checked": "2026-09-25"
  },
  "derivation": "폭은 GOAL.values.width에 해당 구역의 양쪽 깊이를 더한다. 선 굵기는 cm를 m로 환산한다."
};

// IFAB 둘레 하한과 상한을 미터로 바꾸고 그 중간 둘레에서 지름을 구한다.
export const BALL = {
  "units": "m",
  "values": {
    "circumferenceMin": 0.68,
    "circumferenceMax": 0.7,
    "diameter": 0.21963382146681557
  },
  "source": {
    "name": "IFAB Law 2.1",
    "url": "https://www.theifab.com/laws/latest/the-ball/",
    "clause": "circumference of between 68 cm (27 ins) and 70 cm (28 ins)",
    "checked": "2026-09-25"
  },
  "derivation": "둘레 범위의 중간값을 원주율로 나눈 지름이다."
};

// 인용한 공기 음속의 반올림 값과 그 기온이다.
export const SOUND = {
  "units": {
    "speed": "m/s",
    "temperature": "degC"
  },
  "values": {
    "speed": 343,
    "temperature": 20
  },
  "source": {
    "name": "Speed of sound, air",
    "url": "https://en.wikipedia.org/wiki/Speed_of_sound",
    "clause": "At 20 °C (68 °F) , the speed of sound in air is about 343 m/s",
    "checked": "2026-09-25"
  }
};

// ISO 기준 기온과 기압, 선택한 상대습도 절반에서 흡음식을 계산한다.
export const AIR_ABSORPTION = {
  "units": {
    "temperature": "K",
    "humidity": "%",
    "pressure": "kPa",
    "frequencies": "Hz",
    "attenuation": "dB/km"
  },
  "values": {
    "temperature": 293.15,
    "humidity": 50,
    "pressure": 101.325
  },
  "source": {
    "name": "ISO 9613-1:1993, equations 3-5 and saturation vapour pressure",
    "url": "https://acoustic-toolbox.readthedocs.io/en/latest/standards/iso_9613_1_1993/",
    "clause": "ISO 9613-1:1993: Acoustics — Attenuation of sound during propagation outdoors",
    "checked": "2026-09-25"
  },
  "formula": "h=RH*10^(-6.8346*(273.16/T)^1.261+4.6151)/(p/101.325); frO=(p/101.325)*(24+40400*h*(0.02+h)/(0.391+h)); frN=(p/101.325)*(T/293.15)^(-0.5)*(9+280*h*exp(-4.170*((T/293.15)^(-1/3)-1))); alpha=8.686*f^2*(1.84e-11*(p/101.325)^(-1)*(T/293.15)^0.5+(T/293.15)^(-2.5)*(0.01275*exp(-2239.1/T)/(frO+f^2/frO)+0.1068*exp(-3352/T)/(frN+f^2/frN)))",
  "assumptions": "SOUND의 기온, 상대습도 절반, 표준기압을 연출의 조건으로 고른다. 실제 운동장의 날씨를 관측한 값은 아니다."
};

// 인용한 자유단 보 방정식의 첫 네 비강체 근을 수치로 푼 값이다.
export const BAR_MODES = {
  "units": {
    "roots": "dimensionless",
    "ratios": "dimensionless"
  },
  "values": {
    "roots": [
      4.730040744862704,
      7.853204624095838,
      10.995607838001671,
      14.137165491257464
    ]
  },
  "source": {
    "name": "Euler-Bernoulli free-free beam, non-rigid modes",
    "url": "https://en.wikipedia.org/wiki/Euler%E2%80%93Bernoulli_beam_theory#Example:_free%E2%80%93free_(unsupported)_beam",
    "clause": "A free–free beam is a beam without any supports.",
    "checked": "2026-09-25"
  },
  "formula": "cosh(beta)*cos(beta)-1=0; frequency ratio=(beta/beta1)^2",
  "assumptions": "자유단 보의 이상화 모델이다. 실제 용접 골대의 측정 모드라고 주장하지 않는다."
};

// ISO 기준 기온과 기압에 상대습도 절반을 선택한 식의 입력이다. 관측값으로 오해하지 않게 별도로 적는다.
AIR_ABSORPTION.source.formulaInputs = { temperature: 293.15, humidity: 50, pressure: 101.325 };
// ISO 식의 기준 조건에서 각 주파수의 dB/km를 소수 첫째 자리로 반올림한 재계산 기준표다.
AIR_ABSORPTION.source.referenceTable = [[1000, 4.7], [2000, 9.9], [4000, 29.7], [8000, 105.3]];
// 기준표는 소수 첫째 자리이므로 반올림 간격의 절반만 허용한다.
AIR_ABSORPTION.source.rounding = 0.05;
// 인용한 자유단 보 설명은 첫 네 비강체 모드를 다룬다.
BAR_MODES.source.rootCount = 4;

// 근의 제곱에 비례하는 자유단 보 주파수다. 첫 근으로 나눠 재료와 길이에 독립인 비율만 남긴다.
BAR_MODES.values.ratios = BAR_MODES.values.roots.map(root => (root / BAR_MODES.values.roots[0]) ** 2);

// ISO 9613-1 식을 Acoustic Toolbox(BSD-3-Clause)에서 스칼라 JS로 옮겼다. RH는 분율이 아닌 백분율이다.
// 원본과 권리 고지는 아래 LICENSE에 보존한다. 렌더 의존 없이 브라우저와 노드가 같은 식을 쓴다.
export function airAbsorption(frequency, inputs = AIR_ABSORPTION.values) {
  const { temperature: T, humidity: RH, pressure: p } = inputs;
  // ISO의 기준 기온과 기준 기압으로 무차원화한다.
  const theta = T / 293.15, delta = p / 101.325;
  // ISO 포화 수증기압 근사식의 삼중점과 계수다.
  const h = RH * 10 ** (-6.8346 * (273.16 / T) ** 1.261 + 4.6151) / delta;
  // ISO 산소 분자의 이완 주파수 식이다.
  const oxygen = delta * (24 + 40400 * h * (0.02 + h) / (0.391 + h));
  // ISO 질소 분자의 이완 주파수 식이다.
  const nitrogen = delta * theta ** -0.5 * (9 + 280 * h * Math.exp(-4.170 * (theta ** (-1 / 3) - 1)));
  // ISO 흡음계수는 dB/m이므로 천 배 하여 dB/km로 돌려준다.
  return 1000 * 8.686 * frequency ** 2 * (1.84e-11 / delta * theta ** 0.5 + theta ** -2.5 * (
    // 산소와 질소의 활성화 온도 및 기여 계수는 ISO 식의 상수다.
    0.01275 * Math.exp(-2239.1 / T) / (oxygen + frequency ** 2 / oxygen)
    + 0.1068 * Math.exp(-3352 / T) / (nitrogen + frequency ** 2 / nitrogen)));
}

/* LICENSE: Acoustic Toolbox, 스칼라 흡음식의 원본 고지
Copyright (c) 2024, Acoustic Toolbox
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice, this
  list of conditions and the following disclaimer in the documentation and/or
  other materials provided with the distribution.

* Neither the name of the {organization} nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

*/

// 세계은행 최신 비결측 연도의 국가별 Atlas GNI 원값이다. 도시 소득을 뜻하지 않는다.
export const GNI_ARG = {
  "units": "current US$",
  "values": {
    "year": 2025,
    "income": 14650
  },
  "source": {
    "name": "World Bank WDI, GNI per capita, Atlas method (Argentina)",
    "url": "https://api.worldbank.org/v2/country/ARG/indicator/NY.GNP.PCAP.CD?format=json&mrnev=1",
    "clause": "{\"indicator\":{\"id\":\"NY.GNP.PCAP.CD\",\"value\":\"GNI per capita, Atlas method (current US$)\"},\"country\":{\"id\":\"AR\",\"value\":\"Argentina\"},\"countryiso3code\":\"ARG\",\"date\":\"2025\",\"value\":14650,\"obs_status\":\"\",\"decimal\":0}",
    "checked": "2026-09-25"
  }
};

// 세계은행 최신 비결측 연도의 국가별 Atlas GNI 원값이다. 도시 소득을 뜻하지 않는다.
export const GNI_BRA = {
  "units": "current US$",
  "values": {
    "year": 2025,
    "income": 10550
  },
  "source": {
    "name": "World Bank WDI, GNI per capita, Atlas method (Brazil)",
    "url": "https://api.worldbank.org/v2/country/BRA/indicator/NY.GNP.PCAP.CD?format=json&mrnev=1",
    "clause": "{\"indicator\":{\"id\":\"NY.GNP.PCAP.CD\",\"value\":\"GNI per capita, Atlas method (current US$)\"},\"country\":{\"id\":\"BR\",\"value\":\"Brazil\"},\"countryiso3code\":\"BRA\",\"date\":\"2025\",\"value\":10550,\"obs_status\":\"\",\"decimal\":0}",
    "checked": "2026-09-25"
  }
};

// 세계은행 최신 비결측 연도의 국가별 Atlas GNI 원값이다. 도시 소득을 뜻하지 않는다.
export const GNI_DEU = {
  "units": "current US$",
  "values": {
    "year": 2025,
    "income": 60200
  },
  "source": {
    "name": "World Bank WDI, GNI per capita, Atlas method (Germany)",
    "url": "https://api.worldbank.org/v2/country/DEU/indicator/NY.GNP.PCAP.CD?format=json&mrnev=1",
    "clause": "{\"indicator\":{\"id\":\"NY.GNP.PCAP.CD\",\"value\":\"GNI per capita, Atlas method (current US$)\"},\"country\":{\"id\":\"DE\",\"value\":\"Germany\"},\"countryiso3code\":\"DEU\",\"date\":\"2025\",\"value\":60200,\"obs_status\":\"\",\"decimal\":0}",
    "checked": "2026-09-25"
  }
};

// 세계은행 최신 비결측 연도의 국가별 Atlas GNI 원값이다. 도시 소득을 뜻하지 않는다.
export const GNI_ESP = {
  "units": "current US$",
  "values": {
    "year": 2025,
    "income": 37120
  },
  "source": {
    "name": "World Bank WDI, GNI per capita, Atlas method (Spain)",
    "url": "https://api.worldbank.org/v2/country/ESP/indicator/NY.GNP.PCAP.CD?format=json&mrnev=1",
    "clause": "{\"indicator\":{\"id\":\"NY.GNP.PCAP.CD\",\"value\":\"GNI per capita, Atlas method (current US$)\"},\"country\":{\"id\":\"ES\",\"value\":\"Spain\"},\"countryiso3code\":\"ESP\",\"date\":\"2025\",\"value\":37120,\"obs_status\":\"\",\"decimal\":0}",
    "checked": "2026-09-25"
  }
};

// 세계은행 최신 비결측 연도의 국가별 Atlas GNI 원값이다. 도시 소득을 뜻하지 않는다.
export const GNI_GBR = {
  "units": "current US$",
  "values": {
    "year": 2025,
    "income": 54550
  },
  "source": {
    "name": "World Bank WDI, GNI per capita, Atlas method (United Kingdom)",
    "url": "https://api.worldbank.org/v2/country/GBR/indicator/NY.GNP.PCAP.CD?format=json&mrnev=1",
    "clause": "{\"indicator\":{\"id\":\"NY.GNP.PCAP.CD\",\"value\":\"GNI per capita, Atlas method (current US$)\"},\"country\":{\"id\":\"GB\",\"value\":\"United Kingdom\"},\"countryiso3code\":\"GBR\",\"date\":\"2025\",\"value\":54550,\"obs_status\":\"\",\"decimal\":0}",
    "checked": "2026-09-25"
  }
};

// 세계은행 최신 비결측 연도의 국가별 Atlas GNI 원값이다. 도시 소득을 뜻하지 않는다.
export const GNI_JPN = {
  "units": "current US$",
  "values": {
    "year": 2025,
    "income": 38340
  },
  "source": {
    "name": "World Bank WDI, GNI per capita, Atlas method (Japan)",
    "url": "https://api.worldbank.org/v2/country/JPN/indicator/NY.GNP.PCAP.CD?format=json&mrnev=1",
    "clause": "{\"indicator\":{\"id\":\"NY.GNP.PCAP.CD\",\"value\":\"GNI per capita, Atlas method (current US$)\"},\"country\":{\"id\":\"JP\",\"value\":\"Japan\"},\"countryiso3code\":\"JPN\",\"date\":\"2025\",\"value\":38340,\"obs_status\":\"\",\"decimal\":0}",
    "checked": "2026-09-25"
  }
};

// 세계은행 최신 비결측 연도의 국가별 Atlas GNI 원값이다. 도시 소득을 뜻하지 않는다.
export const GNI_KOR = {
  "units": "current US$",
  "values": {
    "year": 2025,
    "income": 37880
  },
  "source": {
    "name": "World Bank WDI, GNI per capita, Atlas method (Korea, Rep.)",
    "url": "https://api.worldbank.org/v2/country/KOR/indicator/NY.GNP.PCAP.CD?format=json&mrnev=1",
    "clause": "{\"indicator\":{\"id\":\"NY.GNP.PCAP.CD\",\"value\":\"GNI per capita, Atlas method (current US$)\"},\"country\":{\"id\":\"KR\",\"value\":\"Korea, Rep.\"},\"countryiso3code\":\"KOR\",\"date\":\"2025\",\"value\":37880,\"obs_status\":\"\",\"decimal\":0}",
    "checked": "2026-09-25"
  }
};

// 세계은행 최신 비결측 연도의 국가별 Atlas GNI 원값이다. 도시 소득을 뜻하지 않는다.
export const GNI_NGA = {
  "units": "current US$",
  "values": {
    "year": 2025,
    "income": 1360
  },
  "source": {
    "name": "World Bank WDI, GNI per capita, Atlas method (Nigeria)",
    "url": "https://api.worldbank.org/v2/country/NGA/indicator/NY.GNP.PCAP.CD?format=json&mrnev=1",
    "clause": "{\"indicator\":{\"id\":\"NY.GNP.PCAP.CD\",\"value\":\"GNI per capita, Atlas method (current US$)\"},\"country\":{\"id\":\"NG\",\"value\":\"Nigeria\"},\"countryiso3code\":\"NGA\",\"date\":\"2025\",\"value\":1360,\"obs_status\":\"\",\"decimal\":0}",
    "checked": "2026-09-25"
  }
};

// 세계은행 최신 비결측 연도의 국가별 Atlas GNI 원값이다. 도시 소득을 뜻하지 않는다.
export const GNI_PRT = {
  "units": "current US$",
  "values": {
    "year": 2025,
    "income": 29930
  },
  "source": {
    "name": "World Bank WDI, GNI per capita, Atlas method (Portugal)",
    "url": "https://api.worldbank.org/v2/country/PRT/indicator/NY.GNP.PCAP.CD?format=json&mrnev=1",
    "clause": "{\"indicator\":{\"id\":\"NY.GNP.PCAP.CD\",\"value\":\"GNI per capita, Atlas method (current US$)\"},\"country\":{\"id\":\"PT\",\"value\":\"Portugal\"},\"countryiso3code\":\"PRT\",\"date\":\"2025\",\"value\":29930,\"obs_status\":\"\",\"decimal\":0}",
    "checked": "2026-09-25"
  }
};

// 세계은행 최신 비결측 연도의 국가별 Atlas GNI 원값이다. 도시 소득을 뜻하지 않는다.
export const GNI_QAT = {
  "units": "current US$",
  "values": {
    "year": 2025,
    "income": 74330
  },
  "source": {
    "name": "World Bank WDI, GNI per capita, Atlas method (Qatar)",
    "url": "https://api.worldbank.org/v2/country/QAT/indicator/NY.GNP.PCAP.CD?format=json&mrnev=1",
    "clause": "{\"indicator\":{\"id\":\"NY.GNP.PCAP.CD\",\"value\":\"GNI per capita, Atlas method (current US$)\"},\"country\":{\"id\":\"QA\",\"value\":\"Qatar\"},\"countryiso3code\":\"QAT\",\"date\":\"2025\",\"value\":74330,\"obs_status\":\"\",\"decimal\":0}",
    "checked": "2026-09-25"
  }
};
