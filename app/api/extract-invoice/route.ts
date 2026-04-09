import { type NextRequest } from 'next/server'

export const maxDuration = 60

const PROMPT = `You are an expert at reading handwritten Village Bakery "Daily Cash Up Sheet" forms.

Analyse the image and extract ONLY the following fields. Return ONLY a valid JSON object — no markdown, no explanation, no extra text. Start with { and end with }

{
  "sheet_date": "string or null",
  "total_cash": 0,
  "slips_paid_out": [{ "description": "string", "amount": 0 }],
  "credit_card_yoco": 0,
  "charged_sales_accounts": 0,
  "till_total_z_print": 0,
  "curios_sales": [{ "name": "string", "description": "string", "amount": 0, "payment_type": "cash" }],
  "notes": "string or null",
  "raw_text": "string or null"
}

Rules:
- sheet_date: DATE field at top (e.g. "31/3/26")
- total_cash: TOTAL CASH row value
- slips_paid_out: rows under "PLUS SLIPS CASH PAID OUT"
- credit_card_yoco: CREDIT CARD / YOCO row
- charged_sales_accounts: CHARGED SALES / ACCOUNTS row
- till_total_z_print: TILL TOTAL / Z PRINT OUT row
- curios_sales: CURIOS SALES table rows
- notes: handwritten notes at bottom
- raw_text: full transcription of all visible text
- Amounts are numbers only, no R or currency symbols
- null for missing/illegible, 0 only if clearly blank
- Output ONLY the raw JSON object`

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
      return Response.json({ data: extracted })
    } catch {
      console.error('[v0] JSON parse error, raw:', content.slice(0, 200))
      return Response.json(
        { error: 'Could not parse AI response. Please try again.' },
        { status: 500 }
      )
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[v0] extraction error:', msg)
    return Response.json({ error: `Extraction failed: ${msg}` }, { status: 500 })
  }
}
