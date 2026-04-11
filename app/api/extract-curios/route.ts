import { type NextRequest } from 'next/server'

export const maxDuration = 60

const CANONICAL_SELLERS = [
  'Belinda', 'Linda', 'Book Nook', 'WK Rose', 'Ant V',
  'Sarnel', 'Biani', 'Christa', 'Gunter', 'Anna',
]

const ALIAS_MAP: Record<string, string> = {
  'belinda d':    'Belinda',
  'b. creations': 'Belinda',
  'b.creations':  'Belinda',
  'b.creation':   'Belinda',
  'b. creation':  'Belinda',
  'bel':          'Belinda',
  'belinda':      'Belinda',
  'linda m':      'Linda',
  'linda':        'Linda',
  'kaleido':      'Linda',
  'lm':           'Linda',
  'sfl(linda)':   'Linda',
  'sfl (linda)':  'Linda',
  'candi':        'Book Nook',
  'bk nook':      'Book Nook',
  'book nook':    'Book Nook',
  'wk':           'WK Rose',
  'wk.':          'WK Rose',
  'rose':         'WK Rose',
  'wk rose':      'WK Rose',
  'av':           'Ant V',
  'av.':          'Ant V',
  'a v':          'Ant V',
  'ant v':        'Ant V',
  'ant':          'Ant V',
  'ant.':         'Ant V',
  'sarnel c':     'Sarnel',
  'sarnel':       'Sarnel',
  'biani':        'Biani',
  'christa h':    'Christa',
  'christa':      'Christa',
  'gunter':       'Gunter',
  'anna':         'Anna',
}

function resolveSellerName(raw: string): string | null {
  const normalized = raw.trim().toLowerCase()
  if (!normalized) return null

  if (normalized.startsWith('lin')) return 'Linda'
  if (normalized.startsWith('bel')) return 'Belinda'

  if (ALIAS_MAP[normalized]) return ALIAS_MAP[normalized]

  const exact = CANONICAL_SELLERS.find((s) => s.toLowerCase() === normalized)
  if (exact) return exact

  const aliasMatch = Object.entries(ALIAS_MAP).find(([alias]) =>
    normalized.startsWith(alias) || alias.startsWith(normalized)
  )
  if (aliasMatch) return aliasMatch[1]

  const sorted = [...CANONICAL_SELLERS].sort((a, b) => b.length - a.length)
  const sub = sorted.find((s) => normalized.includes(s.toLowerCase()))
  if (sub) return sub

  return null
}

