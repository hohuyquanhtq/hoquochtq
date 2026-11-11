/**
 * HQTest - Hệ Thống Cấu Hình Thương Hiệu & Thông Tin Tác Giả Thống Nhất
 */

export const APP_CONFIG = {
  APP_NAME: 'HQTest',
  APP_DESCRIPTION: 'Ngân hàng câu hỏi & Thi trắc nghiệm online',
  APP_AUTHOR: 'Hồ Ngọc Quốc',
  APP_SCHOOL: 'Trường THPT chuyên Nguyễn Bỉnh Khiêm, Tp. Đà Nẵng',
  APP_VERSION: '2.5.0',
  APP_COPYRIGHT: '© 2026 HQTest',
} as const;

export interface GreetingUserLike {
  name?: string;
  role?: 'teacher' | 'student' | 'admin' | string;
}

/**
 * Sinh lời chào động chuẩn xác theo vai trò và thông tin người dùng
 * - Giáo viên: "Xin chào, Thầy/Cô [Tên Giáo Viên]!"
 * - Học sinh:  "Xin chào, Em [Tên Học Sinh]!"
 * - Quản trị viên: "Xin chào, [Tên Quản Trị Viên]!"
 * - Chưa có tên: "Xin chào!"
 */
export function getUserGreeting(user?: GreetingUserLike | null, overrideName?: string): string {
  const rawName = (overrideName !== undefined ? overrideName : user?.name) || '';
  const cleanName = rawName.trim();

  if (!cleanName) {
    return 'Xin chào!';
  }

  // Loại bỏ các tiền tố học vị thừa nếu người dùng nhập trùng để lời chào luôn trang trọng, chuẩn xác
  const displayTitleName = cleanName.replace(/^(ThS\.|TS\.|Thầy\/Cô|Thầy|Cô|Em)\s+/i, '').trim() || cleanName;

  if (user?.role === 'teacher') {
    return `Xin chào, Thầy/Cô ${displayTitleName}!`;
  }

  if (user?.role === 'student') {
    return `Xin chào, Em ${displayTitleName}!`;
  }

  return `Xin chào, ${displayTitleName}!`;
}
