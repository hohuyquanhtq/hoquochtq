import React from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { APP_CONFIG } from '../../constants/brand';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  onResetToHome?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: '',
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[HQTest ErrorBoundary] Lỗi giao diện không mong muốn:', error, info.componentStack);
    this.setState({
      errorInfo: info.componentStack || '',
    });
  }

  handleReload = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: '' });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  handleGoHome = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: '' });
    if (this.props.onResetToHome) {
      this.props.onResetToHome();
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const message = this.state.error?.message || 'Đã xảy ra lỗi không xác định khi hiển thị trang.';

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4 bg-slate-50">
        <div className="max-w-lg w-full bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-rose-600 to-rose-700 px-6 py-5 text-white flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-100 block">
                {APP_CONFIG.APP_NAME} • KHÔI PHỤC HỆ THỐNG
              </span>
              <h1 className="text-lg font-extrabold text-white mt-0.5">
                {this.props.fallbackTitle || 'Không thể hiển thị nội dung này'}
              </h1>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-700 leading-relaxed">
              Ứng dụng vừa gặp sự cố kỹ thuật khi tải giao diện. Dữ liệu của bạn vẫn được bảo vệ an toàn. Vui lòng thử tải lại trang hoặc quay về trang chủ.
            </p>

            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-mono text-rose-800 break-words">
              Chi tiết kỹ thuật: {message}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleGoHome}
                className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <Home className="w-4 h-4 text-slate-600" />
                <span>Quay về trang chủ</span>
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Thử tải lại</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
