import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { requestId, title, description, amount, userId } = body;

    await supabase.from('audit_logs').insert({
      request_id: requestId,
      action: 'REQUEST_CREATED',
      performed_by: userId || null,
      details: { title, amount }
    });

    const prompt = `Bạn là một trợ lý AI quản lý doanh nghiệp. Hãy phân tích yêu cầu chi tiêu sau:
    - Tiêu đề: ${title}
    - Mô tả: ${description}
    - Số tiền: ${amount} VNĐ

    Hãy trả về duy nhất định dạng JSON thuần (không chứa Markdown) có các trường:
    1. "category": Phân loại chi tiêu (chọn 1 trong các nhóm: "Hành chính", "Công nghệ IT", "Marketing", "Vận hành").
    2. "summary": Tóm tắt ngắn gọn yêu cầu trong 1 câu (tối đa 20 từ).
    3. "riskLevel": Nếu số tiền > 10.000.000 VNĐ trả về "HIGH", ngược lại trả về "LOW".`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const aiText = response.text || '{}';
    const aiData = JSON.parse(aiText);

    await supabase
      .from('requests')
      .update({
        category: aiData.category,
        ai_summary: aiData.summary,
        risk_score: aiData.riskLevel,
      })
      .eq('id', requestId);

    await supabase.from('audit_logs').insert({
      request_id: requestId,
      action: 'AI_PROCESSED',
      performed_by: userId || null,
      details: aiData
    });

    return NextResponse.json({ success: true, aiData });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Error processing request with Gemini:', errorMessage);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}