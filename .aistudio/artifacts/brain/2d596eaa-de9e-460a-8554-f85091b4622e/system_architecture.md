# HQTest – HỒ SƠ THIẾT KẾ KIẾN TRÚC & KỸ THUẬT HỆ THỐNG

**Ngân hàng câu hỏi & Thi trắc nghiệm online**  
*Tác giả: Hồ Ngọc Quốc – Trường THPT chuyên Nguyễn Bỉnh Khiêm, Tp. Đà Nẵng*

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

### 3.6. Entity: `exam_answer_keys` (Bảng Nhận dạng Đáp án Tự động – Mục VI)
- `id`: VARCHAR(50) (Khóa chính, VD: `I.1`, `II.1a`, `III.1`)
- `exam_id`: UUID (Khóa ngoại `exams.id`)
- `question_id`: UUID (Khóa ngoại `questions.id`)
- `section`: ENUM ('part1', 'part2', 'part3')
- `question_number`: INTEGER
- `sub_question`: ENUM ('a', 'b', 'c', 'd') (Đối với Phần II)
- `answer_type`: ENUM ('choice', 'true_false', 'short_answer')
- `correct_answer`: VARCHAR(255) (Đáp án chuẩn: 'B', 'Đúng'/'Sai', '58,4')
- `accepted_answers`: JSONB (`['58,4', '58.4']`)
- `tolerance`: FLOAT (Sai số cho phép: 0.05 đối với số thập phân)
- `recognition_status`: ENUM ('verified', 'needs_review', 'not_found', 'conflicted')
- `recognition_source`: ENUM ('answer_table', 'question_content', 'detailed_solution', 'manual')
- `teacher_verified`: BOOLEAN (Giáo viên đã rà soát và xác nhận)
- `notes`: TEXT (Ghi chú nguồn trích xuất)

---

## 4. BỘ MÁY TỰ ĐỘNG NHẬN DẠNG ĐÁP ÁN (ANSWER RECOGNITION ENGINE)

1. **Phần I – Trắc nghiệm 4 lựa chọn**:
   - Tự động nhận dạng cấu trúc bảng 2 dòng: Dòng số câu `Câu 1 2 3 ...` và dòng phương án `Đáp án B A C ...`.
   - Hỗ trợ định dạng dấu chấm phẩy `1.B; 2.A; 3.C` và dạng gạch nối `1-B, 2-A`.
   - Ghép chính xác từng phương án vào phương án đúng của câu hỏi.

2. **Phần II – Trắc nghiệm Đúng/Sai (Hỗ trợ Bảng Ma Trận Hoán Vị)**:
   - Nhận dạng chính xác bảng chuyển vị: Dòng là ý `a), b), c), d)` và cột là số thứ tự câu hỏi `1, 2, 3, 4`.
   - Xử lý các ký hiệu viết tắt `Đ/S` và `Đúng/Sai`.
   - Lưu trữ từng ý thành một bản ghi đáp án độc lập (`II.1a`, `II.1b`, `II.1c`, `II.1d`), không bị nhầm lẫn giữa hàng và cột.

3. **Phần III – Trắc nghiệm Trả lời ngắn**:
   - Nhận dạng số nguyên, số thập phân có dấu phẩy (`58,4`) hoặc dấu chấm (`58.4`), số âm.
   - Tự động đồng bộ mảng `acceptedAnswers` gồm cả dạng dấu phẩy và dấu chấm mà không làm tròn số.
   - Bóc tách kết luận cuối cùng từ phần **"HƯỚNG DẪN GIẢI CHI TIẾT"** khi đề thi không có bảng đáp án riêng.

4. **Nhận dạng theo Mẫu File Đính Kèm (Đề Kiểm Tra Giữa Kì 1 Hóa 12 - Đề Số 5)**:
   - File nguồn: `/public/assets/aistudio/20._____N_T_P_T_T_NGHI_P_THPT_5d90abb8.pdf` (12 trang).
   - Phần I (12 câu): Bóc tách bảng đáp án 12 câu `1: A, 2: B, 3: A, 4: A, 5: B, 6: B, 7: A, 8: A, 9: A, 10: A, 11: A, 12: A`.
   - Phần II (2 câu, 8 ý): Bóc tách bảng chuyển vị hàng dọc/ngang: Câu 1 (a-Đ, b-Đ, c-Đ, d-Đ) và Câu 2 (a-Đ, b-Đ, c-Đ, d-S).
   - Phần III (7 câu): Bóc tách bảng trả lời ngắn số thập phân: `Câu 1: 6; Câu 2: 188,0; Câu 3: 0,4; Câu 4: 14,7; Câu 5: 3,2; Câu 6: 31,1; Câu 7: 0,3`.
   - Bóc tách toàn bộ phần Hướng dẫn giải chi tiết cho cả 3 phần.
   - Tỉ lệ đối soát tự động: 27/27 mục đáp án (100% verified).

5. **Giao diện Đối chiếu & Rà soát (Reconciliation Dashboard)**:
   - Thống kê 4 thẻ số: Đã nhận dạng, Cần kiểm tra, Chưa tìm thấy, % Thành công.
   - Bảng đối chiếu chi tiết cho phép chỉnh sửa trực tiếp (inline edit): nút chọn nhanh A/B/C/D cho Phần I, nút toggle Đúng/Sai cho Phần II, ô nhập số cho Phần III.
   - Nút "Nhận dạng lại đáp án" và "Xác nhận toàn bộ".

---

## 5. BẢO MẬT VÀ TOÀN VẸN DỮ LIỆU
1. **Bảo mật đề thi trực tuyến**:
   - Khi học sinh đang làm bài, các thuộc tính `correctOptionId`, `correctAnswer`, `acceptableAnswers` và `explanation` được bóc tách và ẩn hoàn toàn khỏi state làm bài của client, ngăn chặn việc inspect mã nguồn để gian lận.
2. **Chống mất bài khi đứt mạng**:
   - Mọi thao tác chọn phương án, tick Đúng/Sai hoặc gõ câu trả lời ngắn đều được lưu tự động theo thời gian thực (real-time sync) vào bộ nhớ cục bộ trình duyệt. Khi mất mạng hoặc tải lại trang, hệ thống lập tức khôi phục trạng thái làm bài cùng đồng hồ đếm ngược.
3. **Cảnh báo rời tab (Tab-blur monitoring)**:
   - Hệ thống đếm số lần thí sinh chuyển đổi tab hoặc rời khỏi cửa sổ làm bài và ghi nhận vào biên bản nộp bài để giáo viên theo dõi.
