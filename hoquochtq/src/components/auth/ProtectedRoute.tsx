import React from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { UserRole } from '../../types';
import { useAuth, canAccessRole } from '../../contexts/AuthContext';

interface ProtectedRouteProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  onBackHome?: () => void;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  allowedRoles,
  children,
  onBackHome,
}) => {
  const { authState, userProfile } = useAuth();

  if (authState !== 'authenticated' || !canAccessRole(userProfile, allowedRoles)) {
    return (
      <div className="max-w-lg mx-auto my-12 bg-white border border-rose-200 rounded-3xl p-8 shadow-lg text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900">
          Không có quyền truy cập khu vực này
        </h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          Tài khoản của bạn ({userProfile?.email || 'Chưa xác thực'}) không thuộc nhóm quyền được phép truy cập chức năng này hoặc đang ở trạng thái chưa kích hoạt.
        </p>
        {onBackHome && (
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại không gian của bạn</span>
          </button>
        )}
      </div>
    );
  }

  return <>{children}</>;
};
