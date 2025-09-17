// netlify/functions/ocr.js
import OpenAI from "openai";

export default async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), { status: 500 });
    }

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return new Response(
        JSON.stringify({ error: 'Send multipart/form-data with field name "image"' }),
        { status: 400 }
      );
    }

    const form = await req.formData();
    const file = form.get("image");
    if (!file || typeof file.arrayBuffer !== "function") {
      return new Response(JSON.stringify({ error: "Image missing" }), { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "image/jpeg";
    const b64 = buf.toString("base64");

    const client = new OpenAI({ apiKey });

    const prompt =
      `Read the handwriting carefully. Return a plain text list, one item per line, in the form: ` +
      `"Name — short request". No extra commentary, headers, or numbering.`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } }
          ]
        }
      ],
      temperature: 0.2,
      max_tokens: 800,
    });

    const text = (completion.choices?.[0]?.message?.content || "").replace(/\r\n/g, "\n").trim();
    const lines = text.split("\n").map(s => s.trim()).filter(Boolean);

    return new Response(JSON.stringify({ text, lines }), {
      headers: { "content-type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
};
