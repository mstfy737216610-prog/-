import { useEffect, useMemo, useRef, useState } from 'react'
import { Captions, Check, ChevronLeft, CircleAlert, Download, FileImage, FileText, Film, LoaderCircle, Plus, RefreshCw, Save, Sparkles, Trash2, Upload, WandSparkles } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState, ErrorState, Field, Loading, PageHeader, StatusBadge } from '@/components/Common'
import { useAsync } from '@/hooks/useAsync'
import { api, formatDate, jsonOptions, platformNames } from '@/lib/api'
import type { Account, Platform, StudioProject, StudioScene } from '@/types'

type FormState = {
  account_id: string; title: string; brief: string; caption: string; script: string
  kind: 'university_news' | 'student_promo'; output_format: 'video' | 'image' | 'text'
  source_mode: 'generated' | 'reuse'; platforms: Platform[]; scenes: StudioScene[]
  voice: string; template: string; use_ai: boolean; rights_confirmed: boolean; source_url: string
}

const voices = [
  { value: 'ar-SA-HamedNeural', label: 'حامد — عربية السعودية' },
  { value: 'ar-SA-ZariyahNeural', label: 'زارية — عربية السعودية' },
  { value: 'ar-EG-ShakirNeural', label: 'شاكر — عربية مصر' },
  { value: 'ar-EG-SalmaNeural', label: 'سلمى — عربية مصر' },
]
const platformChoices: Platform[] = ['instagram', 'tiktok', 'facebook', 'x']

function blank(account?: Account): FormState {
  const kind = (account?.settings.account_kind === 'university_news' ? 'university_news' : 'student_promo') as FormState['kind']
  return {
    account_id: account?.id || '', title: '', brief: '', caption: '', script: '', kind,
    output_format: kind === 'university_news' ? 'image' : 'video', source_mode: 'generated',
    platforms: kind === 'university_news' ? ['x', 'facebook'] : ['instagram', 'tiktok', 'facebook'],
    scenes: [], voice: 'ar-SA-HamedNeural', template: kind === 'university_news' ? 'campus_brief' : 'service_spotlight',
    use_ai: false, rights_confirmed: false, source_url: '',
  }
}
function fromProject(project: StudioProject): FormState {
  return { account_id: project.account_id, title: project.title, brief: project.brief, caption: project.caption,
    script: project.script, kind: project.kind, output_format: project.output_format, source_mode: project.source_mode,
    platforms: project.platforms, scenes: project.scenes, voice: project.voice, template: project.template,
    use_ai: false, rights_confirmed: project.rights_confirmed, source_url: '' }
}

