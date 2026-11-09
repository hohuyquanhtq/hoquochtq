import * as XLSX from 'xlsx';
import { StudentSubmission, Exam } from '../types';

/**
 * Exports exam submissions to a nicely styled Excel (.xlsx) file
 */
export function exportExamResultsToExcel(exam: Exam, submissions: StudentSubmission[]) {
  // Format rows
  const rows = submissions.map((sub, index) => {
    let classification = 'Chưa đạt';
    if (sub.totalScore >= 9.0) classification = 'Xuất sắc';
    else if (sub.totalScore >= 8.0) classification = 'Giỏi';
    else if (sub.totalScore >= 6.5) classification = 'Khá';
    else if (sub.totalScore >= 5.0) classification = 'Trung bình';

    const durationMins = Math.floor(sub.durationSeconds / 60);
    const durationSecs = sub.durationSeconds % 60;
    const durationStr = `${durationMins}p ${durationSecs}s`;

    return {
      'STT': index + 1,
      'Họ và tên': sub.studentName,
      'Lớp': sub.studentClass,
      'Mã đề thi': sub.variantCode || exam.code,
      'Thời gian bắt đầu': new Date(sub.startedAt).toLocaleString('vi-VN'),
      'Thời gian nộp bài': new Date(sub.submittedAt).toLocaleString('vi-VN'),
      'Thời gian làm bài': durationStr,
      'Điểm Phần I (Trắc nghiệm)': Number(sub.part1Score.toFixed(2)),
      'Điểm Phần II (Đúng/Sai)': Number(sub.part2Score.toFixed(2)),
      'Điểm Phần III (Trả lời ngắn)': Number(sub.part3Score.toFixed(2)),
      'Tổng điểm (Thang 10)': Number(sub.totalScore.toFixed(2)),
      'Xếp loại': classification,
      'Số lần rời tab': sub.tabSwitchesCount || 0,
    };
  });

  // Calculate summary metrics
  const totalStudents = submissions.length;
  const avgScore = totalStudents > 0 
    ? (submissions.reduce((acc, s) => acc + s.totalScore, 0) / totalStudents).toFixed(2) 
    : '0';
  const highest = totalStudents > 0 
    ? Math.max(...submissions.map(s => s.totalScore)).toFixed(2) 
    : '0';
  const lowest = totalStudents > 0 
    ? Math.min(...submissions.map(s => s.totalScore)).toFixed(2) 
    : '0';

  const summaryRows = [
    {},
    { 'STT': 'THỐNG KÊ CHUNG', 'Họ và tên': `Tổng số học sinh nộp bài: ${totalStudents}` },
    { 'STT': '', 'Họ và tên': `Điểm trung bình toàn lớp: ${avgScore}` },
    { 'STT': '', 'Họ và tên': `Điểm cao nhất: ${highest}` },
    { 'STT': '', 'Họ và tên': `Điểm thấp nhất: ${lowest}` },
  ];

  const fullData = [...rows, ...summaryRows];

  const worksheet = XLSX.utils.json_to_sheet(fullData);
  
  // Set column widths
  worksheet['!cols'] = [
    { wch: 6 },  // STT
    { wch: 25 }, // Họ tên
    { wch: 12 }, // Lớp
    { wch: 12 }, // Mã đề
    { wch: 20 }, // Bắt đầu
    { wch: 20 }, // Nộp bài
    { wch: 16 }, // Thời gian làm
    { wch: 16 }, // Phần I
    { wch: 16 }, // Phần II
    { wch: 16 }, // Phần III
    { wch: 14 }, // Tổng điểm
    { wch: 12 }, // Xếp loại
    { wch: 12 }, // Rời tab
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Bảng Điểm');

  // Trigger browser download
  const sanitizedTitle = exam.title.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 30);
  const fileName = `Bang_Diem_${sanitizedTitle}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}
