"""
Docker 构建时预建 FAISS 索引（避免运行时 OOM）
"""
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np
import json
import os

# ===== 从 seed.py 复制的题目数据 =====
POSITIONS = [
    {
        "name": "互联网产品经理",
        "questions": [
            {"content": "请分析微信朋友圈为什么不做「踩」的功能？", "ability_dimension": "需求分析", "difficulty": "medium", "reference_answer": "应从用户心理（社交压力）、产品定位（正向社交）、竞品差异（与微博的差异化）、数据指标（互动率）等角度分析"},
            {"content": "如果你负责 OPPO 手机的负一屏，你会如何提升用户留存？请给出具体方案", "ability_dimension": "需求分析", "difficulty": "hard", "reference_answer": "应从用户场景分析、功能矩阵设计、个性化推荐、A/B测试方案等角度回答"},
            {"content": "你如何判断一个需求是否值得做？请描述你的决策框架", "ability_dimension": "需求分析", "difficulty": "easy", "reference_answer": "应从用户价值、商业价值、技术可行性、ROI、紧急程度等维度构建决策矩阵"},
            {"content": "假设你收到用户反馈说「这个功能太难用了」，你接下来会怎么做？", "ability_dimension": "需求分析", "difficulty": "medium", "reference_answer": "应描述用户调研、可用性测试、数据分析、竞品对比、优先级排序等步骤"},
            {"content": "设计一个针对大学生群体的手机相册管理功能，请描述你的思路", "ability_dimension": "需求分析", "difficulty": "hard", "reference_answer": "应从用户画像、使用场景、核心痛点、功能优先级、MVP定义等角度分析"},
            {"content": "DAU 突然下降了 10%，你会怎么排查原因？", "ability_dimension": "数据分析", "difficulty": "medium", "reference_answer": "应从数据拆分（渠道/版本/地区）、同期对比、漏斗分析、外部因素等多维度排查"},
            {"content": "如何设计一个衡量「用户满意度」的指标体系？", "ability_dimension": "数据分析", "difficulty": "hard", "reference_answer": "应从NPS、CSAT、留存率、投诉率、功能使用深度等多指标综合评估"},
            {"content": "你如何判断一个 AB 测试的结果是否显著？", "ability_dimension": "数据分析", "difficulty": "medium", "reference_answer": "应涉及样本量计算、置信区间、P值、最小检测效应、实验时长等概念"},
            {"content": "假设你发现某个功能的使用率很低，但用户调研中很多人说需要这个功能，你会怎么分析？", "ability_dimension": "数据分析", "difficulty": "easy", "reference_answer": "应分析用户说 vs 用户做的差异、功能入口可见性、使用场景是否匹配等"},
            {"content": "请解释什么是「留存率」和「流失率」，以及如何通过数据驱动提升留存", "ability_dimension": "数据分析", "difficulty": "medium", "reference_answer": "应定义新用户留存/活跃用户留存/回流用户留存，并给出提升策略"},
            {"content": "OPPO Find 系列和 vivo X 系列的核心差异是什么？如果你是产品经理，你会如何做差异化？", "ability_dimension": "竞品调研", "difficulty": "medium", "reference_answer": "应从定位、定价、核心卖点、目标用户、品牌调性等角度分析"},
            {"content": "请分析抖音和快手在产品设计上的核心差异，以及背后的用户洞察", "ability_dimension": "竞品调研", "difficulty": "hard", "reference_answer": "应从内容分发机制、社区氛围、用户画像、商业化模式等角度对比"},
            {"content": "你如何判断一个竞品功能是否值得跟进？", "ability_dimension": "竞品调研", "difficulty": "medium", "reference_answer": "应从用户重合度、功能战略匹配度、实现成本、差异化空间等维度评估"},
            {"content": "请描述你做过的一次竞品分析，使用了什么方法？得出了什么结论？", "ability_dimension": "竞品调研", "difficulty": "easy", "reference_answer": "应描述具体的分析框架（如SWOT、波特五力、用户体验五要素等）和分析过程"},
            {"content": "如果老板让你分析小米最新发布的IoT产品，你会从哪些维度入手？", "ability_dimension": "竞品调研", "difficulty": "medium", "reference_answer": "应从产品矩阵、生态协同、定价策略、用户反馈、技术壁垒等角度分析"},
            {"content": "请描述你从收到需求到输出原型的设计流程", "ability_dimension": "原型设计", "difficulty": "medium", "reference_answer": "应包括需求理解、用户调研、竞品分析、信息架构、交互设计、视觉设计、评审迭代"},
            {"content": "你认为一个好的交互原型应该具备哪些特点？", "ability_dimension": "原型设计", "difficulty": "easy", "reference_answer": "应提及清晰的导航、减少认知负荷、提供反馈、容错设计、一致性等原则"},
            {"content": "设计一个「手机找回」功能，画出核心流程并说明关键交互决策", "ability_dimension": "原型设计", "difficulty": "hard", "reference_answer": "应描述定位触发、远程锁定、数据擦除、消息推送等流程的交互设计"},
            {"content": "你如何平衡「用户体验」和「商业目标」之间的矛盾？请举例说明", "ability_dimension": "原型设计", "difficulty": "medium", "reference_answer": "应举例说明如何在广告展示、付费引导等场景下平衡两者"},
            {"content": "如果用户反馈原型的某个步骤「太复杂了」，你会如何优化？", "ability_dimension": "原型设计", "difficulty": "medium", "reference_answer": "应从减少步骤、默认值、智能预填、进度提示、引导教育等角度优化"},
            {"content": "需求评审时，研发说这个需求做不了，你会怎么处理？", "ability_dimension": "项目管理", "difficulty": "medium", "reference_answer": "应描述理解技术难点、寻找替代方案、调整优先级、数据支撑决策等沟通策略"},
            {"content": "同时有 5 个需求要做，但资源只够做 3 个，你如何决策？", "ability_dimension": "项目管理", "difficulty": "hard", "reference_answer": "应从ROI、战略对齐度、紧急程度、依赖关系、用户影响面等维度评估"},
            {"content": "你如何确保产品需求文档（PRD）的质量？", "ability_dimension": "项目管理", "difficulty": "medium", "reference_answer": "应提及需求背景、用户故事、验收标准、边界条件、数据埋点等要素"},
            {"content": "请描述你经历过的一次项目延期，你是如何处理的？", "ability_dimension": "项目管理", "difficulty": "easy", "reference_answer": "应描述根因分析、沟通协调、资源调配、风险预案等应对措施"},
            {"content": "你如何与设计师有效沟通？", "ability_dimension": "项目管理", "difficulty": "medium", "reference_answer": "应涉及明确需求而非方案、用数据说话、尊重专业、建立设计规范等"},
            {"content": "请用 1 分钟时间，向一个完全不懂产品的人介绍「产品经理是做什么的」", "ability_dimension": "沟通表达", "difficulty": "easy", "reference_answer": "考察表达清晰度、比喻能力、逻辑结构"},
            {"content": "你如何向老板汇报一个坏消息？比如项目进度严重滞后", "ability_dimension": "沟通表达", "difficulty": "medium", "reference_answer": "应描述事实陈述、原因分析、解决方案、资源需求、时间承诺等汇报结构"},
            {"content": "如果运营团队提了一个你认为不合理的需求，你会怎么拒绝？", "ability_dimension": "沟通表达", "difficulty": "medium", "reference_answer": "应展示用数据说话、提供替代方案、理解对方目标、保持合作态度等技巧"},
            {"content": "请用「电梯演讲」的方式，30秒内说服我投资你的产品创意", "ability_dimension": "沟通表达", "difficulty": "hard", "reference_answer": "考察信息压缩能力、核心卖点提炼、感染力"},
            {"content": "你认为一个好的产品经理需要具备哪些软技能？", "ability_dimension": "沟通表达", "difficulty": "easy", "reference_answer": "应提及同理心、沟通能力、逻辑思维、学习能力、抗压能力等"},
        ],
    },
    {
        "name": "后端开发工程师",
        "questions": [
            {"content": "请解释哈希表的原理，以及如何处理哈希冲突？", "ability_dimension": "数据结构与算法", "difficulty": "medium", "reference_answer": "应解释哈希函数、数组存储、链地址法/开放寻址法、负载因子等"},
            {"content": "设计一个LRU缓存，要求O(1)时间复杂度的get和put操作", "ability_dimension": "数据结构与算法", "difficulty": "hard", "reference_answer": "应使用哈希表+双向链表实现，描述数据结构设计和操作流程"},
            {"content": "请解释什么是时间复杂度和空间复杂度，并举例说明O(n)、O(log n)、O(n²)", "ability_dimension": "数据结构与算法", "difficulty": "medium", "reference_answer": "应分别给出二分查找、遍历、冒泡排序等例子"},
            {"content": "数组和链表各自的优缺点是什么？在什么场景下选择哪个？", "ability_dimension": "数据结构与算法", "difficulty": "easy", "reference_answer": "数组：随机访问O(1)、插入删除O(n)；链表：随机访问O(n)、插入删除O(1)"},
            {"content": "如何判断一个链表是否有环？请给出两种解法", "ability_dimension": "数据结构与算法", "difficulty": "hard", "reference_answer": "快慢指针法（Floyd判圈）和哈希表标记法"},
            {"content": "设计一个支持千万级用户的短视频点赞系统，请描述你的架构方案", "ability_dimension": "系统设计", "difficulty": "hard", "reference_answer": "应从写扩散vs读扩散、异步化、缓存策略、热点处理、数据一致性等角度设计"},
            {"content": "请解释什么是微服务架构？它的优缺点是什么？", "ability_dimension": "系统设计", "difficulty": "medium", "reference_answer": "应描述服务拆分、独立部署、去中心化、以及分布式事务、运维复杂度等挑战"},
            {"content": "如何设计一个分布式ID生成器？至少说出两种方案", "ability_dimension": "系统设计", "difficulty": "hard", "reference_answer": "雪花算法、号段模式、UUID、数据库自增等方案对比"},
            {"content": "请解释CAP理论，并举例说明在分布式系统中如何权衡", "ability_dimension": "系统设计", "difficulty": "medium", "reference_answer": "C一致性/A可用性/P分区容错，举例说明CP（ZooKeeper）和AP（Eureka）的选择"},
            {"content": "什么是缓存穿透、缓存击穿、缓存雪崩？如何解决？", "ability_dimension": "系统设计", "difficulty": "medium", "reference_answer": "穿透：布隆过滤器/空值缓存；击穿：互斥锁/永不过期；雪崩：随机过期时间/多级缓存"},
            {"content": "请解释MySQL的索引原理，B+树和B树的区别", "ability_dimension": "数据库", "difficulty": "medium", "reference_answer": "B+树所有数据在叶子节点、叶子节点链表连接，更利于范围查询和磁盘IO"},
            {"content": "什么是慢查询？你如何定位和优化一条慢SQL？", "ability_dimension": "数据库", "difficulty": "hard", "reference_answer": "应描述EXPLAIN分析、索引优化、SQL改写、分库分表、读写分离等手段"},
            {"content": "请解释事务的ACID特性，以及MySQL如何实现事务隔离", "ability_dimension": "数据库", "difficulty": "medium", "reference_answer": "原子性/一致性/隔离性/持久性，MVCC多版本并发控制，四种隔离级别"},
            {"content": "什么是联合索引的最左前缀原则？请举例说明", "ability_dimension": "数据库", "difficulty": "easy", "reference_answer": "联合索引(a,b,c)中，where a=1、where a=1 and b=2可用索引，where b=2不行"},
            {"content": "Redis有哪些数据结构？分别适用于什么场景？", "ability_dimension": "数据库", "difficulty": "medium", "reference_answer": "String(缓存)、Hash(对象)、List(队列)、Set(去重)、ZSet(排行榜)、HyperLogLog(UV)等"},
            {"content": "请详细描述一次完整的HTTP请求过程，从输入URL到页面展示", "ability_dimension": "网络协议", "difficulty": "medium", "reference_answer": "DNS解析、TCP三次握手、TLS握手、HTTP请求响应、浏览器渲染等"},
            {"content": "请解释TCP三次握手和四次挥手的过程，为什么是三次和四次？", "ability_dimension": "网络协议", "difficulty": "hard", "reference_answer": "三次握手：防止历史连接；四次挥手：全双工通信需要双方各自关闭"},
            {"content": "HTTP和HTTPS的区别是什么？HTTPS是如何保证安全的？", "ability_dimension": "网络协议", "difficulty": "medium", "reference_answer": "HTTPS = HTTP + TLS/SSL，通过证书认证、非对称加密交换密钥、对称加密传输数据"},
            {"content": "请解释常用的HTTP状态码：200、301、302、400、401、403、404、500、502、503", "ability_dimension": "网络协议", "difficulty": "easy", "reference_answer": "分别描述成功、永久重定向、临时重定向、请求错误、未认证、禁止、未找到、服务器错误等"},
            {"content": "TCP和UDP的区别是什么？各自适用于什么场景？", "ability_dimension": "网络协议", "difficulty": "medium", "reference_answer": "TCP可靠/有序/面向连接/流量控制；UDP不可靠/无序/无连接/低延迟，适合视频/游戏"},
            {"content": "请解释Python的GIL是什么？它如何影响多线程性能？如何绕过？", "ability_dimension": "编程语言", "difficulty": "medium", "reference_answer": "全局解释器锁，多线程中同一时刻只有一个线程执行，可通过多进程或异步IO绕过"},
            {"content": "请解释Python中的装饰器是什么？写出一个计时装饰器的实现", "ability_dimension": "编程语言", "difficulty": "easy", "reference_answer": "装饰器是接收函数返回函数的可调用对象，用于增强函数功能"},
            {"content": "请解释什么是设计模式？举出3个你常用的设计模式及其应用场景", "ability_dimension": "编程语言", "difficulty": "medium", "reference_answer": "单例(配置)、工厂(对象创建)、观察者(事件驱动)、策略(算法切换)等"},
            {"content": "请解释Python的async/await原理，以及事件循环的工作机制", "ability_dimension": "编程语言", "difficulty": "hard", "reference_answer": "协程、事件循环、Future/Task、await挂起恢复、IO多路复用等"},
            {"content": "Python中列表和元组的区别是什么？", "ability_dimension": "编程语言", "difficulty": "easy", "reference_answer": "列表可变/元组不可变；列表性能略低/元组更高效；元组可哈希可作为字典键"},
            {"content": "请描述你做过的最有挑战性的项目，你在其中负责什么？遇到了什么技术难点？", "ability_dimension": "项目经验", "difficulty": "medium", "reference_answer": "考察项目经验、问题解决能力、技术深度"},
            {"content": "你如何保证线上服务的稳定性？请描述你的监控和告警体系", "ability_dimension": "项目经验", "difficulty": "medium", "reference_answer": "应提及日志监控、指标监控、链路追踪、告警规则、oncall机制、应急预案等"},
            {"content": "请解释什么是CI/CD？你在项目中是如何实践的？", "ability_dimension": "项目经验", "difficulty": "easy", "reference_answer": "持续集成/持续部署，代码提交→自动测试→构建→部署的自动化流程"},
            {"content": "Docker和虚拟机的区别是什么？为什么容器化这么流行？", "ability_dimension": "项目经验", "difficulty": "medium", "reference_answer": "容器共享宿主机内核、启动快、资源占用少；虚拟机完全隔离、安全性高"},
            {"content": "线上出现了一个严重Bug，你的排查和处理流程是什么？", "ability_dimension": "项目经验", "difficulty": "hard", "reference_answer": "应描述告警响应、日志排查、问题定位、回滚/热修复、根因分析、复盘改进等"},
        ],
    },
    {
        "name": "前端开发工程师",
        "questions": [
            {"content": "请解释BFC是什么？如何创建BFC？它解决了什么问题？", "ability_dimension": "HTML/CSS", "difficulty": "medium", "reference_answer": "块级格式化上下文，通过overflow/float/position等创建，解决margin重叠、浮动清除等"},
            {"content": "请解释CSS盒模型，以及box-sizing的作用", "ability_dimension": "HTML/CSS", "difficulty": "easy", "reference_answer": "content-box(width=内容)和border-box(width=内容+padding+border)，后者更直观"},
            {"content": "如何实现一个三栏布局，左右固定宽度，中间自适应？至少说出3种方法", "ability_dimension": "HTML/CSS", "difficulty": "medium", "reference_answer": "float、flex、grid、absolute定位、table布局等"},
            {"content": "请解释CSS的层叠上下文和z-index的工作原理", "ability_dimension": "HTML/CSS", "difficulty": "hard", "reference_answer": "层叠上下文由position/opacity/transform等创建，z-index只在同一层叠上下文中比较"},
            {"content": "请解释flex布局中flex-grow、flex-shrink、flex-basis的含义", "ability_dimension": "HTML/CSS", "difficulty": "easy", "reference_answer": "grow放大比例、shrink缩小比例、basis初始大小，flex:1 = flex: 1 1 0%"},
            {"content": "请解释JavaScript的事件循环机制，什么是宏任务和微任务？", "ability_dimension": "JavaScript", "difficulty": "medium", "reference_answer": "宏任务：setTimeout/setInterval/I/O；微任务：Promise.then/MutationObserver；执行顺序"},
            {"content": "请解释闭包的原理，并举例说明闭包的应用场景和可能的内存泄漏问题", "ability_dimension": "JavaScript", "difficulty": "hard", "reference_answer": "函数访问外部作用域变量，应用：数据私有化/柯里化/防抖节流；泄漏：未清理的引用"},
            {"content": "请解释原型链和继承的实现方式", "ability_dimension": "JavaScript", "difficulty": "medium", "reference_answer": "每个对象有__proto__指向原型，形成原型链；ES6 class继承本质是原型链继承"},
            {"content": "var、let、const的区别是什么？", "ability_dimension": "JavaScript", "difficulty": "easy", "reference_answer": "var函数作用域/变量提升/可重复声明；let/const块作用域/暂时性死区/不可重复声明"},
            {"content": "请解释Promise的原理，以及async/await是如何基于Promise实现的", "ability_dimension": "JavaScript", "difficulty": "medium", "reference_answer": "Promise三种状态(pending/fulfilled/rejected)，async/await是Generator+Promise的语法糖"},
            {"content": "请解释React Fiber架构的设计理念和解决的问题", "ability_dimension": "框架原理", "difficulty": "hard", "reference_answer": "可中断的异步渲染、优先级调度、时间切片，解决长任务阻塞主线程的问题"},
            {"content": "请解释React的虚拟DOM和Diff算法", "ability_dimension": "框架原理", "difficulty": "medium", "reference_answer": "虚拟DOM是JS对象树，Diff通过同层比较、key优化、三种操作(替换/移动/删除)"},
            {"content": "React的useEffect和useLayoutEffect的区别是什么？", "ability_dimension": "框架原理", "difficulty": "medium", "reference_answer": "useEffect异步执行不阻塞渲染；useLayoutEffect同步执行在DOM更新后、浏览器绘制前"},
            {"content": "请解释Next.js的SSR/SSG/ISR的区别和适用场景", "ability_dimension": "框架原理", "difficulty": "hard", "reference_answer": "SSR每次请求渲染/SSG构建时生成/ISR定时增量更新，分别适合动态/静态/更新频繁的内容"},
            {"content": "React中如何避免不必要的重渲染？请列举至少3种方法", "ability_dimension": "框架原理", "difficulty": "medium", "reference_answer": "React.memo、useMemo、useCallback、状态拆分、Context拆分、key优化等"},
            {"content": "请描述前端性能优化的完整方案，从网络层到渲染层", "ability_dimension": "性能优化", "difficulty": "medium", "reference_answer": "网络：CDN/压缩/HTTP2/缓存；渲染：代码分割/懒加载/SSR/虚拟列表/图片优化"},
            {"content": "如何优化一个大型列表的渲染性能？请说明虚拟滚动的原理", "ability_dimension": "性能优化", "difficulty": "hard", "reference_answer": "只渲染可视区域内的DOM，通过计算偏移量和占位高度模拟滚动，核心是startIndex和endIndex的计算"},
            {"content": "请解释Webpack的Tree Shaking原理，以及如何配置", "ability_dimension": "性能优化", "difficulty": "medium", "reference_answer": "基于ESM静态分析、标记未使用代码、Terser删除；需配置sideEffects和usedExports"},
            {"content": "什么是浏览器的重排和重绘？如何减少重排？", "ability_dimension": "性能优化", "difficulty": "easy", "reference_answer": "重排改变布局、重绘改变外观；减少方法：批量DOM操作、使用transform、脱离文档流"},
            {"content": "请解释浏览器缓存策略：强缓存和协商缓存", "ability_dimension": "性能优化", "difficulty": "medium", "reference_answer": "强缓存：Cache-Control/Expires不发起请求；协商缓存：ETag/Last-Modified发起请求验证"},
            {"content": "请解释Webpack和Vite的核心区别，以及Vite为什么快", "ability_dimension": "工程化", "difficulty": "medium", "reference_answer": "Webpack全量打包；Vite开发时基于ESM按需编译、使用esbuild预构建、HMR极快"},
            {"content": "你如何管理前端项目的代码规范？请描述你的方案", "ability_dimension": "工程化", "difficulty": "easy", "reference_answer": "ESLint+Prettier+Husky+lint-staged+commitlint，自动化检查和格式化"},
            {"content": "请解释TypeScript的泛型是什么？举一个你实际使用泛型的例子", "ability_dimension": "工程化", "difficulty": "medium", "reference_answer": "泛型是类型参数化，如<T>(arg: T): T => arg，用于复用类型逻辑、保证类型安全"},
            {"content": "如何设计一个组件库的架构？请说明你的设计思路", "ability_dimension": "工程化", "difficulty": "hard", "reference_answer": "应从组件设计原则、主题系统、按需加载、类型定义、文档、测试、版本管理等方面说明"},
            {"content": "前端单元测试你使用什么工具？请写出一个测试用例", "ability_dimension": "工程化", "difficulty": "medium", "reference_answer": "Vitest/Jest+Testing Library，描述测试组件渲染、用户交互、异步行为的用例"},
        ],
    },
    {
        "name": "数据分析师",
        "questions": [
            {"content": "请写出SQL查询：找出每个部门工资排名前3的员工", "ability_dimension": "SQL与数据处理", "difficulty": "medium", "reference_answer": "应使用窗口函数ROW_NUMBER()/RANK() OVER(PARTITION BY dept ORDER BY salary DESC)"},
            {"content": "什么是SQL注入？如何防范？", "ability_dimension": "SQL与数据处理", "difficulty": "hard", "reference_answer": "恶意用户通过输入构造SQL语句攻击数据库，防范：参数化查询、输入校验、最小权限原则"},
            {"content": "请解释SQL中JOIN的类型：INNER JOIN、LEFT JOIN、RIGHT JOIN、FULL JOIN的区别", "ability_dimension": "SQL与数据处理", "difficulty": "medium", "reference_answer": "INNER取交集、LEFT保留左表全部、RIGHT保留右表全部、FULL保留两表全部"},
            {"content": "SQL中WHERE和HAVING的区别是什么？", "ability_dimension": "SQL与数据处理", "difficulty": "easy", "reference_answer": "WHERE在分组前过滤行，HAVING在分组后过滤组；WHERE不能用聚合函数，HAVING可以"},
            {"content": "如何处理数据中的缺失值？请描述至少3种方法", "ability_dimension": "SQL与数据处理", "difficulty": "medium", "reference_answer": "删除缺失行、均值/中位数/众数填充、插值法、模型预测填充、标记缺失"},
            {"content": "请解释P值的含义，以及为什么P<0.05不能完全证明结论？", "ability_dimension": "统计学基础", "difficulty": "medium", "reference_answer": "P值是原假设成立时观察到当前结果的概率，P<0.05仅表示结果不太可能是随机产生，但存在假阳性风险"},
            {"content": "什么是中心极限定理？为什么它在大数据分析中很重要？", "ability_dimension": "统计学基础", "difficulty": "medium", "reference_answer": "样本量足够大时，样本均值的分布近似正态分布，这是很多统计推断和假设检验的基础"},
            {"content": "请解释一类错误和二类错误的区别，以及如何权衡", "ability_dimension": "统计学基础", "difficulty": "hard", "reference_answer": "一类错误：弃真（假阳性）；二类错误：存伪（假阴性）；通过调整显著性水平α和样本量来权衡"},
            {"content": "请解释平均数、中位数、众数的区别和各自适用场景", "ability_dimension": "统计学基础", "difficulty": "easy", "reference_answer": "平均数受极端值影响、中位数稳健、众数适用于分类数据；收入数据用中位数更合适"},
            {"content": "什么是相关性分析和因果分析？它们有什么区别？", "ability_dimension": "统计学基础", "difficulty": "medium", "reference_answer": "相关性不等于因果性，相关性描述变量间关联程度，因果分析需要排除混杂因素，通常需要实验设计"},
            {"content": "某APP的DAU连续3周下降，请描述你的分析框架", "ability_dimension": "分析方法论", "difficulty": "hard", "reference_answer": "应从外部因素（节假日/竞品）、内部因素（版本/渠道/功能）、用户分群（新老用户/地区）多维度拆解"},
            {"content": "请解释漏斗分析的核心思想，并举例说明如何用漏斗分析优化转化率", "ability_dimension": "分析方法论", "difficulty": "medium", "reference_answer": "漏斗分析跟踪用户从初始到最终转化的各步骤，找出流失最大的环节进行优化"},
            {"content": "什么是RFM模型？如何用它进行用户分层？", "ability_dimension": "分析方法论", "difficulty": "medium", "reference_answer": "Recency(最近消费时间)、Frequency(消费频率)、Monetary(消费金额)，三维度打分后分层"},
            {"content": "你如何向业务方解释一个复杂的数据分析结果？", "ability_dimension": "分析方法论", "difficulty": "easy", "reference_answer": "应使用金字塔原理：先说结论、再用数据支撑、最后给出建议，避免使用过多技术术语"},
            {"content": "请解释什么是归因分析，以及常用的归因模型有哪些", "ability_dimension": "分析方法论", "difficulty": "medium", "reference_answer": "归因分析是将转化归功于不同触达渠道，模型：首次触达、末次触达、线性、时间衰减、数据驱动"},
            {"content": "你如何设计一个面向高管的Dashboard？请说明你的设计原则", "ability_dimension": "可视化与报告", "difficulty": "medium", "reference_answer": "应聚焦核心指标、一目了然、趋势对比、支持交互下钻、移动端适配"},
            {"content": "请解释柱状图、折线图、饼图、散点图分别适用于什么场景", "ability_dimension": "可视化与报告", "difficulty": "easy", "reference_answer": "柱状图比较类别、折线图展示趋势、饼图显示占比（不超过5类）、散点图展示相关性"},
            {"content": "你如何确保数据报告的准确性？", "ability_dimension": "可视化与报告", "difficulty": "medium", "reference_answer": "应描述数据校验、交叉验证、口径统一、异常值检测、与业务方确认等步骤"},
            {"content": "如果业务方质疑你的数据结果，你会如何处理？", "ability_dimension": "可视化与报告", "difficulty": "hard", "reference_answer": "应先理解质疑点、复查数据源和计算逻辑、用其他方式交叉验证、数据说话而非情绪对抗"},
            {"content": "请设计一个分析报告的框架，包含哪些部分？", "ability_dimension": "可视化与报告", "difficulty": "medium", "reference_answer": "应包括背景/目标、数据来源、分析方法、核心发现、可视化图表、结论与建议、附录"},
            {"content": "如何搭建一个产品的核心指标体系？请以电商APP为例", "ability_dimension": "业务理解", "difficulty": "medium", "reference_answer": "应从北极星指标（如GMV）出发，拆解为流量、转化、客单价、复购等二级指标，再下钻到三级指标"},
            {"content": "你发现某次活动的ROI很低，但运营团队认为活动很成功，你怎么处理？", "ability_dimension": "业务理解", "difficulty": "hard", "reference_answer": "应从双方视角出发：运营关注品牌曝光/用户互动，数据关注ROI/转化，找到共同认可的评估维度"},
            {"content": "请解释什么是AARRR模型，并说明每个阶段的关注指标", "ability_dimension": "业务理解", "difficulty": "medium", "reference_answer": "Acquisition(获客)、Activation(激活)、Retention(留存)、Revenue(收入)、Referral(传播)"},
            {"content": "你觉得数据分析师和产品经理的协作关系应该是怎样的？", "ability_dimension": "业务理解", "difficulty": "easy", "reference_answer": "数据分析师提供数据洞察和决策依据，产品经理基于数据和用户理解做决策，互相赋能"},
            {"content": "如何用数据驱动的方式提升用户留存？", "ability_dimension": "业务理解", "difficulty": "medium", "reference_answer": "应从留存定义、用户分群、行为分析、留存拐点、激励策略等角度，形成假设-验证的闭环"},
            {"content": "请用Python写一个函数，计算两个日期间隔了多少个工作日", "ability_dimension": "编程与工具", "difficulty": "medium", "reference_answer": "应使用datetime模块，遍历日期范围，跳过周末（和节假日），计数工作日"},
            {"content": "Pandas中如何对DataFrame进行分组聚合？请写出示例代码", "ability_dimension": "编程与工具", "difficulty": "easy", "reference_answer": "df.groupby('column').agg({'col1': 'sum', 'col2': 'mean'})或使用agg的多种聚合方式"},
            {"content": "请解释Excel中VLOOKUP和XLOOKUP的区别，以及各自的优缺点", "ability_dimension": "编程与工具", "difficulty": "medium", "reference_answer": "VLOOKUP只能从左向右查找、XLOOKUP支持任意方向；XLOOKUP更灵活但需要Excel 365"},
            {"content": "如何处理一个10GB的数据集？请说明你的技术方案", "ability_dimension": "编程与工具", "difficulty": "hard", "reference_answer": "应使用分块读取、SQL数据库、Spark等分布式框架、抽样分析、增量处理等策略"},
            {"content": "请解释Python中列表推导式和生成器的区别", "ability_dimension": "编程与工具", "difficulty": "medium", "reference_answer": "列表推导式一次性生成全部数据占用内存；生成器惰性计算、逐个生成、内存友好"},
        ],
    },
    {
        "name": "运营",
        "questions": [
            {"content": "请解释用户生命周期管理，并说明每个阶段的运营策略", "ability_dimension": "用户运营", "difficulty": "medium", "reference_answer": "引入期（新手引导）、成长期（激活提升）、成熟期（价值最大化）、休眠期（召回）、流失期（挽回/放弃）"},
            {"content": "如何设计一个用户分层体系？请以你熟悉的APP为例", "ability_dimension": "用户运营", "difficulty": "hard", "reference_answer": "应从RFM模型、行为特征、生命周期阶段等多维度构建分层矩阵，每层制定差异化策略"},
            {"content": "用户活跃度下降，你会如何分析和解决？", "ability_dimension": "用户运营", "difficulty": "medium", "reference_answer": "应从用户分群、行为路径分析、功能使用率、竞品动态、用户调研等多角度诊断，制定针对性方案"},
            {"content": "请解释什么是DAU、MAU、留存率，它们之间的关系是什么？", "ability_dimension": "用户运营", "difficulty": "easy", "reference_answer": "DAU日活/MAU月活，DAU/MAU比值反映用户粘性；留存率是某时间段后仍活跃的用户比例"},
            {"content": "如何设计一个有效的用户召回策略？", "ability_dimension": "用户运营", "difficulty": "medium", "reference_answer": "应分析流失原因、选择召回渠道（Push/短信/邮件）、设计利益点、定频次、A/B测试优化"},
            {"content": "请描述你策划过的最成功的一次活动，从策划到落地的完整流程", "ability_dimension": "活动策划", "difficulty": "medium", "reference_answer": "应包含目标设定、创意构思、方案设计、资源协调、执行推进、数据监控、复盘总结"},
            {"content": "如果让你设计一个拉新活动，预算1万元，预期拉新5000人，你会怎么做？", "ability_dimension": "活动策划", "difficulty": "hard", "reference_answer": "应从目标人群、活动形式（邀请有礼/裂变/任务）、激励设计、投放渠道、ROI测算等角度规划"},
            {"content": "活动上线后效果不及预期，你会怎么调整？", "ability_dimension": "活动策划", "difficulty": "medium", "reference_answer": "应快速分析数据（曝光-点击-转化漏斗）、定位问题环节、调整策略（素材/文案/渠道/激励）、小步快跑迭代"},
            {"content": "你如何判断一个活动创意是否值得执行？", "ability_dimension": "活动策划", "difficulty": "easy", "reference_answer": "应从目标匹配度、用户接受度、实施成本、预期ROI、竞品参考、风险可控性等维度评估"},
            {"content": "请设计一个针对大学生群体的开学季活动方案", "ability_dimension": "活动策划", "difficulty": "medium", "reference_answer": "应从大学生痛点（社交/学习/生活）、活动形式（打卡/挑战赛/投票）、传播渠道（QQ群/朋友圈/校园KOL）等角度设计"},
            {"content": "如何评估一个运营活动的效果？请列出关键指标", "ability_dimension": "数据分析", "difficulty": "medium", "reference_answer": "应从拉新（新增用户/获取成本）、促活（活跃度提升）、留存（后续留存率）、转化（付费率/ARPU）、传播（分享率）等维度"},
            {"content": "一个渠道的获客成本突然翻倍，你会怎么排查？", "ability_dimension": "数据分析", "difficulty": "hard", "reference_answer": "应从渠道本身（出价/竞争）、素材（点击率下降）、落地页（转化率下降）、用户质量（是否被刷量）等维度排查"},
            {"content": "请解释什么是ROI，以及如何提升运营活动的ROI", "ability_dimension": "数据分析", "difficulty": "medium", "reference_answer": "ROI=收益/成本，提升方法：精准投放降低获客成本、优化转化链路提升转化率、提升客单价/复购率"},
            {"content": "你如何用数据说服老板批准你的运营方案？", "ability_dimension": "数据分析", "difficulty": "easy", "reference_answer": "应准备行业数据（市场机会）、历史数据（类似活动效果）、预算测算（ROI预估）、小规模测试验证"},
            {"content": "请解释什么是A/B测试，在运营中如何应用？", "ability_dimension": "数据分析", "difficulty": "medium", "reference_answer": "A/B测试是将用户随机分为实验组和对照组，对比不同策略的效果，用于优化推送文案、活动页、奖励力度等"},
            {"content": "如何打造一个爆款内容？请描述你的方法论", "ability_dimension": "内容运营", "difficulty": "medium", "reference_answer": "应从选题（热点/痛点/共鸣）、标题（吸引点击）、内容结构（开头钩子/正文干货/结尾互动）、分发策略（时机/渠道）等角度"},
            {"content": "请分析抖音和小红书在内容生态上的差异，如果你运营一个品牌账号，策略会有什么不同？", "ability_dimension": "内容运营", "difficulty": "hard", "reference_answer": "抖音重算法推荐/娱乐化/短视频，小红书重社区氛围/种草/图文+视频；抖音需强钩子/前3秒，小红书需真实感/干货"},
            {"content": "你如何策划一个内容日历？请说明你的思路", "ability_dimension": "内容运营", "difficulty": "medium", "reference_answer": "应结合热点日历、产品节奏、用户画像、内容类型（图文/视频/直播）、发布频率等制定"},
            {"content": "你认为一篇好的运营文案应该具备什么特点？", "ability_dimension": "内容运营", "difficulty": "easy", "reference_answer": "应提及明确目标用户、清晰的价值主张、有吸引力的钩子、简洁有力、行动号召CTA"},
            {"content": "如何衡量内容运营的效果？", "ability_dimension": "内容运营", "difficulty": "medium", "reference_answer": "应从曝光量、阅读量、互动率、分享率、转化率、用户停留时长、粉丝增长等指标综合评估"},
            {"content": "请解释什么是增长黑客，以及增长黑客的核心理念", "ability_dimension": "增长思维", "difficulty": "medium", "reference_answer": "增长黑客是以数据驱动、快速实验为核心，通过产品、营销、数据等手段实现低成本快速增长"},
            {"content": "如何从0到1设计一个用户增长方案？", "ability_dimension": "增长思维", "difficulty": "hard", "reference_answer": "应从确定北极星指标、分析增长模型（AARRR/RARRA）、找到关键杠杆点、设计实验、快速迭代等步骤"},
            {"content": "请分析拼多多的增长策略，有哪些值得借鉴的地方？", "ability_dimension": "增长思维", "difficulty": "medium", "reference_answer": "应分析拼团裂变、社交分享、游戏化、低价策略、下沉市场定位等增长手段"},
            {"content": "你如何判断一个增长实验是否成功？", "ability_dimension": "增长思维", "difficulty": "easy", "reference_answer": "应设定明确的成功标准（核心指标提升幅度）、统计显著性检验、控制变量、考虑长期影响而非短期效果"},
            {"content": "请解释什么是病毒系数（K因子），以及如何提升它", "ability_dimension": "增长思维", "difficulty": "medium", "reference_answer": "K因子=每个用户邀请的新用户数，提升方法：优化分享体验、提升激励力度、降低邀请门槛、选择合适的分享时机"},
            {"content": "运营需要和产品、研发、设计等多个部门协作，你如何推动跨部门项目？", "ability_dimension": "沟通协作", "difficulty": "medium", "reference_answer": "应明确共同目标、建立沟通机制、用数据说话、尊重专业、及时同步进度、分享成果"},
            {"content": "你怎么看待运营和产品的关系？", "ability_dimension": "沟通协作", "difficulty": "easy", "reference_answer": "产品负责搭建舞台，运营负责让舞台上精彩表演；产品定义功能和规则，运营驱动用户和内容"},
            {"content": "你提出的运营需求被产品经理拒绝了，你会怎么做？", "ability_dimension": "沟通协作", "difficulty": "medium", "reference_answer": "应先理解拒绝原因、用数据或案例说明需求价值、寻找折中方案、尊重优先级排序"},
            {"content": "如果你负责一个运营项目，但资源非常有限，你会如何取舍？", "ability_dimension": "沟通协作", "difficulty": "hard", "reference_answer": "应聚焦核心目标、选择ROI最高的动作、利用现有资源最大化杠杆效应、阶段性复盘调整"},
            {"content": "请描述一次你处理过的紧急运营事件，你是如何应对的？", "ability_dimension": "沟通协作", "difficulty": "medium", "reference_answer": "应描述快速响应、问题定位、应急方案、沟通协调、事后复盘、预防机制等完整流程"},
        ],
    },
]

