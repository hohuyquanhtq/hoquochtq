const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function generateSampleDocx() {
  const outDir = path.join(__dirname, '../public/assets');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 1. Generate test_chem_equations.docx
  {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

    zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

    zip.folder('word').folder('_rels').file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`);

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:body>
    <w:p>
      <w:r><w:t>SỞ GIÁO DỤC VÀ ĐÀO TẠO - ĐỀ KIỂM THỬ EQUATION TỪ MS WORD (.DOCX)</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn (12 câu)</w:t></w:r>
    </w:p>
    
    <w:p>
      <w:r><w:t>Câu 1. Công thức của acid sulfuric là H</w:t></w:r>
      <w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r>
      <w:r><w:t>SO</w:t></w:r>
      <w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>4</w:t></w:r>
      <w:r><w:t>. Hợp chất nào sau đây là muối nhôm sulfate?</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t>A. AlSO4.</w:t></w:r></w:p>
    <w:p><w:r><w:t>B. Al2(SO4)3.</w:t></w:r></w:p>
    <w:p><w:r><w:t>C. Al3(SO4)2.</w:t></w:r></w:p>
    <w:p><w:r><w:t>D. Al(SO4)2.</w:t></w:r></w:p>

    <w:p>
      <w:r><w:t>Câu 2. Phức chất tetraamminecopper(II) có công thức được tạo từ Insert Equation là: </w:t></w:r>
      <m:oMath>
        <m:sSubSup>
          <m:e><m:r><m:t>[Cu(NH</m:t></m:r></m:e>
          <m:sub><m:r><m:t>3</m:t></m:r></m:sub>
          <m:sup><m:r><m:t></m:t></m:r></m:sup>
        </m:sSubSup>
        <m:r><m:t>)</m:t></m:r>
        <m:sSubSup>
          <m:e><m:r><m:t></m:t></m:r></m:e>
          <m:sub><m:r><m:t>4</m:t></m:r></m:sub>
          <m:sup><m:r><m:t>2+</m:t></m:r></m:sup>
        </m:sSubSup>
      </m:oMath>
      <w:r><w:t>. Phức chất này có màu gì?</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t>A. Màu xanh lam thẫm.</w:t></w:r></w:p>
    <w:p><w:r><w:t>B. Màu đỏ gạch.</w:t></w:r></w:p>
    <w:p><w:r><w:t>C. Màu vàng tươi.</w:t></w:r></w:p>
    <w:p><w:r><w:t>D. Không màu.</w:t></w:r></w:p>

    <w:p>
      <w:r><w:t>Câu 3. Biến thiên enthalpy phản ứng tổng hợp ammonia </w:t></w:r>
      <m:oMath>
        <m:sSub>
          <m:e><m:r><m:t>N</m:t></m:r></m:e>
          <m:sub><m:r><m:t>2</m:t></m:r></m:sub>
        </m:sSub>
        <m:r><m:t> + 3</m:t></m:r>
        <m:sSub>
          <m:e><m:r><m:t>H</m:t></m:r></m:e>
          <m:sub><m:r><m:t>2</m:t></m:r></m:sub>
        </m:sSub>
        <m:r><m:t> ⇌ 2</m:t></m:r>
        <m:sSub>
          <m:e><m:r><m:t>NH</m:t></m:r></m:e>
          <m:sub><m:r><m:t>3</m:t></m:r></m:sub>
        </m:sSub>
      </m:oMath>
      <w:r><w:t> có giá trị ΔrH°298 = -92 kJ/mol. Nồng độ mol tính theo công thức phân số Word: </w:t></w:r>
      <m:oMath>
        <m:f>
          <m:num><m:r><m:t>n</m:t></m:r></m:num>
          <m:den><m:r><m:t>V</m:t></m:r></m:den>
        </m:f>
      </m:oMath>
      <w:r><w:t>. Phản ứng này là:</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t>A. Phản ứng thu nhiệt.</w:t></w:r></w:p>
    <w:p><w:r><w:t>B. Phản ứng không đổi nhiệt.</w:t></w:r></w:p>
    <w:p><w:r><w:t>C. Phản ứng tỏa nhiệt.</w:t></w:r></w:p>
    <w:p><w:r><w:t>D. Phản ứng quang hóa.</w:t></w:r></w:p>

    <w:p><w:r><w:t>---------------------Hết----------------</w:t></w:r></w:p>
    <w:p><w:r><w:t>ĐÁP ÁN:</w:t></w:r></w:p>
    <w:p><w:r><w:t>PHẦN I: Trắc nghiệm 4 lựa chọn</w:t></w:r></w:p>
    
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Câu</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>3</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Đáp án</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>C</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

    zip.folder('word').file('document.xml', documentXml);
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const outPath = path.join(outDir, 'test_chem_equations.docx');
    fs.writeFileSync(outPath, buffer);
    console.log('Successfully created test DOCX at:', outPath);
  }

  // 2. Generate test_chem_3parts.docx (Complete GDPT 2018 3-part exam per Section IX)
  {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

    zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

    zip.folder('word').folder('_rels').file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`);

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:body>
    <w:p>
      <w:r><w:t>SỞ GIÁO DỤC VÀ ĐÀO TẠO - ĐỀ KIỂM TRA CHUẨN 3 PHẦN GDPT 2018 MÔN HÓA HỌC</w:t></w:r>
    </w:p>
    
    <!-- PHẦN I: 3 câu -->
    <w:p><w:r><w:b/><w:t>PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn (Thí sinh trả lời từ câu 1 đến câu 3)</w:t></w:r></w:p>

    <w:p><w:r><w:t>Câu 1. Công thức phân tử của glucose là gì?</w:t></w:r></w:p>
    <w:p><w:r><w:t>A. C12H22O11.</w:t></w:r></w:p>
    <w:p><w:r><w:t>B. C6H12O6.</w:t></w:r></w:p>
    <w:p><w:r><w:t>C. C2H4O2.</w:t></w:r></w:p>
    <w:p><w:r><w:t>D. CH2O.</w:t></w:r></w:p>

    <w:p><w:r><w:t>Câu 2. Trong các kim loại sau, kim loại có độ dẫn điện tốt nhất ở điều kiện thường là:</w:t></w:r></w:p>
    <w:p><w:r><w:t>A. Al.</w:t></w:r></w:p>
    <w:p><w:r><w:t>B. Cu.</w:t></w:r></w:p>
    <w:p><w:r><w:t>C. Ag.</w:t></w:r></w:p>
    <w:p><w:r><w:t>D. Fe.</w:t></w:r></w:p>

    <w:p><w:r><w:t>Câu 3. Khí nào sau đây là nguyên nhân chính gây ra hiện tượng mưa acid?</w:t></w:r></w:p>
    <w:p><w:r><w:t>A. SO2.</w:t></w:r></w:p>
    <w:p><w:r><w:t>B. CO2.</w:t></w:r></w:p>
    <w:p><w:r><w:t>C. N2.</w:t></w:r></w:p>
    <w:p><w:r><w:t>D. O2.</w:t></w:r></w:p>

    <!-- PHẦN II: 2 câu đúng/sai -->
    <w:p><w:r><w:b/><w:t>PHẦN II. Câu trắc nghiệm đúng sai (Thí sinh trả lời từ câu 1 đến câu 2. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai)</w:t></w:r></w:p>

    <w:p><w:r><w:t>Câu 1. Cho phản ứng tổng hợp ammonia trong bình kín: N2(g) + 3H2(g) ⇌ 2NH3(g) (ΔrH°298 = -92 kJ).</w:t></w:r></w:p>
    <w:p><w:r><w:t>a) Phản ứng thuận là phản ứng tỏa nhiệt.</w:t></w:r></w:p>
    <w:p><w:r><w:t>b) Khi tăng áp suất của hệ, cân bằng hóa học chuyển dịch theo chiều nghịch.</w:t></w:r></w:p>
    <w:p><w:r><w:t>c) Khi hạ nhiệt độ của hệ, cân bằng hóa học chuyển dịch sang chiều thuận.</w:t></w:r></w:p>
    <w:p><w:r><w:t>d) Thêm chất xúc tác bột Fe làm tăng hiệu suất tổng hợp ammonia.</w:t></w:r></w:p>

    <w:p><w:r><w:t>Câu 2. Tiến hành thí nghiệm chuẩn độ dung dịch HCl bằng dung dịch chuẩn NaOH 0,1 M với chỉ thị phenolphthalein.</w:t></w:r></w:p>
    <w:p><w:r><w:t>a) Dung dịch NaOH được nạp vào bình tam giác trước khi chuẩn độ.</w:t></w:r></w:p>
    <w:p><w:r><w:t>b) Tại điểm tương đương, dung dịch xuất hiện màu hồng nhạt bền trong khoảng 30 giây.</w:t></w:r></w:p>
    <w:p><w:r><w:t>c) Tráng buret bằng nước cất mà không tráng lại bằng dung dịch NaOH sẽ làm sai lệch kết quả chuẩn độ.</w:t></w:r></w:p>
    <w:p><w:r><w:t>d) Thêm lượng lớn phenolphthalein không làm ảnh hưởng đến độ chính xác của phép chuẩn độ.</w:t></w:r></w:p>

    <!-- PHẦN III: 6 câu trả lời ngắn -->
    <w:p><w:r><w:b/><w:t>PHẦN III. Câu trắc nghiệm trả lời ngắn (Thí sinh trả lời từ câu 1 đến câu 6)</w:t></w:r></w:p>

    <w:p><w:r><w:t>Câu 1. Số nguyên tử oxygen có trong một phân tử acid sulfuric (H2SO4) là bao nhiêu?</w:t></w:r></w:p>
    <w:p><w:r><w:t>Câu 2. Cho kim loại Zn phản ứng hoàn toàn với dung dịch HCl vừa đủ. Khối lượng muối khan thu được sau khi cô cạn dung dịch ứng với giá trị phân tích là bao nhiêu?</w:t></w:r></w:p>
    <w:p><w:r><w:t>Câu 3. Khối lượng mol (g/mol) của sodium chloride (NaCl) là bao nhiêu? (Lấy Na = 23; Cl = 35,45, làm tròn đến một chữ số thập phân).</w:t></w:r></w:p>
    <w:p><w:r><w:t>Câu 4. Nồng độ pH của dung dịch đệm thu được theo thực nghiệm có giá trị là bao nhiêu?</w:t></w:r></w:p>
    <w:p><w:r><w:t>Câu 5. Trị số hằng số pKa của amine hữu cơ xác định bằng thực nghiệm ở 25°C là bao nhiêu?</w:t></w:r></w:p>
    <w:p><w:r><w:t>Câu 6. Thứ tự sắp xếp các ion theo chiều tăng dần bán kính từ 1 đến 4 được biểu diễn bằng số nguyên 4 chữ số là gì?</w:t></w:r></w:p>

    <!-- Mốc kết thúc -->
    <w:p><w:r><w:t>---------------------Hết----------------</w:t></w:r></w:p>
    
    <w:p><w:r><w:b/><w:t>ĐÁP ÁN ĐỀ THI</w:t></w:r></w:p>

    <!-- Bảng Phần I -->
    <w:p><w:r><w:b/><w:t>PHẦN I: Trắc nghiệm 4 lựa chọn</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Câu</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>3</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Đáp án</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>C</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>

    <!-- Bảng Phần II: Lưới đúng sai ma trận hoán vị -->
    <w:p><w:r><w:b/><w:t>PHẦN II: Trắc nghiệm Đúng / Sai</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Câu</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>a)</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Đ</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>S</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>b)</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>S</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Đ</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>c)</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Đ</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Đ</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>d)</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>S</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>S</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>

    <!-- Bảng Phần III: Số nguyên, số thập phân 58,4; 7,1; 9,5 -->
    <w:p><w:r><w:b/><w:t>PHẦN III: Trắc nghiệm trả lời ngắn</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Câu</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>3</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>4</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>5</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>6</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Đáp án</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>4</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>104</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>58,4</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>7,1</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>9,5</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>4132</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

    zip.folder('word').file('document.xml', documentXml);
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const outPath = path.join(outDir, 'test_chem_3parts.docx');
    fs.writeFileSync(outPath, buffer);
    console.log('Successfully created test DOCX at:', outPath);
  }
}

generateSampleDocx().catch(console.error);
