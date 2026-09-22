/* 种子数据 —— 从 prototype/index.html 原样抽出来的初始值（抽出时间 2026-09-21）。
 *
 * ⚠️ 这里是**只读的初始值**，别直接改它。
 *    运行时的可变状态在 stores/db.js —— 那边会深拷贝一份出来用。
 *    原型里那些「这批数字是故意配的」注释一并保留了下来，
 *    它们说明了这些值为什么长这样（比如打卡连续天数，配成清一色满勤就看不出算法写错）。
 */

export const TODAY='2026-09-18';

export const CATS=['餐饮','出行','数码','生活','娱乐','医疗','服饰'];

export const CAT_WORDS={
  '餐饮':['早餐','早饭','午餐','午饭','晚餐','晚饭','咖啡','奶茶','外卖','吃饭','聚餐','零食','夜宵','水果'],
  '出行':['地铁','公交','打车','出租','加油','高铁','机票','停车','单车','过路费'],
  '数码':['硬盘','鼠标','键盘','手机','电脑','耳机','充电','数据线','显示器','内存'],
  '生活':['房租','水电','物业','超市','日用品','纸巾','洗衣','理发','快递','话费'],
  '娱乐':['电影','游戏','演出','门票','唱歌','演唱会','展览'],
  '医疗':['药','挂号','体检','医院','牙','诊所'],
  '服饰':['衣服','鞋','裤','外套','袜','帽子']
};

/* 待办只有这一份存储。
 *
 * 原型里待办存在两处：今日页读 ITEMS，领域页读 DOMAINS[].todos。
 * 两边字段都不一样（这边 title/due/ISO 日期，那边 t/m/中文说明），
 * 种子里因此出现了五条重复：交上月报销单、给张工回邮件、写周报、买跑鞋、交物业费
 * 各存在两遍，两页各显示自己那一份。改一处另一处不动，那不是两个视图，是两个事实。
 *
 * 合并后一条待办长这样：
 *   title   内容
 *   dom     所属领域的 **id**（不是名字 —— 领域要能改名，用名字挂就会一改名就孤儿一片）
 *   due     到期日，ISO；**null = 没有日期的清单条目**，不进今日页
 *   status  'todo' | 'done'
 *   parent  同一条待办树里的父项 id
 *
 * 「跨度是属性不是页面」：有日期和没日期的是同一类东西，差别在 due 上，不在存哪儿。
 */
export const ITEMS=[
  /* imp = 重要，urg = 紧急。两个轴各自独立（见 db.js 的 QUAD 那段），
     这里给出一份有高有低的分布 —— 四格全空的话，四象限那一页第一次打开
     看着像是坏了，而不是像「还没标」。 */
  {id:'it1',title:'交上月报销单',dom:'work',due:'2026-09-16',status:'todo',parent:null,imp:true,urg:true},
  {id:'it2',title:'给张工回邮件',dom:'work',due:'2026-09-17',status:'todo',parent:null,imp:false,urg:true},
  {id:'it3',title:'写周报',dom:'work',due:'2026-09-18',status:'todo',parent:null,imp:true,urg:true},
  {id:'it8',title:'整理本周产出',dom:'work',due:'2026-09-18',status:'todo',parent:'it3',imp:true,urg:true},
  {id:'it9',title:'补上周遗留的两条',dom:'work',due:'2026-09-18',status:'done',parent:'it3',imp:true,urg:true},
  {id:'it4',title:'买跑鞋',dom:'life',due:'2026-09-18',status:'todo',parent:null,imp:true,urg:false},
  {id:'it5',title:'交物业费',dom:'life',due:'2026-09-21',status:'todo',parent:null,imp:true,urg:false},
  {id:'it6',title:'整理周三的会议纪要',dom:'work',due:'2026-09-16',status:'done',parent:null,imp:false,urg:true},
  {id:'it7',title:'把体检报告拍照存档',dom:'life',due:'2026-09-15',status:'done',parent:null,imp:false,urg:false},
  {id:'it10',title:'做体测',dom:'fitness',due:'2026-09-16',status:'done',parent:null,imp:true,urg:false},
  {id:'it11',title:'预约牙医',dom:'life',due:'2026-09-17',status:'done',parent:null,imp:false,urg:true},
  /* 下面这些原来只在领域页的 todos 里，今日页看不见 —— 合并进来才有的一份 */
  {id:'it12',title:'知识库项目上线',dom:'work',due:'2026-09-18',status:'todo',parent:null,imp:true,urg:false},
  {id:'it13',title:'整理接口文档',dom:'work',due:'2026-09-16',status:'todo',parent:'it12',imp:true,urg:false},
  {id:'it14',title:'跑一遍回归',dom:'work',due:'2026-09-17',status:'todo',parent:'it12',imp:false,urg:true},
  {id:'it15',title:'换瑜伽垫',dom:'fitness',due:'2026-09-21',status:'todo',parent:null,imp:false,urg:false},
  {id:'it16',title:'约体测',dom:'fitness',due:null,status:'todo',parent:null,imp:true,urg:false},
  {id:'it17',title:'整理读书笔记',dom:'study',due:null,status:'todo',parent:null,imp:false,urg:false},
  {id:'it18',title:'把 SmartVoyage 的章节笔记归档',dom:'study',due:null,status:'todo',parent:null,imp:false,urg:false}
];

