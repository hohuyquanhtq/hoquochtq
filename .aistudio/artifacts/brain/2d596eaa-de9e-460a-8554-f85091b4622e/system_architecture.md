# CHEM TEST – HỒ SƠ THIẾT KẾ KIẾN TRÚC & KỸ THUẬT HỆ THỐNG

**Hệ thống Ngân hàng câu hỏi, Tạo đề và Thi trắc nghiệm trực tuyến môn Hóa học THPT & Chuyên**

---

## 1. PHÂN TÍCH TOÀN BỘ YÊU CẦU HỆ THỐNG

### 1.1. Bối cảnh và Thách thức
Môn Hóa học THPT (đặc biệt là khối 10, 11, 12, các lớp chuyên Hóa và ôn thi HSG Quốc gia) có các đặc thù khắt khe về mặt nội dung:
- Ký hiệu chỉ số dưới ($H_2SO_4$, $Fe_2O_3$), điện tích ion trên ($Fe^{3+}$, $SO_4^{2-}$, $[Cu(NH_3)_4]^{2+}$).
- Mũi tên phản ứng một chiều ($\rightarrow$) và thuận nghịch cân bằng ($\rightleftharpoons$), biến thiên enthalpy ($\Delta_r H^0_{298}$), độ tan, pH.
- Sơ đồ thí nghiệm thực hành, đồ thị động học và bảng số liệu chuẩn độ.
- Cấu trúc đề thi mới của Bộ Giáo dục & Đào tạo gồm **3 phần riêng biệt**:
  - **Phần I**: Trắc nghiệm 4 lựa chọn (A, B, C, D) – 1 phương án đúng.
  - **Phần II**: Trắc nghiệm Đúng – Sai (gồm 4 mệnh đề a, b, c, d) – chấm điểm tích lũy theo thang Bộ GD&ĐT (đúng 1 ý = 0.1đ, 2 ý = 0.25đ, 3 ý = 0.50đ, 4 ý = 1.00đ).
  - **Phần III**: Trắc nghiệm Trả lời ngắn – điền số thập phân (dấu phẩy hoặc dấu chấm), hỗ trợ sai số cho phép $\pm \epsilon$.
- **Ràng buộc thang điểm**: Đề thi bắt buộc chuẩn hóa thang 10.0 điểm chính xác, có cơ chế tự động cân đối và cảnh báo nếu khác 10.0đ.

---

## 2. ĐỀ XUẤT KIẾN TRÚC HỆ THỐNG (3-TIER ARCHITECTURE)

```
+-------------------------------------------------------------------------+
|                         PRESENTATION TIER (UI)                          |
|  - React 19 + TypeScript + Vite + Tailwind CSS                          |
|  - ChemRenderer (KaTeX + Subscript/Superscript + Reaction Equations)    |
|  - Responsive Mobile / Tablet / Desktop                                 |
|  - Role Switcher (Admin, Teacher, Student)                              |
+------------------------------------+------------------------------------+
                                     |
+------------------------------------v------------------------------------+
|                         BUSINESS & ENGINE TIER                          |
|  - Word / DOCX Parser (Mammoth Engine) + Chem Pattern Heuristics        |
|  - 3-Section Recognition Engine (Part I, Part II, Part III)             |
|  - Compulsory 10.0-Score Matrix Auto-Balancer                           |
|  - Auto-Grading Engine (MOET Cumulative True/False + Tolerance Float)   |
|  - Anti-Cheat & Visibility Monitor (Tab Blur Tracking)                  |
|  - Excel (.xlsx) Generation Engine (SheetJS/xlsx)                       |
|  - Gemini 2.5 Flash AI Assistant (Explanation & Solution Generator)     |
+------------------------------------+------------------------------------+
                                     |
+------------------------------------v------------------------------------+
|                           PERSISTENCE TIER                              |
|  - Local Storage Sync with Auto-Save per Second                         |
|  - JSON Database Backup & Restore Engine                                |
|  - Pre-seeded Rich Question Bank & Verified Exams                       |
+-------------------------------------------------------------------------+
```

---

## 3. THIẾT KẾ CƠ SỞ DỮ LIỆU (RELATIONAL ERD)

### 3.1. Entity: `users`
- `id`: UUID (Khóa chính)
- `name`: VARCHAR(255)
- `email`: VARCHAR(255) UNIQUE
- `role`: ENUM ('admin', 'teacher', 'student')
- `class_name`: VARCHAR(50) (Dành cho học sinh)
- `school`: VARCHAR(255)
- `created_at`: TIMESTAMP

