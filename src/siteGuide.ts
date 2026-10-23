import guide from '../shared/site-guide.json';
export const isGuideQuestion = (q:string) => /第一次|新手|導覽|怎麼用|怎麼操作|使用說明|手冊|操作|來源|怎麼來|如何計算|怎麼算|公式|定義|方法|意思|解釋|為什麼|怎麼解讀|如何解讀|有哪些頁|功能/.test(q);
const topics: Record<string,RegExp> = {
 start:/第一次|新手|導覽|有哪些頁|功能|怎麼用/, overview:/年度|日均|月份|星期|總覽|缺日|增減|占比/,
 baseline:/站點|計費|票種|實扣|金額|OD|子線|基線/i, replay:/重播|在車|車上|定位|地形|GPS|數位孿生/i,
 forecast:/預測|回測|MAE|WAPE|參考帶|迴歸/i, peak:/尖峰|離峰|班距|等待|熱圖/,
 tickets:/票證分析|頻次|回程|旅行鏈|卡片/, optimizer:/最佳化|重排|司機|值勤|加班|併班|空駛|車數/,
 cost:/成本|候選|服務比例/,assistant:/小幫手|助理|選字|Enter|對話/i,other:/旅遊資訊|旅客行程|低碳|碳排|資料品質|模型方法|路徑|票價/,recording:/錄影|影片|故障|不動|失敗/,
};
export function guideContext(question:string) {
 const matched=guide.sections.filter(s=>topics[s.id]?.test(question));
 return {version:guide.version,scope:guide.scope,
  pages:guide.sections.map(s=>({title:s.title,page:s.page,purpose:s.purpose})),
  sections:(matched.length?matched:[guide.sections[0]]).slice(0,6),
  note:'這是從本站程式維護的操作與數據字典，不含即時狀態；沒有列出的數值或來源要說明尚無定義，不可自行補造。'};
}
