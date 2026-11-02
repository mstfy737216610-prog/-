import type { IncomingMessage, ServerResponse } from 'http'
import fs from 'fs'
import path from 'path'

// Mock database in memory with realistic student and university data
const accounts = [
  {
    id: 'acc-aum-news',
    name: 'أخبار ومجموعات الجامعة (AUM)',
    platform: 'x',
    username: 'Aum_page',
    phone_replacement: '+966500000000',
    proxy_masked: 'socks5://185.220.***.***:9050',
    proxy_url: null,
    session_status: 'valid',
    enabled: true,
    review_required: true,
    auto_publish: false,
    monitor_interval_sec: 900,
    min_delay_sec: 45,
    max_delay_sec: 180,
    last_monitor_at: new Date(Date.now() - 3600000).toISOString(),
    last_run_at: new Date(Date.now() - 3600000).toISOString(),
    last_error: null,
    sources: [
      {
        id: 'src-diary',
        account_id: 'acc-aum-news',
        platform: 'x',
        handle: 'student.diary98',
        url: 'https://x.com/student_diary98',
        enabled: true,
        last_sync_at: new Date(Date.now() - 3600000).toISOString(),
        last_error: null,
        config: { from_date: '2026-05-01', to_date: '2026-12-31', only_new: true, reader: 'auto', limit: 20 },
      },
    ],
    profile: {
      dialect: 'أسلوب إخباري جامعي رسمي مشجع، التركيز على المواعيد وجداول العطل والاختبارات وتقسيم الدرجات.',
      topics: ['عطل رسمية', 'جدول الاختبارات', 'تقسيم الدرجات', 'إعلانات العمادة'],
    },
    settings: {
      account_kind: 'university_news',
      replace_username: true,
      ocr_images: true,
      posting_times: ['10:00', '16:00', '21:00'],
      strict_instructions: 'إعادة بناء أي جدول أو إحصائية على القالب الرسمي بشعار AUM. استبعاد إعلانات الكافيهات والمعاهد التجارية.',
      template: {
        mode: 'rebuild',
        background: '#8b181b',
        text: '#ffffff',
        accent: '#d4af37',
      },
    },
  },
  {
    id: 'acc-student-services',
    name: 'المنصة الأكاديمية — خدمات الطلبة',
    platform: 'instagram',
    username: 'page_aum',
    phone_replacement: '+96655114197',
    proxy_masked: 'socks5://194.38.***.***:1080',
    proxy_url: null,
    session_status: 'valid',
    enabled: true,
    review_required: true,
    auto_publish: false,
    monitor_interval_sec: 1200,
    min_delay_sec: 60,
    max_delay_sec: 240,
    last_monitor_at: new Date(Date.now() - 1800000).toISOString(),
    last_run_at: new Date(Date.now() - 1800000).toISOString(),
    last_error: null,
    sources: [
      {
        id: 'src-pt-kuwait',
        account_id: 'acc-student-services',
        platform: 'instagram',
        handle: 'pt_kuwait',
        url: 'https://www.instagram.com/pt_kuwait',
        enabled: true,
        last_sync_at: new Date(Date.now() - 1800000).toISOString(),
        last_error: null,
        config: { from_date: '2026-01-01', to_date: '2026-12-31', only_new: true, reader: 'auto', limit: 20 },
      },
    ],
    profile: {
      dialect: 'أسلوب ترويجي أكاديمي جذاب ومحترم، يبرز السرية وضمان الدرجة والمساعدة في الواجبات والمشاريع.',
      topics: ['حل واجبات', 'أبحاث تخرج', 'عروض بوربوينت', 'تلخيص مواد'],
    },
    settings: {
      account_kind: 'student_promo',
      replace_username: true,
      ocr_images: true,
      posting_times: ['11:00', '17:00', '22:00'],
      strict_instructions: 'استبدل أي رقم هاتف قديم برقمي المعتمد (+96655114197). ركز على خدمات الأبحاث والواجبات.',
      services: [
        'حل الواجبات والتكاليف الجامعية (Assignments)',
        'إعداد وكتابة الأبحاث العلمية ورسائل التخرج',
        'تصميم العروض التقديمية الاحترافية (PowerPoint)',
        'تجهيز مشاريع التخرج وكتابة التقارير الأكاديمية',
        'المساعدة في المذاكرة والمراجعة للاختبارات (Midterm & Final)',
      ],
      cta: 'تواصل معنا واتساب للحجز والاستفسار المباشر',
      facebook_groups: [
        'https://www.facebook.com/groups/aum.students.hub',
        'https://www.facebook.com/groups/ksu.academic.help',
      ],
      template: {
        mode: 'overlay',
        background: '#0c100f',
        text: '#ffffff',
        accent: '#65e6bd',
      },
    },
  },
]

