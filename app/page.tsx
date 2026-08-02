'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { CheckCircle, XCircle, Bot, ShieldCheck, FileText, PlusCircle } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function IntelligentBPMApp() {
  const [requests, setRequests] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // State cho Form tạo đơn
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  // 1. Tải danh sách đơn & audit log từ Supabase
  const fetchData = async () => {
    const { data: reqData } = await supabase
      .from('requests')
      .select('*')
      .order('created_at', { ascending: false });

    const { data: logData } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (reqData) setRequests(reqData);
    if (logData) setAuditLogs(logData);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 2. Hàm gửi đơn mua sắm
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !amount) return alert('Vui lòng nhập đầy đủ thông tin!');

    setLoading(true);

    try {
      // 2a. Tạo bản ghi mới vào Supabase
      const { data, error } = await supabase
        .from('requests')
        .insert([
          {
            title,
            amount: parseFloat(amount),
            description,
            status: 'PENDING',
          },
        ])
        .select()
        .single();

      if (error) throw error;

      // 2b. Gọi Custom Extension API để xử lý AI & Audit Logging
      await fetch('/api/process-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: data.id,
          title: data.title,
          description: data.description,
          amount: data.amount,
        }),
      });

      // Reset Form
      setTitle('');
      setAmount('');
      setDescription('');
      fetchData();
      alert('Đã gửi yêu cầu thành công và được AI phân tích!');
    } catch (err: any) {
      alert('Có lỗi xảy ra: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 3. Hàm Phê duyệt / Từ chối đơn (Quản lý)
  const handleUpdateStatus = async (id: string, newStatus: 'APPROVED' | 'REJECTED') => {
    await supabase.from('requests').update({ status: newStatus }).eq('id', id);

    // Ghi log phê duyệt
    await supabase.from('audit_logs').insert({
      request_id: id,
      action: `MANAGER_${newStatus}`,
      details: { updated_at: new Date().toISOString() },
    });

    fetchData();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER */}
        <header className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Bot className="text-blue-600" /> Hệ Thống Phê Duyệt Chi Tiêu Thông Minh (Hybrid BPM)
            </h1>
            <p className="text-slate-500 text-sm mt-1">Lương Vĩ Thông - Đề thi số 2</p>
          </div>
          <span className="bg-green-100 text-green-700 font-medium px-3 py-1 rounded-full text-xs">
            System Online
          </span>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* CỘT 1: FORM TẠO ĐƠN YÊU CẦU */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <PlusCircle className="text-blue-500" /> Tạo Đề Xuất Chi Tiêu
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tiêu đề yêu cầu</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Mua bàn ghế văn phòng"
                  className="w-full border p-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Số tiền (VNĐ)</label>
                <input
                  type="number"
                  placeholder="5000000"
                  className="w-full border p-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mô tả chi tiết</label>
                <textarea
                  rows={3}
                  placeholder="Mô tả mục đích sử dụng..."
                  className="w-full border p-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white font-medium py-2 rounded-lg text-sm hover:bg-blue-700 transition"
              >
                {loading ? 'AI Đang Phân Tích...' : 'Gửi Phê Duyệt'}
              </button>
            </form>
          </div>

          {/* CỘT 2 & 3: REALTIME DASHBOARD BAN QUẢN LÝ */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <FileText className="text-indigo-500" /> Danh Sách Yêu Cầu Đang Chờ Phê Duyệt
              </h2>

              <div className="space-y-4">
                {requests.length === 0 && <p className="text-slate-400 text-sm">Chưa có yêu cầu nào.</p>}

                {requests.map((req) => (
                  <div key={req.id} className="border p-4 rounded-xl bg-slate-50 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-slate-800">{req.title}</h3>
                        <p className="text-slate-600 text-sm font-semibold mt-0.5">
                          {Number(req.amount).toLocaleString('vi-VN')} VNĐ
                        </p>
                      </div>
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          req.status === 'APPROVED'
                            ? 'bg-green-100 text-green-700'
                            : req.status === 'REJECTED'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {req.status}
                      </span>
                    </div>

                    {/* AI INSIGHTS BOX */}
                    {req.ai_summary && (
                      <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-xs space-y-1">
                        <div className="flex items-center gap-1 font-semibold text-blue-800">
                          <Bot size={14} /> AI Analysis:
                        </div>
                        <p className="text-slate-700"><b>Phân loại:</b> {req.category}</p>
                        <p className="text-slate-700"><b>Tóm tắt:</b> {req.ai_summary}</p>
                        <p className="text-slate-700">
                          <b>Đánh giá rủi ro:</b>{' '}
                          <span className={req.risk_score === 'HIGH' ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>
                            {req.risk_score}
                          </span>
                        </p>
                      </div>
                    )}

                    {/* NÚT THAO TÁC PHÊ DUYỆT */}
                    {req.status === 'PENDING' && (
                      <div className="flex gap-2 justify-end pt-2">
                        <button
                          onClick={() => handleUpdateStatus(req.id, 'APPROVED')}
                          className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-green-700"
                        >
                          <CheckCircle size={14} /> Phê Duyệt
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(req.id, 'REJECTED')}
                          className="flex items-center gap-1 bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-red-700"
                        >
                          <XCircle size={14} /> Từ Chối
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* AUDIT LOG ENGINE DISPLAY */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-md font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <ShieldCheck className="text-emerald-500" /> System Audit Logs (Nhật ký minh bạch)
              </h2>
              <div className="bg-slate-900 text-slate-200 p-4 rounded-lg font-mono text-xs max-h-40 overflow-y-auto space-y-1">
                {auditLogs.map((log) => (
                  <div key={log.id} className="border-b border-slate-800 pb-1">
                    <span className="text-slate-500">[{new Date(log.created_at).toLocaleTimeString()}]</span>{' '}
                    <span className="text-green-400">{log.action}</span> - Details:{' '}
                    {JSON.stringify(log.details)}
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}