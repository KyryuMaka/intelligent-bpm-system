'use client';

import React, { useState, useEffect } from 'react';
import { createClient, User as SupabaseUser } from '@supabase/supabase-js';
import { CheckCircle, XCircle, Bot, ShieldCheck, FileText, PlusCircle, LogOut, User, Lock, Mail } from 'lucide-react';

interface RequestItem {
  id: string;
  title: string;
  amount: number;
  description: string | null;
  category: string | null;
  ai_summary: string | null;
  risk_score: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
}

interface AuditLogItem {
  id: string;
  request_id: string;
  action: string;
  performed_by: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

const getCleanSupabaseUrl = (rawUrl?: string) => {
  if (!rawUrl) return '';
  return rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
};

const supabase = createClient(
  getCleanSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function IntelligentBPMApp() {
  // Auth state (Sử dụng SupabaseUser thay cho any)
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [userRole, setUserRole] = useState<'REQUESTER' | 'MANAGER'>('REQUESTER');
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<'REQUESTER' | 'MANAGER'>('REQUESTER');

  // App state
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  // Lấy Profile & Role của người dùng
  const fetchUserProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).single();
    if (data) {
      setUserRole(data.role as 'REQUESTER' | 'MANAGER');
    }
  };

  // Kiểm tra Session Đăng nhập
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        fetchUserProfile(session.user.id);
      }
    };
    checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        fetchUserProfile(session.user.id);
      } else {
        setUser(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Load dữ liệu Realtime
  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    const loadData = async () => {
      const { data: reqData } = await supabase
        .from('requests')
        .select('*')
        .order('created_at', { ascending: false });

      const { data: logData } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (isMounted) {
        if (reqData) setRequests(reqData as RequestItem[]);
        if (logData) setAuditLogs(logData as AuditLogItem[]);
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, [user]);

  const refreshData = async () => {
    const { data: reqData } = await supabase
      .from('requests')
      .select('*')
      .order('created_at', { ascending: false });

    const { data: logData } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (reqData) setRequests(reqData as RequestItem[]);
    if (logData) setAuditLogs(logData as AuditLogItem[]);
  };

  // Xử lý XÁC THỰC
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (authMode === 'REGISTER') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { role: selectedRole }
          }
        });
        if (error) throw error;
        alert('Đăng ký thành công! Hãy đăng nhập.');
        setAuthMode('LOGIN');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi xác thực không xác định';
      alert('Lỗi xác thực: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  // Xử lý Gửi đơn
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !amount) return alert('Vui lòng nhập đầy đủ!');
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('requests')
        .insert([{ title, amount: parseFloat(amount), description, status: 'PENDING' }])
        .select()
        .single();

      if (error) throw error;

      await fetch('/api/process-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: data.id,
          title: data.title,
          description: data.description,
          amount: data.amount,
          userId: user?.id
        }),
      });

      setTitle('');
      setAmount('');
      setDescription('');
      await refreshData();
      alert('Đã gửi đề xuất thành công và được AI phân tích!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đã xảy ra lỗi';
      alert('Có lỗi: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  // Xử lý Phê duyệt đơn
  const handleUpdateStatus = async (id: string, newStatus: 'APPROVED' | 'REJECTED') => {
    await supabase.from('requests').update({ status: newStatus }).eq('id', id);
    await supabase.from('audit_logs').insert({
      request_id: id,
      action: `MANAGER_${newStatus}`,
      performed_by: user?.id,
      details: { updated_at: new Date().toISOString() },
    });
    await refreshData();
  };

  // MÀN HÌNH 1: CHƯA ĐĂNG NHẬP
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
          <div className="text-center mb-6">
            <Bot className="w-12 h-12 text-blue-600 mx-auto mb-2" />
            <h1 className="text-xl font-bold text-slate-900">Intelligent BPM System</h1>
            <p className="text-slate-500 text-xs mt-1">Lương Vĩ Thông - Hệ thống Phê duyệt Chi tiêu Thông minh</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="email"
                  required
                  placeholder="user@example.com"
                  className="w-full pl-9 pr-3 py-2 border-2 border-slate-300 rounded-lg text-sm text-slate-900 focus:border-blue-600 outline-none"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Mật khẩu</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 border-2 border-slate-300 rounded-lg text-sm text-slate-900 focus:border-blue-600 outline-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {authMode === 'REGISTER' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Chọn Vai Trò (Role)</label>
                <select
                  className="w-full p-2 border-2 border-slate-300 rounded-lg text-sm text-slate-900 font-medium"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as 'REQUESTER' | 'MANAGER')}
                >
                  <option value="REQUESTER">Nhân viên (Tạo đề xuất chi tiêu)</option>
                  <option value="MANAGER">Quản lý (Phê duyệt & Duyệt đơn)</option>
                </select>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white font-bold py-2.5 rounded-lg text-sm hover:bg-blue-700 transition"
            >
              {loading ? 'Đang xử lý...' : authMode === 'LOGIN' ? 'Đăng Nhập' : 'Tạo Tài Khoản'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => setAuthMode(authMode === 'LOGIN' ? 'REGISTER' : 'LOGIN')}
              className="text-xs text-blue-600 font-bold hover:underline"
            >
              {authMode === 'LOGIN' ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đã có tài khoản? Đăng nhập'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // MÀN HÌNH 2: ĐÃ ĐĂNG NHẬP
  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER */}
        <header className="bg-white p-6 rounded-xl shadow-md border border-slate-200 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Bot className="text-blue-600" /> Intelligent BPM System (Hybrid Architecture)
            </h1>
            <p className="text-slate-600 text-sm mt-1 font-medium">Lương Vĩ Thông - Đề thi số 2</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1 justify-end">
                <User size={14} /> {user.email}
              </div>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                userRole === 'MANAGER' ? 'bg-purple-100 text-purple-800 border border-purple-300' : 'bg-blue-100 text-blue-800 border border-blue-300'
              }`}>
                Role: {userRole}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="bg-slate-200 text-slate-700 p-2 rounded-lg hover:bg-slate-300 transition"
              title="Đăng xuất"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* CỘT 1: FORM TẠO ĐƠN */}
          <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <PlusCircle className="text-blue-600" /> Tạo Đề Xuất Chi Tiêu
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1">Tiêu đề yêu cầu</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Mua máy in văn phòng"
                  className="w-full border-2 border-slate-300 bg-white text-slate-900 font-medium p-2.5 rounded-lg text-sm focus:border-blue-600 outline-none"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1">Số tiền (VNĐ)</label>
                <input
                  type="number"
                  placeholder="12000000"
                  className="w-full border-2 border-slate-300 bg-white text-slate-900 font-medium p-2.5 rounded-lg text-sm focus:border-blue-600 outline-none"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1">Mô tả chi tiết</label>
                <textarea
                  rows={3}
                  placeholder="Mô tả mục đích chi tiêu..."
                  className="w-full border-2 border-slate-300 bg-white text-slate-900 font-medium p-2.5 rounded-lg text-sm focus:border-blue-600 outline-none"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg text-sm hover:bg-blue-700 transition"
              >
                {loading ? 'AI Gemini Đang Phân Tích...' : 'Gửi Phê Duyệt'}
              </button>
            </form>
          </div>

          {/* CỘT 2 & 3: REAL-TIME DASHBOARD & AUDIT LOGS */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200">
              <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <FileText className="text-indigo-600" /> Real-time Approval Dashboard
              </h2>

              <div className="space-y-4">
                {requests.length === 0 && <p className="text-slate-500 font-medium text-sm">Chưa có đề xuất nào.</p>}

                {requests.map((req) => (
                  <div key={req.id} className="border-2 border-slate-200 p-4 rounded-xl bg-slate-50 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">{req.title}</h3>
                        <p className="text-blue-700 text-sm font-extrabold mt-0.5">
                          {Number(req.amount).toLocaleString('vi-VN')} VNĐ
                        </p>
                      </div>
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full ${
                          req.status === 'APPROVED'
                            ? 'bg-green-100 text-green-800 border border-green-300'
                            : req.status === 'REJECTED'
                            ? 'bg-red-100 text-red-800 border border-red-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}
                      >
                        {req.status}
                      </span>
                    </div>

                    {req.ai_summary && (
                      <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-xs space-y-1">
                        <div className="flex items-center gap-1 font-bold text-blue-900">
                          <Bot size={14} /> AI Insight:
                        </div>
                        <p className="text-slate-800"><b>Phân loại:</b> {req.category}</p>
                        <p className="text-slate-800"><b>Tóm tắt:</b> {req.ai_summary}</p>
                        <p className="text-slate-800">
                          <b>Đánh giá Rủi ro:</b>{' '}
                          <span className={req.risk_score === 'HIGH' ? 'text-red-700 font-black' : 'text-emerald-700 font-black'}>
                            {req.risk_score}
                          </span>
                        </p>
                      </div>
                    )}

                    {req.status === 'PENDING' && (
                      <div className="flex gap-2 justify-end pt-2">
                        {userRole === 'MANAGER' ? (
                          <>
                            <button
                              onClick={() => handleUpdateStatus(req.id, 'APPROVED')}
                              className="flex items-center gap-1 bg-emerald-600 text-white font-bold px-3.5 py-2 rounded-lg text-xs hover:bg-emerald-700 transition"
                            >
                              <CheckCircle size={14} /> Phê Duyệt
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(req.id, 'REJECTED')}
                              className="flex items-center gap-1 bg-rose-600 text-white font-bold px-3.5 py-2 rounded-lg text-xs hover:bg-rose-700 transition"
                            >
                              <XCircle size={14} /> Từ Chối
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400 italic font-medium">
                            Chờ quản lý phê duyệt...
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* AUDIT LOG ENGINE */}
            <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200">
              <h2 className="text-md font-bold text-slate-900 mb-3 flex items-center gap-2">
                <ShieldCheck className="text-emerald-600" /> System Audit Logs (Minh bạch kiểm toán)
              </h2>
              <div className="bg-slate-950 text-slate-100 p-4 rounded-lg font-mono text-xs max-h-44 overflow-y-auto space-y-1.5 border border-slate-800">
                {auditLogs.map((log) => (
                  <div key={log.id} className="border-b border-slate-800 pb-1">
                    <span className="text-slate-400">[{new Date(log.created_at).toLocaleTimeString()}]</span>{' '}
                    <span className="text-emerald-400 font-bold">{log.action}</span> - Details:{' '}
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