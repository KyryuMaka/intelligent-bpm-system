'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient, User as SupabaseUser } from '@supabase/supabase-js';
import { 
  CheckCircle, XCircle, Bot, ShieldCheck, FileText, PlusCircle, LogOut, 
  User, Lock, Mail, DollarSign, Ban, Clock, LayoutDashboard, Send, SlidersHorizontal, Sparkles 
} from 'lucide-react';

interface RequestItem {
  id: string;
  title: string;
  amount: number;
  description: string | null;
  category: string | null;
  ai_summary: string | null;
  risk_score: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_by: string | null;
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

// Hàm helper sinh dữ liệu AI nếu đơn cũ chưa có dữ liệu trong DB
const getAIData = (item: RequestItem) => {
  const category = item.category || (Number(item.amount) > 10000000 ? 'Thiết bị & Công nghệ IT' : 'Hành chính & Thiết bị văn phòng');
  const ai_summary = item.ai_summary || `Yêu cầu mua sắm '${item.title}' với ngân sách ${Number(item.amount).toLocaleString('vi-VN')} VNĐ phục vụ vận hành.`;
  const risk_score = item.risk_score || (Number(item.amount) > 10000000 ? 'HIGH' : 'LOW');
  return { category, ai_summary, risk_score };
};

export default function IntelligentBPMApp() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [userRole, setUserRole] = useState<'REQUESTER' | 'MANAGER'>('REQUESTER');
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<'REQUESTER' | 'MANAGER'>('REQUESTER');

  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'REQUESTS' | 'AUDIT_LOGS'>('DASHBOARD');

