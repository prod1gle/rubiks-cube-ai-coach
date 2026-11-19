import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, ShieldCheck, Sparkles, Target } from 'lucide-react'
import { Link } from 'react-router-dom'
import { loadCoachContext, requestCoaching } from '../../api/ai'
import type { CoachContext, CoachGoal, CoachReply } from '../../api/ai'
import './coach.css'

const goals: { id: CoachGoal; title: string; subtitle: string }[] = [
  { id: 'balanced', title: 'Find my next focus', subtitle: 'A little direction goes a long way.' },
  { id: 'efficiency', title: 'Use fewer moves', subtitle: 'Review detours and grip changes.' },
  { id: 'fluency', title: 'Build a smoother flow', subtitle: 'Explore input gaps and checkpoints.' },
  { id: 'consistency', title: 'Make practice stick', subtitle: 'Revisit cases and reliable capture.' },
]
const fallback: Record<string, string> = {
  not_configured: 'No AI model is configured. Your plan uses verified engine coaching.',
  unavailable: 'Ollama is unavailable or the configured model could not run. Your plan uses verified engine coaching.',
  timeout: 'The AI request reached its time limit. Your plan uses verified engine coaching.',
  rejected: 'The AI response did not match the approved facts and templates. Your plan uses verified engine coaching.',
  busy: 'The AI service is busy. Your plan uses verified engine coaching.',
}
export function CoachPage() {
  const [context, setContext] = useState<CoachContext>()
  const [goal, setGoal] = useState<CoachGoal>('balanced')
  const [solveId, setSolveId] = useState('')
  const [useModel, setUseModel] = useState(false)
  const [reply, setReply] = useState<CoachReply>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)
  const task = useRef<AbortController | undefined>(undefined)
  useEffect(() => {
    const controller = new AbortController()
    void loadCoachContext(controller.signal).then(v => {
      if (controller.signal.aborted) return
      setContext(v); setSolveId(v.solves[0]?.id ?? '')
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Your records could not be loaded.') })
    return () => controller.abort()
  }, [revision])
  useEffect(() => () => task.current?.abort(), [])
  const clear = () => { setReply(undefined); setError('') }
  const generate = async () => {
    task.current?.abort()
    const controller = new AbortController(); task.current = controller
    const deadline = window.setTimeout(() => controller.abort(), 15000)
    setLoading(true); clear()
    try {
      const v = await requestCoaching({ solve_id: solveId || null, goal, use_model: useModel }, controller.signal)
      if (!controller.signal.aborted) setReply(v)
    } catch (e) {
      if (task.current === controller) setError(controller.signal.aborted ? 'The coaching request timed out. Try engine coaching or retry.' : e instanceof Error ? e.message : 'Coaching is unavailable. Please retry.')
    } finally {
      window.clearTimeout(deadline)
      if (task.current === controller) setLoading(false)
    }
  }
  return <div className="ai-coach">
    <div className="page-heading"><p className="eyebrow">YOUR NEXT INTENTIONAL PRACTICE</p><h1 id="page-title">Your Cube Coach<span className="ai-title-dot">.</span></h1><p className="explorer-subtitle">Turn your own solve history into a clear next step.</p></div>
    <section className="ai-intro panel" aria-label="How coaching works"><div className="ai-icon"><Target size={25} aria-hidden="true" /></div><div><p className="eyebrow">GROUNDED IN YOUR MOVES</p><h2>One focus. A better practice session.</h2><p>Choose a goal and a saved virtual solve. CubeCue replays the record through its cube engine, then builds a plan from verified facts.</p></div><span className="ai-trust"><ShieldCheck size={16} aria-hidden="true" /> Facts first</span></section>
    {error && <div className="ai-error" role="alert"><p>{error}</p>{!context && <button type="button" onClick={() => { setError(''); setRevision(v => v + 1) }}>Retry records</button>}</div>}
    {!context && !error && <p className="ai-loading" role="status">Loading your saved records…</p>}
    {context && <div className="ai-layout"><section className="panel ai-settings" aria-label="Build your practice plan"><div className="ai-section-label"><span>01</span><h2>Choose your focus</h2></div><fieldset disabled={loading} className="ai-goals"><legend className="sr-only">Coaching goal</legend>{goals.map(g => <label className={`ai-goal ${goal === g.id ? 'selected' : ''}`} key={g.id}><input type="radio" name="coaching-goal" value={g.id} checked={goal === g.id} onChange={() => { setGoal(g.id); clear() }} /><span><strong>{g.title}</strong><small>{g.subtitle}</small></span>{goal === g.id && <Check size={16} aria-hidden="true" />}</label>)}</fieldset>
      <div className="ai-section-label"><span>02</span><h2>Bring a real record</h2></div><label className="ai-record-label">Saved virtual solve<select disabled={loading} value={solveId} onChange={e => { setSolveId(e.target.value); clear() }}><option value="">Practice history only</option>{context.solves.map(s => <option key={s.id} value={s.id}>{new Date(s.created_at).toLocaleString()} · {s.status}</option>)}</select></label><p className="ai-small">Most recent {context.recent_limit} saved virtual records. Physical timer results do not contain verified move history and are outside this coaching scope.</p>
      {!context.solves.length && <div className="ai-empty-small"><strong>Your baseline starts with you.</strong><p>No saved virtual solves yet. You can still get a starting plan from practice history.</p><Link to="/live-solve?mode=virtual">Record your first solve <ArrowRight size={13} aria-hidden="true" /></Link></div>}
      <div className="ai-provider"><div className="ai-provider-top"><Sparkles size={17} aria-hidden="true" /><strong>Optional AI selection</strong><span>{context.configured ? 'Configured' : 'Not configured'}</span></div>{context.configured ? <label className="ai-consent"><input type="checkbox" checked={useModel} disabled={loading} onChange={e => { setUseModel(e.target.checked); clear() }} />Use {context.model} via Ollama for this request</label> : <p>Engine coaching is ready. To enable AI selection, configure a model on your local backend. See <a href="https://docs.ollama.com/quickstart" target="_blank" rel="noreferrer">Ollama setup</a> and the project’s AI Coach guide.</p>}<details><summary>Exactly what is sent to AI</summary><p>{context.disclosure}</p><p>AI selects and orders approved advice. CubeCue supplies every displayed fact and action.</p></details></div>
      <button type="button" className="primary-button ai-generate" disabled={loading} onClick={() => void generate()}>{loading ? 'Building your practice plan…' : useModel ? 'Build plan with AI' : 'Build my practice plan'}{!loading && <ArrowRight size={16} aria-hidden="true" />}</button>
    </section><section className="ai-results" aria-label="Your coaching results" aria-busy={loading}>
      {loading && <div className="panel ai-wait" role="status"><span className="ai-pulse" /><h2>{useModel ? 'Checking facts. Asking your model.' : 'Replaying your record.'}</h2><p>Only verified facts can become part of your plan.</p></div>}
      {!loading && !reply && <div className="panel ai-welcome"><div className="ai-orbit" aria-hidden="true"><Target size={45} /></div><p className="eyebrow">MAKE YOUR NEXT SESSION COUNT</p><h2>Your next step belongs here.</h2><p>Pick a focus, then build your practice plan. You’ll see the evidence behind each suggestion and a direct path to practice.</p><div className="ai-welcome-flow"><span>Real record</span><ArrowRight size={13} aria-hidden="true" /><span>Verified facts</span><ArrowRight size={13} aria-hidden="true" /><span>Your next step</span></div></div>}
      {reply && !loading && <><div className="ai-result-header"><div><p className="eyebrow">YOUR PRACTICE BRIEF</p><h2>A clear place to start.</h2></div><span className={`ai-mode ${reply.mode === 'ai' ? 'with-ai' : ''}`}>{reply.mode === 'ai' ? 'AI selected · engine grounded' : 'Verified engine coaching'}</span></div>{fallback[reply.provider_status] && <p className="ai-fallback" role="status">{fallback[reply.provider_status]}</p>}<div className="ai-recommendations">{reply.recommendations.map((r, i) => <article className="panel ai-recommendation" key={`${r.template_id}-${r.fact_id}`}><div className="ai-card-top"><span className="ai-card-number">{String(i + 1).padStart(2, '0')}</span><span>{i === 0 ? 'START HERE' : 'THEN EXPLORE'}</span></div><h3>{r.title}</h3><p>{r.action}</p><blockquote><ShieldCheck size={15} aria-hidden="true" /><span>{reply.facts.find(f => f.id === r.fact_id)?.text}</span></blockquote><Link to={r.href}>{r.link_label}<ArrowRight size={15} aria-hidden="true" /></Link></article>)}</div><details className="panel ai-evidence"><summary>All verified facts used for this plan <span>{reply.facts.length}</span></summary><ul>{reply.facts.map(f => <li key={f.id}>{f.text}{f.source_href && <> <Link to={f.source_href}>View source</Link></>}</li>)}</ul></details><div className="ai-limitations"><ShieldCheck size={16} aria-hidden="true" /><div>{reply.limitations.map(line => <p key={line}>{line}</p>)}</div></div></>}
    </section></div>}
  </div>
}
