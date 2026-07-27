export const LOCATIONS = [
  { value: '',         label: '전국' },
  { value: 'seoul',    label: '서울' },
  { value: 'gyeonggi',label: '경기' },
  { value: 'incheon',  label: '인천' },
  { value: 'busan',    label: '부산' },
  { value: 'daegu',    label: '대구' },
  { value: 'daejeon',  label: '대전' },
  { value: 'gwangju',  label: '광주' },
  { value: 'ulsan',    label: '울산' },
  { value: 'sejong',   label: '세종' },
  { value: 'gangwon',  label: '강원' },
  { value: 'chungbuk', label: '충북' },
  { value: 'chungnam', label: '충남' },
  { value: 'jeonbuk',  label: '전북' },
  { value: 'jeonnam',  label: '전남' },
  { value: 'gyeongbuk',label: '경북' },
  { value: 'gyeongnam',label: '경남' },
  { value: 'jeju',     label: '제주' },
  { value: 'remote',   label: '재택/원격' },
];

export const LOCATION_LABELS: Record<string, string> = Object.fromEntries(
  LOCATIONS.filter(l => l.value).map(l => [l.value, l.label])
);

// 워크넷 지역 코드
export const WORKNET_REGION_CODES: Record<string, string> = {
  seoul:     '01',
  busan:     '02',
  daegu:     '03',
  incheon:   '04',
  gwangju:   '05',
  daejeon:   '06',
  ulsan:     '07',
  sejong:    '08',
  gyeonggi:  '09',
  gangwon:   '10',
  chungbuk:  '11',
  chungnam:  '12',
  jeonbuk:   '13',
  jeonnam:   '14',
  gyeongbuk: '15',
  gyeongnam: '16',
  jeju:      '17',
};

// 사람인 지역 코드
export const SARAMIN_LOCATION_CODES: Record<string, string> = {
  seoul:     '101000',
  gyeonggi:  '102000',
  incheon:   '108000',
  busan:     '106000',
  daegu:     '104000',
  daejeon:   '103000',
  gwangju:   '105000',
  ulsan:     '107000',
  sejong:    '118000',
  gangwon:   '109000',
  chungbuk:  '111000',
  chungnam:  '110000',
  jeonbuk:   '113000',
  jeonnam:   '112000',
  gyeongbuk: '115000',
  gyeongnam: '114000',
  jeju:      '116000',
};

// 원티드 지역 슬러그
export const WANTED_LOCATION_SLUGS: Record<string, string> = {
  seoul:     'seoul%2Call',
  gyeonggi:  'gyeonggi',
  incheon:   'incheon',
  busan:     'busan',
  daegu:     'daegu',
  daejeon:   'daejeon',
  gwangju:   'gwangju',
  ulsan:     'ulsan',
  remote:    'all',
};