export const HABIT_LOGS=[
  /* 健身 · 训练日打卡（每周 4 次，按周算）→ 平移后落两周 → 连续 2 周 · 累计 2 周 */
  {key:'h-fit-1',date:'2026-09-14'},
  {key:'h-fit-1',date:'2026-09-16'},
  {key:'h-fit-1',date:'2026-09-17'},
  {key:'h-fit-1',date:'2026-09-18'},
  /* 学习 · 阅读 30 分钟（每天）→ 中间断过：连续 1 天 · 累计 5 天 */
  {key:'h-study-1',date:'2026-09-12'},
  {key:'h-study-1',date:'2026-09-13'},
  {key:'h-study-1',date:'2026-09-14'},
  {key:'h-study-1',date:'2026-09-15'},
  {key:'h-study-1',date:'2026-09-17'},
  /* 个人 · 健康作息（组）→ 连续 4 天 · 累计 4 天 */
  {key:'h-life-1',date:'2026-09-15'},
  {key:'h-life-1',date:'2026-09-16'},
  {key:'h-life-1',date:'2026-09-17'},
  {key:'h-life-1',date:'2026-09-18'},
  /* 个人 · 饮水 2L（健康作息的子项）→ 连续 5 天 · 累计 5 天 */
  {key:'h-life-2',date:'2026-09-14'},
  {key:'h-life-2',date:'2026-09-15'},
  {key:'h-life-2',date:'2026-09-16'},
  {key:'h-life-2',date:'2026-09-17'},
  {key:'h-life-2',date:'2026-09-18'}
];

export const INBOX=[
  {id:'in1',text:'问问李工那个接口文档在哪',at:'2026-09-17'},
  {id:'in2',text:'想学一下 GraphRAG',at:'2026-09-17'},
  {id:'in3',text:'换一盒充电电池',at:'2026-09-18'}
];

export const NOTES=[
  {id:'nt1',d:'2026-09-17',text:'今天试着把周报提前到周三写完，发现其实两个小时就够。之前一直拖到周五，大概是怕写完就要面对下一周。'},
  {id:'nt2',d:'2026-09-15',text:'早睡这件事，卡住我的不是工作，是手机。'},
  {id:'nt3',d:'2026-09-12',text:'体检报告出来了，其他都好，就是血脂偏高。要开始认真对待吃饭这件事了。'}
];

export const NOTE_PROMPTS=[
  '最近哪件事让你反复想起？',
  '这周有件事想做没做成，卡在哪一步？',
  '这一周只能留一件事，你留哪件？',
  '有什么事你一直没说出口？',
  '最近一次觉得「这样挺好」是什么时候？',
  '今天哪个瞬间你想慢一点？'
];

