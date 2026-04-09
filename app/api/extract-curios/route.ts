import { type NextRequest } from 'next/server'

export const maxDuration = 60

const CANONICAL_SELLERS = ['Belinda', 'Linda', 'Book Nook', 'WK Rose', 'Ant V', 'Sarnel', 'Biani', 'Christa', 'Gunter']

const PROMPT = `You are an expert at reading handwritten "Curios Sales" sheets from Village Bakery.

The ONLY valid seller names are exactly these 9 (you MUST use one of these, spelled exactly as shown):
Belinda, Linda, Book Nook, WK Rose, Ant V, Sarnel, Biani, Christa, Gunter

Aliases you will see on sheets — map them as follows:
- "Belinda D", "B. Creations", "bel", "belinda" → Belinda
- "Linda M", "linda" → Linda
- "Candi", "Bk Nook", "book nook" → Book Nook
- "WK", "Rose", "wk rose" → WK Rose
- "AV", "A V", "ant v" → Ant V
- "Sarnel C", "sarnel" → Sarnel
- "biani" → Biani
- "Christa h", "christa" → Christa
- "gunter" → Gunter

If a name on the sheet does not match any of these 9, pick the closest match.

Return ONLY a valid JSON object — no markdown, no explanation, no extra text.

{
  "sheet_date": "string or null",
  "entries": [
    {
      "name": "one of the 9 canonical seller names",
      "description": "string or empty string if blank",
      "amount": 0,
      "payment_type": "cash",
      "commission_pct": null
    }
  ],
  "notes": "string or null",
  "raw_text": "string"
}

Rules:
- sheet_date: the date written at top (e.g. "31/3/26")
- entries: every individual sale line item
- name: MUST be one of the 9 canonical names above — no exceptions
- If a row has no seller name written, carry forward the seller name from the row above
- description: item description text, or empty string "" if blank/missing
- amount: numeric value only — no "R", no currency symbols
- payment_type: "cash" or "card" — default "cash" if not specified
- commission_pct: always null
- SKIP any row that is a total, sub-total, running total, or summary (e.g. "Total", "TOTAL", a row with no description that just has a sum)
- raw_text: transcribe all visible text from the image
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
        max_tokens: 2000,
        temperature: 0.1,
        stream: false,
        messages: [
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
      console.error('[v0] NIM error:', res.status, body)
      return Response.json(
        { error: `Extraction failed (${res.status}). Please try again.` },
        { status: 500 }
      )
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content ?? ''

    try {
      const extracted = JSON.parse(extractJson(content))

      // Server-side fallback: force every entry name to the nearest canonical seller
      if (Array.isArray(extracted.entries)) {
        extracted.entries = extracted.entries.map((entry: { name?: string; [key: string]: unknown }) => {
          const raw = (entry.name ?? '').trim().toLowerCase()
          if (!raw) return entry
          const exact = CANONICAL_SELLERS.find((s) => s.toLowerCase() === raw)
          if (exact) return { ...entry, name: exact }
          const sub = CANONICAL_SELLERS.find(
            (s) => raw.includes(s.toLowerCase()) || s.toLowerCase().includes(raw)
          )
          if (sub) return { ...entry, name: sub }
          return entry
        })
      }

      return Response.json({ data: extracted })
    } catch {
      console.error('[v0] JSON parse error, raw content:', content.slice(0, 200))
      return Response.json(
        { error: 'Could not parse AI response. Please try again.' },
        { status: 500 }
      )
    }
  } catch (error: unknown) {
    console.error('[v0] Curios extraction error:', error)
    return Response.json(
      { error: 'Failed to extract curios data. Please try again.' },
      { status: 500 }
    )
  }
}