### 3.2. Entity: `folders`
- `id`: UUID (Khóa chính)
- `name`: VARCHAR(255) (VD: "Lớp 12 chuyên Hóa", "Ôn thi HSG Quốc gia")
- `parent_id`: UUID (Khóa ngoại trỏ đến `folders.id`)
- `grade`: ENUM ('10', '11', '12', 'chuyen_hsg')
- `author_id`: UUID (Khóa ngoại `users.id`)
- `created_at`: TIMESTAMP

### 3.3. Entity: `questions`
- `id`: UUID (Khóa chính)
- `code`: VARCHAR(50) (VD: "H12_HC_001")
- `type`: ENUM ('part1_single_choice', 'part2_true_false', 'part3_short_answer')
- `content`: TEXT (Hỗ trợ định dạng hóa học, LaTeX)
- `options`: JSONB (`[{ id: 'A', text: '...', isCorrect: true }]`)
- `statements`: JSONB (`[{ id: 'a', statement: '...', correctAnswer: true }]`)
- `short_answer_config`: JSONB (`{ acceptableAnswers: ['4', '4.0'], isNumeric: true, tolerance: 0.05 }`)
- `grade`: ENUM ('10', '11', '12', 'chuyen_hsg')
- `topic`: ENUM ('hoa_dai_cuong', 'hoa_vo_co', 'hoa_huu_co', 'hoa_thuc_nghiem', 'chuyen_sau_hsg')
- `level`: ENUM ('nhan_biet', 'thong_hieu', 'van_dung', 'van_dung_cao')
- `image_url`: TEXT (Sơ đồ thí nghiệm, đồ thị)
- `explanation`: TEXT (Lời giải chi tiết và phương trình phản ứng)
- `folder_id`: UUID (Khóa ngoại `folders.id`)
- `author_id`: UUID (Khóa ngoại `users.id`)

### 3.4. Entity: `exams`
- `id`: UUID (Khóa chính)
- `code`: VARCHAR(20) UNIQUE (Mã vào thi online, VD: `CHEM12`, `OLYMP1`)
- `title`: VARCHAR(255)
- `duration_minutes`: INTEGER (VD: 45, 50, 90 phút)
- `total_score`: FLOAT (Mặc định 10.0)
- `rules`: JSONB (Điểm từng phần, mô hình chấm chuẩn Bộ GD&ĐT)
- `questions`: JSONB (Danh sách câu hỏi trong đề)
- `shuffle_questions`: BOOLEAN
- `shuffle_options`: BOOLEAN
- `is_published`: BOOLEAN
- `show_score_after_submit`: BOOLEAN
- `show_answers_after_submit`: BOOLEAN
- `show_solutions_after_submit`: BOOLEAN

### 3.5. Entity: `submissions`
- `id`: UUID (Khóa chính)
- `exam_id`: UUID (Khóa ngoại `exams.id`)
- `student_id`: UUID
- `student_name`: VARCHAR(255)
- `student_class`: VARCHAR(50)
- `started_at`: TIMESTAMP
- `submitted_at`: TIMESTAMP
- `duration_seconds`: INTEGER
- `answers`: JSONB (Toàn bộ lựa chọn và câu trả lời của học sinh)
- `part1_score`: FLOAT
- `part2_score`: FLOAT
- `part3_score`: FLOAT
- `total_score`: FLOAT (Thang 10.0)
- `tab_switches_count`: INTEGER (Cảnh báo gian lận)
- `status`: ENUM ('completed', 'in_progress', 'timed_out')

---

## 4. BẢO MẬT VÀ TOÀN VẸN DỮ LIỆU
1. **Bảo mật đề thi trực tuyến**:
   - Khi học sinh đang làm bài, các thuộc tính `correctOptionId`, `correctAnswer`, `acceptableAnswers` và `explanation` được bóc tách và ẩn hoàn toàn khỏi state làm bài của client, ngăn chặn việc inspect mã nguồn để gian lận.
2. **Chống mất bài khi đứt mạng**:
   - Mọi thao tác chọn phương án, tick Đúng/Sai hoặc gõ câu trả lời ngắn đều được lưu tự động theo thời gian thực (real-time sync) vào bộ nhớ cục bộ trình duyệt. Khi mất mạng hoặc tải lại trang, hệ thống lập tức khôi phục trạng thái làm bài cùng đồng hồ đếm ngược.
3. **Cảnh báo rời tab (Tab-blur monitoring)**:
   - Hệ thống đếm số lần thí sinh chuyển đổi tab hoặc rời khỏi cửa sổ làm bài và ghi nhận vào biên bản nộp bài để giáo viên theo dõi.