export default function Studio() {
  const [searchParams] = useSearchParams()
  const { data: accounts, loading: accountsLoading, error: accountsError } = useAsync<Account[]>(() => api('/api/accounts'), [])
  const { data: projects, loading, reload } = useAsync<StudioProject[]>(() => api('/api/studio/projects'), [], 7000)
  const [selectedId, setSelectedId] = useState('')
  const [form, setForm] = useState<FormState>(() => blank())
  const [busy, setBusy] = useState('')
  const [activeScene, setActiveScene] = useState(0)
  const [filter, setFilter] = useState('')
  const [assetId, setAssetId] = useState('')
  const [assetName, setAssetName] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const selected = useMemo(() => projects?.find((project) => project.id === selectedId), [projects, selectedId])
  const requestedProject = searchParams.get('project')
  const account = useMemo(() => accounts?.find((item) => item.id === form.account_id), [accounts, form.account_id])
  const visibleProjects = useMemo(() => projects?.filter((project) => !filter || project.account_id === filter), [projects, filter])

  useEffect(() => {
    if (accounts?.length && !form.account_id) {
      const preferred = accounts.find((item) => item.settings.account_kind === 'student_promo') || accounts[0]
      setForm(blank(preferred))
    }
  }, [accounts, form.account_id])
  useEffect(() => {
    if (!selected || busy !== 'render') return
    if (['ready', 'scheduled', 'published'].includes(selected.status)) {
      setBusy(''); setForm(fromProject(selected)); toast.success('اكتمل تجهيز الملف')
    } else if (['failed', 'publish_unknown'].includes(selected.status)) {
      setBusy(''); setForm(fromProject(selected)); toast.error(selected.error || 'تعذر إنتاج الملف؛ راجع التفاصيل وأعد المحاولة')
    }
  }, [selected?.status, selected?.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (requestedProject && projects?.some((project) => project.id === requestedProject) && selectedId !== requestedProject) {
      const project = projects.find((item) => item.id === requestedProject)!
      choose(project)
    }
  }, [requestedProject, projects, selectedId])

  const choose = (project: StudioProject) => {
    setSelectedId(project.id); setForm(fromProject(project)); setAssetId(project.source_asset_id || ''); setAssetName(''); setActiveScene(0)
  }
  const reset = (nextAccount?: Account) => {
    setSelectedId(''); setForm(blank(nextAccount || account)); setAssetId(''); setAssetName(''); setActiveScene(0)
  }
  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key)
    try { await action() } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'تعذر تنفيذ العملية'); if (key === 'render') setBusy('') }
    finally { if (key !== 'render') setBusy('') }
  }
  const create = async () => {
    if (!form.account_id || !form.brief.trim()) return toast.error('اختر الحساب واكتب فكرة المحتوى')
    if (form.source_mode === 'reuse' && (!assetId || !form.rights_confirmed)) return toast.error('ارفع الفيديو وأكد ملكيتك أو إذن إعادة استخدامه')
    await run('create', async () => {
      const project = await api<StudioProject>('/api/studio/projects', jsonOptions('POST', {
        account_id: form.account_id, brief: form.brief, kind: form.kind, output_format: form.output_format,
        source_mode: form.source_mode, platforms: form.platforms, voice: form.voice, template: form.template,
        source_asset_id: assetId || null, rights_confirmed: form.rights_confirmed, use_ai: form.use_ai,
      }))
      setSelectedId(project.id); setForm(fromProject(project)); await reload(true)
      toast.success(project.warning || 'أُنشئت المسودة؛ راجع النص والمشاهد قبل الإنتاج')
    })
  }
  const save = async (quiet = false) => {
    if (!selected) return null
    const project = await api<StudioProject>(`/api/studio/projects/${selected.id}`, jsonOptions('PATCH', {
      title: form.title, brief: form.brief, caption: form.caption, script: form.script, scenes: form.scenes,
      platforms: form.platforms, voice: form.voice, template: form.template, output_format: form.output_format,
    }))
    setForm(fromProject(project)); if (!quiet) toast.success('حُفظت التعديلات محليًا'); await reload(true); return project
  }
  const regenerate = async () => {
    if (!selected) return
    await run('regenerate', async () => {
      const project = await api<StudioProject>(`/api/studio/projects/${selected.id}/regenerate?use_ai=${form.use_ai}`, jsonOptions('POST'))
      setForm(fromProject(project)); await reload(true); toast.success(project.warning || 'أُعيد توليد النص والمشاهد')
    })
  }
  const render = async () => {
    if (!selected) return toast.info('أنشئ المسودة أولًا')
    await save(true)
    setBusy('render')
    try {
      await api(`/api/studio/projects/${selected.id}/render`, jsonOptions('POST'))
      toast.success('دخل الإنتاج إلى الطابور؛ يمكنك مغادرة الصفحة والعودة لاحقًا'); await reload(true)
    } catch (reason) { setBusy(''); toast.error(reason instanceof Error ? reason.message : 'تعذر بدء الإنتاج') }
  }
  const uploadAsset = async (file: File) => {
    if (!form.account_id) return
    const body = new FormData(); body.append('file', file); body.append('account_id', form.account_id)
    body.append('source_url', form.source_url); body.append('rights_note', 'أكد المستخدم الملكية أو إذن إعادة الاستخدام')
    await run('upload', async () => {
      const asset = await api<{ id: string; original_name: string }>('/api/studio/assets', { method: 'POST', body })
      setAssetId(asset.id); setAssetName(asset.original_name); toast.success('حُفظ الفيديو المصدر محليًا')
    })
  }
  const remove = async () => {
    if (!selected || !window.confirm(`حذف مشروع «${selected.title}» وملفاته؟`)) return
    await run('delete', async () => { await api(`/api/studio/projects/${selected.id}`, { method: 'DELETE' }); toast.success('حُذف المشروع'); reset(); await reload(true) })
  }
  const patchScene = (index: number, text: string) => setForm({ ...form, scenes: form.scenes.map((scene, i) => i === index ? { ...scene, text } : scene) })
  const addScene = () => setForm({ ...form, scenes: [...form.scenes, { heading: `0${form.scenes.length + 1}`, text: 'مشهد جديد — اكتب رسالته هنا' }] })
  const removeScene = (index: number) => { if (form.scenes.length <= 1) return toast.error('يجب بقاء مشهد واحد'); setForm({ ...form, scenes: form.scenes.filter((_, i) => i !== index) }); setActiveScene(0) }
  const currentScene = form.scenes[Math.min(activeScene, Math.max(0, form.scenes.length - 1))]
  const brand = account?.settings.template || {}
  const canEdit = !selected || ['draft', 'failed', 'ready'].includes(selected.status)

  if (accountsLoading && !accounts) return <Loading />
  if (accountsError && !accounts) return <ErrorState message={accountsError} />
  return <div className="page-stack studio-page">
    <PageHeader title="استوديو المحتوى" description="من الفكرة إلى ملف عمودي بالهوية والصوت، ثم إلى طابور لا يفقد عمله عند انقطاع الشبكة."
      actions={<button className="btn btn-primary" onClick={() => reset()}><Plus size={18} />مشروع جديد</button>} />
    <section className="profile-switch" aria-label="ملف الحساب">
      {accounts?.filter((item) => item.settings.account_kind).map((item) => <button key={item.id} className={form.account_id === item.id ? 'active' : ''} onClick={() => reset(item)}>
        <span className={`profile-symbol ${item.settings.account_kind === 'university_news' ? 'news' : 'services'}`}>{item.settings.account_kind === 'university_news' ? <FileText size={20} /> : <Sparkles size={20} />}</span>
        <span><strong>{item.name}</strong><small>{item.settings.account_kind === 'university_news' ? 'إعلانات ومواعيد وتعليمات' : 'خدمات وعروض بدعوة للتواصل'}</small></span>
        {form.account_id === item.id && <Check size={17} />}
      </button>)}
    </section>

    <div className="studio-workbench">
      <section className="studio-form panel">
        <div className="panel-heading"><div><span className="section-label">{selected ? `مسودة محفوظة · ${selected.provider}` : 'مشروع جديد'}</span><h2>{selected ? 'التحرير والإخراج' : 'ما الذي سننتجه؟'}</h2></div>{selected && <StatusBadge status={selected.status} />}</div>
        {!selected ? <>
          <div className="form-grid two compact">
            <Field label="نوع المخرج" hint={form.source_mode === 'reuse' ? 'الفيديو المصرح به يُنتج كفيديو عمودي فقط.' : undefined}><select disabled={form.source_mode === 'reuse'} value={form.output_format} onChange={(e) => setForm({ ...form, output_format: e.target.value as FormState['output_format'] })}><option value="video">فيديو عمودي 9:16</option><option value="image">صورة منشور</option><option value="text">نص فقط</option></select></Field>
            <Field label="طريقة الإنتاج"><select value={form.source_mode} onChange={(e) => { const sourceMode = e.target.value as FormState['source_mode']; setForm({ ...form, source_mode: sourceMode, output_format: sourceMode === 'reuse' ? 'video' : form.output_format }) }}><option value="generated">توليد قالب أصلي</option><option value="reuse">تهيئة فيديو مصرح به</option></select></Field>
          </div>
          {form.source_mode === 'reuse' && <div className="reuse-box">
            <Field label="رابط المصدر للتوثيق (اختياري)"><input type="url" dir="ltr" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} placeholder="https://…" /></Field>
            <input ref={fileInput} type="file" hidden accept="video/mp4,video/webm,video/quicktime" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadAsset(file); e.target.value = '' }} />
            <button className="btn btn-secondary" disabled={busy === 'upload'} onClick={() => fileInput.current?.click()}>{busy === 'upload' ? <LoaderCircle className="spin" size={17} /> : <Upload size={17} />}{assetName || 'رفع الفيديو المملوك أو المصرح به'}</button>
            <label className="check-field"><input type="checkbox" checked={form.rights_confirmed} onChange={(e) => setForm({ ...form, rights_confirmed: e.target.checked })} /><span>أملك هذا الفيديو أو لدي إذن صريح بإعادة استخدامه</span></label>
          </div>}
          <Field label="الفكرة أو الخدمة" hint="اكتب معلومات حقيقية فقط؛ التوليد المحلي يعمل دون مفتاح ولا يخترع مواعيد."><textarea rows={4} value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} placeholder={form.kind === 'university_news' ? 'مثال: تُستأنف المحاضرات يوم الأحد وفق الجدول المرفق…' : 'مثال: خدمة تنسيق الأبحاث والعروض مع مراجعة قبل التسليم…'} /></Field>
          <div className="generation-options"><label className="check-field"><input type="checkbox" checked={form.use_ai} onChange={(e) => setForm({ ...form, use_ai: e.target.checked })} /><span>تحسين الصياغة بمزود AI عند توفره</span></label><span>إذا فشل، تُستخدم الصياغة المحلية تلقائيًا.</span></div>
          <button className="btn btn-primary btn-wide" disabled={busy === 'create'} onClick={() => void create()}>{busy === 'create' ? <LoaderCircle className="spin" size={18} /> : <WandSparkles size={18} />}{busy === 'create' ? 'جارٍ بناء المسودة…' : 'توليد المسودة والمشاهد'}</button>
        </> : <div className="editor-fields">
          <Field label="عنوان المشروع"><input value={form.title} disabled={!canEdit} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <div className="editor-tabs" role="tablist"><button className="active" role="tab"><Captions size={16} />النص والمشاهد</button><Link to="/queue"><Film size={16} />الجدولة والتصدير</Link></div>
          <Field label="النص المرافق للمنشور"><textarea rows={5} disabled={!canEdit} value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} /></Field>
          {form.output_format === 'video' && <Field label="التعليق الصوتي" hint="يجب أن يتضمن اسم الحساب؛ سيُنطق كما هو مكتوب."><textarea rows={4} disabled={!canEdit} value={form.script} onChange={(e) => setForm({ ...form, script: e.target.value })} /></Field>}
          <div className="scene-editor"><div className="section-heading"><div><span className="section-label">المونتاج</span><h3>مشاهد الفيديو ({form.scenes.length})</h3></div><button className="btn btn-quiet" disabled={!canEdit} onClick={addScene}><Plus size={16} />إضافة مشهد</button></div>
            {form.scenes.map((scene, index) => <div className={`scene-field ${activeScene === index ? 'active' : ''}`} key={index} onClick={() => setActiveScene(index)}>
              <span>{scene.heading || `0${index + 1}`}</span><textarea rows={2} disabled={!canEdit} value={scene.text} onChange={(e) => patchScene(index, e.target.value)} /><button className="icon-btn" disabled={!canEdit} aria-label={`حذف المشهد ${index + 1}`} onClick={(e) => { e.stopPropagation(); removeScene(index) }}><Trash2 size={15} /></button>
            </div>)}
          </div>
          <div className="form-grid two compact"><Field label="الصوت"><select disabled={!canEdit} value={form.voice} onChange={(e) => setForm({ ...form, voice: e.target.value })}>{voices.map((voice) => <option key={voice.value} value={voice.value}>{voice.label}</option>)}</select></Field><Field label="القالب"><select disabled={!canEdit} value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })}><option value="service_spotlight">إعلان الخدمة</option><option value="campus_brief">الخبر الجامعي</option><option value="direct_offer">الدعوة المباشرة</option></select></Field></div>
          <Field label="صيغ التصدير والمنصات"><div className="platform-checks">{platformChoices.map((platform) => <label key={platform} className={form.platforms.includes(platform) ? 'selected' : ''}><input type="checkbox" disabled={!canEdit} checked={form.platforms.includes(platform)} onChange={(e) => setForm({ ...form, platforms: e.target.checked ? [...form.platforms, platform] : form.platforms.filter((item) => item !== platform) })} />{platformNames[platform]}</label>)}</div></Field>
          {selected.warning && <div className="inline-alert warning"><CircleAlert size={17} />{selected.warning}</div>}
          {selected.error && <div className="inline-alert"><CircleAlert size={17} />{selected.error}</div>}
          <div className="editor-actions"><button className="btn btn-secondary" disabled={busy === 'save' || !canEdit} onClick={() => void run('save', async () => { await save() })}><Save size={17} />حفظ</button><button className="btn btn-quiet" disabled={busy === 'regenerate' || !['draft', 'failed'].includes(selected.status)} onClick={() => void regenerate()}><RefreshCw size={17} />إعادة الصياغة</button><button className="btn btn-primary" disabled={busy === 'render' || !canEdit} onClick={() => void render()}>{busy === 'render' || selected.status === 'rendering' ? <LoaderCircle className="spin" size={17} /> : <Film size={17} />}{busy === 'render' || selected.status === 'rendering' ? 'جارٍ الإنتاج…' : 'إنتاج وتجهيز'}</button></div>
        </div>}
      </section>

      <aside className="studio-preview">
        <div className="preview-heading"><div><span className="section-label">معاينة حية</span><strong>{form.output_format === 'video' ? 'عمودي · 720 × 1280' : form.output_format === 'image' ? 'صورة · 1080 × 1350' : 'نص المنشور'}</strong></div><span className="preview-account">{account?.name}</span></div>
        <div className={`phone-canvas ${form.output_format === 'image' ? 'square' : ''}`} style={{ '--brand-bg': String(brand.background || '#111827'), '--brand-accent': String(brand.accent || '#fbbf24'), '--brand-text': String(brand.text || '#fff7ed') } as React.CSSProperties}>
          {selected?.output_path && selected.status !== 'draft' && selected.status !== 'failed' ? <div className="rendered-preview">{selected.output_format === 'video' ? <video key={selected.updated_at} src={`/api/studio/projects/${selected.id}/file/video`} controls playsInline preload="metadata" /> : <img src={`/api/studio/projects/${selected.id}/file/cover`} alt="الصورة المنتجة" />}</div> : <div className="mock-scene">
            <div className="mock-brand"><span>{account?.name || 'اسم الحساب'}</span><small>{account?.username ? `@${account.username}` : 'أضف معرفك من الحسابات'}</small></div>
            <span className="mock-index">{currentScene?.heading || '01'}</span>
            <h3>{currentScene?.text || form.brief || 'اكتب فكرتك لتظهر المشاهد هنا'}</h3>
            <div className="mock-footer"><span>{account?.username ? `@${account.username}` : account?.name}</span><div>{form.scenes.map((_, index) => <i className={index === activeScene ? 'active' : ''} key={index} />)}</div></div>
          </div>}
        </div>
        {form.scenes.length > 1 && <div className="scene-dots">{form.scenes.map((_, index) => <button className={activeScene === index ? 'active' : ''} key={index} onClick={() => setActiveScene(index)} aria-label={`معاينة المشهد ${index + 1}`}>{index + 1}</button>)}</div>}
        {selected?.output_path && <div className="export-row"><a className="btn btn-primary" href={`/api/studio/projects/${selected.id}/file/file?download=true`}><Download size={17} />تنزيل {selected.output_format === 'video' ? 'MP4' : 'PNG'}</a><a className="btn btn-secondary" href={`/api/studio/projects/${selected.id}/file/caption?download=true`}><FileText size={17} />النص</a></div>}
        <div className="preview-notes"><span><Check size={14} />اسم الحساب ظاهر في كل مشهد</span><span><Check size={14} />الملف والحالة محفوظان محليًا</span>{selected?.voice_provider && <span><Check size={14} />الصوت: {selected.voice_provider}</span>}</div>
        {selected && <div className="preview-bottom"><Link to={`/queue?project=${selected.id}`} className="text-link">الجدولة والتصدير <ChevronLeft size={15} /></Link><button className="btn btn-quiet" onClick={() => void remove()}><Trash2 size={15} />حذف</button></div>}
      </aside>
    </div>

    <section className="panel project-library">
      <div className="panel-heading"><div><span className="section-label">المكتبة المحلية</span><h2>المشاريع الأخيرة</h2></div><select aria-label="تصفية المشاريع" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">كل الملفات</option>{accounts?.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
      {loading && !projects ? <Loading /> : !visibleProjects?.length ? <EmptyState title="لا توجد مشاريع أخرى" description="أنشئ مسودة جديدة وستبقى هنا حتى بعد إعادة تشغيل التطبيق." /> : <div className="project-cards">{visibleProjects.map((project) => <button key={project.id} className={selectedId === project.id ? 'selected' : ''} onClick={() => choose(project)}>
        <span className="project-format">{project.output_format === 'video' ? <Film size={19} /> : project.output_format === 'image' ? <FileImage size={19} /> : <FileText size={19} />}</span>
        <div><strong>{project.title}</strong><span>{project.account_name} · {formatDate(project.updated_at)}</span></div><StatusBadge status={project.status} /><ChevronLeft size={17} />
      </button>)}</div>}
    </section>
  </div>
}
