import React, { useEffect, useRef, useState } from 'react'

const MAX_CONC = 3
const HAS_FS = typeof window !== 'undefined' && 'showDirectoryPicker' in window

// <helpers>
const EXT = {
  'video/mp4': 'mp4',
  'video/x-matroska': 'mkv',
  'video/webm': 'webm',
  'video/x-msvideo': 'avi',
  'video/quicktime': 'mov',
  'video/mp2t': 'ts',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/wav': 'wav',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'text/vtt': 'vtt',
  'application/x-subrip': 'srt',
}

const pad = (n, w = 2) => String(n).padStart(w, '0')
const safe = (s) => s.replace(/[\\/:*?"<>|]/g, '').replace(/[. ]+$/, '').trim()

// {n} = número, {nn} = 2 dígitos (01), {nnn} = 3 dígitos (001)...
const fill = (tpl, n) => tpl.replace(/\{(n{1,4})\}/g, (_, k) => String(n).padStart(k.length, '0'))
const hasToken = (tpl) => /\{n{1,4}\}/.test(tpl)

// Pega o último número do caminho da URL e troca por {n} / {nn}.
function detectTemplate(raw) {
  let u
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  const path = u.pathname
  const ext = path.match(/\.[a-z0-9]{2,5}$/i) // não confundir o "4" de .mp4 com o número
  const searchable = ext ? path.slice(0, ext.index) : path
  const hits = [...searchable.matchAll(/%[0-9a-fA-F]{2}|\d+/g)].filter((m) => m[0][0] !== '%')
  const m = hits[hits.length - 1]
  if (!m) return null
  const digits = m[0]
  const token = digits.length > 1 && digits[0] === '0' ? `{${'n'.repeat(Math.min(digits.length, 4))}}` : '{n}'
  const newPath = path.slice(0, m.index) + token + path.slice(m.index + digits.length)
  return {
    template: u.origin + newPath + u.search,
    num: Number(digits),
    stremio: /^\/[0-9a-f]{40}\/\d+$/i.test(path),
  }
}

const urlExt = (url) => {
  try {
    const m = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i)
    return m ? m[1].toLowerCase() : ''
  } catch {
    return ''
  }
}
// </helpers>

const size = (b) => (b >= 1e9 ? (b / 1073741824).toFixed(2) + ' GB' : (b / 1048576).toFixed(0) + ' MB')
const rate = (b) => (b / 1048576).toFixed(1) + ' MB/s'

// Fallback sem File System Access API: monta o arquivo na memória e dispara o download.
function saveBlob(blob, file) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

// useState que lembra o valor no navegador (para retomar depois de fechar a aba).
function useLocal(key, initial) {
  const k = `baixador:${key}`
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(k)
      return s === null ? initial : JSON.parse(s)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(k, JSON.stringify(v))
    } catch {
      /* armazenamento indisponível */
    }
  }, [k, v])
  return [v, setV]
}

