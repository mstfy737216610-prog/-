import { useMemo, useState } from 'react'
import { Check, Copy, ExternalLink, MessageSquareText, PhoneCall, Plus, RefreshCw, Send, ShieldAlert, Sparkles, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorState, Field, Loading, Modal, PageHeader } from '@/components/Common'
import { useAsync } from '@/hooks/useAsync'
import { api, jsonOptions } from '@/lib/api'
import type { Account } from '@/types'

export default function FacebookPage() {
  const { data: accounts, loading, error, reload } = useAsync<Account[]>(() => api('/api/accounts'), [])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [modal, setModal] = useState<'service' | 'rules' | 'post' | null>(null)
  const [newGroupUrl, setNewGroupUrl] = useState('')
  const [postContent, setPostContent] = useState('')
  const [targetGroups, setTargetGroups] = useState<string[]>([])
  const [studentInquiry, setStudentInquiry] = useState('')
  const [generatedReply, setGeneratedReply] = useState('')
  const [generatingReply, setGeneratingReply] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const account = useMemo(() => {
    if (selectedAccountId) return accounts?.find((a: Account) => a.id === selectedAccountId)
    return accounts?.find((a: Account) => a.platform === 'facebook') || accounts?.[0]
  }, [accounts, selectedAccountId])

  const groups: string[] = useMemo(() => {
    if (!account) return []
    const raw = account.settings?.facebook_groups
    if (Array.isArray(raw)) return raw.filter(Boolean)
    return []
  }, [account])

  const services: string[] = useMemo(() => {
    if (!account) return []
    const raw = account.settings?.services
    if (Array.isArray(raw)) return raw.filter(Boolean)
    return [
      'حل الواجبات والتكاليف الجامعية (Assignments)',
      'إعداد وكتابة الأبحاث العلمية ورسائل التخرج',
      'تصميم العروض التقديمية الاحترافية (PowerPoint)',
      'تجهيز مشاريع التخرج وكتابة التقارير الأكاديمية',
      'المساعدة في المذاكرة والمراجعة للاختبارات (Midterm & Final)',
    ]
  }, [account])

  const strictInstructions = account?.settings?.strict_instructions || 'استبدل رقم الهاتف دائماً برقمي المعتمد. لا تنشر أي أسعار ثابتة بل اطلب التواصل واتساب للتفاصيل. ركّز على الدقة والسرية الأكاديمية.'
  const phone = account?.phone_replacement || '+966500000000'

  const addGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!account || !newGroupUrl.trim()) return
    const url = newGroupUrl.trim()
    if (!url.startsWith('http')) {
      toast.error('أدخل رابط مجموعة صحيح يبدأ بـ https://')
      return
    }
    const updated = [...groups, url]
    try {
      await api(`/api/accounts/${account.id}`, jsonOptions('PATCH', {
        settings: { ...account.settings, facebook_groups: updated }
      }))
      setNewGroupUrl('')
      toast.success('تمت إضافة المجموعة بنجاح')
      await reload(true)
    } catch {
      toast.error('تعذر حفظ المجموعة')
    }
  }

  const removeGroup = async (index: number) => {
    if (!account) return
    const updated = groups.filter((_, i) => i !== index)
    try {
      await api(`/api/accounts/${account.id}`, jsonOptions('PATCH', {
        settings: { ...account.settings, facebook_groups: updated }
      }))
      toast.success('تم حذف المجموعة')
      await reload(true)
    } catch {
      toast.error('تعذر حذف المجموعة')
    }
  }

  const generateAutoReply = () => {
    if (!studentInquiry.trim()) {
      toast.error('أدخل استفسار أو طلب الطالب أولاً')
      return
    }
    setGeneratingReply(true)
    setTimeout(() => {
      const inquiryLower = studentInquiry.toLowerCase()
      let serviceHighlight = 'خدماتنا الأكاديمية المعتمدة'
      if (inquiryLower.includes('واجب') || inquiryLower.includes('تكليف')) serviceHighlight = 'حل التكاليف والواجبات الجامعية بدقة وضمان الدرجة'
      else if (inquiryLower.includes('بحث') || inquiryLower.includes('تقرير')) serviceHighlight = 'إعداد وكتابة الأبحاث والتقارير الأكاديمية وفق معايير جامعتك'
      else if (inquiryLower.includes('عرض') || inquiryLower.includes('بوربوينت')) serviceHighlight = 'تصميم عروض تقديمية وسلايدات احترافية مع الشرح'
      else if (inquiryLower.includes('اختبار') || inquiryLower.includes('كويز') || inquiryLower.includes('فاينل')) serviceHighlight = 'المساعدة في مراجعة وتلخيص المقررات للاختبارات'

      const reply = `أهلاً بك عزيزي الطالب/الطالبة 🌸\nيسعدنا مساعدتك في ${serviceHighlight} بأعلى جودة وسرعة وسرية تامة.\n\n📱 للتفاصيل والطلب المباشر عبر الواتساب:\n${phone}\n\nنسعد بخدمتكم وتفوقكم دائماً!`
      setGeneratedReply(reply)
      setGeneratingReply(false)
      toast.success('تم توليد الرد الذكي مع رقم هاتفك المعتمد')
    }, 600)
  }

  const handlePublishToGroups = async () => {
    if (!postContent.trim()) return toast.error('اكتب نص المنشور الترويجي أولاً')
    if (targetGroups.length === 0) return toast.error('حدد مجموعة واحدة على الأقل للنشر')
    setPublishing(true)
    try {
      await api('/api/chat', jsonOptions('POST', {
        account_id: account?.id || null,
        message: `نشر ترويجي لمجموعات فيسبوك (${targetGroups.length} مجموعة):\n${postContent}\nرقم الاتصال: ${phone}`,
      }))
      toast.success(`تم إرسال المنشور إلى طابور النشر لـ ${targetGroups.length} مجموعة بنجاح`)
      setPostContent('')
      setTargetGroups([])
    } catch {
      toast.error('تعذر جدولة النشر في المجموعات')
    } finally {
      setPublishing(false)
    }
  }

  if (loading && !accounts) return <Loading label="جارٍ تحميل واجهة فيسبوك والمجموعات…" />
  if (error && !accounts) return <ErrorState message={error} retry={() => void reload()} />

  return (
    <div className="page-stack">
      <PageHeader
        title="مجموعات فيسبوك والترويج الأكاديمي"
        description="إدارة المجموعات الجامعية المستهدفة، نشر الخدمات، والردود التلقائية الذكية بالذكاء الاصطناعي مع رقم هاتفك الخاص."
        actions={
          <div className="button-row">
            <button className="btn btn-secondary" onClick={() => setModal('rules')}>
              <ShieldAlert size={17} />
              تعليمات النظام الصارمة
            </button>
            <button className="btn btn-secondary" onClick={() => setModal('service')}>
              <Plus size={17} />
              كتالوج الخدمات المقدمة
            </button>
          </div>
        }
      />

      {/* Account Selector if multiple */}
      {accounts && accounts.length > 1 && (
        <div className="panel" style={{ padding: '0.75rem 1.25rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>الحساب النشط:</span>
            <select
              value={account?.id}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border)' }}
            >
              {accounts.map((acc: Account) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.platform}) {acc.platform === 'facebook' ? '⭐' : ''}
                </option>
              ))}
            </select>
            <span className="muted-text" style={{ fontSize: '0.85rem' }}>
              رقم الهاتف المعتمد للردود: <strong>{phone}</strong>
            </span>
          </div>
        </div>
      )}

      <div className="grid two" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {/* Left Column: Groups Management & Auto Reply */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Groups list */}
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="section-label">المجموعات المستهدفة</span>
                <h3>مجموعات الطلاب والجامعات ({groups.length})</h3>
              </div>
              <Users size={20} className="muted-text" />
            </div>

            <form onSubmit={addGroup} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="url"
                required
                dir="ltr"
                placeholder="https://www.facebook.com/groups/..."
                value={newGroupUrl}
                onChange={(e) => setNewGroupUrl(e.target.value)}
                style={{ flex: 1, padding: '0.5rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border)' }}
              />
              <button className="btn btn-primary" type="submit">
                <Plus size={16} />
                إضافة
              </button>
            </form>

            {groups.length === 0 ? (
              <p className="empty-inline">لم تتم إضافة مجموعات بعد. أضف روابط مجموعات فيسبوك الجامعية لمراقبتها والنشر فيها.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '280px', overflowY: 'auto' }}>
                {groups.map((groupUrl, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.6rem 0.8rem',
                      background: 'var(--surface-subtle)',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      gap: '0.5rem',
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, cursor: 'pointer', overflow: 'hidden' }}>
                      <input
                        type="checkbox"
                        checked={targetGroups.includes(groupUrl)}
                        onChange={(e) => {
                          if (e.target.checked) setTargetGroups([...targetGroups, groupUrl])
                          else setTargetGroups(targetGroups.filter((u) => u !== groupUrl))
                        }}
                      />
                      <span dir="ltr" style={{ fontSize: '0.82rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {groupUrl.replace('https://www.facebook.com/groups/', '').replace('/', '')}
                      </span>
                    </label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <a href={groupUrl} target="_blank" rel="noreferrer" className="icon-btn" aria-label="فتح المجموعة">
                        <ExternalLink size={14} />
                      </a>
                      <button className="icon-btn danger-icon" onClick={() => removeGroup(idx)} aria-label="حذف المجموعة">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {groups.length > 0 && (
              <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                <span className="muted-text">المحدد للنشر: {targetGroups.length} من {groups.length}</span>
                <button
                  type="button"
                  className="btn btn-quiet"
                  style={{ fontSize: '0.8rem' }}
                  onClick={() => setTargetGroups(targetGroups.length === groups.length ? [] : [...groups])}
                >
                  {targetGroups.length === groups.length ? 'إلغاء تحديد الكل' : 'تحديد كل المجموعات'}
                </button>
              </div>
            )}
          </section>

          {/* Smart Auto-Reply Generator */}
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="section-label">التعليق والرد المباشر الذكي</span>
                <h3>توليد رد تلقائي مع رقمك</h3>
              </div>
              <MessageSquareText size={20} className="muted-text" />
            </div>
            <p className="field-note" style={{ marginBottom: '0.75rem' }}>
              ضع استفسار الطالب في المجموعة ليقوم الذكاء الاصطناعي بصياغة رد لبق جذاب مع رقم الواتساب المعتمد:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <textarea
                rows={3}
                placeholder="مثال: من يعرف شخص يسوي أبحاث ومشاريع تخرج بسعر مناسب؟"
                value={studentInquiry}
                onChange={(e) => setStudentInquiry(e.target.value)}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border)' }}
              />
              <button
                className="btn btn-secondary"
                disabled={generatingReply || !studentInquiry.trim()}
                onClick={generateAutoReply}
              >
                {generatingReply ? <RefreshCw className="spin" size={16} /> : <Sparkles size={16} />}
                توليد الرد الذكي المخصص
              </button>

              {generatedReply && (
                <div style={{ marginTop: '0.5rem', padding: '0.8rem', background: 'var(--surface-subtle)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <strong style={{ fontSize: '0.85rem' }}>الرد المقترح:</strong>
                    <button
                      className="btn btn-quiet"
                      style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                      onClick={() => {
                        navigator.clipboard.writeText(generatedReply)
                        toast.success('تم نسخ الرد إلى الحافظة')
                      }}
                    >
                      <Copy size={13} /> نسخ
                    </button>
                  </div>
                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.85rem', margin: 0 }}>
                    {generatedReply}
                  </pre>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Broadcast Post Composer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <section className="panel" style={{ height: '100%' }}>
            <div className="panel-heading">
              <div>
                <span className="section-label">نشر عام في المجموعات</span>
                <h3>صياغة منشور الخدمات والقروبات</h3>
              </div>
              <Send size={20} className="muted-text" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                  قوالب سريعة للمنشور:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                    onClick={() => {
                      setPostContent(`✨ هل تواجه صعوبة في أبحاثك أو تكاليفك الجامعية؟\nنقدم لك الدعم الأكاديمي الشامل والمتكامل بأعلى درجات الاحترافية والسرية:\n\n• إعداد الأبحاث ورسائل التخرج وفق المعايير الأكاديمية\n• حل الواجبات والتكاليف لجميع التخصصات\n• تصميم العروض التقديمية (PowerPoint)\n• مراجعات وملخصات شاملة للكويزات والفاينل\n\n📲 للتواصل والاستفسار عبر الواتساب المباشر:\n${phone}\nنحن معك خطوة بخطوة نحو التميز! 🎓`)
                    }}
                  >
                    قالب الخدمات الشاملة
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                    onClick={() => {
                      setPostContent(`📢 إعلان لجميع طلبة الجامعة الأعزاء:\nيسرنا الإعلان عن فتح باب استقبال طلبات:\n- مشاريع التخرج والأبحاث الميدانية\n- التقارير الأسبوعية والواجبات\n- التحليل الإحصائي والاستبيانات\n\nدقة في المواعيد وضمان الجودة.\n📱 للاستفسار والحجز واتساب:\n${phone}`)
                    }}
                  >
                    قالب مشاريع التخرج
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                    onClick={() => {
                      setPostContent(`🚨 قرب موعد الميد والفاينل ومتراكم عليك؟\nفريقنا الأكاديمي جاهز لمساعدتك في تلخيص المناهج وحل بنوك الأسئلة السابقة والتكاليف بأفضل الأسعار.\n\nتواصل معنا الآن:\n${phone}`)
                    }}
                  >
                    قالب وقت الاختبارات
                  </button>
                </div>
              </div>

              <Field label="نص المنشور الترويجي">
                <textarea
                  rows={9}
                  required
                  placeholder="اكتب المنشور هنا أو اختر أحد القوالب الجاهزة أعلاه..."
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
              </Field>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--surface-subtle)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <PhoneCall size={18} className="muted-text" />
                  <span style={{ fontSize: '0.85rem' }}>رقمك المستبدل تلقائياً: <strong>{phone}</strong></span>
                </div>
                <span className="badge badge-accent">نشر آمن</span>
              </div>

              <button
                className="btn btn-primary"
                style={{ padding: '0.75rem' }}
                disabled={publishing || !postContent.trim() || targetGroups.length === 0}
                onClick={handlePublishToGroups}
              >
                {publishing ? <RefreshCw className="spin" size={18} /> : <Send size={18} />}
                نشر الآن في {targetGroups.length} مجموعة محددة
              </button>
              {targetGroups.length === 0 && (
                <small className="error-text" style={{ textAlign: 'center' }}>
                  * يرجى تحديد مجموعة واحدة على الأقل من القائمة في اليسار لتفعيل زر النشر.
                </small>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Services Modal */}
      <Modal
        open={modal === 'service'}
        onOpenChange={(open) => !open && setModal(null)}
        title="كتالوج الخدمات الأكاديمية"
        description="الخدمات التي يقدمها حسابك ويستخدمها الذكاء الاصطناعي في صياغة الردود والمنشورات الترويجية."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <ul style={{ listStyle: 'disc', paddingRight: '1.25rem', lineHeight: '1.8' }}>
            {services.map((s, idx) => (
              <li key={idx}><strong>{s}</strong></li>
            ))}
          </ul>
          <div className="modal-actions" style={{ marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={() => setModal(null)}>
              <Check size={16} /> تم
            </button>
          </div>
        </div>
      </Modal>

      {/* Rules Modal */}
      <Modal
        open={modal === 'rules'}
        onOpenChange={(open) => !open && setModal(null)}
        title="تعليمات النظام والسياسات الصارمة"
        description="القواعد الأساسية التي يلتزم بها النظام عند نشر المحتوى أو الرد على استفسارات الطلاب."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ padding: '1rem', background: 'var(--surface-subtle)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>{String(strictInstructions)}</p>
          </div>
          <div className="modal-actions" style={{ marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={() => setModal(null)}>
              <Check size={16} /> حسناً
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
