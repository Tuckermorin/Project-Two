import { NextRequest, NextResponse } from 'next/server';

function toBase64(arr: ArrayBuffer): string {
  const bytes = new Uint8Array(arr);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return Buffer.from(binary, 'binary').toString('base64');
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const ipsJson = form.get('ips') as string | null;
    const modelOverride = (form.get('model') as string | null)?.trim();
    const preferredType = (form.get('preferred_type') as string | null)?.trim()?.toLowerCase() || null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'file required (image/png,jpg)' }, { status: 400 });
    }

    const buf = await file.arrayBuffer();
    const b64 = toBase64(buf);

    const ollamaUrl = process.env.OLLAMA_API_URL?.trim() || 'http://golem:11434/api/chat';
    const model = modelOverride || process.env.OLLAMA_MODEL_VISION || 'llava:latest';

    // Build compact IPS context if provided
    let ipsContext: any = null;
    try { if (ipsJson) ipsContext = JSON.parse(ipsJson); } catch {}

    const messages: any[] = [
      {
        role: 'system',
        content: 'You are an expert options-chain reader. Extract structured data from screenshots and propose optimal trades. Output STRICT JSON only.'
      },
      {
        role: 'user',
        content: [
          'Parse the options chain screenshot. Identify: symbol, expiry (closest row group), and for each row, side (call/put), strike, bid, ask, delta, theta, gamma, vega if visible. Then, using the IPS guidance provided, recommend up to 3 candidate trades with rationale and rough risk/reward (credit/debit). Return STRICT JSON matching the schema. If a field is unclear, set null; do not guess wildly.',
          '\nIPS Guidance (JSON):',
          ipsContext ? JSON.stringify(ipsContext) : 'null',
          preferredType ? `\nIMPORTANT: Only suggest trades whose contractType equals "${preferredType}" (synonyms allowed, e.g., use ${preferredType} variants).` : '',
          '\nSchema:',
          '{"symbol":null,"extracted":{ "expiry":null, "rows":[] }, "suggestions":[{"contractType":"'+(preferredType||'put-credit-spread')+'","symbol":null,"expirationDate":null,"shortPutStrike":null,"longPutStrike":null,"shortCallStrike":null,"longCallStrike":null,"optionStrike":null,"creditReceived":null,"debitPaid":null,"score":null,"rationale":""}]}'
        ].join(' '),
        images: [b64],
      }
    ];

    const res = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: false, messages })
    });

    if (!res.ok) {
      const text = await res.text().catch(()=> '');
      return NextResponse.json({ success: false, error: `Vision model call failed: ${res.status} ${text}` }, { status: 500 });
    }
    const json = await res.json();
    const content = json?.message?.content || json?.choices?.[0]?.message?.content || '';
    let parsed: any = null;
    // Try to parse as JSON; if it fails, try to extract JSON block
    try { parsed = JSON.parse(content); } catch {
      try {
        const start = content.indexOf('{');
        const end = content.lastIndexOf('}');
        if (start >= 0 && end > start) {
          const slice = content.slice(start, end + 1);
          parsed = JSON.parse(slice);
        }
      } catch {}
    }

    let data = parsed || { raw: content };
    const norm = (s:any)=> String(s||'').toLowerCase().replace(/[ _]+/g,'-');
    const matchesPref = (t:any)=> {
      if (!preferredType) return true;
      const n = norm(t);
      if (n === preferredType) return true;
      // simple synonyms for put-credit-spread
      if (preferredType === 'put-credit-spread') {
        if (/bull-?put-?spread/.test(n)) return true;
        if (n === 'pcs' || n === 'put-credit') return true;
      }
      return false;
    };
    const originalCount = Array.isArray((data as any)?.suggestions) ? (data as any).suggestions.length : 0;
    if (data && Array.isArray((data as any).suggestions)) {
      const filtered = preferredType ? (data as any).suggestions.filter((s:any)=> matchesPref(s.contractType)) : (data as any).suggestions;
      (data as any).suggestions = filtered;
      const filteredCount = filtered.length;
      // Build explanation if nothing remains
      let explanation: string | undefined;
      if (originalCount === 0) {
        const rows = Array.isArray((data as any)?.extracted?.rows) ? (data as any).extracted.rows.length : 0;
        explanation = rows === 0
          ? 'The screenshot did not contain a recognizable options table (no rows found). Try zooming in or using a clearer capture of the chain.'
          : 'The vision model could not produce complete trade candidates from the screenshot. Ensure strikes/expiry are visible and not cropped.';
      } else if (filteredCount === 0 && preferredType) {
        explanation = `Found ${originalCount} candidate(s), but none matched your IPS strategy (${preferredType.replace(/-/g,' ')}). Capture the correct side of the chain or adjust the IPS strategy.`;
      }
      (data as any).meta = {
        preferredType,
        originalCount,
        filteredCount,
        hasExtractedRows: Array.isArray((data as any)?.extracted?.rows) ? (data as any).extracted.rows.length : 0,
        symbol: (data as any)?.symbol ?? null,
      };
      if (explanation) (data as any).explanation = explanation;
    }
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('options-scan error', e);
    return NextResponse.json({ success: false, error: 'Unexpected error' }, { status: 500 });
  }
}