function toTitleCase(str: string): string {
  return str.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

const PROMPT = `You are an expert at reading handwritten "Curios Sales" sheets from Village Bakery.

The known seller names are exactly these 10:
Belinda, Linda, Book Nook, WK Rose, Ant V, Sarnel, Biani, Christa, Gunter, Anna

CRITICAL — "Belinda" and "Linda" are TWO completely different people. This is the most common mistake.
Read each name cell character by character before deciding.

- Names starting with "Lin" → ALWAYS Linda, NEVER Belinda
- Names starting with "Bel" → ALWAYS Belinda, NEVER Linda
- "Linda", "linda", "Linda M", "LM", "Kaleido", "SFL(Linda)" → Linda
- "Belinda", "belinda", "Bel", "Belinda D", "B.Creation", "B.Creations" → Belinda

STEP 1 — TRANSCRIBE: Read every cell carefully row by row.
  - For crossed-out text, use the replacement not the crossed-out version.
  - A ditto mark (") or the letter "n" alone in the name column = carry forward seller from row above.
  - A completely blank name cell = carry forward seller from row above.

STEP 2 — INTERPRET: Map name aliases. If a name does NOT match any of the 10 known sellers and is NOT a known alias, record it as-is in "name" AND add it to "unknown_sellers".

STEP 3 — DATE: Extract the sheet date and return it as "sheet_date" in ISO format: yyyy-mm-dd.
  The year is almost certainly 2026 unless clearly stated otherwise.
  Examples:
    "8/4/26"     → "2026-04-08"
    "28 March"   → "2026-03-28"
    "14.3.26"    → "2026-03-14"
    "09/04/2026" → "2026-04-09"
    "23/3/26"    → "2026-03-23"
  If no date is visible, return null.

STEP 4 — OUTPUT: Return ONLY a valid JSON object.

Full alias mapping:
- "ANT", "AV", "AV.", "A V", "Ant", "Ant V" → Ant V
- "B.Creation", "B.Creations", "B. Creation", "Belinda D", "Bel", "Belinda" → Belinda
- "SFL(Linda)", "Linda M", "LM", "Kaleido", "Linda" → Linda
- "Bk Nook", "Book Nook", "Candi" → Book Nook
- "WK", "WK.", "Rose", "WK Rose" → WK Rose
- "Sarnel C", "Sarnel" → Sarnel
- "Biani" → Biani
- "Christa H", "Christa" → Christa
- "Gunter" → Gunter
- "Anna" → Anna

Other rules:
- If a name is crossed out and replaced, use the REPLACEMENT
- Blank / ditto / "n" in name column → carry forward from row above, set "carried_forward": true
- A name that does not match any of the 10 or their aliases → add to "unknown_sellers"

Payment type:
- Look for "CARD", "Cash", "CASH" written to the right of rows
- A brace } groups several rows under one payment type — apply to ALL rows in that group
- Default to "cash" if not specified

Return ONLY a valid JSON object — no markdown, no explanation, no extra text.

{
  "sheet_date": "yyyy-mm-dd or null",
  "entries": [
    {
      "name": "canonical seller name OR unknown name as written",
      "description": "string or empty string",
      "amount": 0,
      "payment_type": "cash",
      "carried_forward": false,
      "commission_pct": null
    }
  ],
  "unknown_sellers": [
    {
      "raw_name": "exactly as written on the sheet",
      "suggested_name": "your best cleaned-up version"
    }
  ],
  "notes": "string or null",
  "raw_text": "string"
}

Rules:
- sheet_date: MUST be yyyy-mm-dd format (e.g. "2026-04-08") or null
- entries: every individual sale line — do NOT skip rows
- carried_forward: true only when name was inferred from the row above
- amount: number only, no R or currency symbols
- commission_pct: always null
- unknown_sellers: empty array [] if none found
- SKIP rows that are totals, sub-totals, or summary lines
- Output ONLY the raw JSON object starting with { and ending with }`

function extractJson(text: string): string {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return text
  return text.slice(start, end + 1)
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const imageFile = formData.get('image') as File | null
    if (!imageFile) {
      return Response.json({ error: 'No image provided' }, { status: 400 })
    }

    const apiKey = process.env.NVIDIA_NIM_API_KEY
    if (!apiKey) {
      return Response.json({ error: 'NVIDIA_NIM_API_KEY is not configured' }, { status: 500 })
    }

    const bytes = await imageFile.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mimeType = imageFile.type || 'image/jpeg'

    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'meta/llama-3.2-90b-vision-instruct',
        max_tokens: 4096,
        temperature: 0.0,
        top_p: 0.9,
        stream: false,
        messages: [
          {
            role: 'system',
            content:
              'You are a precise data extraction tool. You output only valid JSON. ' +
              'You never confuse "Linda" with "Belinda" — they are different people. ' +
              'Names starting with "Lin" are always Linda. Names starting with "Bel" are always Belinda. ' +
              'Always return sheet_date in yyyy-mm-dd format (e.g. "2026-04-08"), or null if not visible.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${base64}` },
              },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error('[curios] NIM error:', res.status, body)
      return Response.json(
        { error: `Extraction failed (${res.status}). Please try again.` },
        { status: 500 }
      )
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content ?? ''

    try {
      const extracted = JSON.parse(extractJson(content))

      const serverDetectedUnknowns: Array<{ raw_name: string; suggested_name: string }> = []

      if (Array.isArray(extracted.entries)) {
        extracted.entries = extracted.entries.map(
          (entry: { name?: string; carried_forward?: boolean; [key: string]: unknown }) => {
            const resolved = resolveSellerName(entry.name ?? '')
            if (!resolved && entry.name) {
              const alreadyTracked = serverDetectedUnknowns.some(
                (u) => u.raw_name.toLowerCase() === (entry.name ?? '').toLowerCase()
              )
              if (!alreadyTracked) {
                serverDetectedUnknowns.push({
                  raw_name: entry.name,
                  suggested_name: toTitleCase(entry.name),
                })
              }
            }
            return resolved ? { ...entry, name: resolved } : entry
          }
        )
      }

      const aiUnknowns: Array<{ raw_name: string; suggested_name: string }> =
        Array.isArray(extracted.unknown_sellers) ? extracted.unknown_sellers : []

      const allUnknowns = [...aiUnknowns]
      for (const u of serverDetectedUnknowns) {
        const alreadyIn = allUnknowns.some(
          (x) => x.raw_name.toLowerCase() === u.raw_name.toLowerCase()
        )
        if (!alreadyIn) allUnknowns.push(u)
      }
      extracted.unknown_sellers = allUnknowns

      return Response.json({ data: extracted })
    } catch {
      console.error('[curios] JSON parse error, raw content:', content.slice(0, 200))
      return Response.json(
        { error: 'Could not parse AI response. Please try again.' },
        { status: 500 }
      )
    }
  } catch (error: unknown) {
    console.error('[curios] extraction error:', error)
    return Response.json(
      { error: 'Failed to extract curios data. Please try again.' },
      { status: 500 }
    )
  }
}