export default function App() {
  const [link, setLink] = useState('')
  const [note, setNote] = useState('')
  const [template, setTemplate] = useLocal('template', '')
  const [nameTpl, setNameTpl] = useLocal('nameTpl', 'Arquivo {nn}')
  const [first, setFirst] = useLocal('first', 1)
  const [last, setLast] = useLocal('last', 12)
  const [offset, setOffset] = useLocal('offset', 0)
  const [conc, setConc] = useLocal('conc', 1)
  const [dir, setDir] = useState(null)
  const [items, setItems] = useState({})
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(0)
  const abortRef = useRef(null)
  const bytesRef = useRef(0)

  // velocidade total (todos os downloads somados), suavizada
  useEffect(() => {
    if (!running) {
      setSpeed(0)
      return
    }
    let prev = bytesRef.current
    let prevT = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      const cur = bytesRef.current
      const inst = ((cur - prev) / (now - prevT)) * 1000
      setSpeed((s) => (s ? s * 0.6 + inst * 0.4 : inst))
      prev = cur
      prevT = now
    }, 1000)
    return () => clearInterval(id)
  }, [running])

  // trocou o modelo: o que estava marcado como pronto deixa de valer
  useEffect(() => {
    if (!running) setItems({})
  }, [template]) // eslint-disable-line react-hooks/exhaustive-deps

  const nums = []
  for (let n = first; n <= last && nums.length < 500; n++) nums.push(n)
  const doneCount = nums.filter((n) => items[n]?.state === 'done').length

  let urlOk = true
  try {
    new URL(fill(template, first))
  } catch {
    urlOk = false
  }
  const problem = !template
    ? ''
    : !hasToken(template)
      ? 'O modelo precisa de {n}, {nn} ou {nnn} no lugar do número.'
      : !urlOk
        ? 'O modelo não forma uma URL válida.'
        : !hasToken(nameTpl) && last > first
          ? 'O nome dos arquivos precisa de {n}, {nn} ou {nnn}, senão eles se sobrescrevem.'
          : ''
  const canStart = Boolean(template) && !problem && nums.length > 0

  const patch = (n, p) => setItems((s) => ({ ...s, [n]: { ...s[n], ...p } }))

  const onLink = (v) => {
    setLink(v)
    const d = detectTemplate(v)
    if (!d) {
      setNote('')
      return
    }
    setTemplate(d.template)
    if (d.stremio) {
      setFirst(0)
      setOffset(1)
      setNote('Link do servidor do Stremio detectado. O número 0 vira o arquivo 01, o 1 vira o 02 e assim por diante.')
    } else {
      setNote(`Modelo montado a partir do link (número detectado: ${d.num}). Ajuste o primeiro e o último número e, se os arquivos têm zero à esquerda (01, 02), troque {n} por {nn}.`)
    }
  }

  const pickDir = async () => {
    try {
      setDir(await window.showDirectoryPicker({ mode: 'readwrite' }))
    } catch {
      /* usuário cancelou */
    }
  }

  const copyLinks = () => navigator.clipboard.writeText(nums.map((n) => fill(template, n)).join('\n'))

  const downloadOne = async (n, d, signal) => {
    patch(n, { state: 'running', loaded: 0, total: 0, msg: '' })
    const url = fill(template, n)
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(`O servidor respondeu ${res.status}`)

    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (type === 'text/html') throw new Error('A resposta é uma página, não um arquivo. Confira a URL.')
    const total = Number(res.headers.get('content-length')) || 0
    const base = safe(fill(nameTpl || 'Arquivo {nn}', n + offset)) || `arquivo-${n}`
    const file = `${base}.${urlExt(url) || EXT[type] || 'bin'}`
    patch(n, { total, file })

    const reader = res.body.getReader()
    const chunks = []
    let loaded = 0
    let t0 = 0
    let writable = null
    let created = false
    try {
      if (d) {
        let fh
        try {
          fh = await d.getFileHandle(file)
        } catch {
          fh = await d.getFileHandle(file, { create: true })
          created = true
        }
        writable = await fh.createWritable()
      }
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (writable) await writable.write(value)
        else chunks.push(value)
        loaded += value.length
        bytesRef.current += value.length
        const now = performance.now()
        if (now - t0 > 250) {
          t0 = now
          patch(n, { loaded })
        }
      }
      if (writable) await writable.close()
      else saveBlob(new Blob(chunks, { type }), file)
      patch(n, { state: 'done', loaded, total: total || loaded })
    } catch (e) {
      if (writable) {
        try { await writable.abort() } catch { /* já fechado */ }
        if (created) {
          try { await d.removeEntry(file) } catch { /* sem problema */ }
        }
      }
      throw e
    }
  }

  const start = async () => {
    if (!canStart) return
    let d = dir
    if (HAS_FS && !d) {
      try {
        d = await window.showDirectoryPicker({ mode: 'readwrite' })
        setDir(d)
      } catch {
        return
      }
    }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const queue = nums.filter((n) => items[n]?.state !== 'done')
    queue.forEach((n) => patch(n, { state: 'queued', msg: '', loaded: 0 }))
    setRunning(true)

    const worker = async () => {
      while (queue.length && !ctrl.signal.aborted) {
        const n = queue.shift()
        try {
          await downloadOne(n, d, ctrl.signal)
        } catch (e) {
          if (e.name === 'AbortError') patch(n, { state: 'canceled' })
          else {
            const msg =
              e.message === 'Failed to fetch'
                ? 'Não foi possível acessar a URL. O servidor está ligado e permite CORS? (veja o README)'
                : e.message
            patch(n, { state: 'error', msg })
          }
        }
      }
    }
    await Promise.all(Array.from({ length: conc }, worker))

    setItems((s) =>
      Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.state === 'queued' ? { ...v, state: 'idle' } : v])),
    )
    setRunning(false)
  }

  const stop = () => abortRef.current?.abort()

  const status = (it) => {
    switch (it?.state) {
      case 'queued': return 'na fila'
      case 'running': return it.total ? `${size(it.loaded)} de ${size(it.total)}` : size(it.loaded || 0)
      case 'done': return `pronto, ${size(it.total)}`
      case 'error': return it.msg
      case 'canceled': return 'cancelado'
      default: return ''
    }
  }

  return (
    <>
      <h1>Baixador em massa</h1>
      <p className="lead">
        Baixe uma sequência de arquivos numerados, como episódios, aulas ou capítulos, direto para uma pasta do seu
        computador. Use só com conteúdo que você tem o direito de baixar.
      </p>

      <div className="layout">
        <section className="settings">
          <label className="field">
            <span>Link de exemplo (opcional)</span>
            <input
              className="mono"
              placeholder="https://servidor/aula-07.mp4"
              value={link}
              onChange={(e) => onLink(e.target.value)}
              disabled={running}
            />
          </label>
          {note && <p className="hint">{note}</p>}
          <label className="field">
            <span>Modelo da URL</span>
            <input
              className="mono"
              placeholder="https://servidor/aula-{nn}.mp4"
              value={template}
              onChange={(e) => setTemplate(e.target.value.trim())}
              disabled={running}
            />
          </label>
          <p className="hint">Use {'{n}'} para o número, {'{nn}'} para dois dígitos (01, 02) ou {'{nnn}'} para três.</p>
          {problem && <p className="warn">{problem}</p>}

          <div className="row2">
            <label className="field">
              <span>Primeiro número</span>
              <input type="number" min="0" value={first} onChange={(e) => setFirst(Math.max(0, Number(e.target.value)))} disabled={running} />
            </label>
            <label className="field">
              <span>Último número</span>
              <input type="number" min="0" value={last} onChange={(e) => setLast(Math.max(0, Number(e.target.value)))} disabled={running} />
            </label>
          </div>

          <label className="field">
            <span>Nome dos arquivos</span>
            <input value={nameTpl} onChange={(e) => setNameTpl(e.target.value)} placeholder="Arquivo {nn}" disabled={running} />
          </label>
          <div className="row2">
            <label className="field">
              <span>Somar ao número no nome</span>
              <input type="number" value={offset} onChange={(e) => setOffset(Number(e.target.value))} disabled={running} />
            </label>
            <label className="field">
              <span>Downloads simultâneos</span>
              <input
                type="number"
                min="1"
                max={MAX_CONC}
                value={conc}
                onChange={(e) => setConc(Math.min(MAX_CONC, Math.max(1, Number(e.target.value))))}
                disabled={running}
              />
            </label>
          </div>
          <p className="hint">
            A extensão é adicionada sozinha. Se o servidor começa em 0 e você quer o arquivo 01, some 1.
          </p>

          {HAS_FS ? (
            <button onClick={pickDir} disabled={running}>
              {dir ? `Pasta: ${dir.name}` : 'Escolher pasta de destino'}
            </button>
          ) : (
            <p className="warn">
              Este navegador não salva direto em pasta. Cada arquivo passa pela memória antes de baixar, e arquivos grandes
              podem falhar. Prefira Chrome ou Edge.
            </p>
          )}

          <div className="actions">
            {running ? (
              <button className="primary" onClick={stop}>Parar</button>
            ) : (
              <button className="primary" onClick={start} disabled={!canStart}>
                {doneCount ? 'Continuar download' : 'Baixar tudo'}
              </button>
            )}
            <button onClick={copyLinks} disabled={!canStart}>Copiar links</button>
          </div>
          <p className="hint">“Copiar links” serve para colar num gerenciador de downloads, como o JDownloader.</p>
        </section>

        <section>
          <div className="queue-head">
            <h2>Arquivos</h2>
            <span>
              {running ? `${rate(speed)} no total, ` : ''}
              {doneCount} de {nums.length} prontos
            </span>
          </div>
          {!canStart && !nums.length ? (
            <p className="empty">Defina o primeiro e o último número para montar a lista.</p>
          ) : !template ? (
            <p className="empty">Cole um link de exemplo ou escreva o modelo da URL para ver a lista de arquivos.</p>
          ) : (
            <ol>
              {nums.map((n) => {
                const it = items[n]
                const pct = it?.state === 'done' ? 100 : it?.total ? Math.min(100, (it.loaded / it.total) * 100) : 0
                return (
                  <li key={n} className={`ep ${it?.state || ''}`}>
                    <span className="fill" style={{ width: `${pct}%` }} />
                    <span className="ep-n">{pad(n + offset)}</span>
                    <span className="ep-file">{it?.file || (urlOk && hasToken(template) ? fill(template, n) : `número ${n}`)}</span>
                    <span className="ep-st">{status(it)}</span>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>
    </>
  )
}