let studioProjects = [
  {
    id: 'proj-video-1',
    account_id: 'acc-student-services',
    title: 'فيديو ترويجي — إعداد الأبحاث والتقارير الأكاديمية',
    brief: 'فيديو ترويجي واقعي لخدمات حل الواجبات وإعداد الأبحاث مع الصوت ورقم الواتساب',
    caption: 'عندك تقرير جامعي أو بحث تخرج وتريد شغل مرتب ومضمون؟ 🎓\nفي المنصة الأكاديمية نساعدك خطوة بخطوة بأعلى جودة وسرية تامة.\n\n📲 للتواصل واتساب: +96655114197\n#خدمات_طلابية #أبحاث #جامعة',
    script: 'عندك تقرير جامعي وتريد شغل مرتب؟ بالزهور والمنصة الأكاديمية نساعدك بتجهيز التقارير والعروض التقديمية باهتمام واحترافية. راسلنا هسه وخلنا نساعدك من البداية للنهاية.',
    kind: 'student_promo',
    output_format: 'video',
    source_mode: 'generated',
    platforms: ['instagram', 'tiktok', 'facebook'],
    scenes: [
      { heading: '01', text: 'عندك تقرير جامعي وتريد شغل مرتب ومتقن؟' },
      { heading: '02', text: 'نساعدك بتجهيز التقارير والأبحاث والعروض التقديمية باحترافية' },
      { heading: '03', text: 'وفر وقتك وراسلنا الآن عبر الواتساب: +96655114197' },
    ],
    voice: 'ar-SA-HamedNeural',
    voice_provider: 'edge-tts',
    template: 'service_spotlight',
    status: 'ready',
    output_path: 'assets/aistudio/_E2_80_8E_D8_A7_D9_84_D8_B2_D9_87_D9_88_D8_B1__D9_84_D9_84_D8_A8_D8_AD_D9_88_D8_AB__D9_88_D8_A7_D9_84_D8_AA_D9_82_D8_A7_D8_B1_D9_8A_D8_B1__D8_A7_D9_84_D8_AC_D8_A7_D9_85_D8_B9_D9_8A_D8_A9_E2_80_8E__7C__E2_80_8E_F0_9F_8C_B8_F0_360p__e16258d8.mp4',
    cover_path: 'assets/aistudio/Screenshot_________-_______c5b0f9de.png',
    rights_confirmed: true,
    error: null,
    warning: null,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3600000).toISOString(),
    provider: 'hcnsec-ai',
  },
  {
    id: 'proj-video-2',
    account_id: 'acc-student-services',
    title: 'فيديو المنصة الأكاديمية — حل الواجبات والتكاليف',
    brief: 'فيديو مكتب ولابتوب مع موسيقى هادئة وصوت زارية للترويج لحل التكاليف',
    caption: 'وراء كل بحث مرتب ساعات من التعب ما تنشاف... نشتغل بصمت والنتيجة تحكي عنا! ✨\nعندك بحث ومحتار من وين تبدأ؟ إحنا نساعدك خطوة بخطوة 💫\n\nتواصل واتساب: +96655114197',
    script: 'وراء كل بحث مرتب ساعات من التعب... احنا نساعدك خطوة بخطوة لتحقيق أعلى الدرجات.',
    kind: 'student_promo',
    output_format: 'video',
    source_mode: 'generated',
    platforms: ['tiktok', 'instagram'],
    scenes: [
      { heading: '01', text: 'وراء كل بحث مرتب ساعات من العمل الدؤوب' },
      { heading: '02', text: 'لما يكون شغفك هو إنجاز غيرك، المسؤولية أكبر' },
      { heading: '03', text: 'عندك بحث ومحتار من وين تبدأ؟ إحنا نساعدك خطوة بخطوة' },
    ],
    voice: 'ar-SA-ZariyahNeural',
    voice_provider: 'edge-tts',
    template: 'service_spotlight',
    status: 'ready',
    output_path: 'assets/aistudio/_E2_80_8E_D8_A7_D9_84_D9_85_D9_86_D8_B5_D8_A9__D8_A7_D9_84_D8_A3_D9_83_D8_A7_D8_AF_D9_8A_D9_85_D9_8A_D8_A9__7C_Academic_Platform__F0_9F_8E_93_E2_80_8E__7C__E2_80_8E_E2_81_A8_09_E2_81_A8_09_E2_81_A8_09_E2_81_A8_09_E2_81_A8_09_360p__35c560ca.mp4',
    cover_path: 'assets/aistudio/Screenshot_________-_______d7ee8bae.png',
    rights_confirmed: true,
    error: null,
    warning: null,
    created_at: new Date(Date.now() - 43200000).toISOString(),
    updated_at: new Date(Date.now() - 1800000).toISOString(),
    provider: 'hcnsec-ai',
  },
  {
    id: 'proj-image-1',
    account_id: 'acc-aum-news',
    title: 'بطاقة جدول العطل الرسمية 2026 — قالب AUM الرسمي',
    brief: 'تحويل جدول العطل البسيط إلى قالب AUM الفخم باللون العنابي والذهبي والنسر',
    caption: '📢 مواعيد وتفاصيل العطل الرسمية القادمة لعام 2026 حسب التقويم الجامعي الرسمي.\nنتمنى لجميع طلبتنا فصولاً مليئة بالتوفيق والنجاح! 🎓✨\n\n#AUM #ACM #جامعة_الشرق_الأوسط_الأمريكية',
    script: '',
    kind: 'university_news',
    output_format: 'image',
    source_mode: 'generated',
    platforms: ['x', 'facebook'],
    scenes: [
      { heading: 'العطل القادمة', text: 'جدول العطل الرسمية لعام 2026: عيد الأضحى المبارك، رأس السنة الهجرية، والمولد النبوي الشريف.' }
    ],
    voice: 'ar-SA-HamedNeural',
    voice_provider: null,
    template: 'campus_brief',
    status: 'ready',
    output_path: 'assets/aistudio/Screenshot_________-_______8f820ef0.png',
    cover_path: 'assets/aistudio/Screenshot_________-_______8f820ef0.png',
    rights_confirmed: true,
    error: null,
    warning: null,
    created_at: new Date(Date.now() - 172800000).toISOString(),
    updated_at: new Date(Date.now() - 7200000).toISOString(),
    provider: 'local_rules',
  },
]