FAISS_DIR = "/app/faiss_data"


def build():
    print("正在加载 embedding 模型...")
    model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
    os.makedirs(FAISS_DIR, exist_ok=True)

    for pos in POSITIONS:
        name = pos["name"]
        safe_name = name.replace(" ", "_").lower()
        questions = pos["questions"]
        documents = [q["content"] for q in questions]

        print(f"  构建 [{name}] FAISS 索引 ({len(documents)} 条)...")
        embeddings = model.encode(documents, normalize_embeddings=True)
        dim = embeddings.shape[1]
        index = faiss.IndexFlatIP(dim)
        index.add(embeddings.astype(np.float32))

        faiss.write_index(index, os.path.join(FAISS_DIR, f"questions_{safe_name}.faiss"))

        metadatas = [
            {
                "content": q.get("content", ""),
                "ability_dimension": q.get("ability_dimension", ""),
                "difficulty": q.get("difficulty", "medium"),
                "reference_answer": q.get("reference_answer", ""),
            }
            for q in questions
        ]
        with open(os.path.join(FAISS_DIR, f"questions_{safe_name}_meta.json"), "w", encoding="utf-8") as f:
            json.dump(metadatas, f, ensure_ascii=False, indent=2)

    print("FAISS 索引构建完成！")


if __name__ == "__main__":
    build()