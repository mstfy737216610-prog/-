import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, CheckCheck, ChevronLeft, CircleAlert, Clock3, Download, FileText, ListChecks, RefreshCw, Send, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState, ErrorState, Loading, PageHeader, StatusBadge } from '@/components/Common'
import { useAsync } from '@/hooks/useAsync'
import { api, formatDate, jsonOptions, platformNames } from '@/lib/api'
import type { Account, StudioProject } from '@/types'

const tabs = [
  { value: 'scheduled', label: 'مجدول' }, { value: 'ready', label: 'جاهز للجدولة' },
  { value: 'publish_unknown', label: 'يحتاج تأكيدًا' }, { value: 'published', label: 'تم النشر' }, { value: '', label: 'الكل' },
]
export default function Queue() {
  const [params] = useSearchParams()
  const [status, setStatus] = useState(params.get('project') ? '' : 'scheduled')
  const [accountId, setAccountId] = useState('')
  const query = new URLSearchParams(); if (status) query.set('status', status); if (accountId) query.set('account_id', accountId)
  const { data: projects, loading, error, reload } = useAsync<StudioProject[]>(() => api(`/api/studio/projects?${query}`), [status, accountId], 10000)
  const { data: accounts } = useAsync<Account[]>(() => api('/api/accounts'), [])
  const [selectedId, setSelectedId] = useState(params.get('project') || '')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState('')
  const selected = useMemo(() => projects?.find((project) => project.id === selectedId) || projects?.[0], [projects, selectedId])
  useEffect(() => { if (projects?.length && !selectedId) setSelectedId(projects[0].id) }, [projects, selectedId])
  useEffect(() => { setDate('') }, [selected?.id])

  const action = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try { await fn(); await reload(true) } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'فشل الإجراء') }
    finally { setBusy('') }
  }
  const schedule = (automatic = false) => {
    if (!selected) return
    void action('schedule', async () => {
      const scheduled_at = automatic || !date ? null : new Date(date).toISOString()
      const result = await api<StudioProject>(`/api/studio/projects/${selected.id}/schedule`, jsonOptions('POST', { scheduled_at }))
      toast.success(`حُفظ الموعد: ${formatDate(result.scheduled_at)}`); setSelectedId(result.id)
    })
  }
  const autoPlan = () => {
    if (!accountId) return toast.info('اختر ملف الحساب أولًا لتوزيع مشاريعه الجاهزة')
    void action('autoplan', async () => {
      const planned = await api<StudioProject[]>(`/api/studio/autoplan?account_id=${accountId}`, jsonOptions('POST'))
      toast.success(planned.length ? `وُزع ${planned.length} مشاريع على الخانات المتاحة` : 'لا توجد مشاريع جاهزة غير مجدولة')
    })
  }
  return <div className="page-stack queue-page">
    <PageHeader title="طابور النشر والتصدير" description="مواعيد محفوظة على الجهاز. عند انقطاع الاتصال لا تضيع الملفات؛ وعند غموض وصول المنشور يتوقف التكرار حتى تؤكد."
      actions={<button className="btn btn-secondary" onClick={() => void autoPlan()} disabled={busy === 'autoplan'}><ListChecks size={18} />توزيع تلقائي</button>} />
    <section className="queue-explainer"><CalendarClock size={22} /><div><strong>خانتا أو ثلاث خانات يوميًا لكل ملف</strong><p>تُستخدم مواعيد الحساب بالترتيب، ولا يحجز النظام موعدًا مكررًا. النشر التلقائي يحتاج جلسة مفحوصة وتعطيل وضع الاختبار.</p></div><Link to="/accounts" className="text-link">ضبط المواعيد <ChevronLeft size={15} /></Link></section>
    <div className="review-filters"><div className="filter-tabs" role="tablist" aria-label="حالة الطابور">{tabs.map((tab) => <button role="tab" aria-selected={status === tab.value} className={status === tab.value ? 'active' : ''} key={tab.value} onClick={() => { setStatus(tab.value); setSelectedId('') }}>{tab.label}</button>)}</div><select aria-label="ملف الحساب" value={accountId} onChange={(e) => { setAccountId(e.target.value); setSelectedId('') }}><option value="">كل الحسابات</option>{accounts?.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></div>
    {loading && !projects ? <Loading /> : error && !projects ? <ErrorState message={error} retry={() => void reload()} /> : !projects?.length ? <EmptyState title="لا يوجد محتوى في هذا العرض" description="جهّز مشروعًا من الاستوديو ثم اختر «جاهز للجدولة»." action={<Link className="btn btn-primary" to="/studio">فتح الاستوديو</Link>} /> : <div className="queue-layout">
      <section className="queue-list" aria-label="المشاريع">{projects.map((project) => <button key={project.id} className={selected?.id === project.id ? 'selected' : ''} onClick={() => setSelectedId(project.id)}>
        <span className="queue-date"><strong>{project.scheduled_at ? new Intl.DateTimeFormat('ar', { day: 'numeric' }).format(new Date(project.scheduled_at)) : '—'}</strong><small>{project.scheduled_at ? new Intl.DateTimeFormat('ar', { month: 'short' }).format(new Date(project.scheduled_at)) : 'بلا موعد'}</small></span>
        <div><strong>{project.title}</strong><span>{project.account_name} · {project.output_format === 'video' ? 'فيديو' : project.output_format === 'image' ? 'صورة' : 'نص'}</span><small><Clock3 size={12} />{project.scheduled_at ? formatDate(project.scheduled_at) : 'لم يحدد موعد'}</small></div><StatusBadge status={project.status} />
      </button>)}</section>
      {selected && <article className="queue-detail panel">
        <div className="panel-heading"><div><span className="section-label">{selected.account_name}</span><h2>{selected.title}</h2></div><StatusBadge status={selected.status} /></div>
        <div className="queue-preview">{selected.cover_path ? selected.output_format === 'video' ? <video src={`/api/studio/projects/${selected.id}/file/video`} controls playsInline preload="metadata" /> : <img src={`/api/studio/projects/${selected.id}/file/cover`} alt="غلاف المشروع" /> : <FileText size={32} />}<div><p>{selected.caption}</p><div className="platform-tags">{selected.platforms.map((platform) => <span key={platform}>{platformNames[platform]}</span>)}</div></div></div>
        {(selected.error || selected.status === 'publish_unknown') && <div className="inline-alert warning"><CircleAlert size={18} /><span>{selected.error || 'تحقق من المنصة قبل اختيار النتيجة.'}</span></div>}
        {selected.status === 'publish_unknown' ? <div className="unknown-confirm"><p>افتح حساب المنصة وتأكد هل ظهر المنشور. لا تعد الجدولة قبل ذلك لتجنب التكرار.</p><div className="button-row"><button className="btn btn-secondary" onClick={() => void action('failed', async () => { await api(`/api/studio/projects/${selected.id}/confirm`, jsonOptions('POST', { status: 'failed', note: 'تحقق المستخدم: لم يُنشر' })); toast.success('سُجل أنه لم يُنشر') })}><X size={17} />لم يُنشر</button><button className="btn btn-primary" onClick={() => void action('published', async () => { await api(`/api/studio/projects/${selected.id}/confirm`, jsonOptions('POST', { status: 'published', note: 'تحقق المستخدم يدويًا من المنصة' })); toast.success('سُجل إيصال النشر') })}><CheckCheck size={17} />تأكد نشره</button></div></div> : <>
          <div className="schedule-box"><div><span className="section-label">موعد النشر</span><strong>{selected.scheduled_at ? formatDate(selected.scheduled_at) : 'اختر موعدًا أو استخدم أقرب خانة'}</strong></div><input type="datetime-local" aria-label="موعد النشر" value={date} onChange={(e) => setDate(e.target.value)} /><div className="button-row"><button className="btn btn-primary" disabled={busy === 'schedule' || !['ready', 'scheduled', 'failed'].includes(selected.status)} onClick={() => schedule(false)}><CalendarClock size={17} />{date ? 'حفظ الموعد' : 'أقرب خانة متاحة'}</button>{selected.status === 'scheduled' && <button className="btn btn-quiet" onClick={() => void action('unschedule', async () => { await api(`/api/studio/projects/${selected.id}/unschedule`, jsonOptions('POST')); toast.success('أُعيد المشروع إلى الجاهز دون حذف الملف') })}>سحب من الجدولة</button>}</div></div>
          <div className="export-panel"><span className="section-label">النشر اليدوي المضمون</span><p>نزّل الملف والنص وارفعهما بنفسك إذا لم تكن الجلسة مختبرة. بعد نشره فعلًا، سجّل النتيجة ليُحفظ الإيصال ولا يتكرر.</p><div className="button-row">{selected.output_path && <a className="btn btn-secondary" href={`/api/studio/projects/${selected.id}/file/file?download=true`}><Download size={17} />تنزيل الملف</a>}<a className="btn btn-secondary" href={`/api/studio/projects/${selected.id}/file/caption?download=true`}><FileText size={17} />تنزيل النص</a>{['ready', 'scheduled', 'failed'].includes(selected.status) && <button className="btn btn-primary" disabled={busy === 'published'} onClick={() => void action('published', async () => { await api(`/api/studio/projects/${selected.id}/confirm`, jsonOptions('POST', { status: 'published', note: 'نشره المستخدم يدويًا بعد تنزيل الملف' })); toast.success('سُجل إيصال النشر اليدوي') })}><CheckCheck size={17} />تأكيد النشر اليدوي</button>}<Link className="btn btn-quiet" to={`/studio?project=${selected.id}`}><RefreshCw size={17} />فتح المحرر</Link></div></div>
        </>}
        <footer className="receipt-line"><Send size={15} /><span>{selected.publication.receipt ? 'يوجد إيصال نشر محفوظ' : `مفتاح منع التكرار: ${selected.idempotency_key.slice(0, 18)}…`}</span></footer>
      </article>}
    </div>}
  </div>
}
