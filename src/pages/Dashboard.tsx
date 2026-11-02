import { ArrowLeft, CalendarClock, CheckCircle2, CircleAlert, Clapperboard, CloudOff, FileText, Plus, Send, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState, ErrorState, Loading, PageHeader, StatusBadge } from '@/components/Common'
import { useAsync } from '@/hooks/useAsync'
import { api, formatDate, platformNames } from '@/lib/api'
import type { DashboardData } from '@/types'

export default function Dashboard() {
  const { data, loading, error, reload } = useAsync<DashboardData>(() => api('/api/dashboard'), [], 12000)
  if (loading && !data) return <Loading />
  if (error && !data) return <ErrorState message={error} retry={() => void reload()} />
  if (!data) return null
  const stats = data.studio_stats
  const cards = [
    { label: 'على جدول اليوم', value: stats.today, icon: CalendarClock, tone: 'mint', to: '/queue' },
    { label: 'جاهز للتنزيل', value: stats.ready, icon: CheckCircle2, tone: 'plain', to: '/queue' },
    { label: 'مواعيد قادمة', value: stats.scheduled, icon: Send, tone: 'plain', to: '/queue' },
    { label: 'يحتاج تدخلك', value: stats.failed + data.stats.pending, icon: CircleAlert, tone: stats.failed ? 'danger' : 'plain', to: '/queue' },
  ]
  return <div className="page-stack dashboard-page">
    <PageHeader title="غرفة الإنتاج والنشر" description="مساران واضحان لأخبار الجامعة وخدمات الطلبة؛ إنتاج محلي مستمر، ومراجعة قبل أن يغادر المحتوى جهازك."
      actions={<Link className="btn btn-primary" to="/studio"><Plus size={18} />إنشاء محتوى</Link>} />
    <section className="profile-overview">
      {data.accounts.filter((account) => account.settings.account_kind).slice(0, 2).map((account) => <Link to="/studio" key={account.id} className="profile-overview-card">
        <span className={`profile-symbol ${account.settings.account_kind === 'university_news' ? 'news' : 'services'}`}>{account.settings.account_kind === 'university_news' ? <FileText size={22} /> : <Sparkles size={22} />}</span>
        <div><span className="section-label">{account.settings.account_kind === 'university_news' ? 'ملف الأخبار' : 'ملف الخدمات'}</span><strong>{account.name}</strong><p>{account.settings.account_kind === 'university_news' ? 'إعلانات، جداول، مجموعات وتعليمات رسمية' : 'شرح الخدمات، فيديوهات صوتية ودعوة للتواصل'}</p></div><ArrowLeft size={19} />
      </Link>)}
    </section>
    <section className="metrics-grid" aria-label="ملخص الإنتاج">{cards.map(({ label, value, icon: Icon, tone, to }) => <Link to={to} className={`metric metric-${tone}`} key={label}><div><span>{label}</span><strong>{value}</strong></div><Icon size={22} /></Link>)}</section>
    <section className="operations-strip"><div><span className="section-label">المسار الحالي</span><strong>{stats.rendering ? `${stats.rendering} قيد الإنتاج` : 'النظام جاهز لمهمة جديدة'}</strong></div><div className="pipeline" aria-label="مراحل الإنتاج"><span>فكرة</span><ArrowLeft size={16} /><span>مسودة</span><ArrowLeft size={16} /><span className={stats.rendering ? 'current' : ''}>إنتاج</span><ArrowLeft size={16} /><span>مراجعة</span><ArrowLeft size={16} /><span className={stats.scheduled ? 'current' : ''}>جدولة</span></div><Link to="/providers" className="text-link">البدائل مضبوطة محليًا <ArrowLeft size={15} /></Link></section>
    <div className="dashboard-grid">
      <section className="panel">
        <div className="panel-heading"><div><span className="section-label">الخطة القريبة</span><h2>المواعيد القادمة</h2></div><Link to="/queue" className="text-link">الطابور الكامل <ArrowLeft size={15} /></Link></div>
        {data.upcoming.length ? <div className="upcoming-list">{data.upcoming.map((project) => <Link to={`/queue?project=${project.id}`} key={project.id} className="upcoming-row"><span className="upcoming-time"><strong>{project.scheduled_at ? new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit' }).format(new Date(project.scheduled_at)) : '—'}</strong><small>{project.scheduled_at ? new Intl.DateTimeFormat('ar', { weekday: 'short' }).format(new Date(project.scheduled_at)) : 'جاهز'}</small></span><div><strong>{project.title}</strong><span>{project.account_name} · {project.output_format === 'video' ? 'فيديو عمودي' : project.output_format === 'image' ? 'صورة' : 'نص'}</span></div><StatusBadge status={project.status} /></Link>)}</div> : <EmptyState title="لا توجد مواعيد قادمة" description="جهّز مشروعًا ثم اختر أقرب خانة متاحة في الطابور." action={<Link to="/studio" className="btn btn-secondary">فتح الاستوديو</Link>} />}
      </section>
      <section className="panel resilience-panel">
        <div className="panel-heading"><div><span className="section-label">الاستمرار عند المشاكل</span><h2>لا تعتمد على خدمة واحدة</h2></div><CloudOff size={22} /></div>
        <div className="resilience-list"><div><span>01</span><p><strong>الإنتاج محلي</strong>القوالب والمونتاج والمسودات لا تحتاج اشتراكًا.</p></div><div><span>02</span><p><strong>الملف قبل الشبكة</strong>يُحفظ الفيديو أولًا ثم ينتظر موعد النشر.</p></div><div><span>03</span><p><strong>لا تكرار عند الغموض</strong>النتيجة غير المؤكدة تتوقف لتأكيدك اليدوي.</p></div></div><Link to="/providers" className="btn btn-secondary">إدارة سلسلة البدائل <ArrowLeft size={16} /></Link>
      </section>
    </div>
    <section className="panel">
      <div className="panel-heading"><div><span className="section-label">آخر المشاريع</span><h2>من المسودة إلى الملف</h2></div><Link to="/studio" className="text-link">مكتبة الاستوديو <ArrowLeft size={15} /></Link></div>
      {data.studio_projects.length ? <div className="compact-posts studio-compact">{data.studio_projects.map((project) => <Link to={`/studio?project=${project.id}`} className="compact-post" key={project.id}><div><strong>{project.title}</strong><span>{project.account_name} · {platformNames[project.account_platform]} · {formatDate(project.updated_at)}</span></div><p>{project.caption || project.brief}</p><StatusBadge status={project.status} /></Link>)}</div> : <EmptyState title="ابدأ أول مسودة" description="اختر ملف الأخبار أو الخدمات، واكتب فكرة واحدة حقيقية." action={<Link className="btn btn-primary" to="/studio"><Clapperboard size={17} />إنشاء مشروع</Link>} />}
    </section>
    <section className="panel recent-activity"><div className="panel-heading"><div><span className="section-label">سجل موثوق</span><h2>آخر الأحداث</h2></div><Link to="/activity" className="text-link">كل النشاط <ArrowLeft size={15} /></Link></div>{data.events.length ? <div className="timeline">{data.events.slice(0, 4).map((event) => <div className="timeline-item" key={event.id}><span className={`timeline-dot level-${event.level}`} /><div><strong>{event.message}</strong><span>{event.account_name || 'النظام'} · {formatDate(event.created_at)}</span></div></div>)}</div> : <p className="muted-text">ستظهر هنا أحداث الإنتاج والجدولة والجلسات.</p>}</section>
  </div>
}
