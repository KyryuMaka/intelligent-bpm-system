import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Khởi tạo Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Khởi tạo OpenAI Client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { requestId, title, description, amount, userId } = body;

    // 1. Ghi log khởi tạo đơn vào Audit Log
    await supabase.from('audit_logs').insert({
      request_id: requestId,
      action: 'REQUEST_CREATED',
      performed_by: userId,
      details: { title, amount }
    });

    // 2. Gọi AI (OpenAI GPT-4o-mini) để phân tích yêu cầu
    const prompt = `Bạn là một trợ lý AI quản lý doanh nghiệp. Hãy phân tích yêu cầu chi tiêu sau:
    - Tiêu đề: ${title}
    - Mô tả: ${description}
    - Số tiền: ${amount} VNĐ

    Hãy trả về duy nhất định dạng JSON thuần (không chứa markdown) có các trường:
    1. "category": Phân loại chi tiêu (chọn 1 trong các nhóm: "Hành chính", "Công nghệ IT", "Marketing", "Vận hành").
    2. "summary": Tóm tắt ngắn gọn yêu cầu trong 1 câu (tối đa 20 từ).
    3. "riskLevel": Nếu số tiền > 10.000.000 VNĐ trả về "HIGH", ngược lại trả về "LOW".`;

    const aiCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    });

    const aiContent = aiCompletion.choices[0].message.content || '{}';
    const aiData = JSON.parse(aiContent);

    // 3. Cập nhật kết quả AI trả về vào bảng requests
    await supabase
      .from('requests')
      .update({
        category: aiData.category,
        ai_summary: aiData.summary,
        risk_score: aiData.riskLevel,
      })
      .eq('id', requestId);

    // 4. Ghi Audit Log cho hành động AI xử lý
    await supabase.from('audit_logs').insert({
      request_id: requestId,
      action: 'AI_PROCESSED',
      performed_by: userId,
      details: aiData
    });

    return NextResponse.json({ success: true, aiData });
  } catch (error: any) {
    console.error('Error processing request:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}