export const LOGS=[
  {id:'lg1',kind:'money',date:'2026-09-18',category:'餐饮',value:32},
  {id:'lg2',kind:'money',date:'2026-09-18',category:'出行',value:6},
  {id:'lg3',kind:'money',date:'2026-09-17',category:'餐饮',value:48},
  {id:'lg4',kind:'money',date:'2026-09-16',category:'数码',value:899},
  {id:'lg5',kind:'money',date:'2026-09-15',category:'餐饮',value:26},
  {id:'lg6',kind:'money',date:'2026-09-14',category:'生活',value:460},
  {id:'lg7',kind:'money',date:'2026-09-12',category:'娱乐',value:210}
];

export const DOMAINS=[
  {
    id:'fitness',name:'健身',pinned:true,
    habits:[{id:'h-fit-1',t:'训练日打卡',m:'每周 4 次',parent:null}],
    goals:[
      {id:'g-fitness-1',t:'硬拉 100kg',m:'当前 80kg × 5 次',p:80,parent:null},
      {id:'g-fitness-1a',t:'周期一：85kg × 5',m:'两周内',p:100,parent:'g-fitness-1'},
      {id:'g-fitness-1b',t:'周期二：95kg × 3',m:'再两周',p:40,parent:'g-fitness-1'},
      {id:'g-fitness-2',t:'体脂降到 18%',m:'当前约 21%',p:35,parent:null}
    ]
  },
  {
    id:'study',name:'学习',pinned:false,
    habits:[{id:'h-study-1',t:'阅读 30 分钟',m:'每天',parent:null}],
    goals:[
      {id:'g-study-1',t:'读完《置身事内》',m:'每周 30 页 · 已读 210/350 页',p:60,parent:null},
      {id:'g-study-1a',t:'第 1–5 章',m:'讲财政',p:100,parent:'g-study-1'},
      {id:'g-study-1b',t:'第 6–10 章',m:'当前在这',p:50,parent:'g-study-1'}
    ]
  },
  {
    id:'work',name:'工作',pinned:false,
    habits:[{id:'h-work-1',t:'下班前清空收件箱',m:'工作日',parent:null}],
    goals:[{id:'g-work-1',t:'知识库项目 v1 上线',m:'方案已定 · 待开工',p:45,parent:null}]
  },
  {
    id:'life',name:'个人',pinned:false,
    habits:[
      {id:'h-life-1',t:'健康作息',m:'一组习惯',parent:null},
      {id:'h-life-2',t:'饮水 2L',m:'每天',parent:'h-life-1'},
      {id:'h-life-3',t:'23:30 前睡',m:'工作日',parent:'h-life-1'}
    ],
    goals:[
      {id:'g-life-1',t:'家庭年度旅行成行',m:'还没定目的地',p:50,parent:null},
      {id:'g-life-1a',t:'定目的地和日期',m:'这个月内',p:100,parent:'g-life-1'},
      {id:'g-life-1b',t:'办签证',m:'看目的地',p:20,parent:'g-life-1'}
    ]
  }
];