  const [filterMonth, setFilterMonth] = useState<number>(new Date().getMonth());
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());

  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const fetchUserProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).single();
    if (data) {
      const role = data.role as 'REQUESTER' | 'MANAGER';
      setUserRole(role);
      if (role === 'REQUESTER') {
        setActiveTab('REQUESTS');
      }
    }
  };

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

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    const loadData = async () => {
      let query = supabase.from('requests').select('*').order('created_at', { ascending: false });
      
      if (userRole === 'REQUESTER') {
        query = query.eq('created_by', user.id);
      }

      const { data: reqData } = await query;

      const { data: logData } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (isMounted) {
        if (reqData) setRequests(reqData as RequestItem[]);
        if (logData) setAuditLogs(logData as AuditLogItem[]);
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, [user, userRole]);

  const refreshData = async () => {
    if (!user) return;
    let query = supabase.from('requests').select('*').order('created_at', { ascending: false });
    
    if (userRole === 'REQUESTER') {
      query = query.eq('created_by', user.id);
    }

    const { data: reqData } = await query;

    const { data: logData } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (reqData) setRequests(reqData as RequestItem[]);
    if (logData) setAuditLogs(logData as AuditLogItem[]);
  };

  const dashboardData = useMemo(() => {
    const filteredRequests = requests.filter((req) => {
      const reqDate = new Date(req.created_at);
      return reqDate.getMonth() === filterMonth && reqDate.getFullYear() === filterYear;
    });

    const approvedList = filteredRequests.filter((req) => req.status === 'APPROVED');
    const pendingList = filteredRequests.filter((req) => req.status === 'PENDING');
    const rejectedList = filteredRequests.filter((req) => req.status === 'REJECTED');

    const totalApproved = approvedList.reduce((sum, req) => sum + Number(req.amount), 0);

    return {
      approvedList,
      pendingList,
      rejectedList,
      totalApproved,
      approvedCount: approvedList.length,
      pendingCount: pendingList.length,
      rejectedCount: rejectedList.length,
      totalCount: filteredRequests.length,
    };
  }, [requests, filterMonth, filterYear]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !amount) return alert('Vui lòng nhập đầy đủ!');
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('requests')
        .insert([{ 
          title, 
          amount: parseFloat(amount), 
          description, 
          status: 'PENDING',
          created_by: user?.id 
        }])
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
                  <option value="MANAGER">Quản lý (Phê duyệt & Dashboard)</option>
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

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <aside className="w-64 bg-white border-r border-slate-200 p-6 flex flex-col justify-between shrink-0">
        <div className="space-y-8">
          <div>
            <div className="flex items-center gap-2 text-blue-600 font-extrabold text-lg">
              <Bot className="w-7 h-7" /> BPM System
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-1">Lương Vĩ Thông - Đề thi 2</p>
          </div>

          <nav className="space-y-1.5">
            {userRole === 'MANAGER' && (
              <button
                onClick={() => setActiveTab('DASHBOARD')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-xs transition ${
                  activeTab === 'DASHBOARD'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <LayoutDashboard size={18} /> Dashboard Quản lý
              </button>
            )}

            <button
              onClick={() => setActiveTab('REQUESTS')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-xs transition ${
                activeTab === 'REQUESTS'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Send size={18} /> Đề Xuất Chi Tiêu
            </button>

            {userRole === 'MANAGER' && (
              <button
                onClick={() => setActiveTab('AUDIT_LOGS')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-xs transition ${
                  activeTab === 'AUDIT_LOGS'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <ShieldCheck size={18} /> System Audit Logs
              </button>
            )}
          </nav>
        </div>

        <div className="border-t border-slate-200 pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="bg-slate-100 p-2 rounded-full text-slate-600">
              <User size={18} />
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-slate-800 truncate">{user.email}</p>
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase inline-block mt-0.5 ${
                userRole === 'MANAGER' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
              }`}>
                Role: {userRole}
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 py-2 rounded-lg text-xs font-bold transition border border-slate-200"
          >
            <LogOut size={14} /> Đăng xuất
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto max-w-7xl space-y-6">
        
        {/* TAB 1: DASHBOARD QUẢN LÝ */}
        {activeTab === 'DASHBOARD' && userRole === 'MANAGER' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <LayoutDashboard className="text-blue-600" /> Báo Cáo Thống Kê Chi Tiêu Quản Lý
                </h2>
                <p className="text-slate-500 text-xs mt-1">Thống kê chỉ số & Phân tích AI Gemini cho từng yêu cầu</p>
              </div>

              <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-200">
                <SlidersHorizontal size={16} className="text-slate-500" />
                <select
                  className="bg-white border border-slate-300 text-slate-800 text-xs font-bold p-1.5 rounded-md outline-none"
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(Number(e.target.value))}
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i} value={i}>Tháng {i + 1}</option>
                  ))}
                </select>

                <select
                  className="bg-white border border-slate-300 text-slate-800 text-xs font-bold p-1.5 rounded-md outline-none"
                  value={filterYear}
                  onChange={(e) => setFilterYear(Number(e.target.value))}
                >
                  <option value={2025}>Năm 2025</option>
                  <option value={2026}>Năm 2026</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 space-y-2">
                <div className="flex justify-between items-center text-slate-500">
                  <span className="text-xs font-bold uppercase">Tổng Chi Tiêu Đã Duyệt</span>
                  <DollarSign className="text-emerald-600" size={20} />
                </div>
                <p className="text-2xl font-black text-emerald-700">
                  {dashboardData.totalApproved.toLocaleString('vi-VN')} VNĐ
                </p>
                <p className="text-[11px] text-slate-400">Từ {dashboardData.approvedCount} đơn đã chấp thuận</p>
              </div>

              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 space-y-2">
                <div className="flex justify-between items-center text-slate-500">
                  <span className="text-xs font-bold uppercase">Đơn Đã Từ Chối</span>
                  <Ban className="text-rose-600" size={20} />
                </div>
                <p className="text-2xl font-black text-rose-700">
                  {dashboardData.rejectedCount} Request
                </p>
                <p className="text-[11px] text-slate-400">Không đủ điều kiện / rủi ro</p>
              </div>

              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 space-y-2">
                <div className="flex justify-between items-center text-slate-500">
                  <span className="text-xs font-bold uppercase">Đơn Đang Chờ Duyệt</span>
                  <Clock className="text-amber-600" size={20} />
                </div>
                <p className="text-2xl font-black text-amber-600">
                  {dashboardData.pendingCount} Request
                </p>
                <p className="text-[11px] text-slate-400">Cần xử lý phê duyệt</p>
              </div>

              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 space-y-2">
                <div className="flex justify-between items-center text-slate-500">
                  <span className="text-xs font-bold uppercase">Tổng Số Request</span>
                  <FileText className="text-blue-600" size={20} />
                </div>
                <p className="text-2xl font-black text-slate-800">
                  {dashboardData.totalCount} Request
                </p>
                <p className="text-[11px] text-slate-400">Khởi tạo trong tháng lựa chọn</p>
              </div>
            </div>

            {/* 3 CỘT DANH SÁCH TÍCH HỢP KHUNG AI INSIGHT THÔNG MINH */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
              
              {/* CỘT ĐÃ DUYỆT */}
              <div className="bg-white p-5 rounded-xl shadow-sm border border-emerald-200 space-y-4">
                <h3 className="text-sm font-bold text-emerald-800 flex items-center justify-between border-b border-emerald-100 pb-2">
                  <span className="flex items-center gap-1.5"><CheckCircle size={16} /> Đã Duyệt Chi</span>
                  <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-full font-extrabold">
                    {dashboardData.approvedCount}
                  </span>
                </h3>

                <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                  {dashboardData.approvedList.length === 0 && (
                    <p className="text-xs text-slate-400 italic">Không có đề xuất nào trong tháng.</p>
                  )}
                  {dashboardData.approvedList.map((item) => {
                    const ai = getAIData(item);
                    return (
                      <div key={item.id} className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-100 space-y-2">
                        <div className="flex justify-between items-start">
                          <p className="text-xs font-bold text-slate-900">{item.title}</p>
                          <span className="font-extrabold text-emerald-700 text-xs">{Number(item.amount).toLocaleString('vi-VN')} VNĐ</span>
                        </div>
                        
                        <div className="bg-white p-2.5 rounded-lg text-[11px] space-y-1 border border-emerald-200/80 shadow-2xs">
                          <p className="font-bold text-purple-700 flex items-center gap-1">
                            <Sparkles size={12} className="text-purple-600" /> AI Gemini Insight:
                          </p>
                          <p className="text-slate-700"><b>Phân loại:</b> {ai.category}</p>
                          <p className="text-slate-700"><b>Tóm tắt:</b> {ai.ai_summary}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CỘT CHỜ DUYỆT */}
              <div className="bg-white p-5 rounded-xl shadow-sm border border-amber-200 space-y-4">
                <h3 className="text-sm font-bold text-amber-800 flex items-center justify-between border-b border-amber-100 pb-2">
                  <span className="flex items-center gap-1.5"><Clock size={16} /> Đang Chờ Duyệt</span>
                  <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-extrabold">
                    {dashboardData.pendingCount}
                  </span>
                </h3>

                <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                  {dashboardData.pendingList.length === 0 && (
                    <p className="text-xs text-slate-400 italic">Không có đơn đang chờ.</p>
                  )}
                  {dashboardData.pendingList.map((item) => {
                    const ai = getAIData(item);
                    return (
                      <div key={item.id} className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-100 space-y-2">
                        <div className="flex justify-between items-start">
                          <p className="text-xs font-bold text-slate-900">{item.title}</p>
                          <span className="font-extrabold text-amber-700 text-xs">{Number(item.amount).toLocaleString('vi-VN')} VNĐ</span>
                        </div>

                        <div className="bg-white p-2.5 rounded-lg text-[11px] space-y-1 border border-amber-200/80 shadow-2xs">
                          <p className="font-bold text-purple-700 flex items-center gap-1">
                            <Sparkles size={12} className="text-purple-600" /> AI Gemini Insight:
                          </p>
                          <p className="text-slate-700"><b>Phân loại:</b> {ai.category}</p>
                          <p className="text-slate-700"><b>Tóm tắt:</b> {ai.ai_summary}</p>
                          <p className="text-slate-700">
                            <b>Rủi ro AI đánh giá:</b>{' '}
                            <span className={ai.risk_score === 'HIGH' ? 'text-red-600 font-black' : 'text-emerald-600 font-black'}>
                              {ai.risk_score}
                            </span>
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CỘT TỪ CHỐI */}
              <div className="bg-white p-5 rounded-xl shadow-sm border border-rose-200 space-y-4">
                <h3 className="text-sm font-bold text-rose-800 flex items-center justify-between border-b border-rose-100 pb-2">
                  <span className="flex items-center gap-1.5"><XCircle size={16} /> Đã Từ Chối</span>
                  <span className="bg-rose-100 text-rose-800 text-xs px-2 py-0.5 rounded-full font-extrabold">
                    {dashboardData.rejectedCount}
                  </span>
                </h3>

                <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                  {dashboardData.rejectedList.length === 0 && (
                    <p className="text-xs text-slate-400 italic">Không có đơn bị từ chối.</p>
                  )}
                  {dashboardData.rejectedList.map((item) => {
                    const ai = getAIData(item);
                    return (
                      <div key={item.id} className="p-3.5 bg-rose-50/50 rounded-xl border border-rose-100 space-y-2">
                        <div className="flex justify-between items-start">
                          <p className="text-xs font-bold text-slate-900">{item.title}</p>
                          <span className="font-extrabold text-rose-700 text-xs">{Number(item.amount).toLocaleString('vi-VN')} VNĐ</span>
                        </div>

                        <div className="bg-white p-2.5 rounded-lg text-[11px] space-y-1 border border-rose-200/80 shadow-2xs">
                          <p className="font-bold text-purple-700 flex items-center gap-1">
                            <Sparkles size={12} className="text-purple-600" /> AI Gemini Insight:
                          </p>
                          <p className="text-slate-700"><b>Phân loại:</b> {ai.category}</p>
                          <p className="text-slate-700"><b>Tóm tắt:</b> {ai.ai_summary}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 2: ĐỀ XUẤT CHI TIÊU */}
        {activeTab === 'REQUESTS' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
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

            <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2 justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="text-indigo-600" /> Real-time Approval Dashboard
                </span>
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                  {userRole === 'MANAGER' ? 'Quản lý: Xem tất cả các đơn' : 'Nhân viên: Chỉ xem đơn cá nhân'}
                </span>
              </h2>

              <div className="space-y-4">
                {requests.length === 0 && <p className="text-slate-500 font-medium text-sm">Chưa có đề xuất nào.</p>}

                {requests.map((req) => {
                  const ai = getAIData(req);
                  return (
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

                      {/* HIỂN THỊ KHUNG AI INSIGHT NỔI BẬT */}
                      <div className="bg-purple-50 border border-purple-200 p-3 rounded-lg text-xs space-y-1">
                        <div className="flex items-center gap-1 font-bold text-purple-900">
                          <Sparkles size={14} className="text-purple-600" /> AI Gemini Insight:
                        </div>
                        <p className="text-slate-800"><b>Phân loại nhóm:</b> {ai.category}</p>
                        <p className="text-slate-800"><b>Tóm tắt:</b> {ai.ai_summary}</p>
                        <p className="text-slate-800">
                          <b>Đánh giá mức độ rủi ro:</b>{' '}
                          <span className={ai.risk_score === 'HIGH' ? 'text-red-700 font-black' : 'text-emerald-700 font-black'}>
                            {ai.risk_score}
                          </span>
                        </p>
                      </div>

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
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SYSTEM AUDIT LOG */}
        {activeTab === 'AUDIT_LOGS' && userRole === 'MANAGER' && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="text-emerald-600" /> System Audit Logs (Nhật Ký Kiểm Toán Minh Bạch)
              </h2>
              <p className="text-slate-500 text-xs mt-1">Truy vết toàn bộ lịch sử thao tác của nhân viên, AI và cấp quản lý</p>
            </div>

            <div className="bg-slate-950 text-slate-100 p-5 rounded-xl font-mono text-xs max-h-[550px] overflow-y-auto space-y-2 border border-slate-800 shadow-inner">
              {auditLogs.map((log) => (
                <div key={log.id} className="border-b border-slate-800 pb-2 flex items-start gap-3">
                  <span className="text-slate-500 shrink-0">[{new Date(log.created_at).toLocaleTimeString()}]</span>
                  <div>
                    <span className="text-emerald-400 font-bold uppercase">{log.action}</span>
                    <span className="text-slate-400 ml-2">Details: {JSON.stringify(log.details)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}