let reviewPosts = [
  {
    id: 'post-rev-1',
    account_id: 'acc-student-services',
    source_id: 'src-pt-kuwait',
    source_handle: 'pt_kuwait',
    platform: 'instagram',
    url: 'https://www.instagram.com/p/B_wKn91j/',
    raw_text: 'Why students ask help from Pro Tutor pt_kuwait? Free Homework? Test Questions? Final Papers? Projects? WhatsApp 95514197',
    ocr_text: 'Want to win free educational assessment? Free Homework? Test Questions? Final Papers? Projects? Assignment? Follow us and Mention 3 friends. WhatsApp: 95514197',
    processed_text: 'هل تبحث عن مساعدة أكاديمية متميزة؟ 🎓✨\nفريقنا جاهز لمساعدتك في حل الواجبات، الأبحاث، والتكاليف الجامعية بأعلى درجات الدقة والسرية.\n\n📲 للتواصل واتساب: +96655114197',
    ai_decision: 'publish',
    ai_reason: 'منشور خدمات ومساعدة طلابية مطابق لمعايير الحساب. تم استبدال رقم الهاتف القديم برقمك المعتمد.',
    ai_confidence: 0.96,
    category: 'student_help',
    status: 'pending_review',
    created_at: new Date(Date.now() - 7200000).toISOString(),
    media: [
      {
        kind: 'image',
        url: '/assets/aistudio/Screenshot_________-_______d7ee8bae.png',
        local_path: 'assets/aistudio/Screenshot_________-_______d7ee8bae.png',
      },
    ],
  },
  {
    id: 'post-rev-2',
    account_id: 'acc-aum-news',
    source_id: 'src-diary',
    source_handle: 'student.diary98',
    platform: 'x',
    url: 'https://x.com/student_diary98/status/1789201',
    raw_text: 'العطل الرسمية القادمة في عام 2026: الوقوف بعرفات الثلاثاء 26 مايو، وعيد الأضحى المبارك...',
    ocr_text: 'العطل الرسمية القادمة في 2026: الثلاثاء 2026/5/26 الوقوف بعرفات، الأربعاء أول أيام عيد الأضحى...',
    processed_text: '📢 العطل الرسمية القادمة لعام 2026 وفق التقويم الجامعي المعتمد 🗓️\n\nإليكم جدول الإجازات الرسمية القادمة كاملة في الصورة المرفقة عبر قالب AUM الرسمي.\nنتمنى لكم إجازة سعيدة وفصلاً دراسياً مكللاً بالتفوق! 🎓',
    ai_decision: 'publish',
    ai_reason: 'خبر جامعي رسمي مهم يخص تقويم العطل، تم تطبيق القالب الصوري الرسمي وتحديث المعرفات.',
    ai_confidence: 0.98,
    category: 'university_news',
    status: 'pending_review',
    created_at: new Date(Date.now() - 14400000).toISOString(),
    media: [
      {
        kind: 'image',
        url: '/assets/aistudio/Screenshot_________-_______8f820ef0.png',
        local_path: 'assets/aistudio/Screenshot_________-_______8f820ef0.png',
      },
    ],
  },
]