export const RECORD_TYPES=[
  {id:'rt_kcal_in',domain:'fitness',name:'热量摄入',mode:'number',unit:'kcal',quick:true,logs:[
    {id:'k1',d:'9月18日',v:1800},{id:'k2',d:'9月17日',v:1920},{id:'k3',d:'9月16日',v:1750}
  ]},
  {id:'rt_kcal_out',domain:'fitness',name:'热量消耗',mode:'number',unit:'kcal',quick:true,logs:[
    {id:'k4',d:'9月18日',v:520},{id:'k5',d:'9月17日',v:480}
  ]},
  {id:'rt_weight',domain:'fitness',name:'体重',mode:'number',unit:'kg',quick:true,logs:[
    {id:'k6',d:'9月18日',v:71.4},{id:'k7',d:'9月15日',v:71.7},{id:'k8',d:'9月12日',v:72.1}
  ]},
  {id:'rt_strength',domain:'fitness',name:'力量训练',mode:'text',unit:'',quick:false,logs:[
    {id:'k9',d:'9月16日 周三',v:'深蹲 80kg × 5 × 5 · 硬拉 90kg × 3 × 3 · 组间休息 2 分钟'},
    {id:'k10',d:'9月13日 周日',v:'深蹲 77.5kg × 5 × 5 · 硬拉 87.5kg × 3 × 3'}
  ]},
  {id:'rt_cardio',domain:'fitness',name:'有氧',mode:'text',unit:'',quick:false,logs:[
    {id:'k11',d:'9月17日 周三',v:'跑步 7.1km · 42 分钟 · 配速 5\'55" · 平均心率 148'}
  ]},
  {id:'rt_squat',domain:'fitness',name:'深蹲最大重量',mode:'number',unit:'kg',quick:false,logs:[
    {id:'k12',d:'9月16日',v:80},{id:'k13',d:'9月13日',v:77.5},{id:'k14',d:'9月10日',v:75}
  ]},
  {id:'rt_book',domain:'study',name:'读书',mode:'number',unit:'页',quick:false,logs:[
    {id:'k15',d:'9月17日',v:24},{id:'k16',d:'9月15日',v:18},{id:'k17',d:'9月13日',v:31}
  ]},
  {id:'rt_note',domain:'study',name:'学习笔记',mode:'text',unit:'',quick:false,logs:[
    {id:'k18',d:'9月17日 周三',v:'第 6 章讲土地财政，和之前看的新闻对上了。'}
  ]}
];

export const CAPTURE_MODES=[
  {k:'auto', t:'自动判断',    on:true, lock:true},
  {k:'todo', t:'待办',        on:true},
  {k:'note', t:'随心记',      on:true},
  {k:'money',t:'记一笔支出',  on:true},
  {k:'inbox',t:'只丢进收件箱',on:true}
];

export const AUTO_RULES=[
  {id:'u-squat', sys:false, on:true, t:'深蹲／硬拉／卧推 → 力量训练',
   kw:'深蹲,硬拉,卧推,引体,划船', to:'rt_strength'},
  {id:'sys-kcal', sys:true, on:true, t:'提到卡路里 → 热量摄入',
   kw:'kcal,千卡,大卡,卡路里', to:'rt_kcal_in'},
  {id:'sys-weight', sys:true, on:true, t:'提到公斤 → 体重',
   kw:'kg,公斤,千克,斤', ex:'×|组|次|深蹲|硬拉|卧推', to:'rt_weight'},
  {id:'sys-money', sys:true, on:true, t:'数字在开头 → 记一笔支出',
   re:'^(¥|￥|RMB)?\\s*\\d+(\\.\\d+)?',
   ex:'公里|千米|km|米|次|页|分钟|小时|组|个|杯|瓶|步', to:'money'}
];

export const TODAY_LOGS=[
  {time:'08:15',label:'早餐 ¥12 · 餐饮'},
  {time:'10:30',label:'体重 71.4 kg',ref:{k:'rt',rtId:'rt_weight',logId:'k6'}},
  {time:'12:40',label:'午餐 ¥32 · 餐饮',ref:{k:'money',id:'lg1'}}
];

export const CLOSED_NODES={};

/* 一次性打包给 db.js 初始化用。
   SEED_DATA = 真正的数据，会进快照、进导出文件；
   SEED_UI   = 界面状态（哪些条目被折叠了），只活在这个会话里，不导出去。 */
export const SEED_DATA = {
  ITEMS, HABIT_LOGS, INBOX, NOTES, NOTE_PROMPTS, LOGS, DOMAINS,
  RECORD_TYPES, CAPTURE_MODES, AUTO_RULES, TODAY_LOGS, CAT_WORDS, CATS
}
export const SEED_UI = { CLOSED_NODES }
