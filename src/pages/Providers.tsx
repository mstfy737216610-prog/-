import { useState } from 'react'
import { Bot, Check, ChevronDown, CircleAlert, KeyRound, LoaderCircle, Plus, Save, ShieldCheck, Trash2, Volume2, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState, ErrorState, Field, Loading, PageHeader, Toggle } from '@/components/Common'
import { useAsync } from '@/hooks/useAsync'
import { api, jsonOptions } from '@/lib/api'
import type { AIProvider } from '@/types'

type ProviderForm = { name: string; base_url: string; model: string; api_key: string; timeout_seconds: number; priority: number }
const blank: ProviderForm = { name: '', base_url: 'https://api.openai.com/v1', model: '', api_key: '', timeout_seconds: 45, priority: 100 }

export default function Providers() {
  const { data: providers, loading, error, reload } = useAsync<AIProvider[]>(() => api('/api/providers'), [])
  const [editing, setEditing] = useState('')
  const [form, setForm] = useState<ProviderForm>(blank)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState('')
  const edit = (provider: AIProvider) => {
    setEditing(provider.id); setForm({ name: provider.name, base_url: provider.base_url, model: provider.model,
      api_key: '', timeout_seconds: provider.timeout_seconds, priority: provider.priority }); setShowForm(true)
  }
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy('save')
    try {
      const payload = { ...form, api_key: form.api_key || null, enabled: true }
      await api(editing ? `/api/providers/${editing}` : '/api/providers', jsonOptions(editing ? 'PATCH' : 'POST', payload))
      toast.success('حُفظت بيانات المزود؛ المفتاح لا يظهر في الاستجابات التالية'); setShowForm(false); setEditing(''); setForm(blank); await reload(true)
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'تعذر الحفظ') }
    finally { setBusy('') }
  }
  const test = async (provider: AIProvider) => {
    setBusy(`test-${provider.id}`)
    try { const result = await api<{ seconds: number; reply: string }>(`/api/providers/${provider.id}/test`, jsonOptions('POST')); toast.success(`نجح الاتصال خلال ${result.seconds} ثانية: ${result.reply}`) }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : 'فشل الاختبار') }
    finally { setBusy('') }
  }
  const toggle = async (provider: AIProvider, enabled: boolean) => {
    try { await api(`/api/providers/${provider.id}`, jsonOptions('PATCH', { enabled })); await reload(true); toast.success(enabled ? 'دخل المزود إلى السلسلة' : 'أُوقف دون حذف إعداداته') }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : 'فشل التحديث') }
  }
  return <div className="page-stack providers-page">
    <PageHeader title="البدائل والتشغيل المستدام" description="النظام لا يتوقف عند فشل مزود: الصياغة المحلية أساس، ومزودو النص اختياريون بأولوية واضحة ومهلة محددة."
      actions={<button className="btn btn-primary" onClick={() => { setEditing(''); setForm(blank); setShowForm(!showForm) }}><Plus size={18} />إضافة مزود</button>} />
    <section className="fallback-flow" aria-label="سلسلة الاستمرار">
      <div className="fallback-node local"><span><Check size={18} /></span><div><strong>صياغة محلية</strong><small>تعمل دائمًا دون مفتاح</small></div></div><ChevronDown size={19} />
      <div className="fallback-node"><span>1</span><div><strong>المزود الأول</strong><small>مهلة ثم انتقال تلقائي</small></div></div><ChevronDown size={19} />
      <div className="fallback-node"><span>2</span><div><strong>المزود البديل</strong><small>لا تُفقد المسودة عند الفشل</small></div></div><ChevronDown size={19} />
      <div className="fallback-node safe"><span><ShieldCheck size={18} /></span><div><strong>مراجعة بشرية</strong><small>لا نشر عند غموض القرار</small></div></div>
    </section>
    {showForm && <form className="panel provider-form" onSubmit={(event) => void save(event)}>
      <div className="panel-heading"><div><span className="section-label">OpenAI-compatible</span><h2>{editing ? 'تعديل المزود' : 'مزود نص جديد'}</h2></div><KeyRound size={22} /></div>
      <div className="form-grid two"><Field label="اسم وصفي"><input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: المزود الأساسي" /></Field><Field label="اسم النموذج" hint="اكتب الاسم كما يوفره المزود؛ auto يحاول قراءة أول نموذج متاح."><input required dir="ltr" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="model-name أو auto" /></Field><Field label="رابط v1"><input required type="url" dir="ltr" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} /></Field><Field label={editing ? 'مفتاح جديد (اتركه فارغًا للإبقاء)' : 'المفتاح'} hint="يُحفظ في data/ai_providers.json بصلاحيات خاصة، ولا يدخل النسخة الاحتياطية العادية."><input type="password" dir="ltr" required={!editing} value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder="••••••••••••" autoComplete="off" /></Field><Field label="المهلة بالثواني"><input type="number" min={5} max={180} value={form.timeout_seconds} onChange={(e) => setForm({ ...form, timeout_seconds: Number(e.target.value) })} /></Field><Field label="الأولوية" hint="الرقم الأصغر يُجرب أولًا."><input type="number" min={1} max={9999} value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} /></Field></div>
      <div className="modal-actions"><button type="button" className="btn btn-quiet" onClick={() => setShowForm(false)}>إلغاء</button><button className="btn btn-primary" disabled={busy === 'save'}>{busy === 'save' ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}حفظ المزود</button></div>
    </form>}
    <div className="providers-grid">
      <section className="panel">
        <div className="panel-heading"><div><span className="section-label">سلسلة النص</span><h2>المزودون المحفوظون</h2></div><Bot size={22} /></div>
        {loading && !providers ? <Loading /> : error && !providers ? <ErrorState message={error} retry={() => void reload()} /> : !providers?.length ? <EmptyState title="التوليد المحلي هو الحالي" description="لا تحتاج مفتاحًا لإنشاء المسودات أو الفيديو. أضف مزودًا فقط إذا أردت صياغة أكثر مرونة." /> : <div className="provider-list">{providers.map((provider) => <article key={provider.id} className={!provider.enabled ? 'disabled' : ''}>
          <div className="provider-order">{provider.priority}</div><div className="provider-main"><div><strong>{provider.name}</strong><span className={provider.key_configured ? 'key-ok' : 'key-missing'}>{provider.key_configured ? provider.key_hint : 'لا يوجد مفتاح'}</span></div><code dir="ltr">{provider.model} · {provider.base_url}</code><small>المهلة {provider.timeout_seconds} ثانية</small></div>
          <div className="provider-actions"><Toggle checked={provider.enabled} label={`${provider.enabled ? 'تعطيل' : 'تفعيل'} ${provider.name}`} onChange={(enabled) => void toggle(provider, enabled)} /><button className="btn btn-secondary" disabled={busy === `test-${provider.id}`} onClick={() => void test(provider)}>{busy === `test-${provider.id}` ? <LoaderCircle className="spin" size={15} /> : <WifiOff size={15} />}اختبار</button><button className="btn btn-quiet" onClick={() => edit(provider)}>تعديل</button><button className="icon-btn danger-icon" aria-label={`حذف ${provider.name}`} onClick={() => { if (window.confirm(`حذف ${provider.name} ومفتاحه؟`)) void api(`/api/providers/${provider.id}`, { method: 'DELETE' }).then(() => reload(true)) }}><Trash2 size={16} /></button></div>
        </article>)}</div>}
      </section>
      <aside className="provider-side">
        <section className="panel"><div className="panel-heading"><div><span className="section-label">التعليق الصوتي</span><h2>سلسلة مستقلة عن النص</h2></div><Volume2 size={22} /></div><ol className="voice-chain"><li><strong>Edge TTS</strong><span>صوت عصبي عند توفر الشبكة؛ بلا مفتاح مخصص.</span></li><li><strong>eSpeak محلي</strong><span>بديل دون اتصال، بجودة أقل لكنه يحفظ التعليق.</span></li><li><strong>نصوص + مسار صامت</strong><span>ملاذ أخير مع تحذير واضح بدل إيقاف الإنتاج.</span></li></ol></section>
        <section className="panel"><div className="panel-heading"><div><span className="section-label">تنبيه عملي</span><h2>لا وعود باشتراك دائم مجاني</h2></div><CircleAlert size={22} /></div><p className="panel-description">توليد الشخصيات الواقعية بالنماذج الكبيرة يحتاج عادة GPU بعيدًا عن الهاتف. لذلك ليس جزءًا إلزاميًا من السلسلة؛ القوالب والمونتاج والصوت هما الأساس القابل للاستمرار.</p></section>
      </aside>
    </div>
  </div>
}