const chatRules = [
  {
    id: 'rule-1',
    role: 'user',
    text: 'استبعد أي إعلانات كافيهات أو مطاعم أو معاهد خاصة لا تخص الجامعة، حتى لو وردت داخل الصور بالـ OCR.',
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'rule-1-reply',
    role: 'assistant',
    text: 'تم حفظ القاعدة بنجاح: سيتم فحص نصوص OCR والنصوص الأصلية وحظر أي إعلانات تجارية خارجية أو كافيهات تلقائياً.',
    created_at: new Date(Date.now() - 86395000).toISOString(),
  },
  {
    id: 'rule-2',
    role: 'user',
    text: 'في أي منشور مساعدة طلابية أو حل واجبات أو قروبات، استبدل رقم الهاتف دائماً برقمي المعتمد.',
    created_at: new Date(Date.now() - 43200000).toISOString(),
  },
  {
    id: 'rule-2-reply',
    role: 'assistant',
    text: 'تم تفعيل قاعدة الاستبدال التلقائي: سيتم استبدال أي أرقام هواتف برقم الواتساب المسجل في الحساب مباشرة.',
    created_at: new Date(Date.now() - 43195000).toISOString(),
  },
]

const activityEvents = [
  {
    id: 'ev-1',
    created_at: new Date(Date.now() - 300000).toISOString(),
    account_name: 'أخبار ومجموعات الجامعة (AUM)',
    event: 'template_rebuild',
    details: 'أُعيد بناء جدول العطل الرسمية بنجاح وتطبيق القالب العنابي وشعار AUM',
    level: 'info',
  },
  {
    id: 'ev-2',
    created_at: new Date(Date.now() - 900000).toISOString(),
    account_name: 'المنصة الأكاديمية — خدمات الطلبة',
    event: 'studio_render_ready',
    details: 'اكتمل إنتاج الفيديو الترويجي العمودي بالصوت العصبي العربي بنجاح (Edge-TTS)',
    level: 'info',
  },
  {
    id: 'ev-3',
    created_at: new Date(Date.now() - 1800000).toISOString(),
    account_name: 'المنصة الأكاديمية — خدمات الطلبة',
    event: 'phone_replaced',
    details: 'استُبدل رقم الهاتف القديم (+96595514197) برقمك المعتمد (+96655114197)',
    level: 'info',
  },
  {
    id: 'ev-4',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    account_name: 'نظام مرسال',
    event: 'monitor_complete',
    details: 'فُحصت المصادر النشطة بنجاح؛ تم اكتشاف منشورين وإدخالهما للمراجعة البشرية',
    level: 'info',
  },
]

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        resolve({})
      }
    })
  })
}

