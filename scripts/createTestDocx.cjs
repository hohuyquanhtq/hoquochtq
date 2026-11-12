const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function generateSampleDocx() {
  const zip = new JSZip();

  // [Content_Types].xml
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  // _rels/.rels
  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  // word/_rels/document.xml.rels
  zip.folder('word').folder('_rels').file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`);

  // word/document.xml containing Word Insert -> Equation OMML markup
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
    
    <!-- Cau 1: Inorganic formula with w:vertAlign subscript -->
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

    <!-- Cau 2: OMML math with sub/sup for ion complex [Cu(NH3)4]2+ -->
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

    <!-- Cau 3: OMML fraction and Delta_r H -->
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

    <!-- Table in DOCX for answers -->
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
  const outDir = path.join(__dirname, '../public/assets');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outPath = path.join(outDir, 'test_chem_equations.docx');
  fs.writeFileSync(outPath, buffer);
  console.log('Successfully created test DOCX at:', outPath);
}

generateSampleDocx().catch(console.error);