function sendJson(res: ServerResponse, data: any, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(JSON.stringify(data))
}

export async function handleMockApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url || ''
  if (!url.startsWith('/api/')) return false

  const method = req.method || 'GET'
  const cleanUrl = url.split('?')[0]

  // GET /api/health
  if (cleanUrl === '/api/health') {
    sendJson(res, {
      status: 'ok',
      version: '1.0.0',
      dry_run: true,
      publishing_enabled: false,
      sources: accounts.reduce((acc, a) => acc + (a.sources?.length || 0), 0),
      posts: reviewPosts.length + studioProjects.length,
      queue: 2,
    })
    return true
  }

  // GET /api/accounts
  if (cleanUrl === '/api/accounts' && method === 'GET') {
    sendJson(res, accounts)
    return true
  }

  // POST /api/accounts
  if (cleanUrl === '/api/accounts' && method === 'POST') {
    const body = await readBody(req)
    const newAccount = {
      id: 'acc-' + Math.random().toString(36).substring(2, 9),
      name: body.name || 'حساب جديد',
      platform: body.platform || 'x',
      username: body.username || '',
      phone_replacement: body.phone_replacement || '',
      proxy_masked: body.proxy_url ? 'socks5://***' : 'الاتصال المباشر',
      proxy_url: body.proxy_url || null,
      session_status: 'unknown',
      enabled: Boolean(body.enabled),
      review_required: body.review_required ?? true,
      auto_publish: Boolean(body.auto_publish),
      monitor_interval_sec: body.monitor_interval_sec || 900,
      min_delay_sec: body.min_delay_sec || 45,
      max_delay_sec: body.max_delay_sec || 180,
      last_monitor_at: null,
      last_run_at: null,
      last_error: null,
      sources: [],
      profile: null,
      settings: body.settings || {},
    }
    accounts.push(newAccount as any)
    sendJson(res, newAccount, 201)
    return true
  }

  // PATCH /api/accounts/:id
  const accountMatch = cleanUrl.match(/^\/api\/accounts\/([^/]+)$/)
  if (accountMatch && method === 'PATCH') {
    const id = accountMatch[1]
    const body = await readBody(req)
    const idx = accounts.findIndex((a) => a.id === id)
    if (idx !== -1) {
      accounts[idx] = { ...accounts[idx], ...body, settings: { ...accounts[idx].settings, ...(body.settings || {}) } }
      sendJson(res, accounts[idx])
    } else {
      sendJson(res, { detail: 'الحساب غير موجود' }, 404)
    }
    return true
  }

  // POST /api/accounts/:id/sources
  const sourceMatch = cleanUrl.match(/^\/api\/accounts\/([^/]+)\/sources$/)
  if (sourceMatch && method === 'POST') {
    const id = sourceMatch[1]
    const body = await readBody(req)
    const acc = accounts.find((a) => a.id === id)
    if (acc) {
      const newSource = {
        id: 'src-' + Math.random().toString(36).substring(2, 9),
        account_id: id,
        platform: body.platform || 'x',
        handle: body.handle || '',
        url: body.url || '',
        enabled: true,
        last_sync_at: null,
        last_error: null,
        config: body.config || {},
      }
      acc.sources = [...(acc.sources || []), newSource]
      sendJson(res, newSource, 201)
    } else {
      sendJson(res, { detail: 'الحساب غير موجود' }, 404)
    }
    return true
  }

  // POST /api/accounts/:id/monitor
  if (cleanUrl.match(/^\/api\/accounts\/([^/]+)\/monitor$/) && method === 'POST') {
    sendJson(res, { status: 'queued', message: 'دخل فحص المصادر إلى الطابور بنجاح' })
    return true
  }

  // POST /api/accounts/:id/check-session
  if (cleanUrl.match(/^\/api\/accounts\/([^/]+)\/check-session$/) && method === 'POST') {
    sendJson(res, { detail: 'تم فحص الجلسة: الجلسة نشطة ومسجلة الدخول بنجاح دون طلب كابتشا' })
    return true
  }

  // POST /api/accounts/:id/template-preview
  if (cleanUrl.match(/^\/api\/accounts\/([^/]+)\/template-preview$/) && method === 'POST') {
    sendJson(res, { preview_url: '/assets/aistudio/Screenshot_________-_______8f820ef0.png' })
    return true
  }

  // GET /api/studio/projects
  if (cleanUrl === '/api/studio/projects' && method === 'GET') {
    sendJson(res, studioProjects)
    return true
  }

  // POST /api/studio/projects
  if (cleanUrl === '/api/studio/projects' && method === 'POST') {
    const body = await readBody(req)
    const newProj = {
      id: 'proj-' + Math.random().toString(36).substring(2, 9),
      account_id: body.account_id || accounts[0]?.id,
      title: body.brief?.slice(0, 45) || 'مشروع جديد',
      brief: body.brief || '',
      caption: `خدمات أكاديمية متكاملة 🎓✨\n${body.brief}\n\n📱 للتواصل واتساب: +96655114197`,
      script: body.brief,
      kind: body.kind || 'student_promo',
      output_format: body.output_format || 'video',
      source_mode: body.source_mode || 'generated',
      platforms: body.platforms || ['instagram', 'tiktok'],
      scenes: [
        { heading: '01', text: body.brief?.slice(0, 50) || 'خدمة أكاديمية مميزة' },
        { heading: '02', text: 'دقة بالعمل ومتابعة مستمرة وضمان التفوق' },
        { heading: '03', text: 'للحجز والاستفسار الفوري تواصل معنا عبر الواتساب' },
      ],
      voice: body.voice || 'ar-SA-HamedNeural',
      voice_provider: 'edge-tts',
      template: body.template || 'service_spotlight',
      status: 'ready',
      output_path: body.output_format === 'video'
        ? 'assets/aistudio/_E2_80_8E_D8_A7_D9_84_D8_B2_D9_87_D9_88_D8_B1__D9_84_D9_84_D8_A8_D8_AD_D9_88_D8_AB__D9_88_D8_A7_D9_84_D8_AA_D9_82_D8_A7_D8_B1_D9_8A_D8_B1__D8_A7_D9_84_D8_AC_D8_A7_D9_85_D8_B9_D9_8A_D8_A9_E2_80_8E__7C__E2_80_8E_F0_9F_8C_B8_F0_360p__e16258d8.mp4'
        : 'assets/aistudio/Screenshot_________-_______8f820ef0.png',
      cover_path: 'assets/aistudio/Screenshot_________-_______c5b0f9de.png',
      rights_confirmed: true,
      error: null,
      warning: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      provider: 'hcnsec-ai',
    }
    studioProjects = [newProj as any, ...studioProjects]
    sendJson(res, newProj, 201)
    return true
  }

  // PATCH /api/studio/projects/:id
  const projMatch = cleanUrl.match(/^\/api\/studio\/projects\/([^/]+)$/)
  if (projMatch && method === 'PATCH') {
    const id = projMatch[1]
    const body = await readBody(req)
    const idx = studioProjects.findIndex((p) => p.id === id)
    if (idx !== -1) {
      studioProjects[idx] = { ...studioProjects[idx], ...body, updated_at: new Date().toISOString() }
      sendJson(res, studioProjects[idx])
    } else {
      sendJson(res, { detail: 'المشروع غير موجود' }, 404)
    }
    return true
  }

  // POST /api/studio/projects/:id/render
  if (cleanUrl.match(/^\/api\/studio\/projects\/([^/]+)\/render$/) && method === 'POST') {
    const id = cleanUrl.split('/')[4]
    const proj = studioProjects.find((p) => p.id === id)
    if (proj) {
      proj.status = 'ready'
      proj.updated_at = new Date().toISOString()
      sendJson(res, proj)
    } else {
      sendJson(res, { detail: 'المشروع غير موجود' }, 404)
    }
    return true
  }

  // Serve studio project file streams (video / cover)
  const fileMatch = cleanUrl.match(/^\/api\/studio\/projects\/([^/]+)\/file\/(video|cover|file)$/)
  if (fileMatch) {
    const projId = fileMatch[1]
    const kind = fileMatch[2]
    const proj = studioProjects.find((p) => p.id === projId)
    let filePath = ''
    if (proj) {
      filePath = kind === 'cover' ? (proj.cover_path || '') : (proj.output_path || '')
    }
    if (!filePath) {
      filePath = 'public/assets/aistudio/_E2_80_8E_D8_A7_D9_84_D8_B2_D9_87_D9_88_D8_B1__D9_84_D9_84_D8_A8_D8_AD_D9_88_D8_AB__D9_88_D8_A7_D9_84_D8_AA_D9_82_D8_A7_D8_B1_D9_8A_D8_B1__D8_A7_D9_84_D8_AC_D8_A7_D9_85_D8_B9_D9_8A_D8_A9_E2_80_8E__7C__E2_80_8E_F0_9F_8C_B8_F0_360p__e16258d8.mp4'
    }
    if (!filePath.startsWith('public/')) {
      filePath = 'public/' + filePath
    }
    const resolved = path.resolve(process.cwd(), filePath)
    if (fs.existsSync(resolved)) {
      const stat = fs.statSync(resolved)
      const isMp4 = resolved.endsWith('.mp4')
      res.writeHead(200, {
        'Content-Type': isMp4 ? 'video/mp4' : 'image/png',
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
      })
      fs.createReadStream(resolved).pipe(res)
      return true
    }
  }

  // GET /api/posts/review
  if (cleanUrl === '/api/posts/review' && method === 'GET') {
    sendJson(res, reviewPosts)
    return true
  }

  // POST /api/posts/:id/review
  const reviewMatch = cleanUrl.match(/^\/api\/posts\/([^/]+)\/review$/)
  if (reviewMatch && method === 'POST') {
    const id = reviewMatch[1]
    const body = await readBody(req)
    reviewPosts = reviewPosts.filter((p) => p.id !== id)
    sendJson(res, { status: body.action || 'approved', detail: 'تم تحديث حالة المنشور بنجاح' })
    return true
  }

  // GET /api/queue
  if (cleanUrl === '/api/queue' && method === 'GET') {
    const queueItems = [
      {
        id: 'q-1',
        title: 'فيديو ترويجي — إعداد الأبحاث والعروض',
        caption: 'نساعدك خطوة بخطوة في إعداد الأبحاث والمشاريع الأكاديمية.\nواتساب: +96655114197',
        status: 'ready',
        platform: 'instagram',
        scheduled_at: new Date(Date.now() + 7200000).toISOString(),
        attempts: 0,
      },
      {
        id: 'q-2',
        title: 'بطاقة جدول العطل الرسمية 2026',
        caption: 'العطل الرسمية القادمة لعام 2026 وفق التقويم الجامعي الرسمي #AUM',
        status: 'scheduled',
        platform: 'x',
        scheduled_at: new Date(Date.now() + 14400000).toISOString(),
        attempts: 0,
      },
    ]
    sendJson(res, queueItems)
    return true
  }

  // GET /api/chat
  if (cleanUrl === '/api/chat' && method === 'GET') {
    sendJson(res, chatRules)
    return true
  }

  // POST /api/chat
  if (cleanUrl === '/api/chat' && method === 'POST') {
    const body = await readBody(req)
    const userMsg = {
      id: 'rule-' + Math.random().toString(36).substring(2, 9),
      role: 'user',
      text: body.message || '',
      created_at: new Date().toISOString(),
    }
    const botMsg = {
      id: 'rule-reply-' + Math.random().toString(36).substring(2, 9),
      role: 'assistant',
      text: `تم حفظ وتثبيت التعليمة في الذاكرة التراكمية: «${body.message?.slice(0, 70)}...» وستُطبق على قرارات الفلترة المستقبلية تلقائياً.`,
      created_at: new Date().toISOString(),
    }
    chatRules.push(userMsg, botMsg)
    sendJson(res, { reply: botMsg.text })
    return true
  }

  // GET /api/activity
  if (cleanUrl === '/api/activity' && method === 'GET') {
    sendJson(res, activityEvents)
    return true
  }

  // GET /api/ai/config
  if (cleanUrl === '/api/ai/config' && method === 'GET') {
    sendJson(res, {
      base_url: 'https://api.hcnsec.cn/v1',
      model: 'DeepSeek-V4.1-Flash',
      timeout_seconds: 60,
      key_configured: true,
      key_hint: '••••Cdii',
    })
    return true
  }

  // GET /api/ai/models
  if (cleanUrl === '/api/ai/models' && method === 'GET') {
    sendJson(res, {
      models: [
        'DeepSeek-V4.1-Flash',
        'DeepSeek-V4-Pro',
        'glm-5.3',
        'glm-5.3-flash',
        'Qwen3.8-27B',
        'Qwen3.8-Flash-Next',
        'MiniMax-M3.1-Flash',
        'MiMo-V2.6-Flash',
      ],
    })
    return true
  }

  // POST /api/ai/test
  if (cleanUrl === '/api/ai/test' && method === 'POST') {
    sendJson(res, {
      ok: true,
      seconds: 1.14,
      requested_model: 'DeepSeek-V4.1-Flash',
      resolved_model: 'DeepSeek-V4.1-Flash (hcnsec-ai)',
      reply: '{"decision":"publish","category":"student_help","confidence":0.96}',
    })
    return true
  }

  // GET /api/providers
  if (cleanUrl === '/api/providers' && method === 'GET') {
    sendJson(res, [
      {
        id: 'hcnsec-ai',
        name: 'مزوّد الذكاء الاصطناعي الأساسي (HCNSEC)',
        base_url: 'https://api.hcnsec.cn/v1',
        model: 'DeepSeek-V4.1-Flash',
        key_configured: true,
        key_hint: '••••Cdii',
        timeout_seconds: 60,
        enabled: true,
        priority: 1,
      },
      {
        id: 'local-rules',
        name: 'المحرك المحلي المدمج (قواعد الصياغة وتشكيل النصوص)',
        base_url: 'http://localhost/local',
        model: 'local-deterministic',
        key_configured: true,
        key_hint: 'محلي',
        timeout_seconds: 10,
        enabled: true,
        priority: 99,
      },
    ])
    return true
  }

  return false
}
